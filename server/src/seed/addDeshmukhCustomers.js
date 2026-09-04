// Idempotent customer seeder for the "Deshmukh Enterprises" merchant
// (mer_1qo1v28tdrds). Only finds-or-creates the customers listed below —
// never touches Manoj Pawar or any other existing customer/payment/link/
// reminder/settlement/activity record, and never touches any other
// merchant. Safe to re-run: matching is by (merchantId, phone).
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { generateId } from '../utils/idGenerator.js';

import Merchant from '../models/Merchant.js';
import Customer from '../models/Customer.js';

import { logActivity } from '../services/activityService.js';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);

const TARGET_MERCHANT_ID = 'mer_1qo1v28tdrds';

const NEW_CUSTOMERS = [
  { name: 'Rahul Sharma', phone: '+919845010001', email: 'rahul.sharma@example.com', company: 'Sharma Hardware Store', createdAgo: 40 },
  { name: 'Priya Patil', phone: '+919845010002', email: 'priya.patil@example.com', company: 'Patil Fashion Point', createdAgo: 38 },
  { name: 'Amit Deshmukh', phone: '+919845010003', email: 'amit.deshmukh@example.com', company: 'Deshmukh Agro Traders', createdAgo: 35 },
  { name: 'Sneha Kulkarni', phone: '+919845010004', email: 'sneha.kulkarni@example.com', company: 'Kulkarni Book Depot', createdAgo: 30 },
  { name: 'Rohit Jadhav', phone: '+919845010005', email: 'rohit.jadhav@example.com', company: 'Jadhav Electricals', createdAgo: 25 },
  { name: 'Neha Pawar', phone: '+919845010006', email: 'neha.pawar@example.com', company: 'Pawar Stationery Mart', createdAgo: 20 },
  { name: 'Akash Shinde', phone: '+919845010007', email: 'akash.shinde@example.com', company: 'Shinde General Store', createdAgo: 12 },
  { name: 'Pooja More', phone: '+919845010008', email: 'pooja.more@example.com', company: 'More Cosmetics Corner', createdAgo: 5 },
];

async function run() {
  await connectDB(process.env.MONGODB_URI);

  const merchant = await Merchant.findOne({ merchantId: TARGET_MERCHANT_ID });
  if (!merchant) {
    throw new Error(`No merchant found with merchantId ${TARGET_MERCHANT_ID}. Aborting.`);
  }
  console.log(`Target merchant: ${merchant.businessName} (${merchant.merchantId})`);

  let created = 0;
  let reused = 0;
  const createdIds = [];
  const reusedIds = [];

  for (const spec of NEW_CUSTOMERS) {
    const existing = await Customer.findOne({ merchantId: merchant.merchantId, phone: spec.phone });
    if (existing) {
      console.log(`Customer already exists: ${existing.name} (${existing.customerId}) — reusing.`);
      reused++;
      reusedIds.push(existing.customerId);
      continue;
    }

    const customer = await Customer.create({
      customerId: generateId('customer'),
      merchantId: merchant.merchantId,
      name: spec.name,
      phone: spec.phone,
      email: spec.email,
      company: spec.company,
      createdAt: daysAgo(spec.createdAgo),
    });

    await logActivity({
      merchantId: merchant.merchantId,
      action: 'CUSTOMER_CREATED',
      entityType: 'customer',
      entityId: customer.customerId,
      description: `Customer ${customer.name} created`,
    });

    console.log(`Customer created: ${customer.name} (${customer.customerId})`);
    created++;
    createdIds.push(customer.customerId);
  }

  const totalForMerchant = await Customer.countDocuments({ merchantId: merchant.merchantId });

  console.log('\n--- Summary ---');
  console.log(`New customers created: ${created}`);
  console.log(`Already existed (reused): ${reused}`);
  console.log(`Total customers for ${merchant.businessName}: ${totalForMerchant}`);
  console.log(`Created IDs: ${createdIds.join(', ') || '(none)'}`);
  console.log(`Reused IDs: ${reusedIds.join(', ') || '(none)'}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Adding Deshmukh Enterprises customers failed:', err);
  process.exit(1);
});
