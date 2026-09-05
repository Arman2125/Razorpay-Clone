import { success, Errors } from '../utils/apiResponse.js';
import * as invoiceService from '../services/invoiceService.js';

export async function createInvoice(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { customerId, customerName, orderId, amount, currency, description, dueDate } = req.body;

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

    const { invoice, deduped } = await invoiceService.createInvoice({
      merchantId,
      customerId,
      customerName,
      orderId,
      amount: Number(amount),
      currency,
      description,
      dueDate,
      idempotencyKey,
    });

    return success(res, invoice, deduped ? 200 : 201);
  } catch (err) {
    next(err);
  }
}

export async function listInvoices(req, res, next) {
  try {
    const { status, customerId, page, limit } = req.query;
    const result = await invoiceService.listInvoices(req.user.merchantId, { status, customerId, page, limit });
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getInvoiceById(req, res, next) {
  try {
    const invoice = await invoiceService.getInvoice(req.user.merchantId, req.params.invoiceId);
    return success(res, invoice);
  } catch (err) {
    next(err);
  }
}

export async function updateInvoice(req, res, next) {
  try {
    const { amount, description, dueDate } = req.body;
    const invoice = await invoiceService.updateInvoiceDraft({
      merchantId: req.user.merchantId,
      invoiceId: req.params.invoiceId,
      amount,
      description,
      dueDate,
    });
    return success(res, invoice);
  } catch (err) {
    next(err);
  }
}

export async function updateInvoiceStatus(req, res, next) {
  try {
    const { status, paymentId } = req.body;
    if (!status) throw Errors.badRequest('status is required');

    const invoice = await invoiceService.updateInvoiceStatus({
      merchantId: req.user.merchantId,
      invoiceId: req.params.invoiceId,
      status,
      paymentId,
    });

    return success(res, invoice);
  } catch (err) {
    next(err);
  }
}
