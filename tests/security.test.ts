import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { safeEqual, isAdminRequest, isValidTelegramWebhook, validateInitData, verifyCryptoPaySignature, escapeHtml } from '../api/_auth';
import { nextPriceCents, previousPriceCents, refundCents } from '../api/_config';

const ADMIN = 'a'.repeat(64);

test('safeEqual', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('', ''), false);
  assert.equal(safeEqual(undefined, 'x'), false);
});

test('admin key: header only, rejects missing/wrong/weak', () => {
  assert.equal(isAdminRequest({ 'x-admin-key': ADMIN }, ADMIN), true);
  assert.equal(isAdminRequest({ 'x-admin-key': ADMIN + 'x' }, ADMIN), false);
  assert.equal(isAdminRequest({}, ADMIN), false);
  assert.equal(isAdminRequest({ 'x-admin-key': 'short' }, 'short'), false); // weak key refused
  assert.equal(isAdminRequest({ 'x-admin-key': ADMIN }, undefined), false);
});

test('telegram webhook secret is fail-closed', () => {
  assert.equal(isValidTelegramWebhook({ 'x-telegram-bot-api-secret-token': 's3cret' }, 's3cret'), true);
  assert.equal(isValidTelegramWebhook({ 'x-telegram-bot-api-secret-token': 'nope' }, 's3cret'), false);
  assert.equal(isValidTelegramWebhook({}, undefined), false);
  assert.equal(isValidTelegramWebhook({ 'x-telegram-bot-api-secret-token': '' }, ''), false);
});

function signInitData(fields: Record<string, string>, botToken: string): string {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret as any).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

test('initData validation', () => {
  const bot = '123456:TEST_TOKEN_NOT_REAL';
  const now = 1_800_000_000;
  const fields = { auth_date: String(now - 60), query_id: 'q1', user: JSON.stringify({ id: 42, first_name: 'A' }) };
  const good = signInitData(fields, bot);
  assert.equal(validateInitData(good, bot, 86400, now), '42');
  assert.equal(validateInitData(good, 'other:token', 86400, now), null);
  const tampered = good.replace('%22id%22%3A42', '%22id%22%3A43');
  assert.notEqual(tampered, good);
  assert.equal(validateInitData(tampered, bot, 86400, now), null);
  assert.equal(validateInitData(good, bot, 30, now), null); // too old
  assert.equal(validateInitData(undefined, bot), null);
});

test('crypto pay signature', () => {
  const token = '999:TEST_CRYPTO_TOKEN';
  const body = { update_type: 'invoice_paid', payload: { description: 'كلمة', amount: '1.00' } };
  const key = crypto.createHash('sha256').update(token).digest();
  const sig = (s: string) => crypto.createHmac('sha256', key as any).update(s).digest('hex');
  assert.equal(verifyCryptoPaySignature(sig(JSON.stringify(body)), token, body), true);
  const ascii = JSON.stringify(body).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  assert.equal(verifyCryptoPaySignature(sig(ascii), token, body), true);
  assert.equal(verifyCryptoPaySignature(sig('{"x":1}'), token, body), false);
  assert.equal(verifyCryptoPaySignature(undefined, token, body), false);
  assert.equal(verifyCryptoPaySignature(sig(JSON.stringify(body)), 'wrong', body), false);
});

test('price math: integer cents, inverse, refund is outbid owner price + 5%', () => {
  let p = 100;
  for (let i = 0; i < 60; i++) {
    const n = nextPriceCents(p);
    assert.ok(Number.isInteger(n) && n > p);
    assert.equal(previousPriceCents(n), p);
    // Site never pays out more than the new buyer paid.
    assert.ok(refundCents(p) <= n, `refund ${refundCents(p)} > paid ${n}`);
    p = n;
  }
  assert.equal(previousPriceCents(100), null);
  assert.equal(nextPriceCents(100), 200);
  assert.equal(refundCents(200), 210);
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('<b>&'), '&lt;b&gt;&amp;');
});
