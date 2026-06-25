# Rambitious Agreement & Deal Builder

One screen to draft any client agreement in seconds. Pick the structure, set **every**
term, hit generate, and get a single link on your domain. The agreement page builds
**itself** from a token in the URL — contract text, the signed PDF, and the emails to
you + the signer all adapt to the deal you configured.

## What you control (in `generator.html`)
- **Agreement type** — Program (guaranteed appointments) · Pay-as-you-go · Trial · Flat/Custom
- **Ad spend funded by** — Client (min $/day) · Rambitious (we cover it) · N/A
- **Output** — Agreement **+ Payment** (Whop checkout) · **Agreement only** (no payment)
- **Flow** — Sign first (sign → pay) · Pay first (pay → sign). Locked to "sign" when agreement-only.
- **After they sign** (sign-first only) — send them to your **branded /pay page** → Whop, or **straight to the raw Whop link**.
- **Signers** — 1 or 2
- All numbers (fee, per-appointment, appointments guaranteed, min daily spend, window)
- Optional pre-fill of business + signer name
- **Customize wording** — override the title/subtitle and add any number of **custom clauses**
  (heading + body) that render in the contract, the PDF, and stay in sync with the emails.

## Flow
1. **You** open `generator.html`, configure the deal, (paste/auto-create the Whop link if it's a
   paid deal) → **Generate link**.
2. **Client** opens the link →
   - *Agreement only / sign-first* → `rambitiousmedia.com/ament?t=<token>` → reviews + signs.
   - *Pay-first* → `rambitiousmedia.com/pay?t=<token>` → pays via Whop → signs the adapted agreement.
3. On signing, a fully-executed PDF (signature, name, business, date burned in) saves to your
   Drive **and emails both you and the signer** the executed counterpart.

No new infra — same GHL page + Google Apps Script + Whop you already run.

## Files & where each one goes
| File | Where it lives | How a change goes live |
|---|---|---|
| `generator.html` | **GitHub Pages** (your internal tool, password-gated) | push to `main` → live in ~60s |
| `agreement.html` | pasted into the **GHL** custom-code page at **`/ament`** | edit here → **paste into GHL** |
| `pay.html` | pasted into the **GHL** page at **`/pay`** | edit here → **paste into GHL** |
| `apps-script.gs` | **Google Apps Script** project | paste → **Deploy → Manage deployments → Edit → New version** |
| `worker.js` | optional Cloudflare Worker (Whop auto-mint) | `wrangler deploy`; set `WORKER_URL` in `generator.html` |

> Pushing to GitHub only updates the **generator**. The signing page + emails live in GHL /
> Apps Script — they need a paste. Update GHL **before** sending any link that uses a new type.

## One-time Apps Script setup
Project Settings (gear) → **Script Properties**:
- `WHOP_API_KEY` = your `apik_…` key
- `WHOP_PRODUCT_ID` = a Whop product to attach plans to (`prod_…`)

Then re-deploy (**New version**) so the dynamic emails + `createWhopPlan` go live.

## The token (`?t=`)
base64url(JSON) of the deal spec:
`{ v:2, type, adSpend, payment, flow, payStyle, signers, upfront, perAppt, estimates, minDaily,
   days, niche, business, contact, title, subtitle, whop, custom:[{h,p}…] }`
Not sensitive — just deal terms + the public checkout link. **Legacy `pif`/`payg`/`trial` tokens
still render** (they normalize: `pif → program`, trial defaults to agency-funded spend).

## Deal variants (examples)
- **Program** — e.g. `$6,000` for `20` qualified estimates, client-funded ad spend (min `$150`/day),
  delivered within `31` days. Pro-rata refund on shortfall.
- **Pay-as-you-go** — `$X` upfront + `$Y` per showed appointment.
- **Trial** — short evaluation; agency can cover ad spend; ends in a review (terminate or continue).
- **Flat / Custom** — a simple flat-fee service agreement; lean on custom clauses for bespoke scope.
