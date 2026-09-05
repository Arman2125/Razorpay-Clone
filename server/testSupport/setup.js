import 'dotenv/config';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { generateId } from '../src/utils/idGenerator.js';
import Merchant from '../src/models/Merchant.js';
import Customer from '../src/models/Customer.js';
import Payment from '../src/models/Payment.js';

// Tests run against a dedicated database on the same cluster the app
// already uses (never the real `mini_razorpay` demo/production database),
// so there is zero risk of the test suite wiping real seeded/demo data.
// Every test also scopes its own fixtures under freshly generated
// merchant/customer ids, so concurrent test files never collide even
// though they share this one test database.
function testMongoUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set — cannot run integration tests');
  if (uri.includes('/mini_razorpay_test')) return uri;
  return uri.replace(/\/([A-Za-z0-9_-]+)(\?|$)/, '/mini_razorpay_test$2');
}

let connected = false;

export async function connectTestDB() {
  if (connected || mongoose.connection.readyState === 1) {
    connected = true;
    return;
  }
  await connectDB(testMongoUri());
  connected = true;
}

export async function disconnectTestDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  connected = false;
}

export function signToken(merchant) {
  return jwt.sign(
    { merchantId: merchant.merchantId, businessName: merchant.businessName },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

export async function createTestMerchant(overrides = {}) {
  const merchant = await Merchant.create({
    merchantId: generateId('merchant'),
    businessName: overrides.businessName || 'Test Merchant',
    ownerName: overrides.ownerName || 'Test Owner',
    phoneNumber: overrides.phoneNumber || `+91${Math.floor(1e9 + Math.random() * 8e9)}`,
    email: overrides.email || 'test@example.com',
    businessType: overrides.businessType || 'General',
    status: overrides.status || 'active',
  });
  return { merchant, token: signToken(merchant) };
}

export async function createTestCustomer(merchantId, overrides = {}) {
  return Customer.create({
    customerId: generateId('customer'),
    merchantId,
    name: overrides.name || 'Test Customer',
    phone: overrides.phone || `+91${Math.floor(1e9 + Math.random() * 8e9)}`,
    email: overrides.email,
    company: overrides.company,
  });
}

export async function createTestPayment(merchantId, customerId, overrides = {}) {
  return Payment.create({
    paymentId: generateId('payment'),
    merchantId,
    customerId,
    amount: overrides.amount ?? 10000,
    currency: 'INR',
    status: overrides.status || 'pending',
    paymentMethod: overrides.paymentMethod || 'UPI',
    description: overrides.description,
    dueDate: overrides.dueDate,
    paidAt: overrides.paidAt,
  });
}

export { default as app } from '../src/app.js';
