---
title: "SCF Funding Analysis: The Fund Is a Rudder, Not a Faucet"
slug: scf-funding-analysis-directed-capital
author: StellarLight
excerpt: "$40.7m across 400 projects isn't a grant lottery. it's directed capital allocation — closer to industrial policy than a faucet — and the anchor premium proves the fund is pricing for the hard, regulated work."
category: ecosystem
tags: scf, funding, grants, ecosystem
featured: true
publishedAt: "2026-06-28T15:00:00.000Z"
contentType: markdown
---

most crypto ecosystems buy their builders. tokens get airdropped to farmers, vcs write checks chasing the next narrative, and incentive programs pay tvl to show up and leave the moment the emissions stop. the result is predictable: a chain ends up with 800 forks of the same yield farm and no memory of why any of it was built.

stellar's community fund is a different instrument, and the data says so.

## the argument in one line

**scf is not a grant lottery — it's directed capital allocation, closer to industrial policy than a faucet.** $40.7m across 400 projects is how stellar steers builders toward its thesis and stays coherent instead of fragmenting. everything below is that sentence with receipts.

## the setup: three ways to grow a chain

there are basically three models for bootstrapping a crypto ecosystem, and they produce different kinds of chains.

the **airdrop-farmed** model rents activity. it works — the numbers go up — right up until the incentives end, and then the mercenary capital walks to the next farm. you get scale without conviction.

the **vc-led** model concentrates. capital flows to whoever raised, narratives get priced before products ship, and the ecosystem's shape is decided in term sheets rather than in the open. fast, but brittle, and it tends to select for fundraising skill over building skill.

the **foundation-directed** model is slower and smaller. a fund with a thesis decides what the ecosystem needs and pays for that. it doesn't out-degen anyone. what it buys instead is coherence — an ecosystem where the funded work points in a direction.

stellar runs the third model, and it has run it for a long time. the fund's own history traces back to the stellar build challenge in 2016, when the foundation awarded builders in four categories: anchors, applications, exchanges, and first-timers ([scf handbook, history of scf](https://stellar.gitbook.io/scf-handbook/additional-support/history-of-scf)). the categories have evolved; the instinct — fund toward a shape, not toward a leaderboard — has not.

## the proof is in the concentration

if scf were a faucet, the money would spray evenly. it doesn't. of 889 active projects, **400 are scf-funded** — 45% of the base. that alone is the tell: nearly half the active ecosystem has passed through the same directed-review pipeline. this isn't open-loop emissions; it's a filter almost everyone building here has been through.

the total distributed is **$40,736,895** at a **mean award of $101,842**. hold that mean number — it's the baseline the rest of this argument measures against.

| model | who decides | what it buys | failure mode |
|---|---|---|---|
| airdrop-farmed | the market | scale | mercenary exit |
| vc-led | term sheets | speed | brittleness |
| foundation-directed (scf) | a thesis | coherence | smaller ceiling |

the honest cost is in the last column. a directed ecosystem is a smaller ecosystem. 45% funded penetration means the fund, not organic mania, is the primary reason a large share of these projects exist — and a fund can only write so many checks. stellar has decided that a coherent ecosystem it can steer beats a bigger one it can't. that's a real tradeoff, not a free lunch.

## the anchor premium: the fund prices for hard work

here's where directed allocation stops being a slogan and shows up in the per-check math. if you break the $40.7m down by category and compute the average award, the fund is clearly not paying every project the same:

| category | scf-funded | avg award | vs mean |
|---|---|---|---|
| anchor | 5 | $214,417 | +111% |
| protocol/contract | 70 | $118,144 | +16% |
| user-facing app | 168 | $100,618 | −1% |
| infrastructure | 80 | $100,270 | −2% |
| tooling | 71 | $88,007 | −14% |
| asset | 5 | $44,160 | −57% |

anchors — the regulated fiat on/off-ramps that connect stellar to actual banking rails — clear **$214k on average, more than double the ecosystem mean**. that's the fund pricing for difficulty. an anchor isn't a weekend hack; it's licensing, compliance, banking relationships, and regulatory exposure in a specific jurisdiction. it's the hard, unglamorous, deeply moated work that a payments network lives or dies on. the fund pays up for it because it knows the casino won't.

the shape of the whole table is the thesis in miniature. the heavy averages land on anchors and protocol/contract work — the infrastructure of payments and programmable money. the light averages land on assets and tooling, which are cheaper to stand up and easier to fund thin. **user-facing apps take the largest total ($16.9m across 168 projects) but sit right at the mean per check** — breadth at the app layer, premium at the rails layer. that is exactly what you'd fund if your thesis were payments and anchors, and exactly what you would not fund if you were chasing tvl.

