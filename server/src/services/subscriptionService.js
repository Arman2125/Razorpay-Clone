import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import { generateId } from '../utils/idGenerator.js';
import { isValidAmount } from '../utils/validators.js';
import { Errors } from '../utils/apiResponse.js';
import { logActivity } from './activityService.js';
import { resolveCustomer } from './customerResolution.js';

const INTERVALS = ['day', 'week', 'month', 'year'];

/**
 * Pure, deterministic date math — same inputs always produce the same next
 * billing date. No timers, no cron: this is called only from
 * processDueSubscriptions (itself only ever invoked by an explicit API
 * call), so a server restart can never cause it to run twice unexpectedly.
 */
export function computeNextBillingDate(from, interval, intervalCount = 1) {
  const date = new Date(from);
  switch (interval) {
    case 'day':
      date.setUTCDate(date.getUTCDate() + intervalCount);
      break;
    case 'week':
      date.setUTCDate(date.getUTCDate() + intervalCount * 7);
      break;
    case 'month':
      date.setUTCMonth(date.getUTCMonth() + intervalCount);
      break;
    case 'year':
      date.setUTCFullYear(date.getUTCFullYear() + intervalCount);
      break;
    default:
      throw Errors.badRequest(`Invalid interval "${interval}"`, 'INVALID_INTERVAL');
  }
  return date;
}

export async function createSubscription({
  merchantId,
  customerId,
  customerName,
  planId,
  amount,
  currency,
  interval,
  intervalCount,
  startAt,
  idempotencyKey,
}) {
  if (idempotencyKey) {
    const existing = await Subscription.findOne({ merchantId, idempotencyKey });
    if (existing) return { subscription: existing, deduped: true };
  }

  const customer = await resolveCustomer(merchantId, { customerId, customerName });

  if (!isValidAmount(amount, { allowZero: false })) {
    throw Errors.badRequest('amount must be a positive number greater than 0', 'INVALID_AMOUNT');
  }
  if (!INTERVALS.includes(interval)) {
    throw Errors.badRequest(`interval must be one of: ${INTERVALS.join(', ')}`, 'INVALID_INTERVAL');
  }

  const count = intervalCount && intervalCount > 0 ? Number(intervalCount) : 1;
  const start = startAt ? new Date(startAt) : new Date();
  const now = new Date();
  // A future start date leaves the subscription "created" (not yet
  // billing); a start date at/before now activates it immediately — both
  // states are deterministic functions of `start` vs `now`, never a timer.
  const status = start.getTime() > now.getTime() ? 'created' : 'active';

  const subscription = await Subscription.create({
    subscriptionId: generateId('subscription'),
    merchantId,
    customerId: customer.customerId,
    planId,
    amount,
    currency: currency || 'INR',
    interval,
    intervalCount: count,
    status,
    startAt: start,
    nextBillingAt: start,
    idempotencyKey: idempotencyKey || undefined,
  });

  await logActivity({
    merchantId,
    action: 'SUBSCRIPTION_CREATED',
    entityType: 'subscription',
    entityId: subscription.subscriptionId,
    description: `Subscription created for ${customer.name} — ₹${amount}/${interval}`,
    metadata: { customerId: customer.customerId, amount, interval, subscriptionId: subscription.subscriptionId },
  });

  return { subscription, deduped: false };
}

export async function listSubscriptions(merchantId, { status, customerId, page, limit } = {}) {
  const filter = { merchantId };
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;

  if (page !== undefined || limit !== undefined) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const [items, total] = await Promise.all([
      Subscription.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Subscription.countDocuments(filter),
    ]);
    return { items, page: pageNum, limit: limitNum, total };
  }

  const items = await Subscription.find(filter).sort({ createdAt: -1 }).lean();
  return { items, total: items.length };
}

export async function getSubscription(merchantId, subscriptionId) {
  const subscription = await Subscription.findOne({ subscriptionId, merchantId }).lean();
  if (!subscription) throw Errors.notFound('Subscription');
  return subscription;
}

export async function cancelSubscription({ merchantId, subscriptionId, atCycleEnd }) {
  const subscription = await Subscription.findOne({ subscriptionId, merchantId });
  if (!subscription) throw Errors.notFound('Subscription');

  if (['cancelled', 'completed'].includes(subscription.status)) {
    throw Errors.badRequest(`Subscription is already ${subscription.status}`, 'NO_STATE_CHANGE');
  }

  if (atCycleEnd) {
    // Scheduled cancellation: keep billing normally until the current
    // cycle's nextBillingAt is reached, then processDueSubscriptions stops
    // it instead of billing again — never a background timer.
    subscription.cancelAt = subscription.nextBillingAt;
  } else {
    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date();
    subscription.cancelAt = subscription.cancelAt || new Date();
  }
  await subscription.save();

  await logActivity({
    merchantId,
    action: 'SUBSCRIPTION_CANCELLED',
    entityType: 'subscription',
    entityId: subscription.subscriptionId,
    description: atCycleEnd
      ? `Subscription ${subscription.subscriptionId} scheduled to cancel at end of current cycle`
      : `Subscription ${subscription.subscriptionId} cancelled immediately`,
    metadata: { atCycleEnd: !!atCycleEnd },
  });

  return subscription;
}

