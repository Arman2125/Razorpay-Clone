import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { generateId } from '../utils/idGenerator.js';

import Merchant from '../models/Merchant.js';
import Customer from '../models/Customer.js';
import Payment from '../models/Payment.js';
import Reminder from '../models/Reminder.js';
import Settlement from '../models/Settlement.js';
import Activity from '../models/Activity.js';
import Refund from '../models/Refund.js';
import Order from '../models/Order.js';
import Invoice from '../models/Invoice.js';
import Subscription from '../models/Subscription.js';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysFromNow = (n) => new Date(Date.now() + n * DAY);

async function run() {
  await connectDB(process.env.MONGODB_URI);

  console.log('Clearing existing collections...');
  await Promise.all([
    Merchant.deleteMany({}),
    Customer.deleteMany({}),
    Payment.deleteMany({}),
    Reminder.deleteMany({}),
    Settlement.deleteMany({}),
    Activity.deleteMany({}),
    Refund.deleteMany({}),
    Order.deleteMany({}),
    Invoice.deleteMany({}),
    Subscription.deleteMany({}),
  ]);

  // ---------- Merchants ----------
  const merchantDocs = await Merchant.insertMany([
    {
      merchantId: generateId('merchant'),
      businessName: 'Sharma Wholesale Traders',
      ownerName: 'Vikram Sharma',
      phoneNumber: '+919876543210',
      email: 'vikram@sharmawholesale.example',
      businessType: 'Wholesale / B2B Distribution',
      status: 'active',
    },
    {
      merchantId: generateId('merchant'),
      businessName: 'Patel Distributors',
      ownerName: 'Anil Patel',
      phoneNumber: '+919876543211',
      email: 'anil@pateldistributors.example',
      businessType: 'FMCG Distribution',
      status: 'active',
    },
    {
      merchantId: generateId('merchant'),
      businessName: 'Deshmukh Enterprises',
      ownerName: 'Sameer Deshmukh',
      phoneNumber: '+919561943782',
      email: 'sameer@deshmukhenterprises.example',
      businessType: 'Retail / General Trade',
      status: 'active',
    },
  ]);
  const merchantA = merchantDocs[0];
  const merchantB = merchantDocs[1];
  const merchantC = merchantDocs[2];
  console.log(
    `Merchants created: ${merchantA.businessName} (${merchantA.merchantId}), ${merchantB.businessName} (${merchantB.merchantId}), ${merchantC.businessName} (${merchantC.merchantId})`
  );

  // ---------- Customers ----------
  const customerSpecs = [
    { key: 'rahulA', merchant: merchantA, name: 'Rahul Sharma', phone: '+919820011111', company: 'Rahul Traders' },
    { key: 'priyaA', merchant: merchantA, name: 'Priya Verma', phone: '+919820022222', company: 'Verma Enterprises' },
    { key: 'amitA', merchant: merchantA, name: 'Amit Singh', phone: '+919820033333', company: 'Singh & Sons' },
    { key: 'sunitaA', merchant: merchantA, name: 'Sunita Rao', phone: '+919820044444', company: 'Rao Retail' },
    { key: 'deepakA', merchant: merchantA, name: 'Deepak Joshi', phone: '+919820055555', company: 'Joshi General Store' },
    { key: 'nehaA', merchant: merchantA, name: 'Neha Gupta', phone: '+919820066666', company: 'Gupta Textiles' },
    { key: 'rahulB', merchant: merchantB, name: 'Rahul Sharma', phone: '+919820077777', company: 'Sharma Provisions' },
    { key: 'kavitaB', merchant: merchantB, name: 'Kavita Nair', phone: '+919820088888', company: 'Nair Traders' },
    { key: 'rameshB', merchant: merchantB, name: 'Ramesh Iyer', phone: '+919820099999', company: 'Iyer Wholesale' },
    { key: 'anjaliB', merchant: merchantB, name: 'Anjali Desai', phone: '+919820010101', company: 'Desai Retail' },
    { key: 'sureshB', merchant: merchantB, name: 'Suresh Menon', phone: '+919820020202', company: 'Menon Stores' },

    // Deliberate name collision within Merchant A, for testing AMBIGUOUS_CUSTOMER
    // resolution on payment-link / reminder creation-by-name.
    { key: 'anitaA1', merchant: merchantA, name: 'Anita Kumar', phone: '+919820030303', company: 'Kumar Traders' },
    { key: 'anitaA2', merchant: merchantA, name: 'Anita Kumar', phone: '+919820040404', company: 'Kumar Textiles' },
  ];

  const customerDocs = await Customer.insertMany(
    customerSpecs.map((c) => ({
      customerId: generateId('customer'),
      merchantId: c.merchant.merchantId,
      name: c.name,
      phone: c.phone,
      company: c.company,
      createdAt: daysAgo(75),
    }))
  );
  const cust = {};
  customerSpecs.forEach((spec, i) => (cust[spec.key] = customerDocs[i]));
  console.log(`Customers created: ${customerDocs.length}`);

  // ---------- Payments ----------
  // paymentSpecs: [customerKey, amount, method, status, createdAtDaysAgo, dueDateDaysAgo, paidAtDaysAgo]
  const paymentSpecs = [
    // Rahul Sharma (Merchant A) — deliberate ambiguous pair: same name, same amount, two dates
    ['rahulA', 25000, 'UPI', 'pending', 20, 10, null, 'Invoice #INV-1042'],
    ['rahulA', 25000, 'UPI', 'pending', 15, 7, null, 'Invoice #INV-1058'],
    ['rahulA', 12000, 'Card', 'paid', 60, 46, 47, 'Invoice #INV-0987'],
    ['rahulA', 18000, 'Net Banking', 'paid', 50, 36, 30, 'Invoice #INV-1001'],
    ['rahulA', 5000, 'Cash', 'failed', 25, 18, null, 'Invoice #INV-1020'],

    // Priya Verma (Merchant A)
    ['priyaA', 9000, 'UPI', 'pending', 18, 4, null, 'Invoice #INV-1051'],
    ['priyaA', 22000, 'Card', 'paid', 55, 41, 41, 'Invoice #INV-0965'],
    ['priyaA', 15000, 'UPI', 'paid', 40, 26, 20, 'Invoice #INV-0998'],

    // Amit Singh (Merchant A)
    ['amitA', 30000, 'Net Banking', 'pending', 22, 12, null, 'Invoice #INV-1049'],
    ['amitA', 7000, 'Cash', 'failed', 10, 3, null, 'Invoice #INV-1070'],
    ['amitA', 45000, 'Card', 'paid', 70, 56, 56, 'Invoice #INV-0940'],

    // Sunita Rao (Merchant A)
    ['sunitaA', 5000, 'UPI', 'pending', 8, 1, null, 'Invoice #INV-1075'],
    ['sunitaA', 40000, 'UPI', 'pending', 30, 20, null, 'Invoice #INV-1035'],
    ['sunitaA', 6000, 'Cash', 'paid', 45, 31, 31, 'Invoice #INV-0985'],

    // Deepak Joshi (Merchant A)
    ['deepakA', 3000, 'UPI', 'pending', 5, -2, null, 'Invoice #INV-1080'],
    ['deepakA', 10000, 'Card', 'paid', 35, 21, 19, 'Invoice #INV-1010'],
    ['deepakA', 20000, 'Net Banking', 'failed', 12, 5, null, 'Invoice #INV-1065'],

    // Neha Gupta (Merchant A)
    ['nehaA', 60000, 'Card', 'pending', 14, 6, null, 'Invoice #INV-1055'],
    ['nehaA', 8000, 'UPI', 'paid', 28, 14, 14, 'Invoice #INV-1015'],
    ['nehaA', 5000, 'Cash', 'paid', 20, 6, 6, 'Invoice #INV-1030'],

    // Rahul Sharma (Merchant B) — same name/amount as Merchant A's pair, PAID, different merchant (isolation test)
    ['rahulB', 25000, 'UPI', 'paid', 25, 20, 20, 'Invoice #PB-2201'],
    ['rahulB', 9000, 'Card', 'pending', 10, 3, null, 'Invoice #PB-2230'],

    // Kavita Nair (Merchant B)
    ['kavitaB', 15000, 'UPI', 'pending', 12, 4, null, 'Invoice #PB-2215'],
    ['kavitaB', 22000, 'Net Banking', 'paid', 40, 26, 26, 'Invoice #PB-2150'],
    ['kavitaB', 6000, 'Cash', 'failed', 9, 2, null, 'Invoice #PB-2225'],

    // Ramesh Iyer (Merchant B)
    ['rameshB', 35000, 'Card', 'pending', 16, 8, null, 'Invoice #PB-2210'],
    ['rameshB', 12000, 'UPI', 'paid', 33, 19, 15, 'Invoice #PB-2170'],

    // Anjali Desai (Merchant B)
    ['anjaliB', 8000, 'UPI', 'pending', 9, 2, null, 'Invoice #PB-2222'],
    ['anjaliB', 27000, 'Card', 'paid', 50, 36, 36, 'Invoice #PB-2140'],
    ['anjaliB', 4000, 'Cash', 'failed', 7, 1, null, 'Invoice #PB-2228'],

    // Suresh Menon (Merchant B)
    ['sureshB', 50000, 'Net Banking', 'pending', 18, 9, null, 'Invoice #PB-2218'],
    ['sureshB', 9500, 'UPI', 'paid', 22, 8, 8, 'Invoice #PB-2190'],
  ];

  const paymentDocs = await Payment.insertMany(
    paymentSpecs.map(([key, amount, method, status, createdAgo, dueAgo, paidAgo, description]) => ({
      paymentId: generateId('payment'),
      merchantId: cust[key].merchantId,
      customerId: cust[key].customerId,
      amount,
      currency: 'INR',
      status,
      paymentMethod: method,
      description,
      createdAt: daysAgo(createdAgo),
      dueDate: dueAgo >= 0 ? daysAgo(dueAgo) : daysFromNow(-dueAgo),
      paidAt: paidAgo !== null ? daysAgo(paidAgo) : undefined,
    }))
  );
  console.log(`Payments created: ${paymentDocs.length}`);

  // Map back to spec keys for locating specific payments by (customerKey, description)
  const paymentByDescription = new Map(paymentDocs.map((p) => [p.description, p]));

  // ---------- Reminders (deliberately NOT touching the Rahul-A ambiguous pair) ----------
  const reminderTargets = [
    { desc: 'Invoice #INV-1051', sentAgo: 2 }, // Priya
    { desc: 'Invoice #INV-1049', sentAgo: 9 }, // Amit
    { desc: 'Invoice #INV-1075', sentAgo: 0.3 }, // Sunita (small pending, near due)
    { desc: 'Invoice #PB-2215', sentAgo: 3 }, // Kavita
    { desc: 'Invoice #PB-2210', sentAgo: 6 }, // Ramesh
    { desc: 'Invoice #PB-2222', sentAgo: 1 }, // Anjali
  ];

  const reminderDocs = [];
  for (const target of reminderTargets) {
    const payment = paymentByDescription.get(target.desc);
    const customerDoc = customerDocs.find((c) => c.customerId === payment.customerId);
    const sentAt = daysAgo(target.sentAgo);
    const message = `Reminder: Your payment of ₹${payment.amount} is pending. Please complete it at your earliest convenience.`;

    const reminder = await Reminder.create({
      reminderId: generateId('reminder'),
      merchantId: payment.merchantId,
      paymentId: payment.paymentId,
      customerId: payment.customerId,
      message,
      status: 'sent',
      sentAt,
      createdAt: sentAt,
    });
    reminderDocs.push({ reminder, payment, customerDoc, sentAt });

    payment.lastReminderAt = sentAt;
    await payment.save();
  }
  console.log(`Reminders created: ${reminderDocs.length}`);

  // ---------- Settlements ----------
  const settlementSpecs = [
    { merchant: merchantA, amount: 45000, status: 'processed', dateAgo: 30, utr: 'UTR2026081234' },
    { merchant: merchantA, amount: 38000, status: 'processed', dateAgo: 15, utr: 'UTR2026081987' },
    { merchant: merchantA, amount: 22000, status: 'pending', dateAgo: 1, utr: null },
    { merchant: merchantB, amount: 30000, status: 'processed', dateAgo: 25, utr: 'UTR2026082211' },
    { merchant: merchantB, amount: 27000, status: 'processed', dateAgo: 10, utr: 'UTR2026082355' },
    { merchant: merchantB, amount: 15000, status: 'pending', dateAgo: 2, utr: null },
  ];

  const settlementDocs = await Settlement.insertMany(
    settlementSpecs.map((s) => ({
      settlementId: generateId('settlement'),
      merchantId: s.merchant.merchantId,
      amount: s.amount,
      status: s.status,
      settlementDate: daysAgo(s.dateAgo),
      utr: s.utr,
      createdAt: daysAgo(s.dateAgo),
    }))
  );
  console.log(`Settlements created: ${settlementDocs.length}`);

  // ---------- Activity log ----------
  const activities = [];

  customerSpecs.forEach((spec, i) => {
    activities.push({
      activityId: generateId('activity'),
      merchantId: spec.merchant.merchantId,
      action: 'CUSTOMER_CREATED',
      entityType: 'customer',
      entityId: customerDocs[i].customerId,
      description: `Customer ${spec.name} created`,
      createdAt: daysAgo(75),
    });
  });

  for (const { reminder, payment, customerDoc, sentAt } of reminderDocs) {
    activities.push({
      activityId: generateId('activity'),
      merchantId: payment.merchantId,
      action: 'REMINDER_SENT',
      entityType: 'reminder',
      entityId: reminder.reminderId,
      description: `Reminder sent to ${customerDoc.name} for ₹${payment.amount} payment (${payment.paymentId})`,
      metadata: { paymentId: payment.paymentId, customerId: customerDoc.customerId, amount: payment.amount },
      createdAt: sentAt,
    });
  }

  const viewedSamples = [
    paymentDocs[2], // Rahul A paid payment
    paymentDocs[12], // Sunita overdue pending
    paymentDocs[21], // Rahul B paid payment
    paymentDocs[27], // Anjali paid payment
  ];
  viewedSamples.forEach((p, i) => {
    activities.push({
      activityId: generateId('activity'),
      merchantId: p.merchantId,
      action: 'PAYMENT_VIEWED',
      entityType: 'payment',
      entityId: p.paymentId,
      description: `Payment ${p.paymentId} viewed`,
      metadata: { amount: p.amount, status: p.status },
      createdAt: daysAgo(4 + i),
    });
  });

  activities.push(
    {
      activityId: generateId('activity'),
      merchantId: merchantA.merchantId,
      action: 'SETTLEMENT_VIEWED',
      entityType: 'settlement',
      entityId: settlementDocs[0].settlementId,
      description: `Settlement ${settlementDocs[0].settlementId} viewed`,
      createdAt: daysAgo(5),
    },
    {
      activityId: generateId('activity'),
      merchantId: merchantB.merchantId,
      action: 'SETTLEMENT_VIEWED',
      entityType: 'settlement',
      entityId: settlementDocs[3].settlementId,
      description: `Settlement ${settlementDocs[3].settlementId} viewed`,
      createdAt: daysAgo(6),
    }
  );

  await Activity.insertMany(activities);
  console.log(`Activity records created: ${activities.length}`);

  // ---------- Refunds (additive demo data) ----------
  const refundedInv0987 = paymentByDescription.get('Invoice #INV-0987'); // Rahul A, paid 12000
  const refundedInv0965 = paymentByDescription.get('Invoice #INV-0965'); // Priya A, paid 22000

  const refundDocs = await Refund.insertMany([
    {
      refundId: generateId('refund'),
      merchantId: refundedInv0987.merchantId,
      paymentId: refundedInv0987.paymentId,
      customerId: refundedInv0987.customerId,
      amount: 4000,
      currency: 'INR',
      status: 'refunded',
      reason: 'Partial return of goods',
      createdAt: daysAgo(10),
    },
    {
      refundId: generateId('refund'),
      merchantId: refundedInv0965.merchantId,
      paymentId: refundedInv0965.paymentId,
      customerId: refundedInv0965.customerId,
      amount: 22000,
      currency: 'INR',
      status: 'refunded',
      reason: 'Order cancelled by customer',
      createdAt: daysAgo(20),
    },
  ]);
  console.log(`Refunds created: ${refundDocs.length}`);

  // ---------- Orders (additive demo data) ----------
  const orderDocs = await Order.insertMany([
    {
      orderId: generateId('order'),
      merchantId: merchantA.merchantId,
      customerId: cust.nehaA.customerId,
      amount: 15000,
      currency: 'INR',
      status: 'created',
      receipt: 'ORD-A-1001',
      createdAt: daysAgo(3),
    },
    {
      orderId: generateId('order'),
      merchantId: merchantA.merchantId,
      customerId: cust.sunitaA.customerId,
      amount: 8000,
      currency: 'INR',
      status: 'paid',
      receipt: 'ORD-A-1002',
      createdAt: daysAgo(12),
    },
    {
      orderId: generateId('order'),
      merchantId: merchantB.merchantId,
      customerId: cust.kavitaB.customerId,
      amount: 20000,
      currency: 'INR',
      status: 'cancelled',
      receipt: 'ORD-B-2001',
      createdAt: daysAgo(6),
    },
  ]);
  console.log(`Orders created: ${orderDocs.length}`);

  // ---------- Invoices (additive demo data) ----------
  const invoiceDocs = await Invoice.insertMany([
    {
      invoiceId: generateId('invoice'),
      merchantId: merchantA.merchantId,
      customerId: cust.amitA.customerId,
      amount: 30000,
      currency: 'INR',
      status: 'draft',
      description: 'Draft invoice awaiting review',
      createdAt: daysAgo(1),
    },
    {
      invoiceId: generateId('invoice'),
      merchantId: merchantA.merchantId,
      customerId: cust.deepakA.customerId,
      amount: 10000,
      currency: 'INR',
      status: 'issued',
      description: 'Consulting services — March',
      dueDate: daysFromNow(10),
      issuedAt: daysAgo(5),
      createdAt: daysAgo(5),
    },
    {
      invoiceId: generateId('invoice'),
      merchantId: merchantA.merchantId,
      customerId: cust.nehaA.customerId,
      amount: 5000,
      currency: 'INR',
      status: 'issued',
      description: 'Overdue demo invoice',
      dueDate: daysAgo(5),
      issuedAt: daysAgo(20),
      createdAt: daysAgo(20),
    },
    {
      invoiceId: generateId('invoice'),
      merchantId: merchantB.merchantId,
      customerId: cust.rameshB.customerId,
      amount: 12000,
      currency: 'INR',
      status: 'paid',
      description: 'Paid demo invoice',
      dueDate: daysAgo(15),
      issuedAt: daysAgo(25),
      paidAt: daysAgo(16),
      createdAt: daysAgo(25),
    },
  ]);
  console.log(`Invoices created: ${invoiceDocs.length}`);

  // ---------- Subscriptions (additive demo data) ----------
  const subscriptionDocs = await Subscription.insertMany([
    {
      subscriptionId: generateId('subscription'),
      merchantId: merchantA.merchantId,
      customerId: cust.priyaA.customerId,
      planId: 'plan_monthly_basic',
      amount: 2000,
      currency: 'INR',
      interval: 'month',
      intervalCount: 1,
      status: 'active',
      startAt: daysAgo(30),
      nextBillingAt: daysFromNow(5),
      createdAt: daysAgo(30),
    },
    {
      subscriptionId: generateId('subscription'),
      merchantId: merchantB.merchantId,
      customerId: cust.anjaliB.customerId,
      planId: 'plan_weekly_lite',
      amount: 500,
      currency: 'INR',
      interval: 'week',
      intervalCount: 1,
      status: 'paused',
      startAt: daysAgo(21),
      nextBillingAt: daysFromNow(2),
      createdAt: daysAgo(21),
    },
  ]);
  console.log(`Subscriptions created: ${subscriptionDocs.length}`);

  console.log('\nSeed complete.\n');
  console.log('Demo merchant login phone numbers:');
  console.log(`  ${merchantA.businessName}: ${merchantA.phoneNumber}`);
  console.log(`  ${merchantB.businessName}: ${merchantB.phoneNumber}`);
  console.log(`  ${merchantC.businessName}: ${merchantC.phoneNumber}`);
  console.log('\nAmbiguity demo: Merchant A -> "Rahul Sharma" has two pending ₹25,000 payments (different due dates).');
  console.log('Isolation demo: Merchant B also has a "Rahul Sharma" with a paid ₹25,000 payment — must never be visible to Merchant A.');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
