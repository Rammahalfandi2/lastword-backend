import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './_db';
import { validateInitData } from './_auth';

// Users may only read THEIR OWN balance. Identity comes from Telegram WebApp initData,
// validated by HMAC with the bot token (header X-Telegram-Init-Data, or ?init_data=).
// The bot's /balance command reads the DB directly and does not use this endpoint.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const header = req.headers['x-telegram-init-data'];
  const initData = (Array.isArray(header) ? header[0] : header) || (req.query.init_data as string | undefined);
  const tgId = validateInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
  if (!tgId) {
    return res.status(401).json({ error: 'Unauthorized. Open the game inside Telegram or use /balance in the bot.' });
  }

  const { data: bal } = await db.from('balances').select('balance_usdt_cents, balance_stars').eq('tg_id', tgId).maybeSingle();

  return res.json({
    tg_id: tgId,
    balance_usdt_cents: bal?.balance_usdt_cents || 0,
    balance_stars: bal?.balance_stars || 0
  });
}
