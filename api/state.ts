import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const board = req.query.board as string;
  if (!board) return res.status(400).json({ error: 'Missing board parameter' });

  // Get board state with round info
  const { data: state, error: stateErr } = await db
    .from('board_state')
    .select('*, rounds(*)')
    .eq('board_id', board)
    .single();

  if (stateErr || !state) return res.status(404).json({ error: 'Board not found' });

  // Close expired rounds
  const now = new Date();
  const round = state.rounds as any;
  if (round && new Date(round.ends_at) < now && round.status === 'active') {
    await completeRound(board, round.id, state);
    // Re-fetch
    const { data: fresh } = await db.from('board_state').select('*, rounds(*)').eq('board_id', board).single();
    return res.json(formatState(fresh));
  }

  return res.json(formatState(state));
}

function formatState(state: any) {
  if (!state) return {};
  const round = state.rounds as any;
  return {
    board_id: state.board_id,
    current_word: state.current_word,
    current_owner: state.current_owner_name,
    current_owner_tg_id: state.current_owner_tg_id,
    current_price_cents: state.current_price_cents,
    last_purchase_at: state.last_purchase_at,
    round: round ? {
      id: round.id,
      number: round.round_number,
      ends_at: round.ends_at,
      status: round.status,
      total_volume_cents: round.total_volume_cents
    } : null
  };
}

async function completeRound(boardId: string, roundId: number, state: any) {
  if (!state.current_owner_tg_id) return;

  // Mark round completed
  await db.from('rounds').update({
    status: 'completed',
    final_winner_tg_id: state.current_owner_tg_id,
    final_word: state.current_word
  }).eq('id', roundId);

  // Add to hall of fame
  await db.from('hall_of_fame').insert({
    board_id: boardId,
    round_id: roundId,
    winner_tg_id: state.current_owner_tg_id,
    winner_name: state.current_owner_name,
    winning_word: state.current_word,
    final_price_cents: state.current_price_cents
  });

  // Create new round
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
      current_price_cents: 100,
      last_purchase_at: null
    }).eq('board_id', boardId);
  }
}
