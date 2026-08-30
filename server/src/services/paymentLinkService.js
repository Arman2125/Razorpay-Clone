import PaymentLink from '../models/PaymentLink.js';
import Customer from '../models/Customer.js';
import Payment from '../models/Payment.js';
import { generateId } from '../utils/idGenerator.js';
import { isValidAmount } from '../utils/validators.js';
import { Errors } from '../utils/apiResponse.js';
import { logActivity } from './activityService.js';
import { updatePaymentStatus } from './paymentService.js';

// Deterministic, terminal-heavy lifecycle: once a link leaves "active" it
// can never be reactivated. "paid" is only reachable through payPaymentLink,
// never through the generic status PATCH — paying has side effects
// (creating a real Payment record) that a bare status flip must not skip.
const PATCHABLE_TRANSITIONS = {
  active: ['cancelled', 'expired'],
  paid: [],
  cancelled: [],
  expired: [],
};

function buildShortUrl(paymentLinkId) {
  const base = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${base}/pay/${paymentLinkId}`;
}

/**
 * Same shape/safety as reminderService's payment resolution: never guesses.
 * customerId (exact) takes priority; customerName is a case-insensitive
 * substring match, consistent with every other lookup in this codebase.
 */
async function resolveCustomer(merchantId, { customerId, customerName }) {
  if (customerId) {
    const customer = await Customer.findOne({ customerId, merchantId });
    if (!customer) throw Errors.notFound('Customer');
    return customer;
  }

  if (!customerName) {
    throw Errors.badRequest(
      'Provide either customerId or customerName to identify the customer',
      'MISSING_CUSTOMER_IDENTIFIER'
    );
  }

  const matches = await Customer.find({
    merchantId,
    name: { $regex: customerName, $options: 'i' },
  });

  if (matches.length === 0) throw Errors.notFound('Customer');
  if (matches.length > 1) {
    throw Errors.ambiguous(
      matches.map((c) => ({ customerId: c.customerId, name: c.name, phone: c.phone, company: c.company })),
      'Multiple customers match the supplied name',
      'AMBIGUOUS_CUSTOMER'
    );
  }

  return matches[0];
}

function isExpired(link) {
  return link.status === 'active' && link.expiresAt && link.expiresAt.getTime() < Date.now();
}

async function flipExpiredIfNeeded(link) {
  if (!isExpired(link)) return link;
  link.status = 'expired';
  await link.save();
  await logActivity({
    merchantId: link.merchantId,
    action: 'PAYMENT_LINK_EXPIRED',
    entityType: 'paymentLink',
    entityId: link.paymentLinkId,
    description: `Payment link ${link.paymentLinkId} expired`,
    metadata: { amount: link.amount },
  });
  return link;
}

export async function createPaymentLink({
  merchantId,
  customerId,
  customerName,
  amount,
  description,
  expiresAt,
  idempotencyKey,
  existingPaymentId,
}) {
  if (idempotencyKey) {
    const existing = await PaymentLink.findOne({ merchantId, idempotencyKey });
    if (existing) return { link: existing, deduped: true };
  }

  const customer = await resolveCustomer(merchantId, { customerId, customerName });

  // Linking to an existing pending payment (e.g. the Customer Dashboard's
  // "Get Payment Link" action on a specific due payment): the link's
  // amount/description are taken from that payment, never from the
  // caller, so the link can never mismatch the actual receivable.
  let linkedPayment;
  if (existingPaymentId) {
    linkedPayment = await Payment.findOne({
      paymentId: existingPaymentId,
      merchantId,
      customerId: customer.customerId,
      status: 'pending',
    });
    if (!linkedPayment) throw Errors.notFound('Pending payment');
  }

  const resolvedAmount = linkedPayment ? linkedPayment.amount : amount;
  if (!isValidAmount(resolvedAmount, { allowZero: false })) {
    throw Errors.badRequest('amount must be a positive number greater than 0', 'INVALID_AMOUNT');
  }

  const paymentLinkId = generateId('paymentLink');

  const link = await PaymentLink.create({
    paymentLinkId,
    merchantId,
    customerId: customer.customerId,
    amount: resolvedAmount,
    currency: 'INR',
    description: description || linkedPayment?.description,
    status: 'active',
    shortUrl: buildShortUrl(paymentLinkId),
    idempotencyKey: idempotencyKey || undefined,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    existingPaymentId: linkedPayment?.paymentId,
  });

  await logActivity({
    merchantId,
    action: 'PAYMENT_LINK_CREATED',
    entityType: 'paymentLink',
    entityId: link.paymentLinkId,
    description: `Payment link created for ${customer.name} — ₹${resolvedAmount}`,
    metadata: { customerId: customer.customerId, amount: resolvedAmount, paymentLinkId: link.paymentLinkId },
  });

  return { link, deduped: false };
}

export async function listPaymentLinks(merchantId, { status, customerId } = {}) {
  const filter = { merchantId };
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;
  return PaymentLink.find(filter).sort({ createdAt: -1 }).lean();
}

export async function getPaymentLink(merchantId, paymentLinkId) {
  const link = await PaymentLink.findOne({ paymentLinkId, merchantId });
  if (!link) throw Errors.notFound('PaymentLink');
  return flipExpiredIfNeeded(link);
}

// Public lookup — deliberately NOT merchant-scoped. Knowledge of the
// paymentLinkId is the capability, exactly like a real payment link.
export async function getPublicPaymentLink(paymentLinkId) {
  const link = await PaymentLink.findOne({ paymentLinkId });
  if (!link) throw Errors.notFound('PaymentLink');
  return flipExpiredIfNeeded(link);
}

export async function updatePaymentLinkStatus({ merchantId, paymentLinkId, status }) {
  if (!['cancelled', 'expired'].includes(status)) {
    throw Errors.badRequest(
      `Invalid target status "${status}". This endpoint only accepts "cancelled" or "expired" — use POST /payment-links/:id/pay to mark a link paid.`,
      'INVALID_STATUS'
    );
  }

  const link = await PaymentLink.findOne({ paymentLinkId, merchantId });
  if (!link) throw Errors.notFound('PaymentLink');

  const allowed = PATCHABLE_TRANSITIONS[link.status] || [];
  if (!allowed.includes(status)) {
    throw Errors.badRequest(
      `Cannot transition payment link from "${link.status}" to "${status}"`,
      'INVALID_TRANSITION'
    );
  }

  const previousStatus = link.status;
  link.status = status;
  await link.save();

  await logActivity({
    merchantId,
    action: status === 'cancelled' ? 'PAYMENT_LINK_CANCELLED' : 'PAYMENT_LINK_EXPIRED',
    entityType: 'paymentLink',
    entityId: link.paymentLinkId,
    description: `Payment link ${link.paymentLinkId} ${previousStatus} -> ${status}`,
    metadata: { previousStatus, newStatus: status, amount: link.amount },
  });

  return link;
}

// Public action — see getPublicPaymentLink for why this isn't merchant-scoped.
export async function payPaymentLink(paymentLinkId) {
  const link = await PaymentLink.findOne({ paymentLinkId });
  if (!link) throw Errors.notFound('PaymentLink');

  await flipExpiredIfNeeded(link);

  if (link.status === 'paid') {
    throw Errors.conflict('This payment link has already been paid.', 'ALREADY_PAID');
  }
  if (link.status !== 'active') {
    throw Errors.conflict(`This payment link is ${link.status} and cannot be paid.`, 'LINK_NOT_ACTIVE');
  }

  const customer = await Customer.findOne({ customerId: link.customerId, merchantId: link.merchantId });

  // If this link was created for an already-existing pending payment (see
  // createPaymentLink), paying it settles THAT payment via the same
  // state-machine/activity-logging every other status change goes through
  // — never a second, parallel "payment" record for the same receivable.
  // Otherwise, preserve the original behavior exactly: a fresh ad-hoc
  // Payment is created (this is what every existing caller — including
  // Sugam's create_payment_link tool — has always relied on).
  const payment = link.existingPaymentId
    ? await updatePaymentStatus({ merchantId: link.merchantId, paymentId: link.existingPaymentId, status: 'paid' })
    : await Payment.create({
        paymentId: generateId('payment'),
        merchantId: link.merchantId,
        customerId: link.customerId,
        amount: link.amount,
        currency: link.currency,
        status: 'paid',
        paymentMethod: 'UPI',
        description: link.description || `Payment link ${link.paymentLinkId}`,
        paidAt: new Date(),
      });

  link.status = 'paid';
  link.paidAt = payment.paidAt;
  link.paymentId = payment.paymentId;
  await link.save();

  await logActivity({
    merchantId: link.merchantId,
    action: 'PAYMENT_LINK_PAID',
    entityType: 'paymentLink',
    entityId: link.paymentLinkId,
    description: `Payment link ${link.paymentLinkId} paid by ${customer?.name || 'customer'} — ₹${link.amount}`,
    metadata: { paymentLinkId: link.paymentLinkId, paymentId: payment.paymentId, amount: link.amount },
  });

  return { link, payment };
}
