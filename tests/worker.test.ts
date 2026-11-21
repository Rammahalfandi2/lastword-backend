import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

// No Supabase / Telegram secrets: these checks must all fail closed before touching the DB.
const ADMIN = 'b'.repeat(64);
const env: any = {
  ADMIN_SECRET_KEY: ADMIN,
  TELEGRAM_WEBHOOK_SECRET: 'w'.repeat(64),
  TELEGRAM_BOT_TOKEN: '1:TEST_NOT_REAL',
  CRYPTO_PAY_TOKEN: '2:TEST_NOT_REAL',
  BASE_URL: 'https://example.workers.dev'
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const worker = require('../src/worker').default;
const B = 'https://example.workers.dev';
const call = (path: string, init?: RequestInit) => worker.fetch(new Request(B + path, init), env) as Promise<Response>;

test('worker serves the Mini App', async () => {
  for (const p of ['/', '/app', '/index.html']) {
    const r = await call(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type') || '', /text\/html/);
    assert.match(await r.text(), /telegram-web-app\.js/);
  }
  const js = await call('/app.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type') || '', /javascript/);
  assert.equal((await call('/api/_db.ts')).status, 404);
  assert.equal((await call('/package.json')).status, 404);
});

test('worker auth checks fail closed', async () => {
  assert.equal((await call('/api/withdraw')).status, 401);
  assert.equal((await call('/api/withdraw', { headers: { 'x-admin-key': 'wrong'.repeat(5) } })).status, 401);
  assert.equal((await call('/api/balance')).status, 401);
  assert.equal((await call('/api/setup-webhook')).status, 401);
  assert.equal((await call('/api/setup-webhook', { method: 'POST' })).status, 401);
  assert.equal((await call('/api/setup-profile', { method: 'POST' })).status, 401);
  assert.equal((await call('/api/webhook/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await call('/api/initiate-payment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await call('/api/webhook/crypto-pay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
});

test('crypto pay webhook verifies the RAW body (non-ASCII safe)', async () => {
  // Raw body with escaped Arabic, exactly as a sender might serialize it; re-serializing would not match.
  const raw = '{"update_type":"something_else","payload":{"description":"\\u0643\\u0644\\u0645\\u0629"}}';
  const key = crypto.createHash('sha256').update(env.CRYPTO_PAY_TOKEN).digest();
  const sig = crypto.createHmac('sha256', key as any).update(raw).digest('hex');
  const ok = await call('/api/webhook/crypto-pay', { method: 'POST', headers: { 'content-type': 'application/json', 'crypto-pay-api-signature': sig }, body: raw });
  assert.equal(ok.status, 200); // valid signature, ignored update type (no DB access)
  const bad = await call('/api/webhook/crypto-pay', { method: 'POST', headers: { 'content-type': 'application/json', 'crypto-pay-api-signature': sig }, body: raw.replace('else', 'elsf') });
  assert.equal(bad.status, 401);
});

test('worker CORS and unknown routes', async () => {
  const r = await call('/api/state', { method: 'OPTIONS' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.equal((await call('/api/nope')).status, 404);
  assert.equal((await call('/api/state')).status, 400); // missing board param, no DB access
});
