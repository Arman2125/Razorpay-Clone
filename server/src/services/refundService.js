import Payment from '../models/Payment.js';
import Refund from '../models/Refund.js';
import { generateId } from '../utils/idGenerator.js';
import { isValidAmount } from '../utils/validators.js';
import { Errors } from '../utils/apiResponse.js';
import { logActivity } from './activityService.js';

/**
 * refundableAmount = payment.amount - sum(amount of "refunded" Refunds for
 * that payment). Always computed fresh from the Refund ledger — never
 * cached, never trusted from a caller. A Payment's own `status` field is
 * NOT touched by refunds (see refundService below) — the state machine in
 * paymentService.js stays exactly as it was.
 */
export async function getRefundedAmount(merchantId, paymentId) {
  const [agg] = await Refund.aggregate([
    { $match: { merchantId, paymentId, status: 'refunded' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return agg?.total ?? 0;
}

export async function getRefundableAmount({ merchantId, paymentId }) {
  const payment = await Payment.findOne({ paymentId, merchantId }).lean();
  if (!payment) throw Errors.notFound('Payment');

  const refundedAmount = await getRefundedAmount(merchantId, paymentId);
  const refundableAmount = Math.max(0, payment.amount - refundedAmount);

  return {
    paymentId: payment.paymentId,
    paymentAmount: payment.amount,
    paymentStatus: payment.status,
    refundedAmount,
    refundableAmount,
  };
}

export async function createRefund({ merchantId, paymentId, amount, reason, idempotencyKey }) {
  if (idempotencyKey) {
    const existing = await Refund.findOne({ merchantId, idempotencyKey });
    if (existing) return { refund: existing, deduped: true };
  }

  if (!paymentId) throw Errors.badRequest('paymentId is required', 'MISSING_PAYMENT_ID');

  const payment = await Payment.findOne({ paymentId, merchantId });
  if (!payment) throw Errors.notFound('Payment');

  // Only a completed transaction has money to give back. This is a
  // validation gate only — a successful refund never flips Payment.status.
  if (payment.status !== 'paid') {
    throw Errors.badRequest(
      `Cannot refund a payment with status "${payment.status}". Only "paid" payments are refundable.`,
      'PAYMENT_NOT_PAID'
    );
  }

  if (!isValidAmount(amount, { allowZero: false })) {
    throw Errors.badRequest('amount must be a positive number greater than 0', 'INVALID_AMOUNT');
  }

  const refundedAmount = await getRefundedAmount(merchantId, paymentId);
  const refundableAmount = payment.amount - refundedAmount;

  if (amount > refundableAmount) {
    throw Errors.badRequest(
      `Refund amount (${amount}) exceeds the refundable balance (${refundableAmount}) for this payment.`,
      'REFUND_EXCEEDS_BALANCE'
    );
  }

  // This demo has no real payment gateway, so a refund that passes every
  // validation above always simulates instant success — same "the state
  // transition is real, the gateway is not" contract as Payment Links.
  const refund = await Refund.create({
    refundId: generateId('refund'),
    merchantId,
    paymentId: payment.paymentId,
    customerId: payment.customerId,
    amount,
    currency: payment.currency,
    status: 'refunded',
    reason,
    idempotencyKey: idempotencyKey || undefined,
  });

  await logActivity({
    merchantId,
    action: 'REFUND_CREATED',
    entityType: 'refund',
    entityId: refund.refundId,
    description: `Refund of ₹${amount} created for payment ${payment.paymentId}`,
    metadata: { paymentId: payment.paymentId, amount, refundId: refund.refundId },
  });

  return { refund, deduped: false };
}

export async function listRefunds(merchantId, { status, paymentId, customerId, page, limit } = {}) {
  const filter = { merchantId };
  if (status) filter.status = status;
  if (paymentId) filter.paymentId = paymentId;
  if (customerId) filter.customerId = customerId;

  if (page !== undefined || limit !== undefined) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const [items, total] = await Promise.all([
      Refund.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Refund.countDocuments(filter),
    ]);
    return { items, page: pageNum, limit: limitNum, total };
  }

  const items = await Refund.find(filter).sort({ createdAt: -1 }).lean();
  return { items, total: items.length };
}

export async function getRefund(merchantId, refundId) {
  const refund = await Refund.findOne({ refundId, merchantId }).lean();
  if (!refund) throw Errors.notFound('Refund');
  return refund;
}

export async function listRefundsForPayment(merchantId, paymentId) {
  const payment = await Payment.findOne({ paymentId, merchantId }).lean();
  if (!payment) throw Errors.notFound('Payment');
  return Refund.find({ merchantId, paymentId }).sort({ createdAt: -1 }).lean();
}
