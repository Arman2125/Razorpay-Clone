import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, createTestMerchant, createTestCustomer } from '../testSupport/setup.js';

describe('Invoices', () => {
  let merchant, token, customer;

  before(async () => {
    await connectTestDB();
    ({ merchant, token } = await createTestMerchant());
    customer = await createTestCustomer(merchant.merchantId, { name: 'Invoice Customer' });
  });
  after(disconnectTestDB);

  function authed(req) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  test('creates a draft invoice', async () => {
    const res = await authed(request(app).post('/api/invoices')).send({
      customerId: customer.customerId,
      amount: 8000,
      description: 'Test invoice',
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.status, 'draft');
  });

  test('a draft invoice can be edited; a non-draft invoice cannot', async () => {
    const created = await authed(request(app).post('/api/invoices')).send({ customerId: customer.customerId, amount: 1000 });
    const invoiceId = created.body.data.invoiceId;

    const edited = await authed(request(app).patch(`/api/invoices/${invoiceId}`)).send({ amount: 1500 });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.data.amount, 1500);

    await authed(request(app).patch(`/api/invoices/${invoiceId}/status`)).send({ status: 'issued' });

    const editAfterIssue = await authed(request(app).patch(`/api/invoices/${invoiceId}`)).send({ amount: 2000 });
    assert.equal(editAfterIssue.status, 400);
    assert.equal(editAfterIssue.body.error.code, 'INVOICE_NOT_DRAFT');
  });

  test('lifecycle: draft -> issued -> paid', async () => {
    const created = await authed(request(app).post('/api/invoices')).send({ customerId: customer.customerId, amount: 6000 });
    const invoiceId = created.body.data.invoiceId;

    const issued = await authed(request(app).patch(`/api/invoices/${invoiceId}/status`)).send({ status: 'issued' });
    assert.equal(issued.status, 200);
    assert.equal(issued.body.data.status, 'issued');
    assert.ok(issued.body.data.issuedAt);

    const paid = await authed(request(app).patch(`/api/invoices/${invoiceId}/status`)).send({ status: 'paid' });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.data.status, 'paid');
    assert.ok(paid.body.data.paidAt);
  });

  test('cancel is allowed from draft and issued, never from paid', async () => {
    const draftInvoice = await authed(request(app).post('/api/invoices')).send({ customerId: customer.customerId, amount: 100 });
    const cancelDraft = await authed(request(app).patch(`/api/invoices/${draftInvoice.body.data.invoiceId}/status`)).send({
      status: 'cancelled',
    });
    assert.equal(cancelDraft.status, 200);

    const paidInvoice = await authed(request(app).post('/api/invoices')).send({ customerId: customer.customerId, amount: 100 });
    await authed(request(app).patch(`/api/invoices/${paidInvoice.body.data.invoiceId}/status`)).send({ status: 'issued' });
    await authed(request(app).patch(`/api/invoices/${paidInvoice.body.data.invoiceId}/status`)).send({ status: 'paid' });

    const cancelPaid = await authed(request(app).patch(`/api/invoices/${paidInvoice.body.data.invoiceId}/status`)).send({
      status: 'cancelled',
    });
    assert.equal(cancelPaid.status, 400);
    assert.equal(cancelPaid.body.error.code, 'INVALID_TRANSITION');
  });

  test('an issued invoice past its due date is lazily flipped to overdue', async () => {
    const created = await authed(request(app).post('/api/invoices')).send({
      customerId: customer.customerId,
      amount: 2500,
      dueDate: new Date(Date.now() - 5 * 86400000).toISOString(), // 5 days in the past
    });
    await authed(request(app).patch(`/api/invoices/${created.body.data.invoiceId}/status`)).send({ status: 'issued' });

    const get = await authed(request(app).get(`/api/invoices/${created.body.data.invoiceId}`));
    assert.equal(get.status, 200);
    assert.equal(get.body.data.status, 'overdue');

    // An overdue invoice can still be paid.
    const paid = await authed(request(app).patch(`/api/invoices/${created.body.data.invoiceId}/status`)).send({
      status: 'paid',
    });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.data.status, 'paid');
  });

  test('merchant isolation on invoices', async () => {
    const created = await authed(request(app).post('/api/invoices')).send({ customerId: customer.customerId, amount: 100 });
    const { token: otherToken } = await createTestMerchant();
    const res = await request(app)
      .get(`/api/invoices/${created.body.data.invoiceId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(res.status, 404);
  });

  test('idempotency key prevents duplicate invoice creation', async () => {
    const key = 'idem-invoice-1';
    const r1 = await authed(request(app).post('/api/invoices')).set('Idempotency-Key', key).send({
      customerId: customer.customerId,
      amount: 321,
    });
    const r2 = await authed(request(app).post('/api/invoices')).set('Idempotency-Key', key).send({
      customerId: customer.customerId,
      amount: 321,
    });
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 200);
    assert.equal(r1.body.data.invoiceId, r2.body.data.invoiceId);
  });
});
