import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isWordAllowed } from '../api/_validate';
import { validateInitDataUser } from '../api/_auth';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const front = require(path.join(process.cwd(), 'public/validate.js'));

const SAMPLES = [
  '', '   ', 'hello', 'Hello World', 'مرحبا', 'привет', 'a'.repeat(20), 'a'.repeat(21), 'word!', 'hi@there',
  'visit.com', 'www.x', 'https://x', 'profit', 'Invest now', 'classic', 'ربح', 'كلب', '12345', '1234', "it's",
  'snake_case', 'kebab-case', 'emoji😀', 'NAZI', '  spaced  ', 'العربية 2027', 'Москва2027', 'tab\tword', 't.me'
];

test('frontend validator matches the API validator', () => {
  for (const s of SAMPLES) {
    const a = isWordAllowed(s);
    const b = front.isWordAllowed(s);
    assert.equal(b.ok, a.ok, `ok mismatch for ${JSON.stringify(s)}`);
    assert.equal(b.code, a.code, `code mismatch for ${JSON.stringify(s)}`);
  }
});

test('frontend validator blocked-term list is identical', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'public/validate.js'), 'utf8');
  const api = fs.readFileSync(path.join(process.cwd(), 'api/_validate.ts'), 'utf8');
  const terms = (s: string) => (s.match(/BLOCKED_TERMS = \[([\s\S]*?)\];/)![1].match(/'[^']*'/g) || []).join(',');
  assert.equal(terms(src), terms(api));
});

function sign(fields: Record<string, string>, bot: string) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(bot).digest();
  return new URLSearchParams({ ...fields, hash: crypto.createHmac('sha256', secret as any).update(dcs).digest('hex') }).toString();
}

test('initData user: id, display name and language from signed data', () => {
  const bot = '1:TEST_NOT_REAL';
  const now = 1_800_000_000;
  const u = validateInitDataUser(sign({ auth_date: String(now), user: JSON.stringify({ id: 7, first_name: 'Ram', last_name: 'A', language_code: 'ar' }) }, bot), bot, 86400, now);
  assert.deepEqual(u, { id: '7', name: 'Ram A', languageCode: 'ar', username: undefined });
  const u2 = validateInitDataUser(sign({ auth_date: String(now), user: JSON.stringify({ id: 8, username: 'nick' }) }, bot), bot, 86400, now);
  assert.equal(u2?.name, 'nick');
  const bad = validateInitDataUser(sign({ auth_date: String(now), user: JSON.stringify({ id: 'x; drop' }) }, bot), bot, 86400, now);
  assert.equal(bad, null);
});

test('mini app assets reference telegram-web-app.js and no secrets', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'public/index.html'), 'utf8');
  assert.match(html, /telegram\.org\/js\/telegram-web-app\.js/);
  for (const f of fs.readdirSync(path.join(process.cwd(), 'public'))) {
    const c = fs.readFileSync(path.join(process.cwd(), 'public', f), 'utf8');
    assert.doesNotMatch(c, /process\.env|SUPABASE|CRYPTO_PAY_TOKEN|\d{8,10}:[A-Za-z0-9_-]{30,}/);
  }
});
