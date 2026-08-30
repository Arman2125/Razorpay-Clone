import Reminder from '../models/Reminder.js';
import Customer from '../models/Customer.js';
import { success, Errors } from '../utils/apiResponse.js';
import { createReminder } from '../services/reminderService.js';

export async function postReminder(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { paymentId, customerId, customerName, amount } = req.body;

    if (!paymentId && !customerId && !customerName) {
      throw Errors.badRequest(
        'Provide either paymentId, or customerId/customerName to identify the payment',
        'MISSING_PAYMENT_IDENTIFIER'
      );
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

    const { reminder, deduped } = await createReminder({
      merchantId,
      paymentId,
      customerId,
      customerName,
      amount,
      idempotencyKey,
    });

    return success(res, reminder, deduped ? 200 : 201);
  } catch (err) {
    next(err);
  }
}

export async function listReminders(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const { status, customer, paymentId } = req.query;

    const filter = { merchantId };
    if (status) filter.status = status;
    if (paymentId) filter.paymentId = paymentId;

    let reminders = await Reminder.find(filter).sort({ createdAt: -1 }).lean();

    if (customer) {
      const matches = await Customer.find({
        merchantId,
        name: { $regex: customer, $options: 'i' },
      }).select('customerId');
      const ids = new Set(matches.map((c) => c.customerId));
      reminders = reminders.filter((r) => ids.has(r.customerId));
    }

    return success(res, reminders);
  } catch (err) {
    next(err);
  }
}

export async function getReminderById(req, res, next) {
  try {
    const merchantId = req.user.merchantId;
    const reminder = await Reminder.findOne({ reminderId: req.params.reminderId, merchantId }).lean();
    if (!reminder) throw Errors.notFound('Reminder');
    return success(res, reminder);
  } catch (err) {
    next(err);
  }
}
