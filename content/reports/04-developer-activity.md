---
title: "who is actually building on stellar"
slug: who-is-actually-building-on-stellar-h1-2026
author: StellarLight
excerpt: "developers are the leading indicator. a chain with a real full-time core and heavy multichain inflow isn't being visited — it's being staffed. here's what 2,070 devs and 43,207 commits actually say about stellar."
category: ecosystem
tags: [developers, soroban, rust, ecosystem, electric-capital, multichain]
featured: true
contentType: markdown
---

# who is actually building on stellar

price tells you what the market feels this quarter. developers tell you what it will be able to do in two years. of every signal a chain emits, the developer base is the slowest to fake and the hardest to buy — you can rent liquidity for a weekend, but you cannot rent 214 people who show up every day to write rust.

## the argument in one line

**a chain's developer base has a signature: the ratio of a full-time core to part-time and multichain inflow tells you whether it's being staffed or just visited. stellar's signature — a small hard core, a large working middle, and heavy multichain crossover — is the profile of a chain that serious builders are migrating into, not touring.** everything below is that sentence with receipts.

## 1. the setup: where developers go when the casino cools

the last cycle trained an entire generation of builders on incentives. mercenary tvl, points farms, chains that paid you to deploy. when the market turned — toward stablecoins, tokenized real-world assets, and actual payment volume instead of leverage — a lot of that developer attention had nothing real to attach to and evaporated.

what's left over is more interesting than what left. the direction of travel across crypto right now is away from speculation-native building and toward infrastructure that has to work: rails that move money, contracts that hold collateral, tooling that other builders depend on. that kind of work selects for a different developer — someone who wants a mature language, a stable runtime, and users on the other end. rust and soroban are a magnet for exactly that person.

so the question "who is building on stellar" is really a proxy for a bigger one: as the industry repriced utility over noise, did the people who build the boring, durable things show up here?

## 2. the shape of the base

here is the ecosystem developer snapshot, as of 2026-06-21 (electric capital methodology, surfaced live through our leaderboard):

| metric | value |
|---|---|
| active devs (28d) | 2,070 |
| commits (28d) | 43,207 |
| full-time devs | 214 |
| part-time devs | 1,606 |
| one-time devs | 250 |

the headline number — 2,070 — is not the interesting part. the *distribution* is. read it as three bands. the 214 full-time devs (10% of the base) are the core: people for whom stellar is the job, not a side quest. the 1,606 part-time devs (78%) are the working middle — contributing steadily without being all-in. and the 250 one-time devs (12%) are the thin tourist layer: showed up once, may not return.

that shape matters. a chain that is *only* full-time core is small and closed. a chain that is *mostly* one-time devs is a hype magnet with no retention — a lot of drive-by commits, no one staying. stellar's curve is the healthy middle case: a real core to anchor the standards, a large part-time body doing the actual volume, and a tourist layer small enough (12%) that the base isn't inflated by people who'll never come back. 43,207 commits across 2,070 devs is roughly 21 commits per developer in a month — that's a working population, not a landing page.

## 3. the multichain read is the real tell

split the same base another way — by whether these developers work only on stellar or also ship on other chains:

| cohort | devs | share |
|---|---|---|
| stellar-only | 1,204 | 58% |
| multichain | 866 | 42% |

42% of active stellar developers also build elsewhere. the lazy reading is that this is disloyalty. the correct reading is the opposite: **multichain inflow is how patterns migrate.** a developer who ships on an evm chain and then writes a soroban contract carries their mental models with them — lending primitives, oracle patterns, keeper architectures, account-abstraction habits. every multichain dev is a channel through which the rest of crypto's engineering knowledge flows *into* stellar.

a chain with 0% multichain devs is isolated — its builders only know its own idioms. a chain that is *all* multichain has no committed core. stellar sitting at 58/42 is the migration signature: a majority that has chosen stellar as home, plus a large minority actively importing what works from everywhere else. when the industry's center of gravity shifts toward stablecoins and rwa — things stellar was built for — those are the developers who notice the fit and route work here.

## 4. what they're actually building (curated, native)

aggregate counts can hide a hollow core, so look at *what* the active-by-commits projects actually are. filtered to stellar-native work — dropping star-inflated non-native entries like Keybase (a messaging app with incidental XLM support) and Noir (an Aztec zk-language used *by* soroban devs, not a stellar project) — the top of the activity leaderboard reads like an infrastructure roster:

| project | category | scf |
|---|---|---|
| AXIS (on-chain orderbook, StellarExpert team) | protocol/contract | yes |
| Nectar Network (liquidation/automation layer) | protocol/contract | yes |
| Pipeline (commodity trade finance) | protocol/contract | no |
| Drips (infra, 19 repos) | infrastructure | no |
| Trustless Work (escrow tooling, 17 repos) | tooling | yes |
| Stellar Development Foundation (36 repos) | infrastructure | no |

notice what dominates: protocol/contract and tooling and infrastructure. an orderbook. a liquidation keeper network. a trade-finance rail targeting the multi-trillion-dollar financing gap banks abandoned. this is not a memecoin bench. these are the load-bearing pieces you build *before* the flashy apps — the sign of a base staffing a platform, not decorating one. and the sdks tell the same story: the JavaScript, Java, iOS, PHP, KMP, and .NET stellar SDKs all sit high on the activity list, because a language-diverse SDK surface is what you invest in when you expect developers from *other* stacks to arrive.

## 5. why rust and soroban pull this crowd

the developer profile above isn't an accident of marketing — it's a consequence of the toolchain. the research corpus makes the on-ramp concrete: the canonical [Write, Test, and Deploy a Rust Smart Contract](https://developers.stellar.org/docs/build/smart-contracts/getting-started/hello-world) guide, the [smart-contracts overview and Rust SDK FAQ](https://developers.stellar.org/docs/build/smart-contracts/overview), and lower-level primitives like [installing Wasm bytecode from within a contract](https://developers.stellar.org/docs/build/guides/transactions/upload-wasm-bytecode) and [deploying a Stellar Asset Contract programmatically](https://developers.stellar.org/docs/build/guides/tokens/deploying-a-sac).

read those together and the audience becomes obvious. this is documentation written for infrastructure engineers — people who deploy contracts *from* contracts, who care about bytecode and wasm and deterministic asset issuance. rust is the language systems programmers already trust; soroban gives them a runtime with real fee metering and a contract model that doesn't fight them. the [frontend guide for stellar dapps](https://developers.stellar.org) in the corpus rounds it out — the same seriousness applied to the app layer. this is the toolchain that converts a curious multichain dev into a committed one: familiar language, mature docs, primitives that assume you know what you're doing.

## 6. where the picture is still incomplete

honesty about the gaps, because the numbers don't answer everything.

**the base is broad but the core is thin.** 214 full-time devs is a real anchor, but it's small in absolute terms. a chain's most durable work — protocol standards, security-critical infrastructure — leans on that core, and 214 is a number that can't afford much attrition. the health of the base over the next year is really the health of that top band.

**part-time is a strength and a fragility at once.** 78% part-time is the working middle that makes the ecosystem move, but part-time attention is also the first thing a competing incentive can pull away. the retention question — does the part-time body convert *upward* into core, or churn *out* into the tourist layer — is the one metric that decides whether 2,070 is a floor or a peak.

**multichain inflow is a bet, not a guarantee.** 42% crossover is only an asset if those developers *stay long enough* to import their patterns. inflow that doesn't convert is just traffic. the conversion of multichain visitors into committed builders is the single number most worth watching, and it's the one a snapshot can't show.

the next 6-12 months get decided in those three conversions — part-time into core, tourist into part-time, multichain into committed. the toolchain is built for it. whether the incentive environment holds the attention long enough is the open question.

## the one-paragraph version

a developer base is a fingerprint, and stellar's reads clearly: 214 full-time devs anchoring a 1,606-strong part-time middle, a thin 12% tourist layer, and 866 multichain builders importing the rest of crypto's engineering knowledge — 43,207 commits from 2,070 people in a month. the top of the activity board is orderbooks, liquidation networks, trade-finance rails, and a language-diverse SDK surface — infrastructure, not decoration. that is the signature of a chain being staffed as the casino cools and rust matures, not one being toured. the work now is turning the visitors into residents.

## how we counted

developer figures (active devs, full/part/one-time split, stellar-only vs multichain, commits) are the electric capital snapshot as of 2026-06-21, surfaced live through the stellarlight leaderboard ecosystem block. the repo total (2,301 indexed-and-scored stellar repos) and project count (918) are from the live status endpoint. the activity leaderboard is sorted by recent commit activity; we curated it to stellar-native projects, explicitly excluding star-inflated non-native entries (Keybase, Noir) that rank on generic github popularity rather than stellar work. percentages are ours, computed from the raw counts. macro claims about the industry's turn toward utility are market context — directional, not precise. the stellar numbers are exact and live.
