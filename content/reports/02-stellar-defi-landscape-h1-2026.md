---
title: "The Stellar DeFi Landscape"
slug: the-stellar-defi-landscape
author: StellarLight
excerpt: stellar defi isn't a casino — it's being built as the rails for a $2.33b tokenized-asset base. boring defi is the defi that fits a regulated-value chain, and lending is the funded whitespace under all that collateral.
category: ecosystem
tags: [defi, rwa, lending, amm, oracles, soroban, stablecoins]
featured: true
publishedAt: "2026-06-19T15:00:00.000Z"
contentType: markdown
---

everyone still asks the same question about stellar defi: where's the yield, where's the leverage, where's the farm. wrong question. the interesting thing about the stellar defi stack is what it *isn't* — and what it's quietly being built to sit underneath.

## the argument in one line

**stellar defi isn't a casino trying to grow up — it's infrastructure being built as the rails for a $2.33b tokenized-asset base, and lending is the funded whitespace sitting directly under all that collateral.** everything below is that sentence with receipts.

## the macro turned against leverage-defi — and stellar was already on the other side

the 2020-21 version of defi was a leverage machine. recursive yield, governance-token emissions, tvl that was mostly the same dollar levered five times. that model got repriced hard. what survived the last two years is the boring half of the stack: stablecoins as the actual product, tokenized treasuries and money-market funds as the actual yield, and real-world assets moving from whitepaper noun to on-chain balance.

that shift matters more for stellar than for almost any other chain, because stellar never had the casino to lose. it was a payments and issuance rail first. when the market decided that *tokenized real value* — not levered crypto-on-crypto — was the durable use case, stellar didn't have to pivot. the defi being built on it now is a consequence of that, not a rejection of it.

so "boring defi" on stellar isn't a weakness. money markets, real-yield vaults, and compliance-aware amms are precisely the defi primitives a regulated-value chain needs. the question isn't why stellar defi looks conservative. it's whether the primitives are landing where the value already is.

## the value is already here — $2.33b of it

if the thesis were wrong, the collateral wouldn't be sitting on the chain. it is.

| issuer | on-chain value | assets |
|---|---|---|
| Spiko | $1.08b | 9 |
| Franklin Templeton | $596m | 3 |
| Ondo Finance | $530m | 1 |
| Circle | $258m | 2 |
| WisdomTree | $38m | 16 |

*live: /api/rwa-tvl — $2.33b total across 86 assets*

read the names, not the numbers. spiko tokenizes eu and us treasury money-market funds. franklin templeton and wisdomtree are traditional asset managers. ondo is regulated tokenized treasuries. this is not degen liquidity — it's a $2.33b base of yield-bearing, real-world collateral, most of it concentrated in three regulated issuers. the ecosystem's own dev notes marked the $2b crossing as roughly 4x growth in twelve months; the live figure now sits at $2.33b and the weekly research corpus is already discussing higher milestones. the direction of travel is not in doubt.

that concentration is the whole point. a chain with $2.33b of tokenized treasuries needs a defi stack that can *do something* with them — lend against them, price them, swap them, wrap them into yield. that's the demand curve stellar defi is building into.

## the map: where the building actually is

the directory's type clusters show where builders and scf dollars have gone. this is the shape of the stack.

| cluster | projects | scf funded | scf $ | crowdedness |
|---|---|---|---|---|
| RWA | 53 | 20 | $1.67m | 10/10 |
| Bridge | 35 | 20 | $1.95m | 10/10 |
| DEX/AMM | 27 | 17 | $1.48m | 9/10 |
| Lending | 11 | 8 | $1.14m | 7/10 |

*live: /api/clusters?dimension=types*

three things jump out.

**rwa is the most-built lane in the whole defi map — 53 projects.** that's not a coincidence sitting next to a $2.33b tvl figure; it's the supply side responding to it. the issuance layer is crowded because the value is real.

**the dex/amm layer is mature.** 27 projects, 17 scf-funded — Soroswap (the first soroban dex and aggregator), Aquarius (aqua, the liquidity-layer amm), Phoenix, Comet (a balancer-style weighted-pool primitive). the swap and pooling primitives exist and are funded. this is the plumbing that lets tokenized assets actually move.

