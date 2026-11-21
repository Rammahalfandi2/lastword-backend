# lastword-backend

Vercel serverless API for "The Last Word on the Internet" (Telegram bot + Crypto Pay + Telegram Stars).

## Admin endpoints (header `x-admin-key: <ADMIN_SECRET_KEY>`, never in the URL)
- `POST /api/setup-webhook` (GET also accepted) — registers the Telegram webhook at `BASE_URL/api/webhook/telegram` with `secret_token = TELEGRAM_WEBHOOK_SECRET`.
- `GET /api/withdraw` — lists withdrawal requests waiting for a manual payout. Approve/reject with the buttons the bot sends to `ADMIN_TELEGRAM_ID`. There are no automatic USDT payouts.

## User endpoints
- `GET /api/balance` — own balance only; requires Telegram WebApp initData in header `X-Telegram-Init-Data` (validated with the bot token). In the bot use `/balance`.
- `POST /api/initiate-payment`, `GET /api/state?board=`, `GET /api/leaderboard`, `GET /api/boards` — public (no Telegram IDs returned).

## Webhooks
- `/api/webhook/telegram` — rejects requests without a matching `X-Telegram-Bot-Api-Secret-Token` (fail-closed).
- `/api/webhook/crypto-pay` — rejects requests without a valid `crypto-pay-api-signature` HMAC.

## Env vars
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_SECRET_KEY` (≥16 chars), `ADMIN_TELEGRAM_ID`, `CRYPTO_PAY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `BASE_URL`, optional `BOT_USERNAME`, `CRYPTO_PAY_API_URL`.

## Checks
`npm run typecheck` and `npm test`.
