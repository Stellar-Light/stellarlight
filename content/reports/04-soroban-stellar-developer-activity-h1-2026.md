---
title: "soroban / stellar developer activity — h1 2026"
slug: soroban-stellar-developer-activity-h1-2026
author: StellarLight
excerpt: "2,070 devs shipped 43,207 commits to stellar in the last 28 days. here's the full-time core vs the part-time long tail, and the multichain split — pulled live off the electric capital snapshot in the stellarlight index."
category: ecosystem
tags: [soroban, developers, electric-capital, developer-activity, stellar]
featured: true
contentType: markdown
---

# soroban / stellar developer activity — h1 2026

"how many people actually build on stellar?" is a question most people answer with a vibe. the electric capital numbers exist — they're just not sitting next to the rest of the ecosystem data. stellarlight snapshots them into the index so you can read dev activity next to repos, projects, and funding. this is that read.

all figures below are the electric capital snapshot as of **2026-06-21**, pulled live from `/api/leaderboard`.

## the numbers

| metric | value |
|---|---|
| active devs (28d) | **2,070** |
| commits (28d) | **43,207** |
| stellar-only devs (28d) | **1,204** |
| multichain devs (28d) | **866** |
| full-time devs | **214** |
| part-time devs | **1,606** |
| one-time devs | **250** |
| indexed & scored repos | **2,301** |

commits work out to ~20.9 per active dev over the 28-day window. the three commitment tiers (214 + 1,606 + 250) sum exactly to 2,070; so do the two chain-focus buckets (1,204 + 866). no rounding gaps.

the read:

1. **a small full-time core carries a large part-time long tail.** only 214 devs — 10.3% — are full-time. 1,606 (77.6%) are part-time and 250 (12.1%) committed once in the window. so ~9 in 10 people touching stellar code are doing it alongside something else. that's normal for an ecosystem this stage, but it means the "core" you actually depend on is small and named — the SDF-and-around cluster, plus the protocol teams — and the health signal to watch is whether part-timers convert upward, not the headline 2,070.

2. **stellar-only still outnumbers multichain, but the multichain share is big.** 1,204 devs (58.2%) build only on stellar; 866 (41.8%) also ship on other chains. a ~42% multichain share cuts both ways — it's inflow (devs bringing multichain patterns and porting apps in) and it's leakage risk (those same devs can leave as fast as they arrived). if you're building here, the multichain cohort is your most portable audience: tooling and SDKs that lower the port-in cost punch above their weight.

3. **repo count outruns dev count, which tells you the surface is wide.** 2,301 indexed-and-scored repos against 2,070 monthly-active devs means the code footprint is broader than the live builder pool — lots of SDKs, examples, and one-repo tools that don't need constant commits. the soroban core repos back this up: `stellar/rs-soroban-sdk` (190 stars), `stellar/soroban-examples` (110), and `stellar/rs-soroban-env` (80) are the highest-scored soroban results in the index — the toolchain is mature, the app layer is where the part-time churn lives.

## who's actually active

sorting the leaderboard by recent activity (`/api/leaderboard?sort=activity`) surfaces what's been committed to lately. one caveat up front: raw activity ranking pulls in cross-ecosystem repos that show up in stellar dev graphs by dependency, not by being stellar-native — **Keybase** (9,219 stars) and **Noir** (Aztec's ZK DSL, 1,361 stars) rank high on stars but aren't stellar-native projects. stellarlight scores for stellar-relevance rather than raw stars, so treat those as star-inflated noise and read past them.

curated to genuinely stellar-native, recently-active projects:

| project | category | scf | repos | last activity |
|---|---|---|---|---|
| **AXIS** | protocol/contract | yes | 7 | 2026-06-19 |
| **Nectar Network** | protocol/contract | yes | 1 | 2026-06-19 |
| **Splito** | user-facing app | yes | 3 | 2026-06-19 |
| **soropg** | tooling | yes | 1 | 2026-06-19 |
| **Microvault** | protocol/contract | yes | 1 | 2026-06-19 |
| **Trustless Work** | tooling | yes | 17 | 2026-06-18 |

AXIS is a smart-contract limit orderbook for stellar built by the StellarExpert team; Nectar Network is an automation/liquidation layer for soroban defi; soropg is a browser IDE for writing and deploying soroban contracts; Trustless Work is escrow-as-a-service on soroban with 17 repos in the index. the SDF org itself (36 repos, 6,212 stars) also shows recent activity — expected, since it's the toolchain's home.

the pattern across the native set: soroban is the common substrate. orderbooks, liquidation layers, escrow, microlending vaults (Microvault, SEP-56 tokenized vaults) — the active app layer is contract-driven, not classic-DEX-only.

## how we counted

no black boxes. every number here is live:

- **dev activity** — `curl "https://stellarlight.xyz/api/leaderboard"`, the `ecosystem` block. this is an electric capital snapshot stored in the index, stamped `asOf: 2026-06-21`. it is a **28-day** window, not a trailing-12-month or all-time figure. we did not compute these; we're surfacing electric capital's methodology.
- **repo count** — `curl "https://stellarlight.xyz/api/status"`, `repos` source: 2,301 indexed-and-scored stellar github repos, last updated 2026-06-19.
- **active projects** — `curl "https://stellarlight.xyz/api/leaderboard?sort=activity&limit=15"`, curated by hand to stellar-native entries.
- **soroban repo texture** — `curl "https://stellarlight.xyz/api/repos/search?q=soroban&limit=5"` and `q=rust`.

honest caveats:

- **the tiers are electric capital's definitions.** full-time / part-time / one-time follow EC's commit-frequency methodology (roughly: days-active-per-month thresholds). we report their buckets as-is and don't re-derive them.
- **"active" is a 28-day count.** a dev who shipped heavily in q1 and paused in june won't appear. this is a monthly pulse, not a roster of everyone who's ever built on stellar.
- **star counts are not activity.** the raw activity sort surfaces high-star cross-ecosystem repos (Keybase, Noir) that live in stellar dev graphs by dependency. we curated those out of the native table on purpose — stellarlight scores for stellar-relevance, and this is exactly the case it's built for.
- **one snapshot, no trend.** we have a single EC snapshot (`ecosystemStats` count: 1). we are **not** claiming growth or decline direction here — there's no prior snapshot to difference against. when we have two, we'll publish the delta.
