import { success, Errors } from '../utils/apiResponse.js';
import * as orderService from '../services/orderService.js';

export async function createOrder(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { customerId, customerName, amount, currency, receipt, notes } = req.body;

    if (!customerId && !customerName) {
      throw Errors.badRequest(
        'Provide either customerId or customerName to identify the customer',
        'MISSING_CUSTOMER_IDENTIFIER'
      );
    }
    if (amount === undefined || amount === null) {
      throw Errors.badRequest('amount is required', 'MISSING_AMOUNT');
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

    const { order, deduped } = await orderService.createOrder({
      merchantId,
      customerId,
      customerName,
      amount: Number(amount),
      currency,
      receipt,
      notes,
      idempotencyKey,
    });

    return success(res, order, deduped ? 200 : 201);
  } catch (err) {
    next(err);
  }
}

export async function listOrders(req, res, next) {
  try {
    const { status, customerId, page, limit } = req.query;
    const result = await orderService.listOrders(req.user.merchantId, { status, customerId, page, limit });
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getOrderById(req, res, next) {
  try {
    const order = await orderService.getOrder(req.user.merchantId, req.params.orderId);
    return success(res, order);
  } catch (err) {
    next(err);
  }
}

export async function updateOrderStatus(req, res, next) {
  try {
    const { status, paymentId } = req.body;
    if (!status) throw Errors.badRequest('status is required');

    const order = await orderService.updateOrderStatus({
      merchantId: req.user.merchantId,
      orderId: req.params.orderId,
      status,
      paymentId,
    });

    return success(res, order);
  } catch (err) {
    next(err);
  }
}
