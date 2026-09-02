// Idempotent demo-data seeder for the "Deshmukh Enterprises" merchant
// (phone +919561943782). Unlike seed.js, this NEVER wipes collections —
// it only finds-or-creates records for this one merchant, so it is safe
// to re-run against a live database without touching anyone else's data.
//
// Wherever the application has a real service for creating a record
// (reminders, payment links, paying a link), this uses that service
// directly so every side effect (activity logging, state transitions,
// shortUrl generation) matches production behavior exactly. Payments and
// Settlements are created via direct model inserts because the app has
// no merchant-facing "create payment" / "create settlement" endpoint —
// seed.js itself does the same for those two.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { generateId } from '../utils/idGenerator.js';

import Merchant from '../models/Merchant.js';
import Customer from '../models/Customer.js';
import Payment from '../models/Payment.js';
import Reminder from '../models/Reminder.js';
import PaymentLink from '../models/PaymentLink.js';
import Settlement from '../models/Settlement.js';
import Activity from '../models/Activity.js';

import { logActivity } from '../services/activityService.js';
import { createReminder } from '../services/reminderService.js';
import { createPaymentLink, payPaymentLink } from '../services/paymentLinkService.js';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysFromNow = (n) => new Date(Date.now() + n * DAY);

const TARGET_MERCHANT_PHONE = '+919561943782';

