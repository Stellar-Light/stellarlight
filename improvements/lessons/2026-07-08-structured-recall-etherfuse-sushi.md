# 2026-07-08 — Structured truth must drive INCLUSION, not just ranking

**Classes:** 6 (structured truth not driving inclusion), 5 (literal matching), 14 (multi-product single-identity)

## What happened

raven#8 / sls-018: "Mexico on-ramp fiat MXN peso deposit anchor" returned 12 ramps and omitted Etherfuse — the one project whose curated `coverage` literally said `countries: [Mexico], currencies: [USD, MXN]`. Tyler: "I've noticed a lot of these kinds of misses. Sushiswap was another one." Verified: Sushi (types `[DEX]`, desc "AMM-based token swaps… liquidity provision") missed "DEX AMM swap liquidity pool" by ONE prose word ("pool") under strict-AND.

## Root cause

The search haystack was `name + shortDescription + category` — prose only. The structured fields we'd built *specifically for corridor queries* (coverage, types, supportedNetworks) affected display and ranking but never **whether a record was retrieved at all**. Inclusion was pure prose-token-count, so:
- a multi-product company whose prose describes product A was unfindable for product B (Etherfuse), and
- a category-true record died on one missing literal word (Sushi).

## The fix (mechanized)

- `src/lib/project-search-match.ts` (extracted + unit-tested): structured fields fold into the haystack AND the DB candidate query; a record that IS the queried type, or whose coverage serves a queried corridor, is **admitted a match-tier looser** than prose alone; a corridor hit under ramp intent bypasses tiers entirely. Precision-gated so topic queries don't over-recall.
- Data half: additive `TYPES_ADD` (Etherfuse `[RWA, Anchor]`), both products named in the description, partner `rampTypes` via `RAMP_ENRICH` (proprietary-API ramps that stellar.toml can never reveal), report-only dual-identity sweep in every curate run.
- **Known-item recall answer key** in the daily self-audit: natural query → entity that MUST appear. Recall holes are invisible to precision evals — they never show up as a wrong answer, only as a missing one — so they must be asserted directly. Every future miss becomes a permanent entry.

## The transferable rule

If a curated field exists because users ask that question, retrieval must READ that field — otherwise the curation is decorative. And test recall with an answer key; precision metrics cannot see what's absent.
