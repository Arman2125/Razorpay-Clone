import Customer from '../models/Customer.js';
import Payment from '../models/Payment.js';
import Reminder from '../models/Reminder.js';
import PaymentLink from '../models/PaymentLink.js';
import Activity from '../models/Activity.js';
import { success, Errors } from '../utils/apiResponse.js';
import { generateId } from '../utils/idGenerator.js';
import { logActivity } from '../services/activityService.js';
import { isValidPhone } from '../utils/validators.js';

export async function listCustomers(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { search } = req.query;

    const filter = { merchantId };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
      ];
    }

    const customers = await Customer.find(filter).sort({ name: 1 }).lean();

    const payments = await Payment.find({ merchantId }).lean();
    const byCustomer = new Map();
    for (const p of payments) {
      if (!byCustomer.has(p.customerId)) byCustomer.set(p.customerId, []);
      byCustomer.get(p.customerId).push(p);
    }

    const enriched = customers.map((c) => {
      const list = byCustomer.get(c.customerId) || [];
      const paidAmount = list.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
      const pendingAmount = list.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
      const pendingCount = list.filter((p) => p.status === 'pending').length;
      const lastPayment = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      return {
        ...c,
        totalPayments: list.length,
        paidAmount,
        pendingAmount,
        pendingCount,
        lastPayment: lastPayment
          ? { paymentId: lastPayment.paymentId, amount: lastPayment.amount, status: lastPayment.status, createdAt: lastPayment.createdAt }
          : null,
      };
    });

    return success(res, enriched);
  } catch (err) {
    next(err);
  }
}

export async function getCustomerById(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const customer = await Customer.findOne({ customerId: req.params.customerId, merchantId }).lean();
    if (!customer) throw Errors.notFound('Customer');

    const payments = await Payment.find({ merchantId, customerId: customer.customerId }).lean();
    const paidAmount = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const pendingAmount = payments.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0);

    return success(res, {
      ...customer,
      totalPayments: payments.length,
      paidAmount,
      pendingAmount,
    });
  } catch (err) {
    next(err);
  }
}

export async function getCustomerPayments(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const customer = await Customer.findOne({ customerId: req.params.customerId, merchantId });
    if (!customer) throw Errors.notFound('Customer');

    const payments = await Payment.find({ merchantId, customerId: customer.customerId })
      .sort({ createdAt: -1 })
      .lean();

    return success(res, payments);
  } catch (err) {
    next(err);
  }
}

export async function getCustomerReminders(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const customer = await Customer.findOne({ customerId: req.params.customerId, merchantId });
    if (!customer) throw Errors.notFound('Customer');

    const reminders = await Reminder.find({ merchantId, customerId: customer.customerId })
      .sort({ createdAt: -1 })
      .lean();

    return success(res, reminders);
  } catch (err) {
    next(err);
  }
}

export async function getCustomerActivity(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const customer = await Customer.findOne({ customerId: req.params.customerId, merchantId });
    if (!customer) throw Errors.notFound('Customer');

    // Activity.entityId is polymorphic (a customerId, paymentId, reminderId,
    // or paymentLinkId depending on entityType) — so "every activity that
    // touches this customer" means gathering the IDs of everything already
    // scoped to (merchantId, customerId) across those collections first,
    // then matching Activity against each entityType's own ID set.
    const [paymentIds, reminderIds, paymentLinkIds] = await Promise.all([
      Payment.find({ merchantId, customerId: customer.customerId }).distinct('paymentId'),
      Reminder.find({ merchantId, customerId: customer.customerId }).distinct('reminderId'),
      PaymentLink.find({ merchantId, customerId: customer.customerId }).distinct('paymentLinkId'),
    ]);

    const activity = await Activity.find({
      merchantId,
      $or: [
        { entityType: 'customer', entityId: customer.customerId },
        { entityType: 'payment', entityId: { $in: paymentIds } },
        { entityType: 'reminder', entityId: { $in: reminderIds } },
        { entityType: 'paymentLink', entityId: { $in: paymentLinkIds } },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    return success(res, activity);
  } catch (err) {
    next(err);
  }
}

export async function createCustomer(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { name, phone, email, company } = req.body;
    if (!name || !phone) throw Errors.badRequest('name and phone are required');
    if (!isValidPhone(phone)) throw Errors.badRequest('phone must be a valid phone number', 'INVALID_PHONE');

    const customer = await Customer.create({
      customerId: generateId('customer'),
      merchantId,
      name,
      phone,
      email,
      company,
    });

    await logActivity({
      merchantId,
      action: 'CUSTOMER_CREATED',
      entityType: 'customer',
      entityId: customer.customerId,
      description: `Customer ${customer.name} created`,
    });

    return success(res, customer, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateCustomer(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { name, phone, email, company } = req.body;
    if (phone !== undefined && !isValidPhone(phone)) {
      throw Errors.badRequest('phone must be a valid phone number', 'INVALID_PHONE');
    }

    const customer = await Customer.findOneAndUpdate(
      { customerId: req.params.customerId, merchantId },
      { $set: { name, phone, email, company } },
      { new: true, runValidators: true }
    );
    if (!customer) throw Errors.notFound('Customer');

    await logActivity({
      merchantId,
      action: 'CUSTOMER_UPDATED',
      entityType: 'customer',
      entityId: customer.customerId,
      description: `Customer ${customer.name} updated`,
    });

    return success(res, customer);
  } catch (err) {
    next(err);
  }
}
