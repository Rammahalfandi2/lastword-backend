import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cryptoPayToken } from '../_config';
import { executePurchase } from '../_purchase';
import { verifyCryptoPaySignature } from '../_auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Verify HMAC-SHA256 of the body with SHA256(CRYPTO_PAY_TOKEN), constant-time.
  const sigHeader = req.headers['crypto-pay-api-signature'];
  const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  const rawBody = typeof req.body === 'string' ? req.body : undefined;
  if (!verifyCryptoPaySignature(signature, cryptoPayToken(), req.body, rawBody)) {
    console.error('Invalid CryptoBot signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { update_type, payload } = body || {};
  if (update_type !== 'invoice_paid') return res.status(200).json({ ok: true });

  const paymentId = payload?.payload;
  if (!paymentId || payload?.status !== 'paid' || payload?.asset !== 'USDT') {
    console.error('Ignoring invoice_paid with unexpected fields', payload?.invoice_id);
    return res.status(200).json({ ok: true });
  }

  const paidUsdtCents = Math.round(parseFloat(String(payload.amount)) * 100);
  if (!Number.isFinite(paidUsdtCents)) return res.status(200).json({ ok: true });

  const result = await executePurchase(String(paymentId), { method: 'usdt', paidUsdtCents });
  if (!result.success) console.error('Purchase execution failed:', result.error);

  return res.status(200).json({ ok: true });
}
