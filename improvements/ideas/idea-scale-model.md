# Idea: quality-as-product (the "Scale model") — design brief

**Status: step 1 SHIPPED 2026-07-21 (#646), pending review.** `/quality` (hidden: noindex, unlinked, off-sitemap) renders committed artifacts only via `src/lib/quality-artifacts.ts`; `DATA_SLA.md` + `docs/interlock-spec.md` live. Deliverable 2 tooling (per-consumer report generator + monthly workflow) followed same-day. Graduation gate unchanged: boxy review → flip-on (nav link + drop noindex + sitemap). Original framing (2026-07-10, "plan around it, don't pivot") below, kept for context.

## The thesis

Scale AI's core insight wasn't labeling — it was **selling measured quality**: every deliverable shipped with the eval that proved it. Our engine system already produces those measurements weekly (recall floors, data-truth cross-checks against SCF/DeepWiki, demand-side OK rate on real consumer queries, corpus health, dupe/staleness sweeps). Today they land in a tracker issue only we read. The breakthrough version: **the measurements are the product.** Nobody else in the Stellar ecosystem can say "here is the eval proving our data is right, re-run weekly, red when it regresses" — that's the moat, and it compounds with every engine improvement.

## The three deliverables

1. **`/quality` public scoreboard** — a page rendering the latest engine artifacts: Engine A recall per bucket vs floor, Engine D OK-rate on real demand, SCF cross-check (0 overstated / 0 understated), golden eval pass rate, corpus S5-S8, dupes=0, north-star audit ok-rate trend (59% → 69% → …). Every number links to the reproducible run that produced it. Rule: **no hand-set numbers** — the page reads committed artifacts (improvements/*.json + the weekly evidence artifact), so it can never drift from the truth the engines measured.
2. **Monthly per-consumer quality report** — generated from Engine D's api-usage log per consumer (Raven first): what you asked, what we served, what missed, what we fixed, what changed for your queries this month. The Scale-style "here's the eval on YOUR workload."
3. **`DATA_SLA.md`** — the standing promises with their guards: recall floors per bucket (Engine A red-line), freshness ceilings per source (S7), data-truth guarantees (SCF cross-check red on any divergence), honesty contract (no fabricated relevance; EMPTY-DISHONEST is a red class). Each promise names the workflow that enforces it.

## Graduation path

Ship `/quality` reading real artifacts (flag off) → boxy review → flip on + link from nav/README → first monthly Raven report → DATA_SLA.md referenced from the OpenAPI description. Adoption signal that it "won": Tyler/Raven cites or links the scoreboard.

## Why this could be the breakthrough (honest version)

It converts work we already do into a differentiated public asset at near-zero marginal cost, and it aligns exactly with the north-star (be Raven's trusted data layer — trust is the product). It is NOT a breakthrough by itself: it needs the engines to keep being right (a public scoreboard showing red is only a win if we fix reds fast), and its ceiling is the ecosystem's size. It makes us the obvious default; it doesn't create demand that isn't there.

## Verdict addendum (2026-07-12, post sls-020..051 week): still the right frame — with one upgrade

The week stress-tested the premise, and the answer is **yes, keep the Scale frame — but the product is stronger than the original brief claimed.**

What the week proved:
- **The mechanics work at incident scale.** 51 externally-filed findings + 74 systemically-corrupted records were closed in days *because* the Scale-style machinery existed (ground-truth cross-checks, dry-run curation, per-item verification, evidence artifacts). Quality-as-process survived contact with a hostile week.
- **The differentiator is BILATERAL, which Scale's vendor model doesn't have.** Scale sells one-directional quality (vendor asserts, customer trusts the SLA). Ours is co-verified: the #1 consumer's CI lints our contract (his live-contract lint gate), consumes our machine-routing metadata as a ranking input (`x-routing` = his "lever 7", absorbed within a day of shipping), files signed findings into a public ledger, and re-baselines on every changelog handshake. Nobody can fake that — the consumer's own commit log is the testimonial.

The upgrade to the productization: keep the trio (`/quality` scoreboard, per-consumer monthly report, `DATA_SLA.md`) and add a **fourth artifact — the interlock spec itself**: a short doc standardizing `x-routing`, the changelog re-baseline handshake, the intake-ledger convention, and per-ship eval expectations. That's the piece other data providers could adopt (and the piece Tyler's intake.json says lumenloop lacks) — it converts "our quality process" into "a protocol we authored," which is the actual network-effect play. Positioning shift: not "Scale for Stellar data" but **"the verified-data protocol between agent data layers — reference implementation."**
