import Customer from '../models/Customer.js';
import { Errors } from '../utils/apiResponse.js';

/**
 * Shared customer-resolution helper for the new domains (Orders, Invoices,
 * Subscriptions). Same safety pattern already used by paymentLinkService and
 * reminderService: customerId (exact) takes priority; customerName is a
 * case-insensitive substring match. Never guesses — 0 matches is 404, more
 * than 1 is a 409 AMBIGUOUS_CUSTOMER with full candidate data.
 */
export async function resolveCustomer(merchantId, { customerId, customerName }) {
  if (customerId) {
    const customer = await Customer.findOne({ customerId, merchantId });
    if (!customer) throw Errors.notFound('Customer');
    return customer;
  }

  if (!customerName) {
    throw Errors.badRequest(
      'Provide either customerId or customerName to identify the customer',
      'MISSING_CUSTOMER_IDENTIFIER'
    );
  }

  const matches = await Customer.find({
    merchantId,
    name: { $regex: customerName, $options: 'i' },
  });

  if (matches.length === 0) throw Errors.notFound('Customer');
  if (matches.length > 1) {
    throw Errors.ambiguous(
      matches.map((c) => ({ customerId: c.customerId, name: c.name, phone: c.phone, company: c.company })),
      'Multiple customers match the supplied name',
      'AMBIGUOUS_CUSTOMER'
    );
  }

  return matches[0];
}
