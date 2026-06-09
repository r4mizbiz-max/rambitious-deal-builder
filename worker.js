/**
 * Rambitious — Whop checkout minter (Cloudflare Worker)
 *
 * Holds the Whop API key server-side (Worker secret) so the public generator can
 * get a checkout link for any price WITHOUT exposing the key.
 *
 * DEDUP: if a generated checkout for that exact price already exists, it REUSES it
 * instead of creating a duplicate (only looks at plans we minted — visibility:quick_link —
 * so it never touches your storefront plans).
 *
 * Env (set on deploy):
 *   secret  WHOP_API_KEY     = apik_…
 *   var     WHOP_PRODUCT_ID  = prod_…
 *
 * Call:  GET https://<worker>.workers.dev/?price=6000&label=PIF%20Bath
 * Returns: { ok:true, plan_id, link, reused:true|false }   (CORS open)
 */
const WHOP = 'https://api.whop.com/v2';

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url   = new URL(request.url);
    const price = Number(url.searchParams.get('price') || 0);
    const label = url.searchParams.get('label') || 'Rambitious deal link';
    const json  = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json', ...cors } });

    if (!price) return json({ ok: false, error: 'missing price' });
    if (!env.WHOP_API_KEY || !env.WHOP_PRODUCT_ID) return json({ ok: false, error: 'worker not configured (set WHOP_API_KEY + WHOP_PRODUCT_ID)' });

    const auth = { 'Authorization': 'Bearer ' + env.WHOP_API_KEY };

    try {
      // 1. Reuse an existing minted plan for this exact price, if one exists.
      const existing = await findPlan(auth, price);
      if (existing) return json({ ok: true, plan_id: existing.id, link: existing.link, reused: true });

      // 2. Otherwise create a fresh one.
      const res = await fetch(`${WHOP}/plans`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: env.WHOP_PRODUCT_ID,
          plan_type: 'one_time',
          release_method: 'buy_now',
          initial_price: price,
          base_currency: 'usd',
          visibility: 'quick_link',
          internal_notes: label,
        }),
      });
      const data = await res.json();
      if (data && data.id) {
        return json({ ok: true, plan_id: data.id, link: (data.direct_link || 'https://whop.com/checkout/' + data.id), reused: false });
      }
      return json({ ok: false, error: (data && data.error && data.error.message) || 'whop error' });
    } catch (e) {
      return json({ ok: false, error: String(e) });
    }
  },
};

/** Find a previously-minted one-time quick_link plan at this exact price. */
async function findPlan(auth, price) {
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${WHOP}/plans?per=50&page=${page}`, { headers: auth });
    const j = await res.json();
    const data = (j && j.data) || [];
    for (const p of data) {
      if (
        p.plan_type === 'one_time' &&
        p.visibility === 'quick_link' &&          // only reuse plans WE minted, never storefront ones
        Number(p.initial_price) === Number(price)
      ) {
        return { id: p.id, link: (p.direct_link || 'https://whop.com/checkout/' + p.id) };
      }
    }
    const totalPages = (j && j.pagination && (j.pagination.total_page || j.pagination.total_pages)) || 1;
    if (page >= totalPages || !data.length) break;
  }
  return null;
}
