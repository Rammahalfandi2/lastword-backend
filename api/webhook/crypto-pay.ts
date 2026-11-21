import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CRYPTO_PAY_TOKEN } from '../_config';
import { executePurchase } from '../_purchase';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // Verify HMAC-SHA256 signature
  const signature = req.headers['crypto-pay-api-signature'] as string;
  if (!signature) return res.status(401).json({ error: 'Missing signature' });

  const body = JSON.stringify(req.body);
  const secretKey = crypto.createHash('sha256').update(CRYPTO_PAY_TOKEN).digest();
  const hmac = crypto.createHmac('sha256', secretKey as unknown as crypto.BinaryLike).update(body).digest('hex');

  if (hmac !== signature) {
    console.error('Invalid CryptoBot signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { update_type, payload } = req.body;
  if (update_type !== 'invoice_paid') return res.status(200).json({ ok: true });

  const paymentId = payload?.payload;
  if (!paymentId) return res.status(200).json({ ok: true });

  const result = await executePurchase(paymentId);
  if (!result.success) {
    console.error('Purchase execution failed:', result.error);
  }

  return res.status(200).json({ ok: true });
}
