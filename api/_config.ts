export const CRYPTO_PAY_TOKEN = process.env.CRYPTO_PAY_TOKEN!;
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
export const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID!;
export const BASE_URL = process.env.BASE_URL!;

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

export function refundCents(paidCents: number): number {
  return Math.floor(paidCents * (1 + OWNER_BONUS_PCT));
}

export function starsForCents(cents: number): number {
  return Math.ceil((cents / 100) * STARS_PER_USD);
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch (e) {
    console.error('Failed to send Telegram message:', e);
  }
}

export async function notifyAdmin(text: string): Promise<void> {
  if (ADMIN_TELEGRAM_ID) await sendTelegramMessage(ADMIN_TELEGRAM_ID, text);
}
