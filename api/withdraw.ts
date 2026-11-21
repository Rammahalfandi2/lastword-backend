import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './_db';
import { isAdminRequest } from './_auth';

// ADMIN ONLY: list withdrawal requests waiting for a manual payout.
// Requires header x-admin-key = ADMIN_SECRET_KEY. Approval/rejection is done via the
// admin's Telegram buttons (only ADMIN_TELEGRAM_ID can press them). No automatic payouts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAdminRequest(req.headers)) return res.status(401).json({ error: 'Unauthorized' });

  const { data: requests, error } = await db
    .from('withdrawal_requests')
    .select('*')
    .in('status', ['pending', 'pending_approval'])
    .order('created_at', { ascending: true });
  if (error) {
    console.error('withdraw list error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }

  return res.json({ pending_withdrawals: requests || [] });
}
