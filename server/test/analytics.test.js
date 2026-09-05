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

describe('Analytics', () => {
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

  test('summary includes original payment fields unchanged', async () => {
    await createTestPayment(merchant.merchantId, customer.customerId, { status: 'paid', amount: 5000, paidAt: new Date() });
    const res = await authed(request(app).get('/api/analytics/summary'));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.overview);
    assert.ok(Array.isArray(res.body.data.statusBreakdown));
    assert.ok(Array.isArray(res.body.data.methodBreakdown));
    assert.ok(Array.isArray(res.body.data.volumeOverTime));
  });

  test('summary is additively extended with refunds/orders/invoices/paymentLinks/settlements', async () => {
    const payment = await createTestPayment(merchant.merchantId, customer.customerId, { status: 'paid', amount: 8000, paidAt: new Date() });
    await authed(request(app).post('/api/refunds')).send({ paymentId: payment.paymentId, amount: 2000 });

    await authed(request(app).post('/api/orders')).send({ customerId: customer.customerId, amount: 3000 });

    const invoice = await authed(request(app).post('/api/invoices')).send({ customerId: customer.customerId, amount: 4000 });
    await authed(request(app).patch(`/api/invoices/${invoice.body.data.invoiceId}/status`)).send({ status: 'issued' });

    await authed(request(app).post('/api/payment-links')).send({ customerId: customer.customerId, amount: 500 });

    const res = await authed(request(app).get('/api/analytics/summary'));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.refunds.totalRefunded, 2000);
    assert.ok(res.body.data.orders.totalOrders >= 1);
    assert.ok(res.body.data.invoices.outstandingAmount >= 4000);
    assert.ok(res.body.data.paymentLinks.totalLinks >= 1);
    assert.ok('totalSettled' in res.body.data.settlements);
  });

  test('analytics is merchant-scoped', async () => {
    const { token: otherToken } = await createTestMerchant();
    const res = await request(app).get('/api/analytics/summary').set('Authorization', `Bearer ${otherToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.overview.totalPayments, 0);
    assert.equal(res.body.data.refunds.totalRefunded, 0);
  });
});
