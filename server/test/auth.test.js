import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, connectTestDB, disconnectTestDB, createTestMerchant } from '../testSupport/setup.js';

// createTestMerchant() already generates a unique random phoneNumber when
// none is given — used here (instead of hardcoded numbers) so re-running
// this suite against the persistent shared test database never collides
// with merchants a previous run left behind.
function uniquePhone() {
  return `+91${Math.floor(1e9 + Math.random() * 8e9)}`;
}

describe('Authentication', () => {
  before(connectTestDB);
  after(disconnectTestDB);

  test('valid login issues a token and merchant profile', async () => {
    const phoneNumber = uniquePhone();
    const { merchant } = await createTestMerchant({ phoneNumber });

    const res = await request(app).post('/api/auth/login').send({ phoneNumber });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.merchant.merchantId, merchant.merchantId);
  });

  test('login with unknown phone number is rejected', async () => {
    const res = await request(app).post('/api/auth/login').send({ phoneNumber: uniquePhone() });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  test('login with malformed phone number is rejected', async () => {
    const res = await request(app).post('/api/auth/login').send({ phoneNumber: 'not-a-phone' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_PHONE');
  });

  test('login for a suspended merchant is rejected', async () => {
    const phoneNumber = uniquePhone();
    await createTestMerchant({ phoneNumber, status: 'suspended' });
    const res = await request(app).post('/api/auth/login').send({ phoneNumber });
    assert.equal(res.status, 401);
  });

  test('protected route without a token is rejected', async () => {
    const res = await request(app).get('/api/payments');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  test('protected route with a malformed Authorization header is rejected', async () => {
    const res = await request(app).get('/api/payments').set('Authorization', 'Token abc123');
    assert.equal(res.status, 401);
  });

  test('protected route with an invalid/garbage JWT is rejected', async () => {
    const res = await request(app).get('/api/payments').set('Authorization', 'Bearer not.a.valid.jwt');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  test('GET /auth/me derives identity from the JWT, not the request', async () => {
    const { merchant, token } = await createTestMerchant({ phoneNumber: uniquePhone() });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.merchantId, merchant.merchantId);
  });

  test('demo-merchants list requires no auth', async () => {
    const res = await request(app).get('/api/auth/demo-merchants');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
  });
});
