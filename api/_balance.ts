// Race-safe balance changes using optimistic concurrency (compare-and-swap).
// A plain read → upsert loses updates when two webhooks touch the same user at once.
import { db } from './_db';

const MAX_RETRIES = 6;

/**
 * Atomically add (or subtract) amounts to a user's balance.
 * Returns false if the result would go negative or the update kept conflicting.
 */
export async function adjustBalance(tgId: string, deltaUsdtCents: number, deltaStars: number): Promise<boolean> {
  if (!Number.isInteger(deltaUsdtCents) || !Number.isInteger(deltaStars)) {
    throw new Error('Balance deltas must be integers');
  }
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data: row, error } = await db
      .from('balances')
      .select('tg_id, balance_usdt_cents, balance_stars')
      .eq('tg_id', tgId)
      .maybeSingle();
    if (error) throw error;

    if (!row) {
      if (deltaUsdtCents < 0 || deltaStars < 0) return false;
      const { error: insErr } = await db.from('balances').insert({
        tg_id: tgId,
        balance_usdt_cents: deltaUsdtCents,
        balance_stars: deltaStars,
        updated_at: new Date().toISOString()
      });
      if (!insErr) return true;
      continue; // someone inserted concurrently → retry as update
    }

    const curUsdt = row.balance_usdt_cents || 0;
    const curStars = row.balance_stars || 0;
    const newUsdt = curUsdt + deltaUsdtCents;
    const newStars = curStars + deltaStars;
    if (newUsdt < 0 || newStars < 0) return false;

    let q = db
      .from('balances')
      .update({ balance_usdt_cents: newUsdt, balance_stars: newStars, updated_at: new Date().toISOString() })
      .eq('tg_id', tgId);
    q = row.balance_usdt_cents === null ? q.is('balance_usdt_cents', null) : q.eq('balance_usdt_cents', row.balance_usdt_cents);
    q = row.balance_stars === null ? q.is('balance_stars', null) : q.eq('balance_stars', row.balance_stars);
    const { data: updated, error: updErr } = await q.select('tg_id');
    if (updErr) throw updErr;
    if (updated && updated.length > 0) return true;
    // Row changed between read and write → retry.
  }
  console.error('adjustBalance: too many conflicts for', tgId);
  return false;
}