async function run() {
  await connectDB(process.env.MONGODB_URI);

  const merchant = await Merchant.findOne({ phoneNumber: TARGET_MERCHANT_PHONE });
  if (!merchant) {
    throw new Error(
      `No merchant found with phoneNumber ${TARGET_MERCHANT_PHONE}. Refusing to invent a merchant — aborting.`
    );
  }
  console.log(`Target merchant: ${merchant.businessName} (${merchant.merchantId})`);

  // ---------- Customer (find-or-create) ----------
  const customerName = 'Manoj Pawar';
  const customerPhone = '+919820051515';
  let customer = await Customer.findOne({ merchantId: merchant.merchantId, phone: customerPhone });
  if (customer) {
    console.log(`Customer already exists: ${customer.name} (${customer.customerId}) — reusing.`);
  } else {
    customer = await Customer.create({
      customerId: generateId('customer'),
      merchantId: merchant.merchantId,
      name: customerName,
      phone: customerPhone,
      email: 'manoj.pawar@example.com',
      company: 'Pawar General Store',
      createdAt: daysAgo(50),
    });
    await logActivity({
      merchantId: merchant.merchantId,
      action: 'CUSTOMER_CREATED',
      entityType: 'customer',
      entityId: customer.customerId,
      description: `Customer ${customer.name} created`,
    });
    console.log(`Customer created: ${customer.name} (${customer.customerId})`);
  }

  // ---------- Payments (find-or-create by description) ----------
  // [description, amount, method, status, createdAgoDays, dueAgoDays(neg=future), paidAgoDays]
  const paymentSpecs = [
    ['Invoice #DE-3001', 18000, 'UPI', 'pending', 20, 10, null],
    ['Invoice #DE-3012', 9500, 'Card', 'pending', 5, -5, null],
    ['Invoice #DE-2950', 32000, 'Net Banking', 'paid', 45, 31, 30],
    ['Invoice #DE-2980', 14000, 'UPI', 'paid', 30, 16, 15],
    ['Invoice #DE-3020', 6000, 'Cash', 'failed', 12, 5, null],
  ];

  const payments = {};
  for (const [description, amount, method, status, createdAgo, dueAgo, paidAgo] of paymentSpecs) {
    let payment = await Payment.findOne({
      merchantId: merchant.merchantId,
      customerId: customer.customerId,
      description,
    });
    if (payment) {
      console.log(`Payment already exists: ${description} (${payment.paymentId}) — reusing.`);
    } else {
      payment = await Payment.create({
        paymentId: generateId('payment'),
        merchantId: merchant.merchantId,
        customerId: customer.customerId,
        amount,
        currency: 'INR',
        status,
        paymentMethod: method,
        description,
        createdAt: daysAgo(createdAgo),
        dueDate: dueAgo >= 0 ? daysAgo(dueAgo) : daysFromNow(-dueAgo),
        paidAt: paidAgo !== null ? daysAgo(paidAgo) : undefined,
      });
      console.log(`Payment created: ${description} (${payment.paymentId}) — ${status}`);
    }
    payments[description] = payment;
  }

  // ---------- Reminder on the overdue pending payment ----------
  const overduePayment = payments['Invoice #DE-3001'];
  const existingReminder = await Reminder.findOne({
    merchantId: merchant.merchantId,
    paymentId: overduePayment.paymentId,
  });
  if (existingReminder) {
    console.log(`Reminder already exists for ${overduePayment.paymentId} (${existingReminder.reminderId}) — reusing.`);
  } else if (overduePayment.status !== 'pending') {
    console.log(`Skipped reminder — ${overduePayment.paymentId} is no longer pending.`);
  } else {
    const { reminder } = await createReminder({
      merchantId: merchant.merchantId,
      paymentId: overduePayment.paymentId,
    });
    console.log(`Reminder created: ${reminder.reminderId} for payment ${overduePayment.paymentId}`);
  }

  // ---------- Payment Links ----------
  // Link A: active, tied to the still-pending Invoice #DE-3012 (the "Get
  // Payment Link for this due payment" flow — existingPaymentId).
  const pendingPayment = payments['Invoice #DE-3012'];
  let linkA = await PaymentLink.findOne({
    merchantId: merchant.merchantId,
    existingPaymentId: pendingPayment.paymentId,
  });
  if (linkA) {
    console.log(`Active payment link already exists for ${pendingPayment.paymentId}: ${linkA.paymentLinkId} — reusing.`);
  } else if (pendingPayment.status !== 'pending') {
    console.log(`Skipped active payment link — ${pendingPayment.paymentId} is no longer pending.`);
  } else {
    const { link } = await createPaymentLink({
      merchantId: merchant.merchantId,
      customerId: customer.customerId,
      existingPaymentId: pendingPayment.paymentId,
    });
    linkA = link;
    console.log(`Active payment link created: ${linkA.paymentLinkId} (₹${linkA.amount})`);
  }

  // Link B: a fresh ad-hoc link, already paid — exercises the "new
  // receivable created by a payment link" path (payPaymentLink creates its
  // own Payment record).
  const paidLinkDescription = 'Advance for Diwali stock order';
  let linkB = await PaymentLink.findOne({
    merchantId: merchant.merchantId,
    customerId: customer.customerId,
    description: paidLinkDescription,
  });
  if (linkB) {
    console.log(`Paid payment link already exists: ${linkB.paymentLinkId} — reusing.`);
  } else {
    const created = await createPaymentLink({
      merchantId: merchant.merchantId,
      customerId: customer.customerId,
      amount: 12000,
      description: paidLinkDescription,
    });
    const paidResult = await payPaymentLink(created.link.paymentLinkId);
    linkB = paidResult.link;
    payments[paidLinkDescription] = paidResult.payment;
    console.log(
      `Paid payment link created & paid: ${linkB.paymentLinkId} (₹${linkB.amount}) -> payment ${paidResult.payment.paymentId}`
    );
  }

  // ---------- Settlements (merchant-level, NOT tied to the customer) ----------
  const settlementSpecs = [
    { amount: 30500, status: 'processed', dateAgo: 28, utr: 'UTR2026082599' },
    { amount: 14000, status: 'processed', dateAgo: 13, utr: 'UTR2026082644' },
    { amount: 12000, status: 'pending', dateAgo: 0, utr: null },
  ];
  for (const s of settlementSpecs) {
    const existing = s.utr
      ? await Settlement.findOne({ merchantId: merchant.merchantId, utr: s.utr })
      : await Settlement.findOne({ merchantId: merchant.merchantId, amount: s.amount, status: 'pending' });
    if (existing) {
      console.log(`Settlement already exists: ${existing.settlementId} — reusing.`);
      continue;
    }
    const settlement = await Settlement.create({
      settlementId: generateId('settlement'),
      merchantId: merchant.merchantId,
      amount: s.amount,
      status: s.status,
      settlementDate: daysAgo(s.dateAgo),
      utr: s.utr,
      createdAt: daysAgo(s.dateAgo),
    });
    console.log(`Settlement created: ${settlement.settlementId} (${s.status}, ₹${s.amount})`);
  }

  // ---------- A couple of PAYMENT_VIEWED activity entries, for a coherent feed ----------
  for (const desc of ['Invoice #DE-2950', 'Invoice #DE-2980']) {
    const p = payments[desc];
    const already = await Activity.findOne({
      merchantId: merchant.merchantId,
      entityType: 'payment',
      entityId: p.paymentId,
      action: 'PAYMENT_VIEWED',
    });
    if (!already) {
      await logActivity({
        merchantId: merchant.merchantId,
        action: 'PAYMENT_VIEWED',
        entityType: 'payment',
        entityId: p.paymentId,
        description: `Payment ${p.paymentId} viewed`,
        metadata: { amount: p.amount, status: p.status },
      });
    }
  }

  console.log('\nSeed for Deshmukh Enterprises complete.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Seeding Deshmukh Enterprises demo data failed:', err);
  process.exit(1);
});
