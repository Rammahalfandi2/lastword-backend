import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isAdminRequest } from './_auth';
import { PROFILE_LANGS, profileFor } from './_profile';

// ADMIN ONLY (POST + header x-admin-key): sets the bot's name, short description, description
// and command list for the default language ('' = English) and en/ar/ru, then reads them back.
// Values already equal are skipped (setMyName is heavily rate-limited by Telegram).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAdminRequest(req.headers)) return res.status(401).json({ error: 'Unauthorized' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Server misconfigured' });

  const call = async (method: string, body: object): Promise<any> => {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return await r.json();
    } catch {
      return { ok: false, description: 'request failed' };
    }
  };
  const summary = (r: any) => (r?.ok ? 'ok' : `error: ${r?.description || 'unknown'}`);

  const results: Record<string, any> = {};
  for (const lang of PROFILE_LANGS) {
    const want = profileFor(lang);
    const lc = lang ? { language_code: lang } : {};
    const out: any = {};

    const [curName, curShort, curDesc] = await Promise.all([
      call('getMyName', lc), call('getMyShortDescription', lc), call('getMyDescription', lc)
    ]);
    out.setMyName = curName?.result?.name === want.name ? 'unchanged' : summary(await call('setMyName', { name: want.name, ...lc }));
    out.setMyShortDescription = curShort?.result?.short_description === want.short_description
      ? 'unchanged' : summary(await call('setMyShortDescription', { short_description: want.short_description, ...lc }));
    out.setMyDescription = curDesc?.result?.description === want.description
      ? 'unchanged' : summary(await call('setMyDescription', { description: want.description, ...lc }));
    out.setMyCommands = summary(await call('setMyCommands', { commands: want.commands, ...lc }));

    // Read back for verification
    const [n, s, d, c] = await Promise.all([
      call('getMyName', lc), call('getMyShortDescription', lc), call('getMyDescription', lc), call('getMyCommands', lc)
    ]);
    out.verify = {
      name: n?.result?.name,
      short_description: s?.result?.short_description,
      description: d?.result?.description,
      commands: Array.isArray(c?.result) ? c.result.map((x: any) => `/${x.command} — ${x.description}`) : c?.description,
      matches: n?.result?.name === want.name && s?.result?.short_description === want.short_description &&
        d?.result?.description === want.description
    };
    results[lang || 'default'] = out;
  }

  const wh = await call('getWebhookInfo', {});
  const webhook = wh?.ok ? {
    url: wh.result.url,
    pending_update_count: wh.result.pending_update_count,
    last_error_message: wh.result.last_error_message || null,
    last_error_date: wh.result.last_error_date || null
  } : { error: wh?.description };

  return res.json({ ok: true, results, webhook });
}
