import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './_db';
import { nextPriceCents, starsForCents, CRYPTO_PAY_TOKEN, BASE_URL, CAP_CENTS } from './_config';
import crypto from 'crypto';

const CRYPTO_API = 'https://pay.crypt.bot/api';

// ✅ SECURITY: In-memory rate limiter (fix #6)
// Key: `${tg_id}:${endpoint}` → { count, resetAt }
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5;           // max 5 purchase attempts per minute per user

function checkRateLimit(tgId: string): boolean {
  const key = `purchase:${tgId}`;
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true; // ok
  }
  if (entry.count >= RATE_LIMIT_MAX) return false; // blocked
  entry.count++;
  return true; // ok
}

// ✅ CONTENT: Word filter — blocked terms (fix #13 + #14)
const BLOCKED_TERMS = [
  // ✅ Fix #14: Financial/investment terms NEVER allowed
  'ربح', 'استثمار', 'عائد', 'profit', 'invest', 'return', 'returns', 'roi',
  // Fix #13: Offensive / political / spam patterns
  'http://', 'https://', 'www.', '.com', '.net', '.org', '.io',
  '@', 'telegram.me', 't.me',
  // Offensive (basic list — extend as needed)
  'fuck', 'shit', 'ass', 'bitch', 'nigger', 'faggot',
  // Political extremism
  'isis', 'داعش', 'نازي', 'nazi', 'hitler',
  // Arabic offensive (basic)
  'كلب', 'حمار', 'عاهرة',
];

const BLOCKED_REGEX = [
  /https?:\/\//i,         // URLs
  /www\./i,               // Web addresses
  /\.(com|net|org|io|xyz|club)\b/i,  // Domains
  /[^\p{L}\p{N}\s\-_']/u, // Non-letter/number chars (allow Unicode letters)
  /\d{5,}/,               // Long number sequences (phone numbers)
];

function isWordAllowed(word: string): { ok: boolean; reason?: string } {
  const trimmed = word.trim().toLowerCase();

  // ✅ Fix: Max 20 chars (not 50)
  if (word.trim().length > 20) {
    return { ok: false, reason: 'Word too long (max 20 characters)' };
  }
  if (word.trim().length < 1) {
    return { ok: false, reason: 'Word cannot be empty' };
  }

  // Check blocked terms
  for (const term of BLOCKED_TERMS) {
    if (trimmed.includes(term.toLowerCase())) {
      return { ok: false, reason: 'This word is not allowed' };
    }
  }

  // Check regex patterns
  for (const pattern of BLOCKED_REGEX) {
    if (pattern.test(word.trim())) {
      return { ok: false, reason: 'This word contains disallowed content (links or special characters)' };
    }
  }

  return { ok: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tg_id, tg_name, board_id, word, payment_method } = req.body;
  if (!tg_id || !tg_name || !board_id || !word || !payment_method) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!['usdt', 'stars'].includes(payment_method)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  // ✅ SECURITY: Rate limit check (fix #6)
  if (!checkRateLimit(String(tg_id))) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute before trying again.' });
  }

  // ✅ CONTENT: Word filter (fix #13 + #14)
  const wordCheck = isWordAllowed(word);
  if (!wordCheck.ok) {
    return res.status(400).json({ error: wordCheck.reason || 'Invalid word' });
  }

  // Validate board_id
  if (!['ar', 'en', 'ru'].includes(board_id)) {
    return res.status(400).json({ error: 'Invalid board' });
  }

  // Get current state
  const { data: state, error: stateErr } = await db
    .from('board_state')
    .select('*, rounds(*)')
    .eq('board_id', board_id)
    .single();

  if (stateErr || !state) return res.status(404).json({ error: 'Board not found' });

  const round = state.rounds as any;
  if (!round || round.status !== 'active') {
    return res.status(400).json({ error: 'No active round on this board' });
  }

  // Check cap
  if (state.current_price_cents >= CAP_CENTS) {
    return res.status(400).json({ error: 'Price cap reached. New round starting soon.' });
  }

  // ✅ Check round expiry (7 days)
  if (round.ends_at && new Date(round.ends_at) < new Date()) {
    return res.status(400).json({ error: 'This round has ended. A new round is starting.' });
  }

  const priceCents = state.current_price_cents; // ✅ integer cents (fix #8)
  const paymentId = crypto.randomUUID();

  // Store pending payment
  await db.from('pending_payments').insert({
    id: paymentId,
    tg_id: String(tg_id),
    tg_name: String(tg_name).substring(0, 64), // Sanitize name length
    board_id,
    word: word.trim(),
    amount_cents: priceCents, // ✅ integer cents
    payment_method,
    status: 'pending'
  });

  if (payment_method === 'usdt') {
    // ✅ SECURITY: amount as string with 2 decimal places (CryptoBot API requirement)
    const amountUsdt = (priceCents / 100).toFixed(2);
    const cryptoRes = await fetch(`${CRYPTO_API}/createInvoice`, {
      method: 'POST',
      headers: {
        'Crypto-Pay-API-Token': CRYPTO_PAY_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        currency_type: 'crypto',
        asset: 'USDT',
        amount: amountUsdt,
        description: `The Last Word: "${word.trim()}" on ${board_id.toUpperCase()} board`,
        payload: paymentId,
        paid_btn_name: 'callback',
        paid_btn_url: `${BASE_URL}/api/crypto-paid?id=${paymentId}`
      })
    });

    const cryptoData = await cryptoRes.json() as any;
    if (!cryptoData.ok) {
      await db.from('pending_payments').update({ status: 'expired' }).eq('id', paymentId);
      // ✅ SECURITY: Don't leak internal error details (fix #7)
      return res.status(500).json({ error: 'Failed to create invoice. Please try again.' });
    }

    return res.json({
      payment_id: paymentId,
      payment_url: cryptoData.result.mini_app_invoice_url || cryptoData.result.bot_invoice_url,
      amount_cents: priceCents,
      method: 'usdt'
    });

  } else {
    // Stars payment — handled via Telegram bot inline
    const starsNeeded = starsForCents(priceCents); // ✅ integer
    return res.json({
      payment_id: paymentId,
      stars_needed: starsNeeded,
      amount_cents: priceCents,
      method: 'stars',
      bot_start: `pay_${paymentId}`
    });
  }
}
