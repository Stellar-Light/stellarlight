---
title: "The Stellar Hackathon Pipeline: Cheap Top-of-Funnel, Unmeasured Conversion"
slug: stellar-hackathon-pipeline
author: StellarLight
excerpt: "12 events, 2,717 hackers, $97k in prizes recruit builders cheaply. whether they convert into funded, maintained products is the one number nobody tracks — and it's the honest test of any ecosystem."
category: ecosystem
tags: hackathons, x402, agentic-payments, scf
featured: true
publishedAt: "2026-06-26T15:00:00.000Z"
contentType: markdown
---

hackathons are the cheapest recruiting a chain can run. the hard part isn't getting people to show up — it's what happens after. stellar's pipeline is good at the first half and completely blind on the second.

## the argument in one line

**hackathons are efficient top-of-funnel; conversion is the black box, and the black box is the whole point.** everything below is a version of that sentence with receipts — and an honest admission of the number we can't yet show you.

## the setup: recruiting in a post-airdrop world

crypto spent the last cycle buying developers with token incentives. airdrop farming, points programs, mercenary tvl — the whole apparatus was built to rent attention, and it worked exactly as well as renting anything does. the moment the incentive stopped, the builder left.

the market is quietly walking away from that model. as the ecosystem repriced around real utility — stablecoins, payments, tokenized assets — the question shifted from "how do we buy activity" to "how do we recruit people who'll still be here next quarter." hackathons are the oldest answer to that question and, per-dollar, still the best one. you get a working prototype, a real name, and a self-selected signal of intent, for the price of a mid-size prize pool.

stellar's numbers show a chain leaning into exactly this. it is not trying to out-spend anyone. it is trying to convert intent.

## the proof is in the throughput

if this were vanity activity, the volume wouldn't hold up. it does.

| metric | value |
|---|---|
| total events | 12 (11 completed, 1 active) |
| total prizes | $97,000 |
| registered hackers | 2,717 |
| total submissions | 829 |
| winners named | 57 |

the striking number here is the denominator. **$97k in prizes against 2,717 hackers is roughly $36 of prize budget per builder recruited** — an order of magnitude cheaper than the fully-loaded cost of a single conference lead. and it isn't top-heavy: the largest single event, the Stellar Build Better Hackathon, put up $25,000 and drew 220 hackers with 84 submissions across three tracks. the rest of the program runs lean and frequent — a cadence of $6k–$12k events rather than one annual splash.

the frequency is the strategy. twelve events in roughly fifteen months means the top of the funnel is always open. a builder who misses ZK Gaming catches Blend; who misses Blend catches Scaffold Stellar. recruiting stops being a moment and becomes a standing offer.

## the funnel is coherent, not scattered

who runs these matters as much as how many there are. two organizers account for the entire program, and the split tells you the shape of the strategy.

| organizer | events | role |
|---|---|---|
| Stellar Development Foundation | 8 | protocol-themed technical hacks |
| Tellus Cooperative | 4 | LATAM ideathons, regional/university |

the SDF events are directed probes — KALE x Reflector, Swaps and Vaults with PaltaLabs, Blend, Scaffold Stellar, the ZK series. each one points hackers at a specific primitive the foundation wants exercised. this is the same rudder logic that runs through the rest of the ecosystem: recruiting isn't a wide net, it's a set of aimed ones. the Tellus track handles a different job entirely — top-of-funnel in latin america, ideathons and university tracks that recruit people who aren't builders yet.

that coherence is a genuine strength and also the honest limit. a directed funnel is a smaller funnel. you won't get the chaotic, thousand-submission memecoin energy of a degen chain out of a program that keeps telling you to go build a price oracle. stellar has traded breadth for aim, and on current evidence that's the right trade — but it is a trade.

## the frontier is showing up in the themes

the most useful thing about a hackathon program is that its topics leak the roadmap. stellar's recent themes are a map of where the chain thinks the next builders come from — and one theme stands out.

