/**
 * Rambitious — Whop checkout minter (Cloudflare Worker)
 *
 * Holds the Whop API key server-side (as a Worker secret) so the public generator
 * can auto-create a checkout for any price WITHOUT exposing the key.
 *
 * Deploy (done by Claude once a Workers-scoped CF token exists):
 *   - secret  WHOP_API_KEY     = apik_…
 *   - var     WHOP_PRODUCT_ID  = prod_…   (a Whop product to attach plans to)
 *
 * Call:  GET https://<worker>.workers.dev/?price=6000&label=PIF%20Bath%20%246000
 * Returns: { ok:true, plan_id, link }  (CORS open, so the generator can read it)
 */
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

    try {
      const res = await fetch('https://api.whop.com/v2/plans', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.WHOP_API_KEY, 'Content-Type': 'application/json' },
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
        return json({ ok: true, plan_id: data.id, link: (data.direct_link || 'https://whop.com/checkout/' + data.id) });
      }
      return json({ ok: false, error: (data && data.error && data.error.message) || 'whop error' });
    } catch (e) {
      return json({ ok: false, error: String(e) });
    }
  },
};
