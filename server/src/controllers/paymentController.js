import Payment from '../models/Payment.js';
import Customer from '../models/Customer.js';
import { success, Errors } from '../utils/apiResponse.js';
import { calculatePriorityForPending } from '../services/priorityService.js';
import { logActivity } from '../services/activityService.js';
import * as paymentService from '../services/paymentService.js';

async function attachCustomers(merchantId, payments) {
  const customerIds = [...new Set(payments.map((p) => p.customerId))];
  const customers = await Customer.find({ merchantId, customerId: { $in: customerIds } }).lean();
  const byId = new Map(customers.map((c) => [c.customerId, c]));
  return payments.map((p) => ({
    ...p,
    customer: byId.get(p.customerId)
      ? { customerId: byId.get(p.customerId).customerId, name: byId.get(p.customerId).name, phone: byId.get(p.customerId).phone }
      : null,
  }));
}

function buildDateRangeFilter(from, to) {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return Object.keys(range).length ? range : undefined;
}

function buildAmountRangeFilter(min, max) {
  const range = {};
  if (min !== undefined) range.$gte = Number(min);
  if (max !== undefined) range.$lte = Number(max);
  return Object.keys(range).length ? range : undefined;
}

export async function listPayments(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { customer, status, minAmount, maxAmount, from, to, page = 1, limit = 20 } = req.query;

    const filter = { merchantId };
    if (status) filter.status = status;

    const amountRange = buildAmountRangeFilter(minAmount, maxAmount);
    if (amountRange) filter.amount = amountRange;

    const dateRange = buildDateRangeFilter(from, to);
    if (dateRange) filter.createdAt = dateRange;

    if (customer) {
      const matches = await Customer.find({
        merchantId,
        name: { $regex: customer, $options: 'i' },
      }).select('customerId');
      filter.customerId = { $in: matches.map((c) => c.customerId) };
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));

    const [items, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Payment.countDocuments(filter),
    ]);

    const enriched = await attachCustomers(merchantId, items);

    return success(res, { items: enriched, page: pageNum, limit: limitNum, total });
  } catch (err) {
    next(err);
  }
}

export async function listPendingPayments(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const payments = await Payment.find({ merchantId, status: 'pending' }).sort({ dueDate: 1 }).lean();
    const enriched = await attachCustomers(merchantId, payments);
    return success(res, enriched);
  } catch (err) {
    next(err);
  }
}

export async function listOverduePayments(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const payments = await Payment.find({
      merchantId,
      status: 'pending',
      dueDate: { $lt: new Date() },
    })
      .sort({ dueDate: 1 })
      .lean();
    const enriched = await attachCustomers(merchantId, payments);
    return success(res, enriched);
  } catch (err) {
    next(err);
  }
}

export async function getPaymentsSummary(req, res, next) {
  try {
    const summary = await paymentService.getPaymentsSummary(req.user.merchantId);
    return success(res, summary);
  } catch (err) {
    next(err);
  }
}

export async function updatePaymentStatusHandler(req, res, next) {
  try {
    const { status } = req.body;
    if (!status) throw Errors.badRequest('status is required');

    const payment = await paymentService.updatePaymentStatus({
      merchantId: req.user.merchantId,
      paymentId: req.params.paymentId,
      status,
    });

    return success(res, payment);
  } catch (err) {
    next(err);
  }
}

export async function listPendingWithPriority(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const payments = await Payment.find({ merchantId, status: 'pending' }).lean();
    const prioritized = await calculatePriorityForPending(merchantId, payments);
    const enriched = await attachCustomers(merchantId, prioritized);
    enriched.sort((a, b) => b.priorityScore - a.priorityScore);
    return success(res, enriched);
  } catch (err) {
    next(err);
  }
}

export async function getPaymentById(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const payment = await Payment.findOne({ paymentId: req.params.paymentId, merchantId }).lean();
    if (!payment) throw Errors.notFound('Payment');

    const [enriched] = await attachCustomers(merchantId, [payment]);

    await logActivity({
      merchantId,
      action: 'PAYMENT_VIEWED',
      entityType: 'payment',
      entityId: payment.paymentId,
      description: `Payment ${payment.paymentId} viewed`,
      metadata: { amount: payment.amount, status: payment.status },
    });

    return success(res, enriched);
  } catch (err) {
    next(err);
  }
}

export async function getPaymentStatus(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const payment = await Payment.findOne({ paymentId: req.params.paymentId, merchantId })
      .select('paymentId status amount dueDate paidAt')
      .lean();
    if (!payment) throw Errors.notFound('Payment');
    return success(res, payment);
  } catch (err) {
    next(err);
  }
}

export async function searchPayments(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { customerName, customerId, amount, status, dateFrom, dateTo } = req.body;

    const payments = await paymentService.findPayments(merchantId, {
      customerName,
      customerId,
      amount,
      status,
      dateFrom,
      dateTo,
    });
    const enriched = await attachCustomers(merchantId, payments);

    return success(res, { items: enriched, count: enriched.length });
  } catch (err) {
    next(err);
  }
}
