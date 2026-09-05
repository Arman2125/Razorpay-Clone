import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import { generateId } from '../utils/idGenerator.js';
import { isValidAmount } from '../utils/validators.js';
import { Errors } from '../utils/apiResponse.js';
import { logActivity } from './activityService.js';
import { resolveCustomer } from './customerResolution.js';

// Deterministic, server-enforced lifecycle — see Order model comment.
const VALID_TRANSITIONS = {
  created: ['attempted', 'paid', 'cancelled'],
  attempted: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
};

export async function createOrder({
  merchantId,
  customerId,
  customerName,
  amount,
  currency,
  receipt,
  notes,
  idempotencyKey,
}) {
  if (idempotencyKey) {
    const existing = await Order.findOne({ merchantId, idempotencyKey });
    if (existing) return { order: existing, deduped: true };
  }

  const customer = await resolveCustomer(merchantId, { customerId, customerName });

  if (!isValidAmount(amount, { allowZero: false })) {
    throw Errors.badRequest('amount must be a positive number greater than 0', 'INVALID_AMOUNT');
  }

  const order = await Order.create({
    orderId: generateId('order'),
    merchantId,
    customerId: customer.customerId,
    amount,
    currency: currency || 'INR',
    receipt,
    notes: notes || {},
    status: 'created',
    idempotencyKey: idempotencyKey || undefined,
  });

  await logActivity({
    merchantId,
    action: 'ORDER_CREATED',
    entityType: 'order',
    entityId: order.orderId,
    description: `Order created for ${customer.name} — ₹${amount}`,
    metadata: { customerId: customer.customerId, amount, orderId: order.orderId },
  });

  return { order, deduped: false };
}

export async function listOrders(merchantId, { status, customerId, page, limit } = {}) {
  const filter = { merchantId };
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;

  if (page !== undefined || limit !== undefined) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const [items, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Order.countDocuments(filter),
    ]);
    return { items, page: pageNum, limit: limitNum, total };
  }

  const items = await Order.find(filter).sort({ createdAt: -1 }).lean();
  return { items, total: items.length };
}

export async function getOrder(merchantId, orderId) {
  const order = await Order.findOne({ orderId, merchantId }).lean();
  if (!order) throw Errors.notFound('Order');
  return order;
}

export async function updateOrderStatus({ merchantId, orderId, status, paymentId }) {
  if (!['attempted', 'paid', 'cancelled'].includes(status)) {
    throw Errors.badRequest(
      `Invalid target status "${status}". Must be one of: attempted, paid, cancelled`,
      'INVALID_STATUS'
    );
  }

  const order = await Order.findOne({ orderId, merchantId });
  if (!order) throw Errors.notFound('Order');

  const allowed = VALID_TRANSITIONS[order.status] || [];
  if (!allowed.includes(status)) {
    throw Errors.badRequest(
      `Cannot transition order from "${order.status}" to "${status}"`,
      'INVALID_TRANSITION'
    );
  }

  // Linking an existing Payment is additive and optional — the order's own
  // "paid" status is a fulfillment flag, never a second source of money
  // movement. If provided, the payment must genuinely belong to this
  // merchant, this order's customer, and already be paid.
  if (status === 'paid' && paymentId) {
    const payment = await Payment.findOne({ paymentId, merchantId, customerId: order.customerId });
    if (!payment) throw Errors.notFound('Payment');
    if (payment.status !== 'paid') {
      throw Errors.badRequest('Linked payment must have status "paid"', 'PAYMENT_NOT_PAID');
    }
    order.paymentId = payment.paymentId;
  }

  const previousStatus = order.status;
  order.status = status;
  await order.save();

  await logActivity({
    merchantId,
    action: 'ORDER_UPDATED',
    entityType: 'order',
    entityId: order.orderId,
    description: `Order ${order.orderId} status changed from ${previousStatus} to ${status}`,
    metadata: { previousStatus, newStatus: status, amount: order.amount },
  });

  return order;
}
