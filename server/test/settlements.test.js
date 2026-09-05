import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, createTestMerchant } from '../testSupport/setup.js';
import { generateId } from '../src/utils/idGenerator.js';
import Settlement from '../src/models/Settlement.js';

describe('Settlements', () => {
  let merchant, token;

  before(async () => {
    await connectTestDB();
    ({ merchant, token } = await createTestMerchant());
    await Settlement.insertMany([
      { settlementId: generateId('settlement'), merchantId: merchant.merchantId, amount: 10000, status: 'processed', settlementDate: new Date(Date.now() - 10 * 86400000), utr: 'UTR1' },
      { settlementId: generateId('settlement'), merchantId: merchant.merchantId, amount: 5000, status: 'pending', settlementDate: new Date(Date.now() - 1 * 86400000) },
      { settlementId: generateId('settlement'), merchantId: merchant.merchantId, amount: 2000, status: 'failed', settlementDate: new Date() },
    ]);
  });
  after(disconnectTestDB);

  function authed(req) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  test('list returns items and an accurate summary', async () => {
    const res = await authed(request(app).get('/api/settlements'));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.items.length >= 3);
    assert.equal(res.body.data.summary.totalSettled, 10000);
    assert.equal(res.body.data.summary.pendingSettlement, 5000);
  });

  test('filters by status', async () => {
    const res = await authed(request(app).get('/api/settlements').query({ status: 'processed' }));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.items.every((s) => s.status === 'processed'));
    // Summary still reflects the whole merchant, not just the filtered page.
    assert.equal(res.body.data.summary.pendingSettlement, 5000);
  });

  test('filters by date range', async () => {
    const from = new Date(Date.now() - 2 * 86400000).toISOString();
    const res = await authed(request(app).get('/api/settlements').query({ from }));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.items.every((s) => new Date(s.settlementDate).getTime() >= new Date(from).getTime()));
  });

  test('single settlement retrieval', async () => {
    const list = await authed(request(app).get('/api/settlements'));
    const one = list.body.data.items[0];
    const res = await authed(request(app).get(`/api/settlements/${one.settlementId}`));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.settlementId, one.settlementId);
  });

  test('merchant isolation', async () => {
    const list = await authed(request(app).get('/api/settlements'));
    const one = list.body.data.items[0];
    const { token: otherToken } = await createTestMerchant();
    const res = await request(app)
      .get(`/api/settlements/${one.settlementId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(res.status, 404);

    const otherList = await request(app).get('/api/settlements').set('Authorization', `Bearer ${otherToken}`);
    assert.equal(otherList.body.data.items.length, 0);
  });
});
