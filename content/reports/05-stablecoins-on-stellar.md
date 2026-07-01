---
title: "stablecoins on stellar — the issuer layer"
slug: stablecoins-on-stellar
author: StellarLight
excerpt: "23 verified stablecoins live on stellar, $746.39m in circulating value, 2.7m holders. the story isn't the total — it's who's issuing: circle, paxos, gmo trust, novatti, ondo. regulated names, real supply, tracked on-chain."
category: ecosystem
tags: [stablecoins, stellar, circle, usdc, issuers, rwa]
featured: true
contentType: markdown
---

# stablecoins on stellar — the issuer layer

stellar gets called a "payments chain." the honest version of that claim is narrower and more interesting: it's a stablecoin chain. the assets that move on it are, overwhelmingly, regulated fiat-backed tokens issued by named companies.

we track them at [stablecoin.stellarlight.xyz](https://stablecoin.stellarlight.xyz). this is the read off that data, pulled live.

## the numbers

| metric | value |
|---|---|
| stablecoins tracked | **23** |
| all verified | **23 / 23** |
| total market cap | **$746.39M** |
| total holders | **2,724,649** |
| 24h volume | **$95.35M** |
| 30d volume | **$2.86B** |
| active wallets (7d) | **953,627** |
| distinct issuing companies | **15** |
| fiat pegs represented | **12** |

every number above is from the live snapshot endpoint (`/api/snapshots/stablecoins-stats`), captured 2026-07-01.

## who issues

this is the part that matters. stellar's stablecoin layer isn't anon-issued or algorithmic — it's a roster of regulated and identifiable issuers.

| ticker | issuer | peg | market cap | holders |
|---|---|---|---|---|
| USDC | Circle | USD | $262.09M | 2,249,763 |
| USDY | Ondo Finance | USD | $465.44M | 5,266 |
| PYUSD | PayPal / Paxos | USD | $7.90M | 8,776 |
| AUDD | Novatti Group | AUD | $4.53M | 100 |
| EURC | Circle | EUR | $2.80M | 23,412 |
| EURS | Stasis | EUR | $1.06M | 142 |
| ZUSD | GMO Trust | USD | $710.13K | 1,927 |
| GYEN | GMO Trust | JPY | $675.82K | 2,184 |
| ARST | Settle Network | ARS | $243.12K | 328,059 |
| mZAR | Mesh Trade | ZAR | $307.88K | 1,271 |

(top 10 by market cap; 23 total in the full explorer.)

the read:

1. **it's a regulated-issuer story, not a defi one.** circle (USDC + EURC), paypal/paxos (PYUSD), gmo trust (ZUSD + GYEN), novatti (AUDD), stasis (EURS), ondo (USDY) — these are licensed, name-brand issuers, not pseudonymous protocols. all 23 tracked assets carry a verified issuer. if you're building a payments or treasury app on stellar, you're building on top of counterparties you can actually name and diligence.

2. **two assets are basically the whole balance sheet.** USDY (ondo, a tokenized-treasury yieldcoin) at $465.44M and USDC (circle) at $262.09M are 62.4% and 35.1% of the $746.39M total — 97.5% between them. everything else is a long tail of sub-$8M assets. the depth is real but concentrated; treat the headline market-cap figure as two big issuers plus a diverse fringe, not an evenly-spread market.

3. **the fiat coverage is genuinely global.** 12 distinct pegs across the 23 assets — USD, EUR, JPY, GBP, CHF, AUD, BRL, ARS, MXN, ZAR, PEN, NGN. that's the part payments-chain positioning actually earns. USD dominates by value (98.7% of market cap sits in USD-pegged assets), but by holder count the emerging-market coins punch above their size: ARST (argentine peso, settle network) has 328,059 holders on $243K of supply, and anclap's PEN/ARS pair carries 40k+ holders each. small balances, lots of wallets — a remittance/on-ramp footprint, not a trading one.

## why stellar keeps attracting issuers

the pattern in the data is consistent: issuers that need a cheap, fast, compliance-friendly settlement rail land here. circle has run USDC on stellar for years; paxos brought PYUSD; gmo trust issues both a dollar and a yen coin; novatti issues an aussie-dollar coin; ondo brought a tokenized-treasury product. these aren't experiments — they're production assets with real holder bases (USDC alone: 2.25M holders, ~83% of all stablecoin holders on the network).

cross-checking against the main stellarlight index (`/api/projects/search?q=stablecoin`) returns the same names as tracked projects — circle, glo dollar, brale, usdc, eurc — plus builders issuing *on* stellar like coopstable and fxdao. the issuer layer and the builder layer point at each other.

## how we counted

no black boxes. two live sources, both queried today (2026-07-01):

- **`https://stablecoin.stellarlight.xyz/api/stablecoins`** — the per-asset list (23 records: ticker, issuer, peg, market cap, holders, verified flag). the per-coin market caps sum exactly to $746.39M, matching the stats endpoint — the data is internally consistent.
- **`https://stablecoin.stellarlight.xyz/api/snapshots/stablecoins-stats`** — network aggregates (total market cap, holders, 24h/7d/30d volume, active wallets).

curl we ran:

```
curl -s "https://stablecoin.stellarlight.xyz/api/stablecoins"
curl -s "https://stablecoin.stellarlight.xyz/api/snapshots/stablecoins-stats"
curl -s "https://stellarlight.xyz/api/projects/search?q=stablecoin&limit=8"
```

three honest caveats:

1. **USDY is a yieldcoin, not a pegged stablecoin.** ondo's USDY is a tokenized short-term-treasury product that accrues yield — it's tracked in the explorer and it's the single largest asset by value ($465.44M), but it doesn't hold a hard $1 peg the way USDC or PYUSD do. if you exclude it, the "pure" fiat-pegged stablecoin market cap is ~$281M, and USDC becomes ~93% of that. we report both so you can pick the definition that fits your use case.

2. **market cap and holder counts are point-in-time snapshots** from the explorer's data pipeline, not independently re-derived from horizon at read time. they track on-chain supply and trustlines but can lag intraday moves.

3. **"holders" counts trustlines/accounts, not unique humans** — one person can hold multiple assets, and a single issuer's holder count can include dust accounts. the 2.72M network total is a sum across assets, so there's overlap; read it as scale, not a de-duplicated user count.

the full on-chain supply dashboard — every asset, historical supply curves per currency, live volumes — lives at [stablecoin.stellarlight.xyz](https://stablecoin.stellarlight.xyz).
