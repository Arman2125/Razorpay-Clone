import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, createTestMerchant, createTestCustomer } from '../testSupport/setup.js';
import { computeNextBillingDate } from '../src/services/subscriptionService.js';
import Subscription from '../src/models/Subscription.js';
import Payment from '../src/models/Payment.js';

describe('Subscriptions', () => {
  let merchant, token, customer;

  before(async () => {
    await connectTestDB();
    ({ merchant, token } = await createTestMerchant());
    customer = await createTestCustomer(merchant.merchantId, { name: 'Subscription Customer' });
  });
  after(disconnectTestDB);

  function authed(req) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  test('computeNextBillingDate is deterministic pure date math', () => {
    const from = new Date('2026-01-15T00:00:00.000Z');
    assert.equal(computeNextBillingDate(from, 'day', 1).toISOString(), '2026-01-16T00:00:00.000Z');
    assert.equal(computeNextBillingDate(from, 'week', 1).toISOString(), '2026-01-22T00:00:00.000Z');
    assert.equal(computeNextBillingDate(from, 'month', 1).toISOString(), '2026-02-15T00:00:00.000Z');
    assert.equal(computeNextBillingDate(from, 'year', 1).toISOString(), '2027-01-15T00:00:00.000Z');
    assert.equal(computeNextBillingDate(from, 'month', 3).toISOString(), '2026-04-15T00:00:00.000Z');
    // Same inputs -> same output, every time.
    assert.equal(computeNextBillingDate(from, 'month', 1).getTime(), computeNextBillingDate(from, 'month', 1).getTime());
  });

  test('creating with a past/now startAt activates immediately; future startAt stays "created"', async () => {
    const active = await authed(request(app).post('/api/subscriptions')).send({
      customerId: customer.customerId,
      amount: 1000,
      interval: 'month',
    });
    assert.equal(active.status, 201);
    assert.equal(active.body.data.status, 'active');

    const future = await authed(request(app).post('/api/subscriptions')).send({
      customerId: customer.customerId,
      amount: 1000,
      interval: 'month',
      startAt: new Date(Date.now() + 10 * 86400000).toISOString(),
    });
    assert.equal(future.body.data.status, 'created');
  });

  test('rejects invalid interval and non-positive amount', async () => {
    const badInterval = await authed(request(app).post('/api/subscriptions')).send({
      customerId: customer.customerId,
      amount: 1000,
      interval: 'fortnight',
    });
    assert.equal(badInterval.status, 400);

    const badAmount = await authed(request(app).post('/api/subscriptions')).send({
      customerId: customer.customerId,
      amount: 0,
      interval: 'month',
    });
    assert.equal(badAmount.status, 400);
  });

  test('retrieval and listing are merchant-scoped', async () => {
    const created = await authed(request(app).post('/api/subscriptions')).send({
      customerId: customer.customerId,
      amount: 500,
      interval: 'week',
    });
    const get = await authed(request(app).get(`/api/subscriptions/${created.body.data.subscriptionId}`));
    assert.equal(get.status, 200);

    const { token: otherToken } = await createTestMerchant();
    const cross = await request(app)
      .get(`/api/subscriptions/${created.body.data.subscriptionId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(cross.status, 404);
  });

  test('pause -> resume -> cancel lifecycle', async () => {
    const created = await authed(request(app).post('/api/subscriptions')).send({
      customerId: customer.customerId,
      amount: 750,
      interval: 'month',
    });
    const id = created.body.data.subscriptionId;

    const paused = await authed(request(app).patch(`/api/subscriptions/${id}/status`)).send({ status: 'paused' });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.data.status, 'paused');

    // Cannot bill while paused, even if nextBillingAt has technically passed.
    // (Other subscriptions created earlier in this suite may also be due
    // for this merchant, so assert on THIS subscription specifically
    // rather than the global processed count.)
    await Subscription.updateOne({ subscriptionId: id }, { $set: { nextBillingAt: new Date(Date.now() - 86400000) } });
    const processedWhilePaused = await authed(request(app).post('/api/subscriptions/process-due'));
    assert.equal(
      processedWhilePaused.body.data.results.some((r) => r.subscriptionId === id),
      false
    );

    const resumed = await authed(request(app).patch(`/api/subscriptions/${id}/status`)).send({ status: 'active' });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.body.data.status, 'active');
    // Resuming must not leave a backlog nextBillingAt in the past.
    assert.ok(new Date(resumed.body.data.nextBillingAt).getTime() >= Date.now() - 1000);

    const cancelled = await authed(request(app).patch(`/api/subscriptions/${id}/status`)).send({ status: 'cancelled' });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.status, 'cancelled');

    const cancelAgain = await authed(request(app).patch(`/api/subscriptions/${id}/status`)).send({ status: 'cancelled' });
    assert.equal(cancelAgain.status, 400);
  });

  test('processDueSubscriptions bills exactly once per due cycle and creates a Payment', async () => {
    const created = await authed(request(app).post('/api/subscriptions')).send({
      customerId: customer.customerId,
      amount: 2500,
      interval: 'day',
    });
    const id = created.body.data.subscriptionId;

    // Force it due right now.
    await Subscription.updateOne({ subscriptionId: id }, { $set: { nextBillingAt: new Date() } });

    const result = await authed(request(app).post('/api/subscriptions/process-due'));
    assert.equal(result.status, 200);
    assert.equal(result.body.data.processed >= 1, true);
    const entry = result.body.data.results.find((r) => r.subscriptionId === id);
    assert.ok(entry);
    assert.equal(entry.billed, true);

    const payment = await Payment.findOne({ paymentId: entry.paymentId });
    assert.ok(payment);
    assert.equal(payment.amount, 2500);
    assert.equal(payment.status, 'paid');

    const after = await authed(request(app).get(`/api/subscriptions/${id}`));
    assert.ok(new Date(after.body.data.nextBillingAt).getTime() > Date.now());
  });

  test('calling processDueSubscriptions twice in a row never double-bills the same cycle', async () => {
    const created = await authed(request(app).post('/api/subscriptions')).send({
      customerId: customer.customerId,
      amount: 999,
      interval: 'day',
    });
    const id = created.body.data.subscriptionId;
    await Subscription.updateOne({ subscriptionId: id }, { $set: { nextBillingAt: new Date() } });

    const first = await authed(request(app).post('/api/subscriptions/process-due'));
    const firstEntry = first.body.data.results.find((r) => r.subscriptionId === id);
    assert.ok(firstEntry?.billed);

    // Immediately re-run — the subscription's nextBillingAt is now in the
    // future, so nothing should be billed for it again.
    const second = await authed(request(app).post('/api/subscriptions/process-due'));
    const secondEntry = second.body.data.results.find((r) => r.subscriptionId === id);
    assert.equal(secondEntry, undefined);

    const paymentsForSub = await Payment.find({ merchantId: merchant.merchantId, amount: 999, description: `Subscription ${id} billing` });
    assert.equal(paymentsForSub.length, 1);
  });

  test('idempotency key prevents duplicate subscription creation', async () => {
    const key = 'idem-sub-1';
    const r1 = await authed(request(app).post('/api/subscriptions')).set('Idempotency-Key', key).send({
      customerId: customer.customerId,
      amount: 111,
      interval: 'month',
    });
    const r2 = await authed(request(app).post('/api/subscriptions')).set('Idempotency-Key', key).send({
      customerId: customer.customerId,
      amount: 111,
      interval: 'month',
    });
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 200);
    assert.equal(r1.body.data.subscriptionId, r2.body.data.subscriptionId);
  });
});
