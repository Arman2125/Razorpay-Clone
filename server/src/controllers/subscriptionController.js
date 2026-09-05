import { success, Errors } from '../utils/apiResponse.js';
import * as subscriptionService from '../services/subscriptionService.js';

export async function createSubscription(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { customerId, customerName, planId, amount, currency, interval, intervalCount, startAt } = req.body;

    if (!customerId && !customerName) {
      throw Errors.badRequest(
        'Provide either customerId or customerName to identify the customer',
        'MISSING_CUSTOMER_IDENTIFIER'
      );
    }
    if (amount === undefined || amount === null) {
      throw Errors.badRequest('amount is required', 'MISSING_AMOUNT');
    }
    if (!interval) throw Errors.badRequest('interval is required', 'MISSING_INTERVAL');

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

    const { subscription, deduped } = await subscriptionService.createSubscription({
      merchantId,
      customerId,
      customerName,
      planId,
      amount: Number(amount),
      currency,
      interval,
      intervalCount,
      startAt,
      idempotencyKey,
    });

    return success(res, subscription, deduped ? 200 : 201);
  } catch (err) {
    next(err);
  }
}

export async function listSubscriptions(req, res, next) {
  try {
    const { status, customerId, page, limit } = req.query;
    const result = await subscriptionService.listSubscriptions(req.user.merchantId, {
      status,
      customerId,
      page,
      limit,
    });
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getSubscriptionById(req, res, next) {
  try {
    const subscription = await subscriptionService.getSubscription(req.user.merchantId, req.params.subscriptionId);
    return success(res, subscription);
  } catch (err) {
    next(err);
  }
}

export async function updateSubscriptionStatus(req, res, next) {
  try {
    const { status, atCycleEnd } = req.body;
    if (!status) throw Errors.badRequest('status is required');

    const merchantId = req.user.merchantId;
    const subscriptionId = req.params.subscriptionId;

    let subscription;
    if (status === 'cancelled') {
      subscription = await subscriptionService.cancelSubscription({ merchantId, subscriptionId, atCycleEnd });
    } else if (status === 'paused') {
      subscription = await subscriptionService.pauseSubscription({ merchantId, subscriptionId });
    } else if (status === 'active') {
      subscription = await subscriptionService.resumeSubscription({ merchantId, subscriptionId });
    } else {
      throw Errors.badRequest(
        `Invalid target status "${status}". Must be one of: active, paused, cancelled`,
        'INVALID_STATUS'
      );
    }

    return success(res, subscription);
  } catch (err) {
    next(err);
  }
}

// Deterministic, idempotent billing-cycle processor — merchant-scoped, no
// background scheduler. See subscriptionService.processDueSubscriptions.
export async function processDueSubscriptions(req, res, next) {
  try {
    const results = await subscriptionService.processDueSubscriptions(req.user.merchantId);
    return success(res, { processed: results.length, results });
  } catch (err) {
    next(err);
  }
}
