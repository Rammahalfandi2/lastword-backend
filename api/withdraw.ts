import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Admin endpoint to list pending withdrawals
  const { data: requests } = await db
    .from('withdrawal_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  return res.json({ pending_withdrawals: requests || [] });
}
