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

describe('Payments — regression + extended search', () => {
  let merchant, token, customer;

  before(async () => {
    await connectTestDB();
    ({ merchant, token } = await createTestMerchant());
    customer = await createTestCustomer(merchant.merchantId, { name: 'Payments Regress Customer' });

    await createTestPayment(merchant.merchantId, customer.customerId, { status: 'pending', amount: 1000, paymentMethod: 'UPI' });
    await createTestPayment(merchant.merchantId, customer.customerId, { status: 'paid', amount: 5000, paymentMethod: 'Card', paidAt: new Date() });
    await createTestPayment(merchant.merchantId, customer.customerId, {
      status: 'pending',
      amount: 9000,
      paymentMethod: 'Cash',
      dueDate: new Date(Date.now() - 86400000), // overdue
    });
  });
  after(disconnectTestDB);

  function authed(req) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  test('list, filter by status, and paginate', async () => {
    const all = await authed(request(app).get('/api/payments').query({ page: 1, limit: 2 }));
    assert.equal(all.status, 200);
    assert.equal(all.body.data.items.length, 2);
    assert.equal(all.body.data.total >= 3, true);

    const pendingOnly = await authed(request(app).get('/api/payments').query({ status: 'pending' }));
    assert.ok(pendingOnly.body.data.items.every((p) => p.status === 'pending'));
  });

  test('overdue is a subset of pending', async () => {
    const overdue = await authed(request(app).get('/api/payments/overdue'));
    assert.equal(overdue.status, 200);
    assert.ok(overdue.body.data.every((p) => p.status === 'pending'));
    assert.ok(overdue.body.data.some((p) => p.amount === 9000));
  });

  test('summary aggregates totals correctly', async () => {
    const res = await authed(request(app).get('/api/payments/summary'));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.totalPayments >= 3);
    assert.ok(res.body.data.overdueCount >= 1);
  });

  test('valid state transition pending -> paid sets paidAt', async () => {
    const p = await createTestPayment(merchant.merchantId, customer.customerId, { status: 'pending', amount: 2000 });
    const res = await authed(request(app).patch(`/api/payments/${p.paymentId}/status`)).send({ status: 'paid' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'paid');
    assert.ok(res.body.data.paidAt);
  });

  test('invalid state transition is rejected', async () => {
    const p = await createTestPayment(merchant.merchantId, customer.customerId, { status: 'pending', amount: 2000 });
    await authed(request(app).patch(`/api/payments/${p.paymentId}/status`)).send({ status: 'paid' });
    const res = await authed(request(app).patch(`/api/payments/${p.paymentId}/status`)).send({ status: 'pending' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_TRANSITION');
  });

  test('paid is a terminal state — no transitions out', async () => {
    const p = await createTestPayment(merchant.merchantId, customer.customerId, { status: 'paid', amount: 2000, paidAt: new Date() });
    const res = await authed(request(app).patch(`/api/payments/${p.paymentId}/status`)).send({ status: 'failed' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_TRANSITION');
  });

  test('search: original {items, count} shape is preserved when no pagination is requested', async () => {
    const res = await authed(request(app).post('/api/payments/search')).send({ customerId: customer.customerId });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.items));
    assert.equal(typeof res.body.data.count, 'number');
    assert.equal(res.body.data.page, undefined);
  });

  test('search: minAmount/maxAmount range filter', async () => {
    const res = await authed(request(app).post('/api/payments/search')).send({
      customerId: customer.customerId,
      minAmount: 2000,
      maxAmount: 6000,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.items.every((p) => p.amount >= 2000 && p.amount <= 6000));
  });

  test('search: paymentMethod filter', async () => {
    const res = await authed(request(app).post('/api/payments/search')).send({
      customerId: customer.customerId,
      paymentMethod: 'Cash',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.items.every((p) => p.paymentMethod === 'Cash'));
  });

  test('search: opt-in pagination adds page/limit/total without breaking items/count', async () => {
    const res = await authed(request(app).post('/api/payments/search')).send({
      customerId: customer.customerId,
      page: 1,
      limit: 1,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.items.length, 1);
    assert.equal(res.body.data.page, 1);
    assert.equal(res.body.data.limit, 1);
    assert.ok(res.body.data.total >= 3);
  });

  test('search is merchant-scoped', async () => {
    const { token: otherToken } = await createTestMerchant();
    const res = await request(app)
      .post('/api/payments/search')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ customerId: customer.customerId });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.count, 0);
  });
});
