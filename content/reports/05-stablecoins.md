---
title: "stablecoins on stellar — the issuer layer"
slug: stablecoins-on-stellar-the-issuer-layer
author: StellarLight
excerpt: "~$746m and ~2.7m holders is a fine number. the story is who issues it — circle, paxos, gmo trust, novatti, ondo, brale. in the digital-dollar distribution race, compliance-native rails win institutional issuance, and stellar's issuer roster is the moat."
category: ecosystem
tags: [stablecoins, usdc, circle, anchors, rwa, compliance, payments]
featured: true
contentType: markdown
---

# stablecoins on stellar — the issuer layer

most stablecoin coverage counts supply. it looks at a chain, adds up the circulating dollars, ranks it, moves on. by that scoreboard stellar is a mid-table chain — real money, not the most money. that scoreboard misses the actual asset.

## the argument in one line

**the moat isn't the amount of stablecoin on stellar. it's who is allowed to issue it.** ~$746m across 23 stablecoins is fine. the thing worth paying attention to is that ~99.7% of it comes from regulated issuers — circle, paxos, gmo trust, novatti, ondo, brale — not anon mints. in a digital-dollar distribution race that is turning into a compliance race, that roster is the defensible thing. everything below is that sentence with receipts.

## 1. the setup: stablecoins became the product, and issuance became regulated

the broad direction of the last two years is not subtle. stablecoins stopped being crypto plumbing and became the point — the part of this industry with product-market fit, real volume, and, increasingly, real rules. the regulatory turn in the u.s. and europe pushed the question from "can you mint a dollar" to "are you *allowed* to, and who's holding the reserves." that reframes the competition. it's no longer chains fighting over raw throughput or the cheapest fee. it's chains fighting to be the rail a regulated issuer is comfortable putting a licensed dollar on.

this is the fork in the digital-dollar race. one path — the tron path — optimizes for sheer remittance volume and settles enormous flow with a comparatively thin issuer story. another path optimizes for programmability and general-purpose defi. stellar is running a third: be the rail that regulated issuers *choose*, and make compliance a native property instead of a bolt-on. that's a smaller pond today. it's the pond the institutions are wading into.

## 2. the proof is in the roster, not the supply

here's the live issuer layer.

| issuer | coin(s) | company type | circulating |
|---|---|---|---|
| Circle | USDC, EURC | regulated (US) | $264.9M |
| Ondo Finance | USDY | tokenized treasuries (US) | $465.4M |
| PayPal / Paxos | PYUSD | regulated trust (US) | $7.9M |
| Novatti | AUDD | licensed (AU) | $4.5M |
| GMO Trust | ZUSD, GYEN | NY trust charter | $1.4M |
| Stasis | EURS | regulated (EU) | $1.1M |
| Mesh Trade | mZAR | licensed (ZA) | $0.31M |
| Brale | SBC, MXNe | US issuance platform | $0.02M |
| Anclap, MyKobo, Settle, VNX, FxDAO, Glo, LINK.IO | regional/€/local | mixed | remainder |

23 stablecoins, 15 distinct issuer companies, every one of them tagged verified in our index. run the concentration and the thesis falls out: **~99.7% of circulating value sits with regulated or licensed issuers.** circle alone (USDC + EURC) is ~35.5%. this isn't a chain where a pseudonymous team spun up a dollar over a weekend. it's a chain where the dollars have a company, a domain, and in most cases a charter behind them.

that's the moat restated as data. supply can migrate. an issuer relationship — the legal work, the reserve attestations, the decision by a licensed entity to make *this* chain a home for a licensed asset — does not migrate on a whim. paxos putting PYUSD here, gmo trust bringing its ny-chartered ZUSD and GYEN, novatti issuing a licensed australian dollar — each is a bet that took months of diligence. the roster is sticky in a way a supply number never is.

## 3. why regulated issuers pick a compliance-native rail

the reason this roster clusters on stellar and not somewhere else is architectural. stellar shipped compliance primitives as protocol, not product. the ecosystem's own standards — the SEPs — encode it: [SEP-0003](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0003.md) is a compliance protocol; [SEP-0008](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0008.md)-style regulated-asset controls let an issuer gate who can hold and move a token; asset authorization flags are a native ledger feature, not a smart-contract afterthought. an issuer that must know its holders doesn't have to trust a bespoke contract to enforce it. the rail enforces it.

that's the quiet reason a licensed issuer chooses stellar over a general-purpose chain. on a general-purpose chain, compliance is something you build and audit and hope holds. here it's a property of the asset. when you're a regulated entity, "the ledger enforces the rule" is worth more than any throughput number.

## 4. the distribution layer: anchors are the second half of the moat

