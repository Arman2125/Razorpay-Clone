// Idempotent demo-data seeder for the 8 customers added by
// addDeshmukhCustomers.js under the "Deshmukh Enterprises" merchant
// (mer_1qo1v28tdrds). Those customers currently have zero payments.
// This NEVER wipes collections and never touches Manoj Pawar's data —
// it only finds-or-creates payments (by merchant+customer+description),
// reminders, and payment links for these 8 customers. Safe to re-run.
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { generateId } from '../utils/idGenerator.js';

import Merchant from '../models/Merchant.js';
import Customer from '../models/Customer.js';
import Payment from '../models/Payment.js';
import Reminder from '../models/Reminder.js';
import PaymentLink from '../models/PaymentLink.js';
import Activity from '../models/Activity.js';

import { logActivity } from '../services/activityService.js';
import { createReminder } from '../services/reminderService.js';
import { createPaymentLink, payPaymentLink } from '../services/paymentLinkService.js';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysFromNow = (n) => new Date(Date.now() + n * DAY);

const TARGET_MERCHANT_PHONE = '+919561943782';

// [customerPhone, description, amount, method, status, createdAgo, dueAgo(neg=future), paidAgo]
const PAYMENT_SPECS = [
  ['+919845010001', 'Invoice #SH-101', 15000, 'Net Banking', 'paid', 35, 25, 24],
  ['+919845010001', 'Invoice #SH-108', 8200, 'Card', 'pending', 8, -2, null],
  ['+919845010001', 'Invoice #SH-112', 4500, 'Cash', 'failed', 3, -4, null],

  ['+919845010002', 'Invoice #PF-201', 22000, 'Net Banking', 'paid', 33, 20, 19],
  ['+919845010002', 'Invoice #PF-207', 9800, 'UPI', 'paid', 15, 5, 4],
  ['+919845010002', 'Invoice #PF-210', 6000, 'UPI', 'pending', 6, 4, null],

  ['+919845010003', 'Invoice #DA-301', 45000, 'Net Banking', 'paid', 30, 18, 16],
  ['+919845010003', 'Invoice #DA-309', 27000, 'UPI', 'pending', 10, -6, null],
  ['+919845010003', 'Invoice #DA-314', 12500, 'Card', 'pending', 2, -10, null],

  ['+919845010004', 'Invoice #KB-401', 3200, 'Cash', 'paid', 28, 20, 20],
  ['+919845010004', 'Invoice #KB-405', 5400, 'UPI', 'paid', 12, 4, 3],
  ['+919845010004', 'Invoice #KB-409', 2100, 'UPI', 'failed', 4, -3, null],

  ['+919845010005', 'Invoice #JE-501', 31000, 'Net Banking', 'paid', 26, 14, 13],
  ['+919845010005', 'Invoice #JE-506', 18500, 'Card', 'pending', 9, 3, null],
  ['+919845010005', 'Invoice #JE-511', 9000, 'UPI', 'pending', 1, -9, null],

  ['+919845010006', 'Invoice #PS-601', 4800, 'UPI', 'paid', 18, 10, 9],
  ['+919845010006', 'Invoice #PS-604', 6200, 'Cash', 'pending', 7, -5, null],
  ['+919845010006', 'Invoice #PS-607', 3300, 'UPI', 'failed', 2, -8, null],

  ['+919845010007', 'Invoice #SG-701', 7600, 'UPI', 'paid', 10, 3, 2],
  ['+919845010007', 'Invoice #SG-704', 5100, 'Card', 'pending', 4, 1, null],
  ['+919845010007', 'Invoice #SG-706', 2800, 'Cash', 'pending', 1, -12, null],

  ['+919845010008', 'Invoice #MC-801', 13500, 'Net Banking', 'paid', 4, -1, 0],
  ['+919845010008', 'Invoice #MC-802', 4200, 'UPI', 'pending', 2, -6, null],
  ['+919845010008', 'Invoice #MC-803', 1800, 'Cash', 'pending', 1, -14, null],
];

// Overdue pending payments to raise a reminder on (description -> customerPhone via PAYMENT_SPECS).
const REMINDER_DESCRIPTIONS = ['Invoice #PF-210', 'Invoice #JE-506', 'Invoice #SG-704'];

// PAYMENT_VIEWED activity for a couple of paid payments, for a coherent feed.
const VIEWED_DESCRIPTIONS = ['Invoice #SH-101', 'Invoice #PF-201'];

