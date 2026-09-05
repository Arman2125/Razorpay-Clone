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
import Payment from '../src/models/Payment.js';
import PaymentLink from '../src/models/PaymentLink.js';

describe('Payment Links — regression (pre-existing feature)', () => {
  let merchant, token, customer;

  before(async () => {
    await connectTestDB();
    ({ merchant, token } = await createTestMerchant());
    customer = await createTestCustomer(merchant.merchantId, { name: 'PLink Customer' });
  });
  after(disconnectTestDB);

  function authed(req) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  test('create, list, and retrieve a payment link', async () => {
    const created = await authed(request(app).post('/api/payment-links')).send({
      customerId: customer.customerId,
      amount: 4000,
      description: 'Regression test link',
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.status, 'active');
    assert.ok(created.body.data.shortUrl.includes('/pay/'));

    const list = await authed(request(app).get('/api/payment-links'));
    assert.ok(list.body.data.some((l) => l.paymentLinkId === created.body.data.paymentLinkId));

    const get = await authed(request(app).get(`/api/payment-links/${created.body.data.paymentLinkId}`));
    assert.equal(get.status, 200);
  });

  test('rejects invalid amount', async () => {
    const res = await authed(request(app).post('/api/payment-links')).send({ customerId: customer.customerId, amount: 0 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_AMOUNT');
  });

  test('ambiguous customerName returns candidates', async () => {
    await createTestCustomer(merchant.merchantId, { name: 'Duplicate Name Co' });
    await createTestCustomer(merchant.merchantId, { name: 'Duplicate Name Co' });

    const res = await authed(request(app).post('/api/payment-links')).send({
      customerName: 'Duplicate Name Co',
      amount: 100,
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'AMBIGUOUS_CUSTOMER');
    assert.ok(Array.isArray(res.body.error.candidates));
    assert.equal(res.body.error.candidates.length, 2);
  });

  test('idempotency key prevents duplicate link creation', async () => {
    const key = 'idem-link-1';
    const r1 = await authed(request(app).post('/api/payment-links')).set('Idempotency-Key', key).send({
      customerId: customer.customerId,
      amount: 250,
    });
    const r2 = await authed(request(app).post('/api/payment-links')).set('Idempotency-Key', key).send({
      customerId: customer.customerId,
      amount: 250,
    });
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 200);
    assert.equal(r1.body.data.paymentLinkId, r2.body.data.paymentLinkId);
  });

  test('cancellation transition and terminal-state rejection', async () => {
    const created = await authed(request(app).post('/api/payment-links')).send({ customerId: customer.customerId, amount: 300 });
    const cancel = await authed(request(app).patch(`/api/payment-links/${created.body.data.paymentLinkId}/status`)).send({
      status: 'cancelled',
    });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.data.status, 'cancelled');

    const reCancel = await authed(request(app).patch(`/api/payment-links/${created.body.data.paymentLinkId}/status`)).send({
      status: 'expired',
    });
    assert.equal(reCancel.status, 400);
    assert.equal(reCancel.body.error.code, 'INVALID_TRANSITION');
  });

  test('"paid" is rejected as a direct PATCH target — must go through /pay', async () => {
    const created = await authed(request(app).post('/api/payment-links')).send({ customerId: customer.customerId, amount: 300 });
    const res = await authed(request(app).patch(`/api/payment-links/${created.body.data.paymentLinkId}/status`)).send({
      status: 'paid',
    });
    assert.equal(res.status, 400);
  });

  test('an expired link is lazily flipped and rejects payment', async () => {
    const created = await authed(request(app).post('/api/payment-links')).send({
      customerId: customer.customerId,
      amount: 500,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const pay = await request(app).post(`/api/payment-links/${created.body.data.paymentLinkId}/pay`);
    assert.equal(pay.status, 409);
    assert.equal(pay.body.error.code, 'LINK_NOT_ACTIVE');

    const link = await PaymentLink.findOne({ paymentLinkId: created.body.data.paymentLinkId });
    assert.equal(link.status, 'expired');
  });

  test('public pay creates a real Payment and cannot be paid twice', async () => {
    const created = await authed(request(app).post('/api/payment-links')).send({ customerId: customer.customerId, amount: 1234 });

    const pay1 = await request(app).post(`/api/payment-links/${created.body.data.paymentLinkId}/pay`);
    assert.equal(pay1.status, 200);
    assert.equal(pay1.body.data.link.status, 'paid');
    assert.equal(pay1.body.data.payment.status, 'paid');
    assert.equal(pay1.body.data.payment.amount, 1234);

    const paymentInDb = await Payment.findOne({ paymentId: pay1.body.data.payment.paymentId });
    assert.ok(paymentInDb);

    const pay2 = await request(app).post(`/api/payment-links/${created.body.data.paymentLinkId}/pay`);
    assert.equal(pay2.status, 409);
    assert.equal(pay2.body.error.code, 'ALREADY_PAID');
  });

  test('paying a link created for an existing pending payment settles that payment (no duplicate)', async () => {
    const existingPayment = await createTestPayment(merchant.merchantId, customer.customerId, {
      status: 'pending',
      amount: 7500,
      description: 'Pre-existing receivable',
    });

    const created = await authed(request(app).post('/api/payment-links')).send({
      customerId: customer.customerId,
      existingPaymentId: existingPayment.paymentId,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.amount, 7500);

    const pay = await request(app).post(`/api/payment-links/${created.body.data.paymentLinkId}/pay`);
    assert.equal(pay.status, 200);
    assert.equal(pay.body.data.payment.paymentId, existingPayment.paymentId);
    assert.equal(pay.body.data.payment.status, 'paid');

    const countForCustomer = await Payment.countDocuments({ merchantId: merchant.merchantId, customerId: customer.customerId, amount: 7500 });
    assert.equal(countForCustomer, 1); // no duplicate Payment created
  });

  test('merchant isolation on payment links', async () => {
    const created = await authed(request(app).post('/api/payment-links')).send({ customerId: customer.customerId, amount: 100 });
    const { token: otherToken } = await createTestMerchant();
    const res = await request(app)
      .get(`/api/payment-links/${created.body.data.paymentLinkId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(res.status, 404);
  });

  test('the public payment page renders without auth', async () => {
    const created = await authed(request(app).post('/api/payment-links')).send({ customerId: customer.customerId, amount: 999 });
    const res = await request(app).get(`/pay/${created.body.data.paymentLinkId}`);
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('PAY NOW') || res.text.includes('Payment'));
  });
});
