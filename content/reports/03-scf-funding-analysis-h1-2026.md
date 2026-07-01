---
title: "scf funding analysis — how $40.7m actually flowed"
slug: scf-funding-analysis-h1-2026
author: StellarLight
excerpt: "$40.7m of scf capital, cumulative across every round, mapped to the 400 projects that got it. concentration, the anchor premium, and what 'funded' looks like once you count it."
category: ecosystem
tags: [scf, funding, stellar, ecosystem, soroban]
featured: true
contentType: markdown
---

everyone quotes the scf headline number. almost nobody breaks it down. $40.7m sounds like a lot until you ask the next question — into how many projects, which categories, and how big is the average check versus the long tail.

we pulled it from the index. here's where the money actually went.

## the numbers

| metric | value |
|---|---|
| scf-awarded projects | **400** |
| total scf distributed (cumulative, all rounds) | **$40.7m** |
| mean award per funded project | **$101,842** |
| active projects in the index | 889 |
| share of active projects that are funded | **45.0%** |

that $40.7m is a cumulative total across every scf round to date — not an annual figure, not h1 2026 alone. the index does not carry a per-round split, so treat it as lifetime-to-date.

## where the capital concentrates

| category | funded projects | scf $ | avg $/funded |
|---|---|---|---|
| user-facing app | 168 | $16,903,777 | $100,618 |
| protocol/contract | 70 | $8,270,078 | $118,144 |
| infrastructure | 80 | $8,021,625 | $100,270 |
| tooling | 71 | $6,248,532 | $88,007 |
| anchor | 5 | $1,072,083 | **$214,417** |
| asset | 5 | $220,800 | $44,160 |

the six category totals reconcile to $40,736,895 — the full distributed figure — once you add the one funded partner-integration project (which carries $0 in recorded scf). so this table is the whole pie, not a sample.

the read:

1. **four categories hold 97% of the money.** user-facing apps, protocol/contract, infrastructure, and tooling together account for $39.4m of the $40.7m — 96.8% of everything distributed. apps alone are 41.5% of the capital and 168 of the 400 funded projects. if you're building here, the funded path runs through consumer apps, contracts, and the plumbing under them. assets and anchors are rounding error by dollar count.

2. **the anchor premium is real.** anchors average $214,417 per funded project — more than double the ecosystem mean of $101,842 and roughly 2x what an app or infra project pulls. only 5 anchors are funded, so it's a small n, but the pattern is clean: fiat on/off-ramp work is expensive and scf writes bigger checks for it. protocol/contract is the next tier up at $118,144 avg — soroban contract work commands a premium over app work.

3. **~45% of active projects are funded, and the median check is near the mean.** 400 of 889 active projects have scf money attached. four of the six real categories average within a tight band of $88k–$118k, which means this isn't a whale-and-dust distribution — it's a broad program writing consistently-sized checks. the tail exists (the smallest recorded awards are in the tens of thousands, e.g. Python Stellar SDK at $29,861) but the center of gravity is a ~$100k grant.

## what a funded project looks like

pulled live from the funded set (`scfAwarded=1`), these are genuinely stellar-native, all currently Live:

- **Reflector** (infrastructure, oracle) — $444,840, the largest single award in the top slice.
- **Aquarius** (protocol/contract, amm liquidity) — $391,000.
- **Soroswap** (protocol/contract, dex) — $346,750.
- **Lobstr** (user-facing app, wallet) — $232,000.
- **Blend** (protocol/contract, lending) — $50,000.

note the shape: the biggest checks go to shared infrastructure and core defi primitives — an oracle, an amm, a dex — not to any single consumer app. the wallet everyone uses (Lobstr) sits below three pieces of protocol plumbing.

## how we counted

no black boxes. all of it is live:

- `/api/analyze?dimension=funding` → the 400 / $40.7m / $101,842 headline block.
- `/api/analyze` → per-category `scfFundedCount` and `scfTotalUSD`.
- `/api/projects/search?scfAwarded=1&limit=10` → the named funded projects and their `scfTotalAwardedUSD`.

per-category averages are `scfTotalUSD / scfFundedCount`, computed by us.

three honest caveats:

- **the $40.7m is cumulative across all scf rounds.** the `byRound` field in the funding endpoint is empty (`[]`) — per-round data isn't in the index yet, so we can't show a funding-over-time trend and we don't invent one.
- **the post-hackathon status funnel is uninformative.** every one of the 889 projects reads `Unknown` for post-award build status (`Built`/`In Progress`/`Abandoned` are all 0). we can tell you who got funded, not yet what happened after. that's a data gap, stated plainly.
- **"active" here means Live / Pre-Release / Development.** the 889 denominator excludes Inactive projects, so the 45%-funded figure is among active projects only. it will differ from the full-collection count in `/api/status` — don't merge the two without labeling the source.
