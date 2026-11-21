import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../_db';
import { executePurchase } from '../_purchase';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!;
const ADMIN_TG_ID = process.env.ADMIN_TELEGRAM_ID!;
const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ✅ SECURITY: Stars balance non-withdrawable flag
const STARS_CURRENCY = 'stars' as const;

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

  // ✅ SECURITY: Verify X-Telegram-Bot-Api-Secret-Token (fix #2)
  if (TELEGRAM_WEBHOOK_SECRET) {
    const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (incomingSecret !== TELEGRAM_WEBHOOK_SECRET) {
      console.error('Invalid Telegram webhook secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const update = req.body;

  // Handle pre_checkout_query (Stars) — must respond within 10s
  if (update.pre_checkout_query) {
    const pcq = update.pre_checkout_query;
    const paymentId = pcq.invoice_payload;
    const { data: payment } = await db
      .from('pending_payments')
      .select('*')
      .eq('id', paymentId)
      .eq('status', 'pending')
      .single();

    await fetch(`${TG_API}/answerPreCheckoutQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pre_checkout_query_id: pcq.id,
        ok: !!payment,
        error_message: payment ? undefined : 'Payment expired. Please try again from the website.'
      })
    });
    return res.status(200).json({ ok: true });
  }

  // Handle successful_payment (Stars confirmed)
  if (update.message?.successful_payment) {
    const sp = update.message.successful_payment;
    const paymentId = sp.invoice_payload;
    const result = await executePurchase(paymentId, 'stars');
    if (!result.success) console.error('Stars purchase failed:', result.error);
    return res.status(200).json({ ok: true });
  }

  if (!update.message?.text) return res.status(200).json({ ok: true });

  const msg = update.message;
  const chatId = String(msg.chat.id);
  const text = (msg.text as string).trim();
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
        await fetch(`${TG_API}/sendInvoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            title: `The Last Word — ${payment.board_id.toUpperCase()} Board`,
            description:
              `Set your word: "${payment.word}"\n\n` +
              `⚠️ Stars balance cannot be withdrawn — game credits only.\n` +
              `💡 Use USDT for a withdrawable balance.`,
            payload: payment.id,
            currency: 'XTR',
            prices: [{ label: `Word: "${payment.word}"`, amount: starsNeeded }]
          })
        });
      }
      return res.status(200).json({ ok: true });
    }

    await sendMsg(chatId,
      `🌐 <b>Welcome to The Last Word on the Internet!</b>\n\n` +
      `A fame game — the last holder of a word when the round ends wins forever.\n\n` +
      `🕹 Visit the game: <a href="https://claude.ai/artifact/ScKpDdVuwwRqaoP3bZqbwU">Play here</a>\n\n` +
      `Commands:\n/balance — Check your balance\n/terms — Terms of use\n/support — Get help\n/paysupport — Payment help`
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
    const amount = parseFloat(parts[1]);
    const wallet = parts[2];

    if (isNaN(amount) || amount < 5) {           // ✅ min $5 (fix #3)
      await sendMsg(chatId, '❌ Minimum withdrawal is $5.00 USDT');
      return res.status(200).json({ ok: true });
    }

    const amountCents = Math.floor(amount * 100); // ✅ integer cents (fix #8)

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

    // Deduct immediately (held in escrow)
    await db.from('balances').upsert({
      tg_id: tgId,
      balance_usdt_cents: available - amountCents,
      balance_stars: starsBalance,
      updated_at: new Date().toISOString()
    });

    const { data: wReq } = await db.from('withdrawal_requests').insert({
      tg_id: tgId,
      tg_name: tgName,
      amount_cents: amountCents,
      wallet_address: wallet,
      status,
      requires_approval: needsApproval
    }).select().single();

    if (needsApproval && ADMIN_TG_ID) {
      // ✅ Notify admin with approve/reject buttons (fix #3)
      await fetch(`${TG_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_TG_ID,
          text:
            `💸 <b>Withdrawal Request</b>\n\n` +
            `User: ${tgName} (${tgId})\n` +
            `Amount: $${amount.toFixed(2)} USDT\n` +
            `Wallet: <code>${wallet}</code>\n` +
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
      await sendMsg(chatId,
        `⏳ <b>Withdrawal request submitted!</b>\n\n` +
        `Amount: $${amount.toFixed(2)} USDT\n` +
        `Wallet: <code>${wallet}</code>\n\n` +
        `Requires manual approval (first withdrawal or ≥$20). You'll be notified within 24h.`
      );
    } else {
      await sendMsg(chatId,
        `✅ <b>Withdrawal request submitted!</b>\n\n` +
        `Amount: $${amount.toFixed(2)} USDT\n` +
        `Wallet: <code>${wallet}</code>\n\n` +
        `Processing within 24 hours.`
      );
    }
    return res.status(200).json({ ok: true });
  }

  // ── Admin: approve/reject withdraw via callback ─────────────────
  if (update.callback_query) {
    const cq = update.callback_query;
    const adminId = String(cq.from.id);
    if (adminId !== ADMIN_TG_ID) {
      await fetch(`${TG_API}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cq.id, text: 'Not authorized' })
      });
      return res.status(200).json({ ok: true });
    }
    const data = cq.data as string;
    if (data.startsWith('approve_withdraw_') || data.startsWith('reject_withdraw_')) {
      const action = data.startsWith('approve') ? 'approved' : 'rejected';
      const reqId = data.split('_').slice(2).join('_');
      const { data: wReq } = await db.from('withdrawal_requests').select('*').eq('id', reqId).single();
      if (wReq) {
        await db.from('withdrawal_requests').update({ status: action, updated_at: new Date().toISOString() }).eq('id', reqId);
        if (action === 'rejected') {
          // Refund back to user
          const { data: bal } = await db.from('balances').select('*').eq('tg_id', wReq.tg_id).single();
          await db.from('balances').upsert({
            tg_id: wReq.tg_id,
            balance_usdt_cents: (bal?.balance_usdt_cents || 0) + wReq.amount_cents,
            balance_stars: bal?.balance_stars || 0,
            updated_at: new Date().toISOString()
          });
          await sendMsg(wReq.tg_id, `❌ Your withdrawal of $${(wReq.amount_cents / 100).toFixed(2)} was rejected. Amount returned to your balance.`);
        } else {
          await sendMsg(wReq.tg_id, `✅ Your withdrawal of $${(wReq.amount_cents / 100).toFixed(2)} was approved and is being processed!`);
        }
        await fetch(`${TG_API}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: cq.id, text: `Marked as ${action}` })
        });
      }
      return res.status(200).json({ ok: true });
    }
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
        `${i + 1}. <b>${h.winner_name}</b> — "${h.winning_word}" (${h.board_id.toUpperCase()})`
      ).join('\n');
      await sendMsg(chatId, `🏆 <b>Hall of Fame</b>\n\n${lines}`);
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}
