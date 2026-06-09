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
| `generator.html` | **Live as a GitHub Page** (password-gated). Bookmark it. Pure client-side — no server, no keys. |
| `agreement.html` | Paste into the GHL custom-code page at **`/agreement`** (replaces the current one). Token-driven; legacy niche flow still works if no token. Uses your **existing** Apps Script for the Drive-save + emails — nothing new to set up. |
| `apps-script.gs` | **Optional.** Your existing deployed script already saves the PDF + emails. This version just makes those notification emails show the new PIF/PAYG pricing instead of the old $997 text. Paste + redeploy (New version) only if you care about that. |

## Setup — that's it
1. Paste `agreement.html` into the GHL `/agreement` page.
2. Open the generator GitHub Page (password gated), pick a deal, set the price, paste a Whop
   checkout link for that price, hit **Generate**.

No Apps Script changes required. (A static page can't safely auto-mint Whop checkouts — that
would need a server — so you paste the Whop link; the generator remembers it per deal type.)

## Password gate
The generator is gated by a client-side SHA-256 check. It deters casual visitors but is **not**
real security (the repo is public). Don't put anything truly sensitive in this repo.

## The token
`?t=` is base64url(JSON) of:
`{type:'pif'|'payg', upfront, perAppt, estimates, niche, minDaily, days, whop}`.
Not sensitive (it's just deal terms + the public checkout link) — no secret needed.

## Deal variants
- **PIF** — e.g. `$6,000` for `20` qualified estimates, client-funded ad spend (min `$150`/day),
  delivered within `31` days. No per-appointment fee.
- **PAYG** — `$X` upfront + `$Y` per showed appointment, client-funded ad spend.

Both contracts include the client-funded **Media Spend** clause and the no-show credit.
