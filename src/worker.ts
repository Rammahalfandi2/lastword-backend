// Cloudflare Worker entry: serves the Mini App (static assets) and the existing api/* handlers.
import { runHandler, Handler } from './adapter';
import { STATIC_FILES } from './static';
import state from '../api/state';
import boards from '../api/boards';
import leaderboard from '../api/leaderboard';
import balance from '../api/balance';
import initiatePayment from '../api/initiate-payment';
import withdraw from '../api/withdraw';
import setupWebhook from '../api/setup-webhook';
import setupProfile from '../api/setup-profile';
import cryptoPayWebhook from '../api/webhook/crypto-pay';
import telegramWebhook from '../api/webhook/telegram';

export interface Env {
  ASSETS?: { fetch(req: Request): Promise<Response> };
  [key: string]: unknown;
}

const ROUTES: Record<string, { handler: Handler; rawBody?: boolean }> = {
  '/api/state': { handler: state },
  '/api/boards': { handler: boards },
  '/api/leaderboard': { handler: leaderboard },
  '/api/balance': { handler: balance },
  '/api/initiate-payment': { handler: initiatePayment },
  '/api/withdraw': { handler: withdraw },
  '/api/setup-webhook': { handler: setupWebhook },
  '/api/setup-profile': { handler: setupProfile },
  '/api/webhook/crypto-pay': { handler: cryptoPayWebhook, rawBody: true }, // HMAC over the raw bytes
  '/api/webhook/telegram': { handler: telegramWebhook },
};

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization, X-Telegram-Init-Data',
};

const STATIC_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cache-control': 'public, max-age=0, must-revalidate',
};

function syncEnv(env: Env) {
  // The handlers read process.env at call time; mirror string bindings/secrets into it.
  const p: any = (globalThis as any).process;
  if (!p) return;
  p.env = p.env || {};
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string') p.env[k] = v;
}

function withHeaders(resp: Response, extra: Record<string, string>): Response {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(extra)) r.headers.set(k, v);
  return r;
}

async function serveStatic(request: Request, env: Env, path: string): Promise<Response> {
  const file = path === '/' || path === '/app' || path === '/index.html' ? '/index.html' : path;
  if (env.ASSETS) {
    const url = new URL(request.url);
    url.pathname = file === '/index.html' ? '/' : file;
    const r = await env.ASSETS.fetch(new Request(url.toString(), request));
    if (r.status !== 404) return withHeaders(r, STATIC_HEADERS);
  }
  const f = STATIC_FILES[file];
  if (!f) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(request.method === 'HEAD' ? null : f.body, {
    status: 200,
    headers: { 'content-type': f.type, ...STATIC_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    syncEnv(env);
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    if (path.startsWith('/api/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      const route = ROUTES[path];
      if (!route) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json', ...CORS } });
      try {
        const resp = await runHandler(route.handler, request, { rawBody: route.rawBody });
        return withHeaders(resp, CORS);
      } catch (e) {
        console.error('Unhandled error on', path, e);
        return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'content-type': 'application/json', ...CORS } });
      }
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    return serveStatic(request, env, path);
  },
};
