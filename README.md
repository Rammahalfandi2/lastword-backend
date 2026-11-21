# lastword-backend

Vercel serverless API for "The Last Word on the Internet" (Telegram bot + Crypto Pay + Telegram Stars).

## Mini App
Static Telegram Mini App in `public/` (served at `/` and `/app`). Opened from the bot's Play button and chat menu button. Uses `/api/state`, `/api/boards`, `/api/leaderboard`, `/api/balance` and `/api/initiate-payment` (initData in `X-Telegram-Init-Data`).

## Admin endpoints (header `x-admin-key: <ADMIN_SECRET_KEY>`, never in the URL)
- `POST /api/setup-webhook` (GET also accepted) — registers the Telegram webhook at `BASE_URL/api/webhook/telegram` with `secret_token = TELEGRAM_WEBHOOK_SECRET`, and sets the chat menu button to the Mini App (`BASE_URL/`).
- `POST /api/setup-profile` — sets bot name, short description, description and commands for default/en/ar/ru (texts in `api/_profile.ts`) and returns a read-back.
- `GET /api/withdraw` — lists withdrawal requests waiting for a manual payout. Approve/reject with the buttons the bot sends to `ADMIN_TELEGRAM_ID`. There are no automatic USDT payouts.

## User endpoints
- `GET /api/balance` — own balance only; requires Telegram WebApp initData in header `X-Telegram-Init-Data` (validated with the bot token). In the bot use `/balance`.
- `POST /api/initiate-payment` — requires initData (header `X-Telegram-Init-Data`); tg_id/name come from initData, not the body.
- `GET /api/state?board=`, `GET /api/leaderboard`, `GET /api/boards` — public (no Telegram IDs returned).

## Webhooks
- `/api/webhook/telegram` — rejects requests without a matching `X-Telegram-Bot-Api-Secret-Token` (fail-closed).
- `/api/webhook/crypto-pay` — rejects requests without a valid `crypto-pay-api-signature` HMAC.

## Env vars
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_SECRET_KEY` (≥16 chars), `ADMIN_TELEGRAM_ID`, `CRYPTO_PAY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `BASE_URL`, optional `BOT_USERNAME`, `CRYPTO_PAY_API_URL`.

## Checks
`npm run typecheck` and `npm test`.

## Cloudflare Workers
`src/worker.ts` runs the same `api/*` handlers on a Worker (Vercel req/res adapter in `src/adapter.ts`, `nodejs_compat`), serves `public/` (ASSETS binding, or the embedded copy in `src/static.ts`), and verifies Crypto Pay signatures over the raw body.
- Build: `npm run build:worker` → `dist-worker/worker.js` (or `wrangler deploy` with `wrangler.jsonc`).
- URL: https://lastword.khazna.workers.dev
- Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_SECRET_KEY`, `ADMIN_TELEGRAM_ID`, `CRYPTO_PAY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`; var `BASE_URL`.
