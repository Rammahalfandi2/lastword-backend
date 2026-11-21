import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isAdminRequest } from './_auth';

// ADMIN ONLY: registers the Telegram webhook with secret_token = TELEGRAM_WEBHOOK_SECRET
// and sets the chat menu button to open the Mini App at BASE_URL/.
// Call with POST (or GET) and header x-admin-key: <ADMIN_SECRET_KEY>. Query-string keys are rejected.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAdminRequest(req.headers)) return res.status(401).json({ error: 'Unauthorized' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const baseUrl = process.env.BASE_URL;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !baseUrl || !secretToken || !/^[A-Za-z0-9_-]{16,256}$/.test(secretToken)) {
    return res.status(500).json({ error: 'Server misconfigured: TELEGRAM_BOT_TOKEN, BASE_URL or TELEGRAM_WEBHOOK_SECRET missing/invalid' });
  }
  const webhookUrl = `${baseUrl.replace(/\/+$/, '')}/api/webhook/telegram`;

  const result = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secretToken, // Telegram will send it as X-Telegram-Bot-Api-Secret-Token
      allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
      drop_pending_updates: false
    })
  });

  const data = await result.json() as any;

  // Chat menu button → open the Mini App (default for all private chats).
  const appUrl = `${baseUrl.replace(/\/+$/, '')}/`;
  let menu: any = null;
  try {
    const menuRes = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu_button: { type: 'web_app', text: 'Play', web_app: { url: appUrl } } })
    });
    menu = await menuRes.json();
  } catch (e) {
    menu = { ok: false, description: 'request failed' };
  }

  return res.json({
    ok: !!data?.ok,
    description: data?.description,
    webhook_url: webhookUrl,
    menu_button: { ok: !!menu?.ok, description: menu?.description, url: appUrl }
  });
}