issuance without distribution is a stranded asset. stellar's answer is the anchor network — its term for the [on/off-ramps that connect the ledger to banks and fintechs](https://developers.stellar.org/docs/build/apps/example-application-tutorial/anchor-integration). our directory lists a deep bench of them: moneygram, bitso, yellow card, fonbnk, anclap, coins.ph, tucambio, cash abroad. these are the last mile — the thing that turns an on-chain dollar into cash in a hand in lagos, buenos aires, or manila.

anchors run on the same standards backbone: [SEP-0024](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md) for hosted deposit/withdrawal, [SEP-0038](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0038.md) for cross-asset quotes, the anchor platform to run it all. so the moat has two walls: regulated issuers minting at the top, a standardized licensed-anchor network distributing at the bottom. moneygram's stellar ramps are the cleanest expression of it — a fifty-year money-transfer network using the chain as settlement, cash-in one country, USDC out another. that's the digital-dollar distribution race made concrete, and stellar is running it through licensed rails at both ends.

## 5. the connectivity turn: USDC stopped being an island

for years the knock on stellar-issued USDC was that it was walled — native, but hard to move off. that wall came down. per the ecosystem research corpus, [circle's CCTP went live on stellar](https://lumenloop.com/research/stellar-now-native-gateway-usdc) in may 2026, wiring native USDC into a ~23-chain burn-and-mint corridor with no wrapping and no custodial bridge. exchanges followed the same quarter — kraken and bitso both added stellar USDC rails.

read that against the roster and the strategic picture sharpens. stellar's edge was never being the biggest USDC pool; it was being the *compliant* USDC pool. CCTP removes the one real cost of that position — liquidity isolation — without diluting it. an institution can now issue and settle on a compliance-native rail *and* move value to any major chain on demand. you keep the moat and lose the island. that's the combination the issuer roster was waiting for.

## 6. where the ground is still moving

be honest about the gaps.

**it's concentrated.** ondo's USDY (~$465m) and circle (~$265m) are the vast majority of the ~$746m. strip the yield-bearing RWA token and the pure stablecoin snapshot is closer to ~$281m. a moat resting mostly on two names is a strong moat and a narrow one. the health of this layer over the next year is whether the *middle* of the roster — the gmo trusts, novattis, brales — grows into real supply, or stays as logos.

**holders are lopsided.** ~2.7m total holders, but USDC is ~2.25m of them. the long tail of regional coins (ARST, PEN, ARS via anclap and settle) shows tens of thousands of real users each — genuine local-currency demand — but the retail base is still overwhelmingly one asset.

**issuance-to-usage is the unanswered question.** a licensed dollar sitting in a wallet is a milestone, not a business. the reported ~$2.3b in monthly stablecoin settlement from the SDF's institutional report (per the research corpus, not our live index) is the number that would prove the roster is *working* and not just *present*. we count who issues and how much circulates cleanly. we don't yet have first-party velocity telemetry — and that's the metric that decides whether the moat is load-bearing.

## where the next 6–12 months get decided

three things. first, does the middle of the roster grow — do the testing-stage regulated names (the corpus notes a top-five u.s. bank publicly testing custom stablecoin issuance here) convert to live supply? each conversion compounds the moat. second, does CCTP connectivity turn stellar-issued dollars into cross-chain settlement volume, or just optionality? third — the honest one — does anyone publish issuance-to-velocity data that turns "regulated issuers chose stellar" into "regulated dollars *move* on stellar." the first is a roster. the second is a rail.

## the one-paragraph version

the scoreboard says stellar is a mid-size stablecoin chain: ~$746m, 23 coins, ~2.7m holders. the roster says something the scoreboard can't — ~99.7% of that value is issued by regulated or licensed companies, circle to paxos to gmo trust to novatti to ondo to brale, on a rail where compliance is a protocol feature and a licensed anchor network handles the last mile. supply is rentable. an issuer relationship is not. in a digital-dollar race that has quietly become a compliance race, the moat isn't how many dollars are on stellar. it's who's allowed to make them.

## how we counted

stablecoin supply, holder, and issuer figures are live from stellarlight's stablecoin index (23 coins, pulled 2026-07-01). "circulating" totals include ondo's USDY, a yield-bearing tokenized-treasury asset; the ~$281m figure is the pure-stablecoin snapshot that excludes it, and we flag both. the ~99.7% regulated share is computed over that live roster by issuer company. the $2.3b monthly-settlement and RWA figures come from ecosystem research (SDF institutional report, via our research corpus) and are attributed as such, not measured by us. macro claims — the stablecoin regulatory turn, the tron/solana/stellar distribution split — are direction-of-travel market context, deliberately kept soft. every stellar-specific number is live and exact.