async function run() {
  await connectDB(process.env.MONGODB_URI);

  const merchant = await Merchant.findOne({ phoneNumber: TARGET_MERCHANT_PHONE });
  if (!merchant) {
    throw new Error(`No merchant found with phoneNumber ${TARGET_MERCHANT_PHONE}. Aborting.`);
  }
  console.log(`Target merchant: ${merchant.businessName} (${merchant.merchantId})`);

  const customersByPhone = {};
  const payments = {};
  let created = 0;
  let reused = 0;

  // ---------- Payments ----------
  for (const [phone, description, amount, method, status, createdAgo, dueAgo, paidAgo] of PAYMENT_SPECS) {
    let customer = customersByPhone[phone];
    if (!customer) {
      customer = await Customer.findOne({ merchantId: merchant.merchantId, phone });
      if (!customer) {
        console.log(`Skipping "${description}" — no customer found with phone ${phone}.`);
        continue;
      }
      customersByPhone[phone] = customer;
    }

    let payment = await Payment.findOne({
      merchantId: merchant.merchantId,
      customerId: customer.customerId,
      description,
    });
    if (payment) {
      console.log(`Payment already exists: ${description} (${payment.paymentId}) — reusing.`);
      reused++;
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
      console.log(`Payment created: ${customer.name} — ${description} (${payment.paymentId}) — ${status}`);
      created++;
    }
    payments[description] = payment;
  }

  // ---------- Reminders on overdue pending payments ----------
  for (const description of REMINDER_DESCRIPTIONS) {
    const payment = payments[description];
    if (!payment) continue;
    const existing = await Reminder.findOne({ merchantId: merchant.merchantId, paymentId: payment.paymentId });
    if (existing) {
      console.log(`Reminder already exists for ${payment.paymentId} (${existing.reminderId}) — reusing.`);
    } else if (payment.status !== 'pending') {
      console.log(`Skipped reminder — ${payment.paymentId} is no longer pending.`);
    } else {
      const { reminder } = await createReminder({ merchantId: merchant.merchantId, paymentId: payment.paymentId });
      console.log(`Reminder created: ${reminder.reminderId} for payment ${payment.paymentId} (${description})`);
    }
  }

  // ---------- Payment Links ----------
  // Active link tied to Amit Deshmukh's still-pending Invoice #DA-309.
  const daPayment = payments['Invoice #DA-309'];
  if (daPayment) {
    let link = await PaymentLink.findOne({ merchantId: merchant.merchantId, existingPaymentId: daPayment.paymentId });
    if (link) {
      console.log(`Active payment link already exists for ${daPayment.paymentId}: ${link.paymentLinkId} — reusing.`);
    } else if (daPayment.status !== 'pending') {
      console.log(`Skipped active payment link — ${daPayment.paymentId} is no longer pending.`);
    } else {
      const amitCustomer = customersByPhone['+919845010003'];
      const result = await createPaymentLink({
        merchantId: merchant.merchantId,
        customerId: amitCustomer.customerId,
        existingPaymentId: daPayment.paymentId,
      });
      link = result.link;
      console.log(`Active payment link created: ${link.paymentLinkId} (₹${link.amount}) for Amit Deshmukh`);
    }
  }

  // Fresh ad-hoc link for Sneha Kulkarni, already paid.
  const snehaCustomer = customersByPhone['+919845010004'];
  if (snehaCustomer) {
    const paidLinkDescription = 'Advance for Diwali book stock';
    let linkB = await PaymentLink.findOne({
      merchantId: merchant.merchantId,
      customerId: snehaCustomer.customerId,
      description: paidLinkDescription,
    });
    if (linkB) {
      console.log(`Paid payment link already exists: ${linkB.paymentLinkId} — reusing.`);
    } else {
      const createdLink = await createPaymentLink({
        merchantId: merchant.merchantId,
        customerId: snehaCustomer.customerId,
        amount: 5000,
        description: paidLinkDescription,
      });
      const paidResult = await payPaymentLink(createdLink.link.paymentLinkId);
      linkB = paidResult.link;
      console.log(
        `Paid payment link created & paid: ${linkB.paymentLinkId} (₹${linkB.amount}) -> payment ${paidResult.payment.paymentId}`
      );
    }
  }

  // ---------- PAYMENT_VIEWED activity for a couple of paid payments ----------
  for (const description of VIEWED_DESCRIPTIONS) {
    const payment = payments[description];
    if (!payment) continue;
    const already = await Activity.findOne({
      merchantId: merchant.merchantId,
      entityType: 'payment',
      entityId: payment.paymentId,
      action: 'PAYMENT_VIEWED',
    });
    if (!already) {
      await logActivity({
        merchantId: merchant.merchantId,
        action: 'PAYMENT_VIEWED',
        entityType: 'payment',
        entityId: payment.paymentId,
        description: `Payment ${payment.paymentId} viewed`,
        metadata: { amount: payment.amount, status: payment.status },
      });
    }
  }

  console.log('\n--- Summary ---');
  console.log(`New payments created: ${created}`);
  console.log(`Already existed (reused): ${reused}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Seeding customer payments failed:', err);
  process.exit(1);
});
