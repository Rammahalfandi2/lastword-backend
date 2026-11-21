// Shared purchase execution logic
import { db } from './_db';
import {
  nextPriceCents, previousPriceCents, refundCents, starsForCents, CAP_CENTS, ROUND_DAYS,
  sendTelegramMessage, notifyAdmin
} from './_config';
import { adjustBalance } from './_balance';
import { escapeHtml } from './_auth';

export type PaymentProof =
  | { method: 'usdt'; paidUsdtCents: number }
  | { method: 'stars'; paidStars: number; payerTgId?: string };

// Idempotency lock: only one process can move a payment from 'pending' to 'processing'.
async function claimPayment(paymentId: string): Promise<boolean> {
  const { data, error } = await db
    .from('pending_payments')
    .update({ status: 'processing', processing_started_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('status', 'pending')
    .select('id');
  if (error) {
    console.error('claimPayment error:', error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/** Credit what the buyer actually paid back to their in-game balance (same currency). */
async function creditBuyer(payment: any, proof: PaymentProof, reason: string) {
  const ok = proof.method === 'usdt'
    ? await adjustBalance(String(payment.tg_id), proof.paidUsdtCents, 0)
    : await adjustBalance(String(payment.tg_id), 0, proof.paidStars);
  const shown = proof.method === 'usdt'
    ? `$${(proof.paidUsdtCents / 100).toFixed(2)} USDT`
    : `${proof.paidStars} Stars`;
  await db.from('pending_payments')
    .update({ status: 'failed', error_message: (ok ? 'credited to balance: ' : 'CREDIT FAILED: ') + reason })
    .eq('id', payment.id);
  if (ok) {
    await sendTelegramMessage(String(payment.tg_id),
      `⚠️ Your word could not be placed (${escapeHtml(reason)}).\n` +
      `${shown} was added to your balance. Use /balance to check it.`);
  }
  await notifyAdmin(`⚠️ Payment ${payment.id} not applied (${escapeHtml(reason)}). ` +
    (ok ? `Credited ${shown} to ${payment.tg_id}.` : `CREDIT FAILED — fix manually.`));
}

export async function executePurchase(paymentId: string, proof: PaymentProof): Promise<{ success: boolean; error?: string }> {
  const claimed = await claimPayment(paymentId);
  if (!claimed) return { success: false, error: 'Payment not found or already processed' };

  let payment: any = null;
  try {
    const { data: p, error: payErr } = await db.from('pending_payments').select('*').eq('id', paymentId).single();
    if (payErr || !p) return { success: false, error: 'Payment not found after claim' };
    payment = p;

    // Stars: the person who actually paid owns the purchase.
    if (proof.method === 'stars' && proof.payerTgId && proof.payerTgId !== String(payment.tg_id)) {
      payment.tg_id = proof.payerTgId;
      await db.from('pending_payments').update({ tg_id: proof.payerTgId }).eq('id', paymentId);
    }

    // Verify the amount actually paid matches what we asked for.
    const paidEnough = proof.method === 'usdt'
      ? proof.paidUsdtCents >= payment.amount_cents
      : proof.paidStars >= starsForCents(payment.amount_cents);
    if (proof.method !== payment.payment_method || !paidEnough) {
      await db.from('pending_payments').update({ status: 'failed', error_message: 'amount/method mismatch' }).eq('id', paymentId);
      await notifyAdmin(`🚨 Payment ${paymentId}: amount or method mismatch. Check manually.`);
      return { success: false, error: 'Amount mismatch' };
    }

    const method = proof.method;
    const { data: state, error: stateErr } = await db
      .from('board_state').select('*, rounds(*)').eq('board_id', payment.board_id).single();
    if (stateErr || !state) {
      await creditBuyer(payment, proof, 'board not found');
      return { success: false, error: 'Board not found' };
    }

    const round = state.rounds as any;
    const roundExpired = round?.ends_at && new Date(round.ends_at) < new Date();
    if (!round || round.status !== 'active' || roundExpired) {
      await creditBuyer(payment, proof, 'round is not active');
      return { success: false, error: 'No active round' };
    }

    const pricePaid: number = payment.amount_cents; // integer cents
    const prevOwnerTgId = state.current_owner_tg_id;

    // ✅ Stale price / concurrent purchase guard: take the board only if it still has the
    // price and owner this payment was created for (compare-and-swap).
    if (state.current_price_cents !== pricePaid) {
      await creditBuyer(payment, proof, 'the price changed before your payment arrived');
      return { success: false, error: 'Stale price' };
    }
    const newPrice = nextPriceCents(pricePaid);
    let claimQ = db.from('board_state').update({
      current_word: payment.word,
      current_owner_tg_id: payment.tg_id,
      current_owner_name: payment.tg_name,
      current_price_cents: newPrice,
      last_purchase_at: new Date().toISOString()
    })
      .eq('board_id', payment.board_id)
      .eq('current_price_cents', pricePaid)
      .eq('current_round_id', round.id);
    claimQ = prevOwnerTgId ? claimQ.eq('current_owner_tg_id', prevOwnerTgId) : claimQ.is('current_owner_tg_id', null);
    const { data: boardClaim, error: claimErr } = await claimQ.select('board_id');
    if (claimErr) throw claimErr;
    if (!boardClaim || boardClaim.length === 0) {
      await creditBuyer(payment, proof, 'someone else bought the board at the same moment');
      return { success: false, error: 'Board changed concurrently' };
    }

    await db.from('pending_payments').update({ status: 'completed' }).eq('id', paymentId);

    // ✅ Refund = what the OUTBID owner paid + 5%, in the currency THEY paid with.
    let refund = 0;
    let refundMethod: 'usdt' | 'stars' | null = null;
    if (prevOwnerTgId) {
      const prevPaid = previousPriceCents(pricePaid) ?? Math.floor((pricePaid * 100) / 120);
      refund = refundCents(prevPaid);
      const { data: prevBuy } = await db.from('purchase_history')
        .select('payment_method')
        .eq('board_id', payment.board_id)
        .eq('round_id', round.id)
        .eq('buyer_tg_id', prevOwnerTgId)
        .eq('price_paid_cents', prevPaid)
        .limit(1);
      refundMethod = (prevBuy?.[0]?.payment_method as any) || method;
    }

    await db.from('purchase_history').insert({
      board_id: payment.board_id,
      round_id: round.id,
      buyer_tg_id: payment.tg_id,
      buyer_name: payment.tg_name,
      word: payment.word,
      price_paid_cents: pricePaid,
      payment_method: method,
      previous_owner_tg_id: prevOwnerTgId || null,
      refund_sent_cents: refund || null,
      refund_method: refundMethod
    });

    // Refund goes to internal balance only — never an automatic USDT send.
    // Stars refunds stay as Stars (never withdrawable as USDT).
    let refundDisplay = '';
    if (prevOwnerTgId && refund > 0) {
      let ok: boolean;
      if (refundMethod === 'usdt') {
        ok = await adjustBalance(String(prevOwnerTgId), refund, 0);
        refundDisplay = `$${(refund / 100).toFixed(2)} USDT`;
      } else {
        const starsRefund = starsForCents(refund);
        ok = await adjustBalance(String(prevOwnerTgId), 0, starsRefund);
        refundDisplay = `${starsRefund} Stars`;
      }
      if (!ok) await notifyAdmin(`🚨 Refund credit FAILED for ${prevOwnerTgId} (${refundDisplay}). Fix manually.`);
    }

    await db.from('rounds').update({
      total_volume_cents: (round.total_volume_cents || 0) + pricePaid
    }).eq('id', round.id);

    if (newPrice >= CAP_CENTS) {
      await completeRound(payment.board_id, round.id, {
        current_owner_tg_id: payment.tg_id,
        current_owner_name: payment.tg_name,
        current_word: payment.word,
        current_price_cents: newPrice,
        rounds: { round_number: round.round_number }
      });
    }

    const boardLabel = String(payment.board_id).toUpperCase();
    await sendTelegramMessage(String(payment.tg_id),
      `🏆 <b>You now own the ${boardLabel} board!</b>\n\n` +
      `Your word: <b>${escapeHtml(payment.word)}</b>\n` +
      `You paid: $${(pricePaid / 100).toFixed(2)}\n` +
      `Next price: $${(newPrice / 100).toFixed(2)}\n\n` +
      `If someone takes your word, $${(refundCents(pricePaid) / 100).toFixed(2)} goes back to your in-game balance.`
    );

    if (prevOwnerTgId) {
      await sendTelegramMessage(String(prevOwnerTgId),
        `⚡ <b>Your word was claimed on the ${boardLabel} board!</b>\n\n` +
        `"${escapeHtml(payment.word)}" was taken by ${escapeHtml(payment.tg_name)}.\n` +
        `Your refund: <b>${refundDisplay}</b> has been added to your balance.\n\n` +
        `Use /balance to check your balance.\n` +
        `Use /withdraw to withdraw USDT (min $5).`
      );
    }

    await notifyAdmin(
      `💰 New purchase on ${boardLabel}:\n` +
      `${escapeHtml(payment.tg_name)} → "${escapeHtml(payment.word)}"\n` +
      `$${(pricePaid / 100).toFixed(2)} via ${method.toUpperCase()}`
    );

    return { success: true };
  } catch (err: any) {
    console.error('executePurchase error:', err);
    await db.from('pending_payments').update({ status: 'failed', error_message: String(err?.message || err) }).eq('id', paymentId);
    await notifyAdmin(`🚨 Purchase ${paymentId} crashed after payment. Check manually.`);
    return { success: false, error: 'Internal error during purchase' };
  }
}

/**
 * Close a round exactly once (compare-and-swap on rounds.status) and start the next one.
 * Works for rounds without an owner too (expired empty rounds are simply restarted).
 */
export async function completeRound(boardId: string, roundId: number, state: any): Promise<boolean> {
  const { data: closed, error } = await db.from('rounds').update({
    status: 'completed',
    final_winner_tg_id: state.current_owner_tg_id || null,
    final_word: state.current_word || null
  }).eq('id', roundId).eq('status', 'active').select('id');
  if (error) { console.error('completeRound error:', error); return false; }
  if (!closed || closed.length === 0) return false; // another request already closed it

  if (state.current_owner_tg_id) {
    await db.from('hall_of_fame').insert({
      board_id: boardId,
      round_id: roundId,
      winner_tg_id: state.current_owner_tg_id,
      winner_name: state.current_owner_name,
      winning_word: state.current_word,
      final_price_cents: state.current_price_cents
    });
  }

  const { data: newRound } = await db.from('rounds').insert({
    board_id: boardId,
    round_number: (state.rounds?.round_number || 0) + 1,
    ends_at: new Date(Date.now() + ROUND_DAYS * 24 * 60 * 60 * 1000).toISOString()
  }).select().single();

  if (newRound) {
    await db.from('board_state').update({
      current_round_id: newRound.id,
      current_word: '',
      current_owner_tg_id: null,
      current_owner_name: null,
      current_price_cents: 100,
      last_purchase_at: null
    }).eq('board_id', boardId);
  } else {
    await notifyAdmin(`🚨 Could not start a new round on ${boardId}. Check manually.`);
  }

  if (state.current_owner_tg_id) {
    await sendTelegramMessage(String(state.current_owner_tg_id),
      `🎉 <b>YOU WON THE ${boardId.toUpperCase()} BOARD!</b>\n\n` +
      `You held the last word: <b>${escapeHtml(state.current_word)}</b>\n` +
      `A new round has started. Your name is now in the Hall of Fame!`
    );
  }
  return true;
}
