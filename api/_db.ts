import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazily created so the module can load without env (Cloudflare Workers, tests);
// env is read at first use, not at import time.
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export const db: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const c = getClient() as any;
    const v = c[prop];
    return typeof v === 'function' ? v.bind(c) : v;
  }
});
