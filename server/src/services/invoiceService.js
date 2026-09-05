import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import { generateId } from '../utils/idGenerator.js';
import { isValidAmount } from '../utils/validators.js';
import { Errors } from '../utils/apiResponse.js';
import { logActivity } from './activityService.js';
import { resolveCustomer } from './customerResolution.js';

// draft -> issued -> paid | cancelled
// issued/overdue -> paid | cancelled ("overdue" is not a manual target — it
// is lazily derived from dueDate, same pattern as PaymentLink's expiry flip)
const VALID_TRANSITIONS = {
  draft: ['issued', 'cancelled'],
  issued: ['paid', 'cancelled'],
  overdue: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
};

function isOverdue(invoice) {
  return invoice.status === 'issued' && invoice.dueDate && invoice.dueDate.getTime() < Date.now();
}

async function flipOverdueIfNeeded(invoice) {
  if (!isOverdue(invoice)) return invoice;
  invoice.status = 'overdue';
  await invoice.save();
  await logActivity({
    merchantId: invoice.merchantId,
    action: 'INVOICE_OVERDUE',
    entityType: 'invoice',
    entityId: invoice.invoiceId,
    description: `Invoice ${invoice.invoiceId} is now overdue`,
    metadata: { amount: invoice.amount, dueDate: invoice.dueDate },
  });
  return invoice;
}

export async function createInvoice({
  merchantId,
  customerId,
  customerName,
  orderId,
  amount,
  currency,
  description,
  dueDate,
  idempotencyKey,
}) {
  if (idempotencyKey) {
    const existing = await Invoice.findOne({ merchantId, idempotencyKey });
    if (existing) return { invoice: existing, deduped: true };
  }

  const customer = await resolveCustomer(merchantId, { customerId, customerName });

  if (!isValidAmount(amount, { allowZero: false })) {
    throw Errors.badRequest('amount must be a positive number greater than 0', 'INVALID_AMOUNT');
  }

  const invoice = await Invoice.create({
    invoiceId: generateId('invoice'),
    merchantId,
    customerId: customer.customerId,
    orderId,
    amount,
    currency: currency || 'INR',
    description,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    status: 'draft',
    idempotencyKey: idempotencyKey || undefined,
  });

  await logActivity({
    merchantId,
    action: 'INVOICE_CREATED',
    entityType: 'invoice',
    entityId: invoice.invoiceId,
    description: `Invoice created for ${customer.name} — ₹${amount}`,
    metadata: { customerId: customer.customerId, amount, invoiceId: invoice.invoiceId },
  });

  return { invoice, deduped: false };
}

export async function listInvoices(merchantId, { status, customerId, page, limit } = {}) {
  const filter = { merchantId };
  if (customerId) filter.customerId = customerId;

  // Overdue is lazily derived, so filtering by it (or by "issued", which
  // must exclude anything that has since become overdue) requires flipping
  // eligible invoices first, exactly like flipExpiredIfNeeded elsewhere.
  const candidates = await Invoice.find(
    status && ['issued', 'overdue'].includes(status) ? { merchantId, status: { $in: ['issued', 'overdue'] } } : filter
  );
  for (const invoice of candidates) {
    await flipOverdueIfNeeded(invoice);
  }

  if (status) filter.status = status;

  if (page !== undefined || limit !== undefined) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const [items, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Invoice.countDocuments(filter),
    ]);
    return { items, page: pageNum, limit: limitNum, total };
  }

  const items = await Invoice.find(filter).sort({ createdAt: -1 }).lean();
  return { items, total: items.length };
}

export async function getInvoice(merchantId, invoiceId) {
  const invoice = await Invoice.findOne({ invoiceId, merchantId });
  if (!invoice) throw Errors.notFound('Invoice');
  await flipOverdueIfNeeded(invoice);
  return invoice.toObject ? invoice.toObject() : invoice;
}

export async function updateInvoiceDraft({ merchantId, invoiceId, amount, description, dueDate }) {
  const invoice = await Invoice.findOne({ invoiceId, merchantId });
  if (!invoice) throw Errors.notFound('Invoice');

  if (invoice.status !== 'draft') {
    throw Errors.badRequest('Only a draft invoice can be edited', 'INVOICE_NOT_DRAFT');
  }

  if (amount !== undefined) {
    if (!isValidAmount(amount, { allowZero: false })) {
      throw Errors.badRequest('amount must be a positive number greater than 0', 'INVALID_AMOUNT');
    }
    invoice.amount = amount;
  }
  if (description !== undefined) invoice.description = description;
  if (dueDate !== undefined) invoice.dueDate = dueDate ? new Date(dueDate) : undefined;

  await invoice.save();
  return invoice;
}

export async function updateInvoiceStatus({ merchantId, invoiceId, status, paymentId }) {
  if (!['issued', 'paid', 'cancelled'].includes(status)) {
    throw Errors.badRequest(
      `Invalid target status "${status}". Must be one of: issued, paid, cancelled`,
      'INVALID_STATUS'
    );
  }

  const invoice = await Invoice.findOne({ invoiceId, merchantId });
  if (!invoice) throw Errors.notFound('Invoice');
  await flipOverdueIfNeeded(invoice);

  const allowed = VALID_TRANSITIONS[invoice.status] || [];
  if (!allowed.includes(status)) {
    throw Errors.badRequest(
      `Cannot transition invoice from "${invoice.status}" to "${status}"`,
      'INVALID_TRANSITION'
    );
  }

  if (status === 'paid' && paymentId) {
    const payment = await Payment.findOne({ paymentId, merchantId, customerId: invoice.customerId });
    if (!payment) throw Errors.notFound('Payment');
    if (payment.status !== 'paid') {
      throw Errors.badRequest('Linked payment must have status "paid"', 'PAYMENT_NOT_PAID');
    }
    invoice.paymentId = payment.paymentId;
  }

  const previousStatus = invoice.status;
  invoice.status = status;
  if (status === 'issued') invoice.issuedAt = new Date();
  if (status === 'paid') invoice.paidAt = new Date();
  await invoice.save();

  const actionByStatus = { issued: 'INVOICE_ISSUED', paid: 'INVOICE_PAID', cancelled: 'INVOICE_CANCELLED' };

  await logActivity({
    merchantId,
    action: actionByStatus[status],
    entityType: 'invoice',
    entityId: invoice.invoiceId,
    description: `Invoice ${invoice.invoiceId} status changed from ${previousStatus} to ${status}`,
    metadata: { previousStatus, newStatus: status, amount: invoice.amount },
  });

  return invoice;
}
