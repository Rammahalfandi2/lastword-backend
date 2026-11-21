import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../_db';
import { executePurchase } from '../_purchase';
import { adjustBalance } from '../_balance';
import { isValidTelegramWebhook, escapeHtml } from '../_auth';
import { starsInvoiceTexts } from '../_invoice';

// Env is read per request (Cloudflare Workers / Vercel), see loadEnv().
let ADMIN_TG_ID = '';
let TG_API = '';
let PLAY_BUTTON: any = null;
function loadEnv() {
  ADMIN_TG_ID = process.env.ADMIN_TELEGRAM_ID || '';
  TG_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  const appUrl = `${(process.env.BASE_URL || 'https://lastword-backend.vercel.app').replace(/\/+$/, '')}/`;
  PLAY_BUTTON = { inline_keyboard: [[{ text: '🎮 Play The Last Word', web_app: { url: appUrl } }]] };
}
// /start <param> deep links from the Mini App that map to bot commands
const START_ALIASES: Record<string, string> = {
  terms: '/terms', support: '/support', paysupport: '/paysupport', balance: '/balance', withdraw: '/withdraw', scores: '/scores'
};

function starsForCents(cents: number): number {
  return Math.ceil((cents / 100) * 77);
}

async function sendMsg(chatId: string, text: string, extra?: object) {
  try {
    await fetch(`${TG_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra })
    });
  } catch (e) { console.error('sendMsg error', e); }
}

// ✅ SECURITY: Check daily withdrawal limit
async function checkDailyWithdrawalLimit(tgId: string, amountCents: number): Promise<{ ok: boolean; usedCents: number }> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data } = await db
    .from('withdrawal_requests')
    .select('amount_cents')
    .eq('tg_id', tgId)
    .neq('status', 'rejected')
    .gte('created_at', startOfDay.toISOString());
  const usedCents = (data || []).reduce((s: number, r: any) => s + r.amount_cents, 0);
  const DAILY_LIMIT_CENTS = 10000; // $100/day
  return { ok: usedCents + amountCents <= DAILY_LIMIT_CENTS, usedCents };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  loadEnv();

  // ✅ SECURITY: Verify X-Telegram-Bot-Api-Secret-Token (constant-time, fail-closed if unset)
  if (!isValidTelegramWebhook(req.headers)) {
    console.error('Invalid Telegram webhook secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const update = req.body || {};

  // Handle pre_checkout_query (Stars) — must respond within 10s
  if (update.pre_checkout_query) {
    const pcq = update.pre_checkout_query;
    const paymentId = pcq.invoice_payload;
    const { data: payment } = await db
      .from('pending_payments')
      .select('*')
      .eq('id', paymentId)
      .eq('status', 'pending')
      .maybeSingle();

    // Accept only if the payment is pending, is a Stars payment, the amount matches,
    // and the board price has not moved since the invoice was created.
    let okToPay = !!payment && payment.payment_method === 'stars' &&
      pcq.currency === 'XTR' && pcq.total_amount === starsForCents(payment.amount_cents);
    if (okToPay) {
      const { data: st } = await db.from('board_state').select('current_price_cents').eq('board_id', payment.board_id).maybeSingle();
      okToPay = !!st && st.current_price_cents === payment.amount_cents;
    }

    await fetch(`${TG_API}/answerPreCheckoutQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pre_checkout_query_id: pcq.id,
        ok: okToPay,
        error_message: okToPay ? undefined : 'This price has expired. Please start a new purchase.'
      })
    });
    return res.status(200).json({ ok: true });
  }

  // Handle successful_payment (Stars confirmed)
  if (update.message?.successful_payment) {
    const sp = update.message.successful_payment;
    const paymentId = sp.invoice_payload;
    if (sp.currency !== 'XTR') return res.status(200).json({ ok: true });
    const result = await executePurchase(String(paymentId), {
      method: 'stars',
      paidStars: Number(sp.total_amount) || 0,
      payerTgId: update.message.from?.id ? String(update.message.from.id) : undefined
    });
    if (!result.success) console.error('Stars purchase failed:', result.error);
    return res.status(200).json({ ok: true });
  }

  // ── Admin: approve/reject withdraw via callback ─────────────────
  // (Must run before the text check: callback updates have no message.text.)
  if (update.callback_query) {
    const cq = update.callback_query;
    const answer = (text: string) => fetch(`${TG_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: cq.id, text })
    });
    if (!ADMIN_TG_ID || String(cq.from?.id) !== String(ADMIN_TG_ID)) {
      await answer('Not authorized');
      return res.status(200).json({ ok: true });
    }
    const data = String(cq.data || '');
    if (data.startsWith('approve_withdraw_') || data.startsWith('reject_withdraw_')) {
      const action = data.startsWith('approve') ? 'approved' : 'rejected';
      const reqId = data.split('_').slice(2).join('_');
      // ✅ Idempotent: only a request that is still pending can change state (no double refunds).
      const { data: changed } = await db.from('withdrawal_requests')
        .update({ status: action, updated_at: new Date().toISOString() })
        .eq('id', reqId)
        .in('status', ['pending', 'pending_approval'])
        .select('*');
      const wReq = changed?.[0];
      if (!wReq) {
        await answer('Already handled or not found');
        return res.status(200).json({ ok: true });
      }
      if (action === 'rejected') {
        const ok = await adjustBalance(String(wReq.tg_id), wReq.amount_cents, 0);
        if (!ok) await sendMsg(ADMIN_TG_ID, `🚨 Could not return $${(wReq.amount_cents / 100).toFixed(2)} to ${wReq.tg_id}. Fix manually.`);
        await sendMsg(String(wReq.tg_id), `❌ Your withdrawal of $${(wReq.amount_cents / 100).toFixed(2)} was rejected. Amount returned to your balance.`);
      } else {
        // Approval only marks it; the admin sends the USDT manually. No automatic payout.
        await sendMsg(String(wReq.tg_id), `✅ Your withdrawal of $${(wReq.amount_cents / 100).toFixed(2)} was approved and is being processed!`);
      }
      await answer(`Marked as ${action}`);
    }
    return res.status(200).json({ ok: true });
  }

  if (!update.message?.text) return res.status(200).json({ ok: true });

  const msg = update.message;
  const chatId = String(msg.chat.id);
  let text = (msg.text as string).trim().replace(/^(\/\w+)@\w+/, '$1');
  const startParam = text.startsWith('/start ') ? text.split(/\s+/)[1] : undefined;
  if (startParam && START_ALIASES[startParam]) text = START_ALIASES[startParam];
  const tgId = String(msg.from.id);
  const tgName = msg.from.first_name || tgId;

  // ── /start ──────────────────────────────────────────────────────
  if (text.startsWith('/start')) {
    const param = text.split(' ')[1];

    if (param?.startsWith('pay_')) {
      const paymentId = param.slice(4);
      const { data: payment } = await db
        .from('pending_payments')
        .select('*')
        .eq('id', paymentId)
        .eq('status', 'pending')
        .single();

      if (!payment) {
        await sendMsg(chatId, '❌ This payment link has expired. Please try again from the website.');
      } else {
        const starsNeeded = starsForCents(payment.amount_cents);
        const inv = starsInvoiceTexts(payment.word, payment.board_id);
        await fetch(`${TG_API}/sendInvoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            title: inv.title,
            description: inv.description,
            prices: [{ label: inv.label, amount: starsNeeded }],
            payload: payment.id,
            currency: 'XTR',
            provider_token: ''
          })
        });
      }
      return res.status(200).json({ ok: true });
    }

    await sendMsg(chatId,
      `🌐 <b>Welcome to The Last Word on the Internet!</b>\n\n` +
      `A fame game — the last holder of a word when the round ends wins forever.\n\n` +
      `🕹 Tap <b>Play</b> below to open the game.\n\n` +
      `Commands:\n/balance — Check your balance\n/terms — Terms of use\n/support — Get help\n/paysupport — Payment help`,
      msg.chat?.type === 'private' ? { reply_markup: PLAY_BUTTON } : undefined
    );
    return res.status(200).json({ ok: true });
  }

  // ── /balance ─────────────────────────────────────────────────────
  if (text === '/balance') {
    const { data: bal } = await db.from('balances').select('*').eq('tg_id', tgId).single();
    const usdtBal = bal?.balance_usdt_cents || 0;
    const starsBal = bal?.balance_stars || 0;
    await sendMsg(chatId,
      `💰 <b>Your Balance</b>\n\n` +
      `💵 USDT: <b>$${(usdtBal / 100).toFixed(2)}</b> — withdrawable via /withdraw\n` +
      `⭐ Stars: <b>${starsBal}</b> — game credits only, <b>cannot be withdrawn</b>\n\n` +
      `Min withdrawal: $5.00 USDT | Daily limit: $100`
    );
    return res.status(200).json({ ok: true });
  }

  // ── /withdraw ────────────────────────────────────────────────────
  if (text.startsWith('/withdraw')) {
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      await sendMsg(chatId,
        '❌ Usage: /withdraw AMOUNT WALLET_ADDRESS\n' +
        'Example: /withdraw 10.00 TYourTRC20Address\n\n' +
        'Min: $5.00 | Daily limit: $100'
      );
      return res.status(200).json({ ok: true });
    }
    const amount = /^\d+(\.\d{1,2})?$/.test(parts[1]) ? parseFloat(parts[1]) : NaN;
    const wallet = parts[2];

    if (!/^[A-Za-z0-9]{20,100}$/.test(wallet)) {
      await sendMsg(chatId, '❌ Invalid wallet address.');
      return res.status(200).json({ ok: true });
    }

    if (isNaN(amount) || amount < 5) {           // ✅ min $5 (fix #3)
      await sendMsg(chatId, '❌ Minimum withdrawal is $5.00 USDT');
      return res.status(200).json({ ok: true });
    }

    const amountCents = Math.round(amount * 100); // ✅ integer cents (input limited to 2 decimals)

    const { data: bal } = await db.from('balances').select('*').eq('tg_id', tgId).single();
    const available = bal?.balance_usdt_cents || 0;
    const starsBalance = bal?.balance_stars || 0;

    // ✅ SECURITY: Stars cannot be withdrawn as USDT (fix #4)
    if (starsBalance > 0 && available === 0) {
      await sendMsg(chatId,
        '❌ Your balance is in Stars (⭐).\n\n' +
        '⭐ Stars are game credits only and <b>cannot be withdrawn as USDT</b>.\n' +
        'You can use Stars to buy again in the next round.'
      );
      return res.status(200).json({ ok: true });
    }

    if (amountCents > available) {
      await sendMsg(chatId, `❌ Insufficient USDT balance.\nAvailable: $${(available / 100).toFixed(2)}`);
      return res.status(200).json({ ok: true });
    }

    // ✅ Daily limit check (fix #3)
    const { ok: withinLimit, usedCents } = await checkDailyWithdrawalLimit(tgId, amountCents);
    if (!withinLimit) {
      await sendMsg(chatId,
        `❌ Daily withdrawal limit reached.\n` +
        `Used today: $${(usedCents / 100).toFixed(2)} / $100.00`
      );
      return res.status(200).json({ ok: true });
    }

    // ✅ Large withdrawals and first-time require manual approval (fix #3)
    const { count: prevWithdrawals } = await db
      .from('withdrawal_requests')
      .select('id', { count: 'exact', head: true })
      .eq('tg_id', tgId)
      .eq('status', 'approved');

    const needsApproval = amountCents >= 2000 || (prevWithdrawals || 0) === 0;
    const status = needsApproval ? 'pending_approval' : 'pending';

    // Deduct immediately (held in escrow) — race-safe, fails if balance changed/insufficient
    const debited = await adjustBalance(tgId, -amountCents, 0);
    if (!debited) {
      await sendMsg(chatId, '❌ Could not reserve your balance. Please try again.');
      return res.status(200).json({ ok: true });
    }

    const { data: wReq, error: wErr } = await db.from('withdrawal_requests').insert({
      tg_id: tgId,
      tg_name: tgName,
      amount_cents: amountCents,
      wallet_address: wallet,
      status,
      requires_approval: needsApproval
    }).select().single();

    if (wErr || !wReq) {
      await adjustBalance(tgId, amountCents, 0); // put the money back
      await sendMsg(chatId, '❌ Could not create the withdrawal request. Your balance was not changed.');
      return res.status(200).json({ ok: true });
    }

    // Every withdrawal is paid manually by the admin; always notify with buttons.
    if (ADMIN_TG_ID) {
      // ✅ Notify admin with approve/reject buttons (fix #3)
      await fetch(`${TG_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_TG_ID,
          text:
            `💸 <b>Withdrawal Request</b>\n\n` +
            `User: ${escapeHtml(tgName)} (${tgId})\n` +
            `Amount: $${amount.toFixed(2)} USDT\n` +
            `Wallet: <code>${escapeHtml(wallet)}</code>\n` +
            `Needs extra review: ${needsApproval ? 'YES' : 'no'}\n` +
            `First withdrawal: ${(prevWithdrawals || 0) === 0 ? 'YES ⚠️' : 'No'}\n` +
            `ID: ${wReq?.id}`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Approve', callback_data: `approve_withdraw_${wReq?.id}` },
              { text: '❌ Reject', callback_data: `reject_withdraw_${wReq?.id}` }
            ]]
          }
        })
      });
    }
    if (needsApproval) {
      await sendMsg(chatId,
        `⏳ <b>Withdrawal request submitted!</b>\n\n` +
        `Amount: $${amount.toFixed(2)} USDT\n` +
        `Wallet: <code>${escapeHtml(wallet)}</code>\n\n` +
        `Requires manual approval (first withdrawal or ≥$20). You'll be notified within 24h.`
      );
    } else {
      await sendMsg(chatId,
        `✅ <b>Withdrawal request submitted!</b>\n\n` +
        `Amount: $${amount.toFixed(2)} USDT\n` +
        `Wallet: <code>${escapeHtml(wallet)}</code>\n\n` +
        `Processing within 24 hours.`
      );
    }
    return res.status(200).json({ ok: true });
  }

  // ── /terms ───────────────────────────────────────────────────────
  if (text === '/terms') {
    await sendMsg(chatId,
      `📋 <b>Terms of Use — The Last Word on the Internet</b>\n\n` +
      `🎮 This is a <b>fame game</b>, not an investment.\n\n` +
      `• No profit is promised or guaranteed\n` +
      `• Stars balance is for in-game use only — it <b>cannot be withdrawn</b>\n` +
      `• USDT balance can be withdrawn (min $5, daily limit $100)\n` +
      `• The admin reserves the right to reject any word and refund the full amount\n` +
      `• Words containing offensive, political, or advertising content are prohibited\n` +
      `• The game is for entertainment purposes only\n\n` +
      `🇸🇦 هذه لعبة شهرة وليست استثماراً. لا يوجد ضمان لأي عائد مالي.\n\n` +
      `🇷🇺 Это игра известности, а не инвестиция. Никакой прибыли не гарантируется.`
    );
    return res.status(200).json({ ok: true });
  }

  // ── /support ─────────────────────────────────────────────────────
  if (text === '/support') {
    await sendMsg(chatId,
      `🆘 <b>Support</b>\n\n` +
      `For any issues with the game, word rejections, or account problems:\n\n` +
      `📩 Contact the admin directly\n` +
      `💡 Use /balance to check your balance\n` +
      `💡 Use /terms to read the rules\n` +
      `💡 Use /paysupport for payment issues`
    );
    return res.status(200).json({ ok: true });
  }

  // ── /paysupport ──────────────────────────────────────────────────
  if (text === '/paysupport') {
    await sendMsg(chatId,
      `💳 <b>Payment Support</b>\n\n` +
      `<b>USDT payments:</b>\n` +
      `• Payments are processed via @CryptoBot\n` +
      `• If your word didn't update after payment, contact support with your transaction ID\n` +
      `• Refunds are credited to your balance automatically\n\n` +
      `<b>Stars payments:</b>\n` +
      `• Stars are non-refundable per Telegram policy\n` +
      `• Stars balance cannot be withdrawn as USDT\n` +
      `• Stars can only be used to buy again in the game\n\n` +
      `📩 For unresolved issues, contact the admin.`
    );
    return res.status(200).json({ ok: true });
  }

  // ── /balance ─────────────────────────────────────────────────────
  if (text === '/scores') {
    const { data: hof } = await db
      .from('hall_of_fame')
      .select('*')
      .order('won_at', { ascending: false })
      .limit(10);

    if (!hof?.length) {
      await sendMsg(chatId, '🏆 No winners yet. Be the first!');
    } else {
      const lines = hof.map((h: any, i: number) =>
        `${i + 1}. <b>${escapeHtml(h.winner_name)}</b> — "${escapeHtml(h.winning_word)}" (${h.board_id.toUpperCase()})`
      ).join('\n');
      await sendMsg(chatId, `🏆 <b>Hall of Fame</b>\n\n${lines}`);
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}
