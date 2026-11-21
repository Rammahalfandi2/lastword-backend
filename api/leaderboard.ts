import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { data: hof, error } = await db
    .from('hall_of_fame')
    .select('*, boards(name)')
    .order('won_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ leaderboard: hof });
}
