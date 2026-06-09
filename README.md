# Rambitious Deal Link Builder

One-click deal links. You pick **Pay-in-Full** or **Pay-as-you-go** + the prices, hit
generate, and get a single link on your domain. It mints the Whop checkout and the
agreement page **adapts itself** (contract text, PDF, and emails) from a token in the URL.

## Flow
1. **You** open `generator.html`, choose PIF/PAYG, set the price(s), click **Mint via Whop**
   (creates the checkout) → **Generate client link**.
2. **Client** opens `rambitiousmedia.com/agreement?t=<token>` → the agreement renders the
   matching deal → they enter name + business + signature → a PDF (with their signature,
   name, business, date burned in) saves to your Drive + emails both of you.
3. After signing they're sent to the **Whop checkout** to pay.

No new infra — same GHL page + Google Apps Script + Whop you already run.

## Files
| File | Where it goes |
|---|---|
| `agreement.html` | Paste into the GHL custom-code page at **`/agreement`** (replaces the current one). Token-driven; legacy niche flow still works if no token. |
| `generator.html` | Your internal tool. Live on GitHub Pages (bookmark it) or just open the file. |
| `apps-script.gs` | Paste into your Apps Script project → **Deploy → Manage deployments → Edit → New version**. |

## One-time setup (Apps Script)
In the Apps Script project: **Project Settings (gear) → Script Properties**, add:
- `WHOP_API_KEY` = your `apik_…` key
- `WHOP_PRODUCT_ID` = a Whop product to attach plans to (e.g. create one called
  "Rambitious Onboarding" in Whop, or reuse an existing `prod_…`)

Then re-deploy (**New version**) so the new `doGet`/`createWhopPlan` + dynamic emails go live.

## The token
`?t=` is base64url(JSON) of:
`{type:'pif'|'payg', upfront, perAppt, estimates, niche, minDaily, days, whop}`.
Not sensitive (it's just deal terms + the public checkout link) — no secret needed.

## Deal variants
- **PIF** — e.g. `$6,000` for `20` qualified estimates, client-funded ad spend (min `$150`/day),
  delivered within `31` days. No per-appointment fee.
- **PAYG** — `$X` upfront + `$Y` per showed appointment, client-funded ad spend.

Both contracts include the client-funded **Media Spend** clause and the no-show credit.
