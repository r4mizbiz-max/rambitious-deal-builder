# Context — why this exists

This repo was built during a working session with Ram (Rambitious Media) on 2026-06-09.
It captures the decisions so future-you (or a new agent) has the full picture.

## The business
**Rambitious Media** — performance-based lead generation for home-service contractors
(bathroom remodel, walk-in showers, kitchen & bath, HVAC, decks, painting, cabinets, etc.).
The product is **seated in-home estimates**, not raw leads.

## The model shift (the whole reason for this)
Historically Ram **covered the ad spend** for most clients. That created the core problem:
**misaligned incentives.** When the agency funds the media, it panics if a campaign doesn't
perform on day one, and starts forcing through low-quality appointments just to justify its
own spend → the client gets junk → the client churns in ~a month.

Going forward: **the client funds the ad spend.** Not because Ram can't afford it — because
it makes the agency a true growth partner. Zero pressure to recoup its own money means it can
throw away every unqualified lead freely and optimize purely for quality. The framing to the
client: *"We don't ask you to pay for marketing. We manage your acquisition capital."*
A contractor's willingness to invest in growth is itself a qualification filter.

New positioning: premium growth partner · fewer, higher-margin clients · high-ticket niches ·
client-funded ad spend · aligned incentives.

## The offers (what this generator builds links for)
- **Pay in Full (PIF) — the flagship:** **$6,000** for **20 qualified in-home estimates**
  ($300/seat). **Client funds the ad spend** (~$100/day, minimum **$150/day**). Delivered
  within **31 days**, conditional on maintaining the minimum daily spend. No-shows don't count
  toward the 20 (credited).
- **Pay as you go (PAYG):** a setup/upfront fee + a per-showed-appointment fee. Client funds
  the ad spend. (Prices set per-deal in the generator.)

Both contracts carry the client-funded **Media Spend** clause and the no-show credit. The old
model (for reference) was $997 upfront + $175 per showed appointment, agency-funded ads.

## What this repo is
A **Deal Link Builder**. Ram picks PIF/PAYG + the prices in `generator.html`, generates a link
on his domain (`rambitiousmedia.com/agreement?t=<token>`), and the agreement page **adapts
itself** — contract text, the signed PDF, and the notification emails — from the token. See
`README.md` for the file map + flow.

## Decisions made
- **Sign-then-pay:** the client opens the link, reviews + signs the adapting agreement (PDF →
  Drive + emails both, via Ram's existing Google Apps Script), then is sent to the Whop checkout
  to pay. (Whop's post-checkout redirect can't carry the token, so signing happens first.)
- **No server-side Whop minting:** the generator is a static GitHub Page, which can't safely
  hold the Whop API key. So Ram pastes a Whop checkout link per price (the generator remembers
  the last one per deal type). Auto-minting would require a small server, which Ram declined.
- **Soft password gate:** the generator is gated by a client-side SHA-256 password check
  (deters casual visitors; not real security since the repo is public).
- **Legal text is AI-drafted** from Ram's real existing contract. He should review the new
  clauses (Media Spend, Delivery Commitment) before sending high-ticket deals.

## Related systems (same agency, built the same session)
- **Daily P&L report** (`rambitious-daily-ping`) — cloud cron posting daily revenue/spend/profit
  to Slack + Notion. Self-healing catch-up.
- **Pitch deck** (`rambitious-pitch-deck`) — the $6K / 20-estimate value-stack sales deck with
  the "why you fund the ad spend" alignment slide.