the Stellar Hacks: Agents event drew 591 registered hackers, the largest completed field in the dataset, built around x402 and Stripe/Tempo's MPP. that isn't a random topic. per the ecosystem's own developer notes, [x402 and MPP — the two leading agentic payment protocols — are now live on stellar mainnet](https://developers.stellar.org/meetings/2026/04/16). the pitch is specific: the internet's payment infrastructure was built for humans, and an AI agent that hits a paid API hits a wall — a form, a dashboard, an API key a human configured. x402 collapses that to one HTTP round trip: agent requests, server prices, agent authorizes a stablecoin payment, resource is delivered.

the reason this lands on stellar rather than elsewhere is unglamorous and decisive: fees. the notes put stellar settlement at "approximately 0.00001 XLM per transaction" and under five seconds, with USDC, PYUSD, and USDY as first-class native assets rather than bridged wrappers. **if your transaction fee costs more than the payment itself, micropayments do not work** — and agentic workloads are nothing but micropayments at machine frequency. the biggest hackathon field in the program clustering around this is a real signal: the agent-economy frontier isn't a keynote slide here, it's the thing new builders showed up to build.

the active event continues the pattern — Stellar Hacks: Real-World ZK, 534 hackers, pointed squarely at the privacy primitives (BN254, Poseidon) that recent protocol releases shipped. the themes are consistently one step ahead of the average builder, which is what a recruiting funnel is supposed to do.

## where the ground is still moving

here is the honest part, and it's the whole reason this report exists.

**we can count who enters. we cannot yet count who converts.** the outcome funnel — did a submission get built out, is it in progress, was it abandoned — exists in the data model but is completely unpopulated. across all 829 submissions, every bucket reads zero:

| outcome | count |
|---|---|
| built | 0 |
| in progress | 0 |
| abandoned | 0 |
| unknown | 0 |

not a single one of the 829 submissions has been classified — the funnel isn't even sorting them into "unknown," it's simply empty. this is not a trend, and we won't dress it up as one. it's a gap. the top of the funnel is instrumented; the bottom is dark.

that dark bottom is where the only question that matters lives. 2,717 hackers and 57 winners tell you the recruiting works. they tell you nothing about whether a KALE x Reflector winner shipped a maintained product, applied to SCF, or vanished the monday after. the conversion rate from "hackathon winner" to "funded, live protocol" is the single honest test of whether this program is a pipeline or a party — and it's precisely the number no one in the ecosystem tracks yet, ours included.

the pieces to close it exist. winners are named. SCF funding is recorded elsewhere in the ecosystem. repository activity — is the winning repo still getting commits six months later — is observable. joining those three is the obvious next workstream, and until it's done, any claim about hackathon ROI is faith, not measurement.

## the one-paragraph version

stellar runs a lean, aimed hackathon program: 12 events, 2,717 hackers, $97k in prizes, at roughly $36 of prize budget per builder recruited — cheap, frequent, and coherent, with the agent-payments frontier (591 hackers on x402/MPP) already showing up in the themes. that's a strong top of funnel. but not one of the 829 submissions has an outcome recorded on the built/abandoned ledger — every bucket is empty — which means the ecosystem can prove it recruits builders and cannot yet prove it keeps them. the recruiting is real. the conversion is a black box. closing that box — winners → SCF → live repos — is the work that turns a good funnel into a measurable one, and it's the honest next number to go get.

## how we counted

all stellar figures are pulled live from the stellarlight api on 2026-07-01: the `/api/analyze` hackathons block (12 events, $97k, 2,717 hackers) and per-event `/api/hackathons/{slug}` detail (hackers, submissions, winners, outcomes, organizer). the 2,717 total is the verified sum of per-event `hackersCount`; submissions (829) and winners (57) are summed the same way. the $36-per-builder figure is prizes ÷ hackers and is a recruiting-cost proxy, not a fully-loaded cost. the outcome funnel is reported as empty because it is empty in the source — every `stats.outcomes` bucket returns zero and we did not estimate a conversion rate. the x402/MPP context comes from stellar's own published developer meeting notes; those macro claims are ecosystem direction-of-travel, while every stellar count above is exact and live.
