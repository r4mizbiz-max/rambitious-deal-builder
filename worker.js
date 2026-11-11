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
// Whop's CURRENT API. v2 (api.whop.com/v2 and /api/v2) is refused from
// 2026-11-13. Plans are called "variants" here; ids still start with plan_.
// Verified against the live account on 2026-11-10: create with
// billing_type 'one_time' + visibility 'quick_link' returns a one-time plan
// with a purchase_url; listing needs the account id (from /accounts/me).
const WHOP = 'https://api.whop.com/api/v1';

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
      const res = await fetch(`${WHOP}/variants`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: env.WHOP_PRODUCT_ID,
          billing_type: 'one_time',
          release_method: 'buy_now',
          initial_price: price,          // dollars
          currency: 'usd',
          visibility: 'quick_link',
          unlimited_stock: true,
          internal_notes: label,
        }),
      });
      const data = await res.json();
      if (data && data.id) {
        return json({ ok: true, plan_id: data.id, link: (data.purchase_url || 'https://whop.com/checkout/' + data.id), reused: false });
      }
      return json({ ok: false, error: (data && data.error && data.error.message) || 'whop error' });
    } catch (e) {
      return json({ ok: false, error: String(e) });
    }
  },
};

/** Find a previously-minted one-time quick_link plan at this exact price. */
async function findPlan(auth, price) {
  // Listing needs the account id; the key knows its own account.
  const me = await (await fetch(`${WHOP}/accounts/me`, { headers: auth })).json();
  const account = me && me.id;
  if (!account) return null;               // can't look — just mint a new one
  let after = '';
  for (let page = 0; page < 20; page++) {
    const res = await fetch(`${WHOP}/variants?account_id=${account}&first=100${after ? '&after=' + encodeURIComponent(after) : ''}`, { headers: auth });
    const j = await res.json();
    const data = (j && j.data) || [];
    for (const p of data) {
      if (
        (p.plan_type || p.billing_type) === 'one_time' &&
        p.visibility === 'quick_link' &&          // only reuse plans WE minted, never storefront ones
        Number(p.initial_price) === Number(price)
      ) {
        return { id: p.id, link: (p.purchase_url || 'https://whop.com/checkout/' + p.id) };
      }
    }
    const info = (j && j.page_info) || {};
    if (!info.has_next_page || !info.end_cursor || !data.length) break;
    after = info.end_cursor;
  }
  return null;
}
