import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './_db';
import { completeRound } from './_purchase';
import { nextPriceCents, starsForCents, CAP_CENTS } from './_config';

const BOARDS = ['ar', 'en', 'ru'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const board = req.query.board as string;
  if (!board) return res.status(400).json({ error: 'Missing board parameter' });
  if (!BOARDS.includes(board)) return res.status(404).json({ error: 'Board not found' });

  const { data: state, error: stateErr } = await db
    .from('board_state')
    .select('*, rounds(*)')
    .eq('board_id', board)
    .single();

  if (stateErr || !state) return res.status(404).json({ error: 'Board not found' });

  // Close expired rounds (idempotent: completeRound only closes an 'active' round once)
  const round = state.rounds as any;
  if (round && round.status === 'active' && new Date(round.ends_at) < new Date()) {
    await completeRound(board, round.id, state);
    const { data: fresh } = await db.from('board_state').select('*, rounds(*)').eq('board_id', board).single();
    return res.json(formatState(fresh));
  }

  return res.json(formatState(state));
}

// Public view: no Telegram IDs.
function formatState(state: any) {
  if (!state) return {};
  const round = state.rounds as any;
  return {
    board_id: state.board_id,
    current_word: state.current_word,
    current_owner: state.current_owner_name,
    current_price_cents: state.current_price_cents,
    current_price_stars: starsForCents(state.current_price_cents),
    next_price_cents: nextPriceCents(state.current_price_cents),
    cap_cents: CAP_CENTS,
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
