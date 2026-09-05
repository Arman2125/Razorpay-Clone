import { success, Errors } from '../utils/apiResponse.js';
import * as refundService from '../services/refundService.js';

export async function createRefund(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { paymentId, amount, reason } = req.body;

    if (!paymentId) throw Errors.badRequest('paymentId is required', 'MISSING_PAYMENT_ID');
    if (amount === undefined || amount === null) {
      throw Errors.badRequest('amount is required', 'MISSING_AMOUNT');
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

    const { refund, deduped } = await refundService.createRefund({
      merchantId,
      paymentId,
      amount: Number(amount),
      reason,
      idempotencyKey,
    });

    return success(res, refund, deduped ? 200 : 201);
  } catch (err) {
    next(err);
  }
}

export async function listRefunds(req, res, next) {
  try {
    const { status, paymentId, customerId, page, limit } = req.query;
    const result = await refundService.listRefunds(req.user.merchantId, {
      status,
      paymentId,
      customerId,
      page,
      limit,
    });
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getRefundById(req, res, next) {
  try {
    const refund = await refundService.getRefund(req.user.merchantId, req.params.refundId);
    return success(res, refund);
  } catch (err) {
    next(err);
  }
}

export async function listRefundsForPayment(req, res, next) {
  try {
    const refunds = await refundService.listRefundsForPayment(req.user.merchantId, req.params.paymentId);
    return success(res, refunds);
  } catch (err) {
    next(err);
  }
}

export async function getRefundableAmount(req, res, next) {
  try {
    const result = await refundService.getRefundableAmount({
      merchantId: req.user.merchantId,
      paymentId: req.params.paymentId,
    });
    return success(res, result);
  } catch (err) {
    next(err);
  }
}
