import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './_db';
import { nextPriceCents, starsForCents, CRYPTO_PAY_TOKEN, CAP_CENTS } from './_config';
import crypto from 'crypto';
import { isWordAllowed } from './_validate';
import { cryptoPayDescription, starsInvoiceTexts } from './_invoice';
import { validateInitDataUser, initDataFromHeaders } from './_auth';

const CRYPTO_API = process.env.CRYPTO_PAY_API_URL || 'https://pay.crypt.bot/api';
const BOT_USERNAME = process.env.BOT_USERNAME || 'word2027_Bot';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ✅ Identity comes ONLY from Telegram WebApp initData (HMAC-validated), never from the body.
  const user = validateInitDataUser(initDataFromHeaders(req.headers), process.env.TELEGRAM_BOT_TOKEN);
  if (!user) return res.status(401).json({ error: 'Unauthorized. Open the game inside Telegram.' });
  const tg_id = user.id;
  const tg_name = user.name;

  const { board_id, word, payment_method } = req.body || {};
  if (!board_id || !word || !payment_method) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (typeof word !== 'string') {
    return res.status(400).json({ error: 'Invalid fields' });
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
    return res.status(400).json({ error: wordCheck.reason || 'Invalid word', code: wordCheck.code });
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
  const { error: insErr } = await db.from('pending_payments').insert({
    id: paymentId,
    tg_id: String(tg_id),
    tg_name: String(tg_name).substring(0, 64), // Sanitize name length
    board_id,
    word: word.trim(),
    amount_cents: priceCents, // ✅ integer cents
    payment_method,
    status: 'pending'
  });
  if (insErr) {
    console.error('pending_payments insert error:', insErr);
    return res.status(500).json({ error: 'Could not start payment. Please try again.' });
  }

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
        description: cryptoPayDescription(word, board_id),
        payload: paymentId,
        // Invoice expires quickly so it cannot be paid later at an old (lower) price.
        expires_in: 15 * 60,
        // /api/crypto-paid does not exist; send the payer back to the bot instead.
        paid_btn_name: 'openBot',
        paid_btn_url: `https://t.me/${BOT_USERNAME}`
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
    // Invoice link for Telegram.WebApp.openInvoice (Mini App). The bot's /start pay_<id> flow still works too.
    let invoiceLink: string | null = null;
    const inv = starsInvoiceTexts(word, board_id);
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/createInvoiceLink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: inv.title,
          description: inv.description,
          prices: [{ label: inv.label, amount: starsNeeded }],
          payload: paymentId,
          currency: 'XTR',
          provider_token: ''
        })
      });
      const tgData = await tgRes.json() as any;
      if (tgData?.ok) invoiceLink = tgData.result;
      else console.error('createInvoiceLink failed:', tgData?.description);
    } catch (e) {
      console.error('createInvoiceLink error:', e);
    }
    return res.json({
      payment_id: paymentId,
      stars_needed: starsNeeded,
      amount_cents: priceCents,
      method: 'stars',
      invoice_link: invoiceLink,
      bot_start: `pay_${paymentId}`
    });
  }
}
