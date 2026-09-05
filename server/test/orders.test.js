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

describe('Orders', () => {
  let merchant, token, customer;

  before(async () => {
    await connectTestDB();
    ({ merchant, token } = await createTestMerchant());
    customer = await createTestCustomer(merchant.merchantId, { name: 'Order Customer' });
  });
  after(disconnectTestDB);

  function authed(req) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  test('creates an order associated with a customer', async () => {
    const res = await authed(request(app).post('/api/orders')).send({
      customerId: customer.customerId,
      amount: 15000,
      receipt: 'ORD-TEST-1',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.status, 'created');
    assert.equal(res.body.data.customerId, customer.customerId);
    assert.equal(res.body.data.amount, 15000);
  });

  test('creates an order by resolving customerName', async () => {
    const res = await authed(request(app).post('/api/orders')).send({
      customerName: 'Order Customer',
      amount: 2000,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.customerId, customer.customerId);
  });

  test('rejects missing amount and missing customer identifier', async () => {
    const noAmount = await authed(request(app).post('/api/orders')).send({ customerId: customer.customerId });
    assert.equal(noAmount.status, 400);

    const noCustomer = await authed(request(app).post('/api/orders')).send({ amount: 100 });
    assert.equal(noCustomer.status, 400);
  });

  test('retrieval and listing are merchant-scoped', async () => {
    const created = await authed(request(app).post('/api/orders')).send({ customerId: customer.customerId, amount: 3000 });

    const get = await authed(request(app).get(`/api/orders/${created.body.data.orderId}`));
    assert.equal(get.status, 200);

    const list = await authed(request(app).get('/api/orders').query({ customerId: customer.customerId }));
    assert.equal(list.status, 200);
    assert.ok(list.body.data.items.some((o) => o.orderId === created.body.data.orderId));

    const { token: otherToken } = await createTestMerchant();
    const cross = await request(app)
      .get(`/api/orders/${created.body.data.orderId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(cross.status, 404);
  });

  test('valid transitions: created -> attempted -> paid', async () => {
    const created = await authed(request(app).post('/api/orders')).send({ customerId: customer.customerId, amount: 4000 });
    const orderId = created.body.data.orderId;

    const attempted = await authed(request(app).patch(`/api/orders/${orderId}/status`)).send({ status: 'attempted' });
    assert.equal(attempted.status, 200);
    assert.equal(attempted.body.data.status, 'attempted');

    const paid = await authed(request(app).patch(`/api/orders/${orderId}/status`)).send({ status: 'paid' });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.data.status, 'paid');
  });

  test('invalid transition from a terminal state is rejected', async () => {
    const created = await authed(request(app).post('/api/orders')).send({ customerId: customer.customerId, amount: 4000 });
    const orderId = created.body.data.orderId;
    await authed(request(app).patch(`/api/orders/${orderId}/status`)).send({ status: 'cancelled' });

    const res = await authed(request(app).patch(`/api/orders/${orderId}/status`)).send({ status: 'paid' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_TRANSITION');
  });

  test('marking paid can link an existing paid Payment for this customer', async () => {
    const payment = await createTestPayment(merchant.merchantId, customer.customerId, { status: 'paid', amount: 4000, paidAt: new Date() });
    const created = await authed(request(app).post('/api/orders')).send({ customerId: customer.customerId, amount: 4000 });

    const res = await authed(request(app).patch(`/api/orders/${created.body.data.orderId}/status`)).send({
      status: 'paid',
      paymentId: payment.paymentId,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.paymentId, payment.paymentId);
  });

  test('idempotency key prevents duplicate order creation', async () => {
    const key = 'idem-order-1';
    const r1 = await authed(request(app).post('/api/orders')).set('Idempotency-Key', key).send({
      customerId: customer.customerId,
      amount: 999,
    });
    assert.equal(r1.status, 201);

    const r2 = await authed(request(app).post('/api/orders')).set('Idempotency-Key', key).send({
      customerId: customer.customerId,
      amount: 999,
    });
    assert.equal(r2.status, 200);
    assert.equal(r2.body.data.orderId, r1.body.data.orderId);
  });
});