**lending is the tell.** 11 projects. that's the *thinnest* defi lane on the board — thinner than bridges, dexes, or rwa issuance — and yet it's carrying $1.14m of scf funding across 8 of those 11. read that ratio: a small, heavily-funded, deliberately-directed lane. Blend and Slender are the audited money-market cores; DeFindex is the yield-infrastructure layer wallets plug into; OrbitCDP does collateralized-debt positions. it's thin, it's funded, and it is sitting directly under $2.33b of collateral that currently has almost nowhere to be borrowed against.

that gap — a lot of tokenized value, very few places to lend it — is the funded whitespace. it's the sentence that explains the whole stack.

## this is not ethereum defi, and that's the design

ethereum defi composed *upward* — primitive on primitive on primitive, until the yield was mostly other people's leverage. stellar's stack is composing *downward*: toward the collateral. the ordering is inverted on purpose.

you can see it in the oracle layer, which is the part of defi nobody notices until it breaks. stellar has Reflector as the native soroban price oracle, plus DIA, Band, and Redstone live as cross-chain feeds. that's redundancy in the one place a real-yield chain cannot afford a single point of failure — because when your collateral is tokenized treasuries, a bad price feed isn't a farm getting rekt, it's mispriced real-world value. the research corpus has the receipts here: Blend weathered an attempted oracle-manipulation incident in may 2026 that was *contained*, and it's described as one of the most-audited lending protocols on soroban. Slender and Aquarius both carry published third-party audits (certora, cantina). audited cores + redundant oracles is the posture of a stack expecting to hold real money, not tourist liquidity.

that's the ethereum contrast in one line: ethereum defi optimized for composability and got fragility; stellar defi is optimizing for the collateral and paying for it in audits and oracle redundancy.

## where the ground is still moving

the honest gaps, because the thesis lives or dies on them.

**the lending-to-collateral conversion is unproven.** $2.33b of rwa and 11 lending projects is the opportunity *and* the risk. if that collateral never becomes borrowable — if tokenized treasuries just sit as static balances — then stellar has a great issuance chain and a thin defi chain, not a defi stack. this is the single number to watch: how much of the rwa base actually flows into money markets over the next year.

**native liquidity is still shallow relative to the collateral.** amm primitives exist, but deep two-sided liquidity for tokenized real-world assets isn't the same as having a dex. thin pools under thick collateral is a bridge, not a market.

**compliant defi is the unlock and it's unfinished.** lending against a regulated treasury token means the money market itself has to respect the compliance rails the asset carries. permissioned pools, identity-aware lending, kyc'd liquidity — the primitives that make "boring defi" legal at institutional scale are still early. that's the frontier the scf integration list is quietly pointing at.

## the one-paragraph version

stellar defi looks boring because it's not trying to be a casino — it's being built as the rails for a $2.33b tokenized-asset base that's already on the chain, concentrated in regulated issuers like spiko, franklin templeton, and ondo. the amm and oracle layers are mature and redundant; rwa issuance is the most-built lane on the board with 53 projects; and lending — 11 projects, 8 of them scf-funded — is the thin, deliberately-funded whitespace sitting directly under all that collateral. the stack composes downward toward real value instead of upward toward leverage. whether it wins comes down to one conversion: does the $2.33b become borrowable, or does it just sit there. that's the number the next year decides.

## how we counted

rwa tvl, issuer breakdown, and asset counts are live from /api/rwa-tvl ($2.33b, 86 assets). cluster sizes, scf-funded counts, and scf dollar totals are live from /api/clusters?dimension=types; "crowdedness" is a log-scaled 1–10 saturation score, not a raw count. named projects come from /api/projects/search. primary sources — the blend oracle-incident writeup, slender/aquarius audits, the scf defi integration list, and the ecosystem's $2b rwa snapshot — are from the stellarlight research corpus (/api/research). macro claims (the turn from leverage-defi to rwa/real-yield, the ethereum-composability contrast) are market context stated as direction-of-travel, not precise figures. every stellar-specific number is live as of the pull date.