## what the ecosystem is actually asking for

the directedness isn't only in the checks — it's baked into the application itself. the community's own scf submission templates ask builders to defend their *ecosystem fit*: whether the work creates "composable value that other projects can build on," what the "long-term commitment to stellar (vs chain-hopping risk)" is, and how it differs from existing projects in the space ([scf build award submission template](https://github.com/lumenloop/awesome-stellar-community-fund/blob/main/docs/submission-template.md)).

read those questions as revealed strategy. a faucet doesn't ask about chain-hopping risk. a rudder does. the fund is explicitly selecting against mercenary builders and for composable, sticky infrastructure — the anti-airdrop-farm filter, written into the form.

and the direction it steers toward is the one the rest of the ecosystem is now converging on. the recurring themes from sdf leadership's recent public ama — "utility over hype," value accruing "through real usage, not speculation or token mechanics," and "years of groundwork compound" as the reason institutions like the dtcc chose stellar first ([stellar ama recap: dtcc, rwas, privacy](https://lumenloop.com/research/stellar-ama-recap-dtcc-rwas-privacy-next)) — are the same priorities the fund has been paying for all along. the capital allocation and the strategy are the same document.

## where the ground is still moving

the directed model has real gaps, and it's worth being honest about them rather than papering over them.

**the round-level view — a gap this piece flagged, now closed.** when this analysis first ran, the fund's `byRound` breakdown came back empty from our data, and we said so rather than estimate around it. that gap has since been closed (updated 2026-07-18): the index now carries per-round data for 41 rounds — $39.1m across 578 round-awards with published amounts — and the trend is worth stating plainly. the fund scaled volume, not check size. early rounds (through #20) averaged about 6 awards at a ~$75k mean; recent rounds (#30 and later) average about 20 awards at a ~$72k mean, with a mid-era dip (#21–29, ~$55k mean) before recovering. the largest round to date is #41: $2.37m across 25 awards. in other words, as the fund matured it got broader, not bigger — roughly three times the shots per round at the same disciplined check size — which fits the rudder framing: steer more builders, don't inflate the grants.

**outcomes are unmeasured.** the post-funding status of these projects — built, in progress, abandoned — is unknown across the board in our data. directed capital is only as good as its hit rate, and right now the survival curve of scf-funded work is the honest open question. a fund that steers well but funds projects that die is just a slower faucet.

**the ceiling is the tradeoff.** directed allocation buys coherence at the cost of size. the open question for the next 6–12 months is whether the model scales — whether the fund can keep its thesis-driven discipline as the addressable market grows from crypto users to the institutions now showing up, without either diluting into a faucet or bottlenecking the builders it's trying to attract.

## the one-paragraph version

most chains bought their builders and got 800 forks of a yield farm. stellar's community fund did the opposite: $40.7m across 400 projects — 45% of the active base — allocated by a thesis, not sprayed by a faucet. the anchor premium ($214k avg, more than double the $101,842 mean) is the fund pricing for the hard, regulated, deeply-moated work that payments actually require, and the application form's own ecosystem-fit questions are the anti-mercenary filter written down. the cost is a smaller ceiling; the payoff is an ecosystem that points in a direction. scf isn't a grant program. it's industrial policy for a payments network — and the next question is whether it can stay a rudder as the market it was built for finally arrives.

## how we counted

all stellar-specific figures are pulled live from stellarlight.xyz. funding totals, mean award, and the 400-project count come from `/api/analyze?dimension=funding`. the per-category funded counts, category totals, and the 889-project active base come from `/api/analyze?dimension=categories`; per-category averages are computed as category total ÷ funded count. "active projects" scope excludes inactive/other projects and differs from the full-collection count in `/api/status`. scf totals are cumulative across the fund's history, not annual. the `byRound` breakdown was empty when this piece first ran and has since been populated — the round-level figures above come from `/api/analyze?dimension=funding` as of 2026-07-18, and cover the 41 rounds with published per-round amounts (which is why their $39.1m sum sits below the cumulative headline total: some awards have no published round attribution, and one project can win multiple rounds). post-funding outcome status remains empty in our data and is flagged as a gap rather than estimated. the three-model framing and macro context (airdrop/vc/foundation growth models, the utility-over-hype turn) are market interpretation; the stellar numbers are exact.
