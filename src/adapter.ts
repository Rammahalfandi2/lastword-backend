// Minimal Vercel (req, res) → Fetch API adapter so the existing api/* handlers run on Cloudflare Workers.
export type Handler = (req: any, res: any) => unknown | Promise<unknown>;

export interface AdaptedResult { status: number; headers: Record<string, string>; body: string | null }

export async function buildVercelRequest(request: Request, opts: { rawBody?: boolean } = {}) {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { if (!(k in query)) query[k] = v; });

  let body: unknown = undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const text = await request.text();
    if (opts.rawBody) {
      body = text; // handler verifies a signature over the exact bytes
    } else if ((headers['content-type'] || '').includes('application/json')) {
      try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
    } else {
      body = text;
    }
  }
  return { method: request.method, url: url.pathname + url.search, headers, query, body };
}

export function createResponseCollector() {
  const state: AdaptedResult = { status: 200, headers: {}, body: null };
  let done = false;
  const res: any = {
    status(code: number) { state.status = code; return res; },
    setHeader(k: string, v: string) { state.headers[k.toLowerCase()] = String(v); return res; },
    json(obj: unknown) {
      if (!state.headers['content-type']) state.headers['content-type'] = 'application/json; charset=utf-8';
      state.body = JSON.stringify(obj); done = true; return res;
    },
    send(b: unknown) {
      if (typeof b === 'object' && b !== null) return res.json(b);
      state.body = b == null ? '' : String(b); done = true; return res;
    },
    end(b?: unknown) { if (b != null) state.body = String(b); done = true; return res; },
  };
  return { res, state, isDone: () => done };
}

export async function runHandler(handler: Handler, request: Request, opts: { rawBody?: boolean } = {}): Promise<Response> {
  const req = await buildVercelRequest(request, opts);
  const { res, state } = createResponseCollector();
  await handler(req, res);
  return new Response(state.body, { status: state.status, headers: state.headers });
}
