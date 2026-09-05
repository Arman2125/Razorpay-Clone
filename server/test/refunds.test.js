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

describe('Refunds', () => {
  let merchant, token, customer;

  before(async () => {
    await connectTestDB();
    ({ merchant, token } = await createTestMerchant());
    customer = await createTestCustomer(merchant.merchantId);
  });
  after(disconnectTestDB);

  function authed(req) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  test('cannot refund a pending (non-paid) payment', async () => {
    const payment = await createTestPayment(merchant.merchantId, customer.customerId, { status: 'pending', amount: 5000 });
    const res = await authed(request(app).post('/api/refunds')).send({ paymentId: payment.paymentId, amount: 1000 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'PAYMENT_NOT_PAID');
  });

  test('rejects zero amount', async () => {
    const payment = await createTestPayment(merchant.merchantId, customer.customerId, { status: 'paid', amount: 5000, paidAt: new Date() });
    const res = await authed(request(app).post('/api/refunds')).send({ paymentId: payment.paymentId, amount: 0 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_AMOUNT');
  });

  test('rejects negative amount', async () => {
    const payment = await createTestPayment(merchant.merchantId, customer.customerId, { status: 'paid', amount: 5000, paidAt: new Date() });
    const res = await authed(request(app).post('/api/refunds')).send({ paymentId: payment.paymentId, amount: -500 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_AMOUNT');
  });

  test('rejects an invalid/unknown paymentId', async () => {
    const res = await authed(request(app).post('/api/refunds')).send({ paymentId: 'pay_doesnotexist', amount: 100 });
    assert.equal(res.status, 404);
  });

  test('partial refunds accumulate correctly and expose the refundable balance', async () => {
    const payment = await createTestPayment(merchant.merchantId, customer.customerId, {
      status: 'paid',
      amount: 10000,
      paidAt: new Date(),
    });

    const initial = await authed(request(app).get(`/api/payments/${payment.paymentId}/refundable`));
    assert.equal(initial.status, 200);
    assert.equal(initial.body.data.refundableAmount, 10000);

    const r1 = await authed(request(app).post('/api/refunds')).send({ paymentId: payment.paymentId, amount: 3000 });
    assert.equal(r1.status, 201);
    assert.equal(r1.body.data.status, 'refunded');

    const after1 = await authed(request(app).get(`/api/payments/${payment.paymentId}/refundable`));
    assert.equal(after1.body.data.refundableAmount, 7000);

    const r2 = await authed(request(app).post('/api/refunds')).send({ paymentId: payment.paymentId, amount: 4000 });
    assert.equal(r2.status, 201);

    const after2 = await authed(request(app).get(`/api/payments/${payment.paymentId}/refundable`));
    assert.equal(after2.body.data.refundableAmount, 3000);

    // Attempting to refund more than what remains (4000 > 3000) must fail.
    const over = await authed(request(app).post('/api/refunds')).send({ paymentId: payment.paymentId, amount: 4000 });
    assert.equal(over.status, 400);
    assert.equal(over.body.error.code, 'REFUND_EXCEEDS_BALANCE');

    // Exactly the remaining balance succeeds and exhausts it.
    const exact = await authed(request(app).post('/api/refunds')).send({ paymentId: payment.paymentId, amount: 3000 });
    assert.equal(exact.status, 201);
    const final = await authed(request(app).get(`/api/payments/${payment.paymentId}/refundable`));
    assert.equal(final.body.data.refundableAmount, 0);

    // The underlying Payment must never change status because of refunds.
    const paymentCheck = await authed(request(app).get(`/api/payments/${payment.paymentId}`));
    assert.equal(paymentCheck.body.data.status, 'paid');

    const history = await authed(request(app).get(`/api/payments/${payment.paymentId}/refunds`));
    assert.equal(history.body.data.length, 3);
  });

  test('idempotency key prevents duplicate refund creation', async () => {
    const payment = await createTestPayment(merchant.merchantId, customer.customerId, { status: 'paid', amount: 5000, paidAt: new Date() });
    const key = `idem-refund-${payment.paymentId}`;

    const r1 = await authed(request(app).post('/api/refunds'))
      .set('Idempotency-Key', key)
      .send({ paymentId: payment.paymentId, amount: 1000 });
    assert.equal(r1.status, 201);

    const r2 = await authed(request(app).post('/api/refunds'))
      .set('Idempotency-Key', key)
      .send({ paymentId: payment.paymentId, amount: 1000 });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.data.refundId, r1.body.data.refundId);

    const list = await authed(request(app).get(`/api/payments/${payment.paymentId}/refunds`));
    assert.equal(list.body.data.length, 1);
  });

  test('listing and retrieval are merchant-scoped', async () => {
    const payment = await createTestPayment(merchant.merchantId, customer.customerId, { status: 'paid', amount: 5000, paidAt: new Date() });
    const created = await authed(request(app).post('/api/refunds')).send({ paymentId: payment.paymentId, amount: 1500, reason: 'test' });
    assert.equal(created.status, 201);

    const get = await authed(request(app).get(`/api/refunds/${created.body.data.refundId}`));
    assert.equal(get.status, 200);
    assert.equal(get.body.data.reason, 'test');

    const list = await authed(request(app).get('/api/refunds').query({ paymentId: payment.paymentId }));
    assert.equal(list.status, 200);
    assert.ok(list.body.data.items.some((r) => r.refundId === created.body.data.refundId));
  });

  test('cross-merchant refund creation is rejected (payment not found for this merchant)', async () => {
    const { token: otherToken } = await createTestMerchant();
    const payment = await createTestPayment(merchant.merchantId, customer.customerId, { status: 'paid', amount: 5000, paidAt: new Date() });

    const res = await request(app)
      .post('/api/refunds')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ paymentId: payment.paymentId, amount: 100 });

    assert.equal(res.status, 404);
  });
});
