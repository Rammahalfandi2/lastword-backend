// Pure security helpers (no DB access) so they can be unit-tested.
import crypto from 'crypto';

// Buffer typing clash between @types/node and the DOM lib; cast once here.
const u8 = (b: Buffer) => b as unknown as Uint8Array;

/** Constant-time string comparison. Returns false for missing values. */
export function safeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(u8(ha) as any, u8(hb) as any) && a.length === b.length;
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** True only if the x-admin-key header matches ADMIN_SECRET_KEY (query-string keys are NOT accepted). */
export function isAdminRequest(
  headers: Record<string, string | string[] | undefined>,
  adminKey: string | undefined = process.env.ADMIN_SECRET_KEY
): boolean {
  if (!adminKey || adminKey.length < 16) return false; // refuse weak / unset keys
  return safeEqual(headerValue(headers['x-admin-key']), adminKey);
}

/** Telegram webhook secret check (fail-closed when the secret is not configured). */
export function isValidTelegramWebhook(
  headers: Record<string, string | string[] | undefined>,
  secret: string | undefined = process.env.TELEGRAM_WEBHOOK_SECRET
): boolean {
  if (!secret) return false;
  return safeEqual(headerValue(headers['x-telegram-bot-api-secret-token']), secret);
}

/**
 * Validate Telegram WebApp initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Returns the Telegram user id on success, otherwise null.
 */
export function validateInitData(
  initData: string | undefined,
  botToken: string | undefined,
  maxAgeSeconds = 24 * 60 * 60,
  nowSeconds = Math.floor(Date.now() / 1000)
): string | null {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', u8(secretKey) as any).update(dataCheckString).digest('hex');
  if (!safeEqual(expected, hash)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowSeconds - authDate > maxAgeSeconds) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || user.id === undefined || user.id === null) return null;
    return String(user.id);
  } catch {
    return null;
  }
}

/** Python-style ensure_ascii JSON (non-ASCII as \uXXXX). */
function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

/**
 * Verify Crypto Pay webhook signature: HMAC-SHA256(body, SHA256(api_token)) in hex.
 * Prefer the raw body when available; otherwise re-serialize the parsed body (both
 * plain and ASCII-escaped forms are tried, since we cannot always get the raw bytes).
 */
export function verifyCryptoPaySignature(
  signature: string | undefined,
  token: string | undefined,
  body: unknown,
  rawBody?: string
): boolean {
  if (!signature || !token || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const secret = crypto.createHash('sha256').update(token).digest();
  const candidates = rawBody !== undefined ? [rawBody] : [JSON.stringify(body), asciiJson(body)];
  return candidates.some((c) =>
    safeEqual(crypto.createHmac('sha256', u8(secret) as any).update(c).digest('hex'), signature.toLowerCase())
  );
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
