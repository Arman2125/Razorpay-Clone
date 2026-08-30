import Payment from '../models/Payment.js';
import Customer from '../models/Customer.js';
import Reminder from '../models/Reminder.js';
import { generateId } from '../utils/idGenerator.js';
import { Errors } from '../utils/apiResponse.js';
import { logActivity } from './activityService.js';
import { findPayments } from './paymentService.js';

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves which payment a reminder is for. Sugam is expected to have
 * already resolved ambiguity via /payments/search before calling this —
 * but this is a backend-enforced safety net in its own right: even if a
 * caller skips that step and passes loose criteria (customerName/amount)
 * instead of an exact paymentId, this will refuse to guess. Zero matches
 * -> 404. Multiple matches -> 409 AMBIGUOUS_PAYMENT with candidates, never
 * an arbitrary pick.
 */
async function resolvePayment({ merchantId, paymentId, customerId, customerName, amount }) {
  if (paymentId) {
    const payment = await Payment.findOne({ paymentId, merchantId });
    if (!payment) throw Errors.notFound('Payment');
    return payment;
  }

  const candidates = await findPayments(merchantId, {
    customerId,
    customerName,
    amount,
    status: 'pending',
  });

  if (candidates.length === 0) throw Errors.notFound('Payment');
  if (candidates.length > 1) {
    throw Errors.ambiguous(
      candidates.map((c) => ({
        paymentId: c.paymentId,
        customerId: c.customerId,
        amount: c.amount,
        status: c.status,
        dueDate: c.dueDate,
      }))
    );
  }

  return Payment.findOne({ paymentId: candidates[0].paymentId, merchantId });
}

export async function createReminder({ merchantId, paymentId, customerId, customerName, amount, idempotencyKey }) {
  const payment = await resolvePayment({ merchantId, paymentId, customerId, customerName, amount });

  const customer = await Customer.findOne({ customerId: payment.customerId, merchantId });
  if (!customer) throw Errors.notFound('Customer');

  if (idempotencyKey) {
    const existing = await Reminder.findOne({ merchantId, idempotencyKey });
    if (existing) return { reminder: existing, deduped: true };
  }

  const recentDuplicate = await Reminder.findOne({
    merchantId,
    paymentId: payment.paymentId,
    status: { $in: ['pending', 'sent'] },
    createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
  }).sort({ createdAt: -1 });

  if (recentDuplicate) {
    throw Errors.conflict(
      'A reminder for this payment was already sent in the last 24 hours.',
      'DUPLICATE_REMINDER'
    );
  }

  const message = `Reminder: Your payment of ₹${payment.amount} is ${payment.status}. Please complete it at your earliest convenience.`;

  const reminder = await Reminder.create({
    reminderId: generateId('reminder'),
    merchantId,
    paymentId: payment.paymentId,
    customerId: payment.customerId,
    message,
    status: 'sent',
    idempotencyKey: idempotencyKey || undefined,
    sentAt: new Date(),
  });

  payment.lastReminderAt = reminder.sentAt;
  await payment.save();

  await logActivity({
    merchantId,
    action: 'REMINDER_SENT',
    entityType: 'reminder',
    entityId: reminder.reminderId,
    description: `Reminder sent to ${customer.name} for ₹${payment.amount} payment (${payment.paymentId})`,
    metadata: { paymentId: payment.paymentId, customerId: customer.customerId, amount: payment.amount },
  });

  return { reminder, deduped: false };
}
