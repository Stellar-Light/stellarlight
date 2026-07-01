---
title: "the stellar hackathon pipeline"
slug: stellar-hackathon-pipeline-h1-2026
author: StellarLight
excerpt: "12 stellar hackathons, 2,717 registered hackers, $97k in prizes, 829 submissions. here's the top of the builder funnel — and the one number nobody's tracking yet."
category: ecosystem
tags: [hackathons, builders, dorahacks, sdf, ecosystem, funnel]
featured: true
contentType: markdown
---

# the stellar hackathon pipeline

hackathons are where builders first touch stellar. before the mainnet deploy, before the scf award, before the company — there's a weekend, a prize pool, and a submission. that's the top of the funnel.

nobody had these numbers in one place. stellarlight indexes them live off dorahacks. this is the read.

## the numbers

| metric | value |
|---|---|
| total events | **12** |
| completed | 11 |
| active right now | 1 |
| total registered hackers | **2,717** |
| total submissions | **829** |
| total prize pool | **$97,000** |
| winners placed | 57 |
| prize per registered hacker | **$35.70** |
| prize per submission | **$117** |
| submission rate (subs ÷ registrations) | 30.5% |

*(the 12-event / 2,717-hacker / $97k totals are the live figures off `/api/analyze`. everything below is per-event off `/api/hackathons`.)*

## every event on the index

| event | organizer | dates | hackers | subs | prize |
|---|---|---|---|---|---|
| Stellar Build Better Hackathon | SDF | mar 2025 | 220 | 84 | $25,000 |
| Stellar Hacks: Blend | SDF | jun–jul 2025 | 136 | 39 | $6,000 |
| Stellar Hacks: Swaps and Vaults (PaltaLabs) | SDF | jul–aug 2025 | 124 | 27 | $6,000 |
| Stellar Ideaton: Road to Meridian | Tellus Cooperative | aug 2025 | 180 | 78 | $5,000 |
| Stellar Hacks: KALE x Reflector | SDF | aug–sep 2025 | 161 | 46 | $12,000 |
| Stellar LATAM Ideathon 2 (Universitario) | Tellus Cooperative | sep–oct 2025 | 37 | 22 | $1,000 |
| Scaffold Stellar Hackathon | SDF | oct–nov 2025 | 275 | 63 | $10,000 |
| Ideatón Fin de Año (Stellar Chile) | Tellus Cooperative | dec 2025–jan 2026 | 139 | 67 | $1,000 |
| Stellar Hacks: ZK Gaming | SDF | feb 2026 | 215 | 99 | $10,000 |
| Build on Stellar Chile Ideatón | Tellus Cooperative | feb–mar 2026 | 105 | 42 | $1,000 |
| Stellar Hacks: Agents (x402/Stripe) | SDF | mar–apr 2026 | 591 | 262 | $10,000 |
| Stellar Hacks: Real-World ZK | SDF | *active, ends jul 3* | 534 | — | $10,000 |

the two organizers running everything: the **stellar development foundation** (8 events, the technical "stellar hacks" series) and **tellus cooperative** (4 events, the LATAM/spanish-language ideatons). all 12 are sourced from dorahacks.

## real winners, not vaporware

the index carries placement-ranked winners per event. a few genuine 1st-place projects:

- **Stellar Build Better Hackathon** — 1st place: **PayZoll_Stellar**, an ai-powered on-chain payroll app (better finance track). 84 submissions, $25k pool — the biggest single event on the board.
- **Stellar Hacks: Agents** — 1st place: **Cards402.com**, out of 262 submissions. this was the largest event by participation: 591 registered hackers, an x402 / stripe agentic-payments theme.
- **Stellar Hacks: KALE x Reflector** — 1st place: **xbid.ai**, top of a deep 10-winner composability bracket.

these are real placements pulled live from dorahacks, each with a `placementRank`, track, and demo/video link on the detail endpoint. if you're scouting hackathon talent, that's the raw list.

the read:

1. **participation is real and accelerating.** 2,717 registered hackers and 829 submissions across 12 events is a live builder pipeline, not a vanity count. and the trend points up: the most recent completed event (Agents, mar–apr 2026) was the single largest ever — 591 hackers, 262 submissions — roughly 3x the registrations of the flagship Build Better a year earlier. the currently-active ZK event already has 534 registered before it even closes.

2. **prize efficiency is high — stellar buys a lot of builder attention cheaply.** $97k total spread over 2,717 hackers is **$35.70 per registered hacker** and **$117 per submission**. for context, one scf award dwarfs the entire cumulative hackathon prize pool. these events are a low-cost top-of-funnel: small pools ($1k–$25k) pulling hundreds of builders each. the $25k Build Better and $12k KALE x Reflector were the richest; three $1k tellus ideatons still pulled a combined 281 hackers.

3. **conversion tracking is the next frontier — and honestly, it's not there yet.** every event exposes a post-hackathon outcomes funnel (`built` / `inProgress` / `abandoned`), and right now **it is entirely unpopulated** — every event returns zeros, i.e. "unknown" across the board. so we can tell you 829 projects were submitted; we *cannot yet* tell you how many shipped to mainnet, raised, or died in the repo. that's the single most valuable question about a hackathon and it's the exact gap stellarlight is being wired to close — by joining these winners to the projects/repos index and reading their commit + status signal. until that lands, treat every conversion percentage you hear elsewhere as a guess.

## how we counted

no black boxes. all live, all pulled today (2026-07-01):

- **headline totals** — `curl https://stellarlight.xyz/api/analyze` → `hackathons` block: `totalEvents: 12`, `byStatus: {active:1, completed:11, upcoming:0}`, `totalPrizePoolUSD: 97000`, `totalRegisteredHackers: 2717`.
- **per-event table** — `curl https://stellarlight.xyz/api/hackathons` (12 events, all `source: dorahacks`, `curated: 0`).
- **winners + submissions + outcomes** — per-event detail, e.g. `curl https://stellarlight.xyz/api/hackathons/build-on-stellar` and `.../stellar-agents-x402-stripe-mpp`. winners carry `placementRank`, `track`, and demo links; each event exposes `stats.outcomes`.

the per-event hacker and submission counts sum exactly to the analyze totals (2,717 and 829), so the aggregate reconciles.

three honest caveats:

- **the outcomes funnel is empty.** `stats.outcomes` is `{built:0, inProgress:0, abandoned:0, unknown:0}` on every event. no conversion data exists yet. we did not estimate it and neither should you.
- **the active event has no submission count yet.** Real-World ZK is still open (ends jul 3), so its 534 hackers are registrations, not finished builds — it's excluded from the 829-submission total.
- **prize pools are as-listed on dorahacks in usd.** some tellus ideatons are small ($1k) local-currency-equivalent pools; we report the usd figure the source publishes and don't adjust.