export async function pauseSubscription({ merchantId, subscriptionId }) {
  const subscription = await Subscription.findOne({ subscriptionId, merchantId });
  if (!subscription) throw Errors.notFound('Subscription');

  if (subscription.status !== 'active') {
    throw Errors.badRequest(`Cannot pause a subscription with status "${subscription.status}"`, 'INVALID_TRANSITION');
  }

  subscription.status = 'paused';
  await subscription.save();
  return subscription;
}

export async function resumeSubscription({ merchantId, subscriptionId }) {
  const subscription = await Subscription.findOne({ subscriptionId, merchantId });
  if (!subscription) throw Errors.notFound('Subscription');

  if (subscription.status !== 'paused') {
    throw Errors.badRequest(`Cannot resume a subscription with status "${subscription.status}"`, 'INVALID_TRANSITION');
  }

  // Resuming never bills for the cycles missed while paused — the next
  // charge is simply "now", preventing any backlog/duplicate billing.
  const now = new Date();
  if (subscription.nextBillingAt.getTime() < now.getTime()) {
    subscription.nextBillingAt = now;
  }
  subscription.status = 'active';
  await subscription.save();
  return subscription;
}

/**
 * Deterministic, idempotent "run the clock forward" step. Safe to call any
 * number of times (from a manual endpoint, a real external scheduler added
 * later, or a test) — each due cycle is billed exactly once because the
 * claim (advancing nextBillingAt) is a single atomic findOneAndUpdate keyed
 * on the exact nextBillingAt value being claimed, so a concurrent second
 * call for the same subscription can never also claim it.
 */
export async function processDueSubscriptions(merchantId, { now = new Date() } = {}) {
  const dueQuery = { merchantId, status: { $in: ['created', 'active'] }, nextBillingAt: { $lte: now } };
  const dueSubscriptions = await Subscription.find(dueQuery).lean();

  const results = [];

  for (const sub of dueSubscriptions) {
    // A "created" subscription whose start has arrived is lazily activated
    // below via the same $set that claims the billing cycle (or, on the
    // cancel-at-cycle-end path, moved straight to "cancelled").

    // Reached (or passed) a scheduled end-of-cycle cancellation: stop
    // without billing this cycle.
    if (sub.cancelAt && sub.cancelAt.getTime() <= sub.nextBillingAt.getTime()) {
      const stopped = await Subscription.findOneAndUpdate(
        { subscriptionId: sub.subscriptionId, nextBillingAt: sub.nextBillingAt, status: { $in: ['created', 'active'] } },
        { $set: { status: 'cancelled', cancelledAt: now } },
        { new: true }
      );
      if (stopped) {
        await logActivity({
          merchantId,
          action: 'SUBSCRIPTION_CANCELLED',
          entityType: 'subscription',
          entityId: stopped.subscriptionId,
          description: `Subscription ${stopped.subscriptionId} cancelled at scheduled cycle end`,
        });
        results.push({ subscriptionId: stopped.subscriptionId, billed: false, cancelled: true });
      }
      continue;
    }

    const nextBillingAt = computeNextBillingDate(sub.nextBillingAt, sub.interval, sub.intervalCount);

    // Atomic claim: only succeeds if nextBillingAt still matches what we
    // just read, so two concurrent calls can never both bill this cycle.
    const claimed = await Subscription.findOneAndUpdate(
      { subscriptionId: sub.subscriptionId, nextBillingAt: sub.nextBillingAt, status: { $in: ['created', 'active'] } },
      { $set: { nextBillingAt, status: 'active' } },
      { new: false }
    );
    if (!claimed) continue; // lost the race (or already processed) — skip, no duplicate charge

    const payment = await Payment.create({
      paymentId: generateId('payment'),
      merchantId,
      customerId: sub.customerId,
      amount: sub.amount,
      currency: sub.currency,
      status: 'paid',
      paymentMethod: 'UPI',
      description: `Subscription ${sub.subscriptionId} billing`,
      paidAt: now,
    });

    await logActivity({
      merchantId,
      action: 'SUBSCRIPTION_BILLED',
      entityType: 'subscription',
      entityId: sub.subscriptionId,
      description: `Subscription ${sub.subscriptionId} billed ₹${sub.amount} (payment ${payment.paymentId})`,
      metadata: { paymentId: payment.paymentId, amount: sub.amount },
    });

    results.push({ subscriptionId: sub.subscriptionId, billed: true, paymentId: payment.paymentId, nextBillingAt });
  }

  return results;
}
