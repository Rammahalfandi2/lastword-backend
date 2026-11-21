// Shared purchase execution logic
import { db } from './_db';
import { nextPriceCents, refundCents, CAP_CENTS, sendTelegramMessage, notifyAdmin } from './_config';

// ✅ SECURITY: Idempotency lock using atomic DB update (fix #5)
// Only one process can transition a payment from 'pending' to 'processing' at a time.
// If two requests arrive simultaneously, only one will see rowCount=1; the other gets 0 → rejected.
async function claimPayment(paymentId: string): Promise<boolean> {
  const { data, error } = await db
    .from('pending_payments')
    .update({ status: 'processing', processing_started_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('status', 'pending')   // ← only matches if still 'pending'; second call finds 'processing' → no match
    .select('id');

  if (error) {
    console.error('claimPayment error:', error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

export async function executePurchase(paymentId: string, paymentMethod?: string): Promise<{ success: boolean; error?: string }> {
  // ✅ ATOMIC CLAIM: Only one execution wins the race (fix #5)
  const claimed = await claimPayment(paymentId);
  if (!claimed) {
    return { success: false, error: 'Payment not found or already processed' };
  }

  try {
    // Get payment (now safely locked)
    const { data: payment, error: payErr } = await db
      .from('pending_payments')
      .select('*')
      .eq('id', paymentId)
      .single();

    if (payErr || !payment) {
      return { success: false, error: 'Payment not found after claim' };
    }

    // Override payment_method if provided (e.g., 'stars' from successful_payment callback)
    const method = paymentMethod || payment.payment_method;

    // Get board state
    const { data: state, error: stateErr } = await db
      .from('board_state')
      .select('*, rounds(*)')
      .eq('board_id', payment.board_id)
      .single();

    if (stateErr || !state) {
      await db.from('pending_payments').update({ status: 'failed' }).eq('id', paymentId);
      return { success: false, error: 'Board not found' };
    }

    const round = state.rounds as any;
    if (!round || round.status !== 'active') {
      // Refund the buyer since round is not active
      await db.from('pending_payments').update({ status: 'failed' }).eq('id', paymentId);
      return { success: false, error: 'No active round' };
    }

    const prevOwnerTgId = state.current_owner_tg_id;
    const prevOwnerName = state.current_owner_name;
    const pricePaid = payment.amount_cents; // ✅ always integer cents (fix #8)
    const refund = prevOwnerTgId ? refundCents(pricePaid) : 0;
    const newPrice = nextPriceCents(pricePaid);

    // Mark payment completed
    await db.from('pending_payments').update({ status: 'completed' }).eq('id', paymentId);

    // Record purchase
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
      refund_method: prevOwnerTgId ? method : null
    });

    // ✅ SECURITY: Credit previous owner — refund goes to internal balance only, NO auto USDT send (fix #3)
    // Stars refund → balance_stars (never withdrawable as USDT — fix #4)
    // USDT refund → balance_usdt_cents
    if (prevOwnerTgId && refund > 0) {
      const { data: existing } = await db.from('balances').select('*').eq('tg_id', prevOwnerTgId).single();
      if (method === 'usdt') {
        const currentBal = existing?.balance_usdt_cents || 0;
        await db.from('balances').upsert({
          tg_id: prevOwnerTgId,
          balance_usdt_cents: currentBal + refund, // ✅ integer cents
          balance_stars: existing?.balance_stars || 0,
          updated_at: new Date().toISOString()
        });
      } else {
        // Stars payment → Stars refund (fix #4: Stars balance stays in balance_stars, never converted to USDT)
        const starsRefund = Math.ceil((refund / 100) * 77);
        const currentStars = existing?.balance_stars || 0;
        await db.from('balances').upsert({
          tg_id: prevOwnerTgId,
          balance_usdt_cents: existing?.balance_usdt_cents || 0,
          balance_stars: currentStars + starsRefund, // ✅ Stars stays as Stars
          updated_at: new Date().toISOString()
        });
      }
    }

    // Update board state
    const totalVolume = (round.total_volume_cents || 0) + pricePaid;
    await db.from('board_state').update({
      current_word: payment.word,
      current_owner_tg_id: payment.tg_id,
      current_owner_name: payment.tg_name,
      current_price_cents: newPrice, // ✅ integer cents
      last_purchase_at: new Date().toISOString()
    }).eq('board_id', payment.board_id);

    await db.from('rounds').update({
      total_volume_cents: totalVolume // ✅ integer cents
    }).eq('id', round.id);

    // Check cap → trigger round completion
    if (newPrice >= CAP_CENTS) {
      await completeRound(payment.board_id, round.id, {
        current_owner_tg_id: payment.tg_id,
        current_owner_name: payment.tg_name,
        current_word: payment.word,
        current_price_cents: newPrice,
        rounds: { round_number: round.round_number }
      });
    }

    // Notify buyer
    const boardLabel = payment.board_id.toUpperCase();
    await sendTelegramMessage(payment.tg_id,
      `🏆 <b>You now own the ${boardLabel} board!</b>\n\n` +
      `Your word: <b>${payment.word}</b>\n` +
      `You paid: $${(pricePaid / 100).toFixed(2)}\n` +
      `Next price: $${(newPrice / 100).toFixed(2)}\n\n` +
      `If someone steals your word, you get back $${(refundCents(newPrice) / 100).toFixed(2)} automatically to your balance!`
    );

    // Notify previous owner
    if (prevOwnerTgId) {
      const refundDisplay = method === 'usdt'
        ? `$${(refund / 100).toFixed(2)} USDT`
        : `${Math.ceil((refund / 100) * 77)} Stars`;
      await sendTelegramMessage(prevOwnerTgId,
        `⚡ <b>Your word was claimed on the ${boardLabel} board!</b>\n\n` +
        `"${payment.word}" was taken by ${payment.tg_name}.\n` +
        `Your refund: <b>${refundDisplay}</b> has been added to your balance.\n\n` +
        `Use /balance to check your balance.\n` +
        `Use /withdraw to withdraw USDT (min $5).`
      );
    }

    // Notify admin
    await notifyAdmin(
      `💰 New purchase on ${boardLabel}:\n` +
      `${payment.tg_name} → "${payment.word}"\n` +
      `$${(pricePaid / 100).toFixed(2)} via ${method.toUpperCase()}`
    );

    return { success: true };
  } catch (err: any) {
    console.error('executePurchase error:', err);
    // Mark as failed so it can be investigated
    await db.from('pending_payments').update({ status: 'failed', error_message: String(err?.message || err) }).eq('id', paymentId);
    return { success: false, error: 'Internal error during purchase' };
  }
}

async function completeRound(boardId: string, roundId: number, state: any) {
  if (!state.current_owner_tg_id) return;

  await db.from('rounds').update({
    status: 'completed',
    final_winner_tg_id: state.current_owner_tg_id,
    final_word: state.current_word
  }).eq('id', roundId);

  await db.from('hall_of_fame').insert({
    board_id: boardId,
    round_id: roundId,
    winner_tg_id: state.current_owner_tg_id,
    winner_name: state.current_owner_name,
    winning_word: state.current_word,
    final_price_cents: state.current_price_cents // ✅ integer cents
  });

  const { data: newRound } = await db.from('rounds').insert({
    board_id: boardId,
    round_number: (state.rounds?.round_number || 0) + 1,
    ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  }).select().single();

  if (newRound) {
    await db.from('board_state').update({
      current_round_id: newRound.id,
      current_word: '',
      current_owner_tg_id: null,
      current_owner_name: null,
      current_price_cents: 100, // ✅ $1.00 in cents
      last_purchase_at: null
    }).eq('board_id', boardId);
  }

  await sendTelegramMessage(state.current_owner_tg_id,
    `🎉 <b>YOU WON THE ${boardId.toUpperCase()} BOARD!</b>\n\n` +
    `The price cap was reached and you held the last word: <b>${state.current_word}</b>\n` +
    `A new round has started. Your name is now in the Hall of Fame!`
  );
}
