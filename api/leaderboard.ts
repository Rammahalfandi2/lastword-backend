import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Public view: explicit columns only (no Telegram IDs).
  const { data: hof, error } = await db
    .from('hall_of_fame')
    .select('board_id, round_id, winner_name, winning_word, final_price_cents, won_at, boards(name)')
    .order('won_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('leaderboard error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
  return res.json({ leaderboard: hof });
}
