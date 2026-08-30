import { success, Errors } from '../utils/apiResponse.js';
import * as paymentLinkService from '../services/paymentLinkService.js';

export async function createPaymentLink(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { customerId, customerName, amount, description, expiresAt, existingPaymentId } = req.body;

    if (!customerId && !customerName) {
      throw Errors.badRequest(
        'Provide either customerId or customerName to identify the customer',
        'MISSING_CUSTOMER_IDENTIFIER'
      );
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

    const { link, deduped } = await paymentLinkService.createPaymentLink({
      merchantId,
      customerId,
      customerName,
      amount,
      description,
      expiresAt,
      idempotencyKey,
      existingPaymentId,
    });

    return success(res, link, deduped ? 200 : 201);
  } catch (err) {
    next(err);
  }
}

export async function listPaymentLinks(req, res, next) {
  try {
    const { status, customerId } = req.query;
    const links = await paymentLinkService.listPaymentLinks(req.user.merchantId, { status, customerId });
    return success(res, links);
  } catch (err) {
    next(err);
  }
}

export async function getPaymentLink(req, res, next) {
  try {
    const link = await paymentLinkService.getPaymentLink(req.user.merchantId, req.params.paymentLinkId);
    return success(res, link);
  } catch (err) {
    next(err);
  }
}

export async function updatePaymentLinkStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!status) throw Errors.badRequest('status is required');

    const link = await paymentLinkService.updatePaymentLinkStatus({
      merchantId: req.user.merchantId,
      paymentLinkId: req.params.paymentLinkId,
      status,
    });

    return success(res, link);
  } catch (err) {
    next(err);
  }
}

// Public — no merchant auth. Anyone holding the paymentLinkId can pay it,
// exactly like a real payment link. See paymentLinkService for the
// reasoning and the isolation guarantees that still apply everywhere else.
export async function payPaymentLink(req, res, next) {
  try {
    const { link, payment } = await paymentLinkService.payPaymentLink(req.params.paymentLinkId);
    return success(res, { link, payment });
  } catch (err) {
    next(err);
  }
}
