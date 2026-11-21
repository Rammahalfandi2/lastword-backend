import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const tg_id = req.query.tg_id as string;
  if (!tg_id) return res.status(400).json({ error: 'Missing tg_id' });

  const { data: bal } = await db.from('balances').select('*').eq('tg_id', tg_id).single();

  return res.json({
    tg_id,
    balance_usdt_cents: bal?.balance_usdt_cents || 0,
    balance_stars: bal?.balance_stars || 0
  });
}
