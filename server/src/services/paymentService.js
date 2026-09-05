import Payment from '../models/Payment.js';
import Customer from '../models/Customer.js';
import { Errors } from '../utils/apiResponse.js';
import { logActivity } from './activityService.js';

const VALID_STATUSES = ['pending', 'paid', 'failed', 'expired'];

// Deterministic state machine. "paid" is terminal — once a payment is
// marked paid, its financial outcome must not be changed by any API call.
const VALID_TRANSITIONS = {
  pending: ['paid', 'failed', 'expired'],
  failed: ['paid', 'pending'],
  expired: ['paid', 'pending'],
  paid: [],
};

/**
 * Structured, merchant-scoped payment lookup shared by /payments/search
 * and reminder creation-by-criteria. Never accepts a merchantId from the
 * criteria object — callers must always pass the authenticated merchantId.
 *
 * minAmount/maxAmount/paymentMethod/sortBy/sortOrder are additive — every
 * existing caller (reminder-by-criteria, the original /payments/search
 * shape) keeps working unchanged since these are simply left undefined.
 */
export async function findPayments(
  merchantId,
  { customerName, customerId, amount, minAmount, maxAmount, status, paymentMethod, dateFrom, dateTo, sortBy, sortOrder } = {}
) {
  const filter = { merchantId };

  if (customerId) {
    filter.customerId = customerId;
  } else if (customerName) {
    const matches = await Customer.find({
      merchantId,
      name: { $regex: customerName, $options: 'i' },
    }).select('customerId');
    filter.customerId = { $in: matches.map((c) => c.customerId) };
  }

  if (amount !== undefined && amount !== null && amount !== '') {
    filter.amount = Number(amount);
  } else if (minAmount !== undefined || maxAmount !== undefined) {
    const range = {};
    if (minAmount !== undefined && minAmount !== null && minAmount !== '') range.$gte = Number(minAmount);
    if (maxAmount !== undefined && maxAmount !== null && maxAmount !== '') range.$lte = Number(maxAmount);
    if (Object.keys(range).length) filter.amount = range;
  }

  if (status) filter.status = status;
  if (paymentMethod) filter.paymentMethod = paymentMethod;

  const dateRange = {};
  if (dateFrom) dateRange.$gte = new Date(dateFrom);
  if (dateTo) dateRange.$lte = new Date(dateTo);
  if (Object.keys(dateRange).length) filter.createdAt = dateRange;

  const sortField = ['amount', 'createdAt', 'dueDate'].includes(sortBy) ? sortBy : 'createdAt';
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  return Payment.find(filter).sort({ [sortField]: sortDir }).lean();
}

export async function getPaymentsSummary(merchantId) {
  const [agg] = await Payment.aggregate([
    { $match: { merchantId } },
    {
      $group: {
        _id: null,
        totalPayments: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        pendingAmount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } },
        paidCount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
        paidAmount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
        failedCount: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        expiredCount: { $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] } },
      },
    },
  ]);

  const overdueCount = await Payment.countDocuments({
    merchantId,
    status: 'pending',
    dueDate: { $lt: new Date() },
  });

  return {
    totalPayments: agg?.totalPayments ?? 0,
    totalAmount: agg?.totalAmount ?? 0,
    pendingCount: agg?.pendingCount ?? 0,
    pendingAmount: agg?.pendingAmount ?? 0,
    paidCount: agg?.paidCount ?? 0,
    paidAmount: agg?.paidAmount ?? 0,
    failedCount: agg?.failedCount ?? 0,
    expiredCount: agg?.expiredCount ?? 0,
    overdueCount,
  };
}

export async function updatePaymentStatus({ merchantId, paymentId, status }) {
  if (!VALID_STATUSES.includes(status)) {
    throw Errors.badRequest(
      `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
      'INVALID_STATUS'
    );
  }

  const payment = await Payment.findOne({ paymentId, merchantId });
  if (!payment) throw Errors.notFound('Payment');

  if (payment.status === status) {
    throw Errors.badRequest(`Payment is already ${status}`, 'NO_STATE_CHANGE');
  }

  const allowed = VALID_TRANSITIONS[payment.status] || [];
  if (!allowed.includes(status)) {
    throw Errors.badRequest(
      `Cannot transition payment from "${payment.status}" to "${status}"`,
      'INVALID_TRANSITION'
    );
  }

  const previousStatus = payment.status;
  payment.status = status;
  if (status === 'paid') payment.paidAt = new Date();

  await payment.save();

  await logActivity({
    merchantId,
    action: 'PAYMENT_UPDATED',
    entityType: 'payment',
    entityId: payment.paymentId,
    description: `Payment ${payment.paymentId} status changed from ${previousStatus} to ${status}`,
    metadata: { previousStatus, newStatus: status, amount: payment.amount },
  });

  return payment;
}
