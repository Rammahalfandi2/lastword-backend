import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // ✅ SECURITY: Admin key required (fix #1)
  const adminKey = process.env.ADMIN_SECRET_KEY;
  const provided = req.headers['x-admin-key'] || req.query.key;
  if (!adminKey || provided !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const baseUrl = process.env.BASE_URL!;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET!;
  const webhookUrl = `${baseUrl}/api/webhook/telegram`;

  const result = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken   // ✅ enables X-Telegram-Bot-Api-Secret-Token verification
      })
    }
  );

  const data = await result.json();
  return res.json(data);
}
