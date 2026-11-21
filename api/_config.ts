// Env is read at call time (works on Vercel and Cloudflare Workers).
export const cryptoPayToken = () => process.env.CRYPTO_PAY_TOKEN || '';

export const PRICE_STEP_PCT = 0.20;
export const MIN_STEP_CENTS = 100;
export const CAP_CENTS = 50000;
export const OWNER_BONUS_PCT = 0.05;
export const STARS_PER_USD = 77;
export const ROUND_DAYS = 7;

export function nextPriceCents(currentCents: number): number {
  const step = Math.max(Math.floor(currentCents * PRICE_STEP_PCT), MIN_STEP_CENTS);
  return currentCents + step;
}

/**
 * Inverse of nextPriceCents: the price the current owner paid, given the board's
 * current (next) price. Returns null if `currentCents` is not reachable.
 */
export function previousPriceCents(currentCents: number): number | null {
  if (!Number.isInteger(currentCents) || currentCents <= 100) return null;
  // nextPriceCents is strictly increasing, so binary search over [1, currentCents).
  let lo = 1, hi = currentCents - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const n = nextPriceCents(mid);
    if (n === currentCents) return mid;
    if (n < currentCents) lo = mid + 1; else hi = mid - 1;
  }
  return null;
}

export function refundCents(paidCents: number): number {
  return Math.floor(paidCents * (1 + OWNER_BONUS_PCT));
}

export function starsForCents(cents: number): number {
  return Math.ceil((cents / 100) * STARS_PER_USD);
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch (e) {
    console.error('Failed to send Telegram message:', e);
  }
}

export async function notifyAdmin(text: string): Promise<void> {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (adminId) await sendTelegramMessage(adminId, text);
}
