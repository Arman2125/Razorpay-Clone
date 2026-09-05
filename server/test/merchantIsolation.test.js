import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  app,
  connectTestDB,
  disconnectTestDB,
  createTestMerchant,
  createTestCustomer,
  createTestPayment,
} from '../testSupport/setup.js';
import { generateId } from '../src/utils/idGenerator.js';
import Refund from '../src/models/Refund.js';
import Order from '../src/models/Order.js';
import Invoice from '../src/models/Invoice.js';
import Subscription from '../src/models/Subscription.js';
import Settlement from '../src/models/Settlement.js';
import Activity from '../src/models/Activity.js';

describe('Merchant isolation — cross-merchant access must 404, never leak', () => {
  let merchantA, tokenA, merchantB, tokenB, customerA, paymentA;

  before(async () => {
    await connectTestDB();
    ({ merchant: merchantA, token: tokenA } = await createTestMerchant());
    ({ merchant: merchantB, token: tokenB } = await createTestMerchant());
    customerA = await createTestCustomer(merchantA.merchantId, { name: 'Isolation Customer A' });
    paymentA = await createTestPayment(merchantA.merchantId, customerA.customerId, { status: 'paid', amount: 20000, paidAt: new Date() });
  });
  after(disconnectTestDB);

  test('Merchant B cannot access Merchant A payment', async () => {
    const res = await request(app).get(`/api/payments/${paymentA.paymentId}`).set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 404);
  });

  test('Merchant B cannot access Merchant A customer', async () => {
    const res = await request(app).get(`/api/customers/${customerA.customerId}`).set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 404);
  });

  test('Merchant B cannot access Merchant A refund', async () => {
    const refund = await Refund.create({
      refundId: generateId('refund'),
      merchantId: merchantA.merchantId,
      paymentId: paymentA.paymentId,
      customerId: customerA.customerId,
      amount: 1000,
      status: 'refunded',
    });
    const res = await request(app).get(`/api/refunds/${refund.refundId}`).set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 404);
  });

  test('Merchant B cannot see Merchant A payment in refundable/refunds nested routes', async () => {
    const res1 = await request(app)
      .get(`/api/payments/${paymentA.paymentId}/refundable`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res1.status, 404);

    const res2 = await request(app)
      .get(`/api/payments/${paymentA.paymentId}/refunds`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res2.status, 404);
  });

  test('Merchant B cannot access Merchant A order', async () => {
    const order = await Order.create({
      orderId: generateId('order'),
      merchantId: merchantA.merchantId,
      customerId: customerA.customerId,
      amount: 5000,
      status: 'created',
    });
    const res = await request(app).get(`/api/orders/${order.orderId}`).set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 404);
  });

  test('Merchant B cannot access Merchant A invoice', async () => {
    const invoice = await Invoice.create({
      invoiceId: generateId('invoice'),
      merchantId: merchantA.merchantId,
      customerId: customerA.customerId,
      amount: 7000,
      status: 'draft',
    });
    const res = await request(app).get(`/api/invoices/${invoice.invoiceId}`).set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 404);
  });

  test('Merchant B cannot access Merchant A subscription', async () => {
    const now = new Date();
    const sub = await Subscription.create({
      subscriptionId: generateId('subscription'),
      merchantId: merchantA.merchantId,
      customerId: customerA.customerId,
      amount: 1000,
      interval: 'month',
      status: 'active',
      startAt: now,
      nextBillingAt: now,
    });
    const res = await request(app)
      .get(`/api/subscriptions/${sub.subscriptionId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 404);
  });

  test('Merchant B cannot access Merchant A settlement', async () => {
    const settlement = await Settlement.create({
      settlementId: generateId('settlement'),
      merchantId: merchantA.merchantId,
      amount: 9000,
      status: 'processed',
      settlementDate: new Date(),
    });
    const res = await request(app)
      .get(`/api/settlements/${settlement.settlementId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 404);
  });

  test('Merchant B cannot access Merchant A activity records (list scoping)', async () => {
    await Activity.create({
      activityId: generateId('activity'),
      merchantId: merchantA.merchantId,
      action: 'PAYMENT_VIEWED',
      entityType: 'payment',
      entityId: paymentA.paymentId,
      description: 'isolation test activity',
    });
    const res = await request(app).get('/api/activity').set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 200);
    const leaked = res.body.data.items.some((a) => a.merchantId === merchantA.merchantId);
    assert.equal(leaked, false);
  });

  test('Merchant B cannot list Merchant A resources by spoofing merchantId in query', async () => {
    const res = await request(app)
      .get('/api/payments')
      .query({ merchantId: merchantA.merchantId })
      .set('Authorization', `Bearer ${tokenB}`);
    assert.equal(res.status, 200);
    const leaked = res.body.data.items.some((p) => p.paymentId === paymentA.paymentId);
    assert.equal(leaked, false);
  });
});
