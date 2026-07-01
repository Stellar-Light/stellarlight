---
title: "the state of stellar — h1 2026: the boring chain won"
slug: state-of-stellar-h1-2026
author: StellarLight
excerpt: "for years stellar was the chain nobody talked about — no casino, no memecoins, just payments. then crypto grew up. stablecoins became the killer app, tradfi started tokenizing treasuries, and regulators picked winners. stellar was already built for all of it. here's the state of the ecosystem that turn created."
category: ecosystem
tags: ecosystem-map, rwa, stablecoins, soroban, scf, stellar, thesis
featured: true
contentType: markdown
---

# the state of stellar — h1 2026: the boring chain won

for most of the last cycle, stellar was the chain you skipped in the ecosystem tour. no leverage farms, no memecoin factory, no 4-digit apy. it moved dollars across borders and issued assets, and in a market that paid for narrative volatility, "it works and it's cheap" was not a narrative. it was a shrug.

that market is gone. the thing crypto spent 2024 and 2025 rediscovering — that the durable use cases are stablecoins, payments, and tokenized real-world assets, not the casino — is the exact thing stellar was built for in 2014. the rest of the industry spent a cycle building its way toward stellar's design. this report is a map of the ecosystem that turn produced: what's here, who's funding it, who's shipping, and where the ground is still moving.

we index the whole builder base — 889 active projects, 2,301 repos, every scf award — so this isn't a vibes post. but it isn't a scoreboard either. the numbers are here to support an argument.

## the argument in one line

**stablecoins and rwa are no longer a stellar side-quest; they are the main quest, and soroban arrived just in time to make them programmable.**

everything below is a version of that sentence with receipts.

## 1. the setup: crypto turned toward what stellar already was

three things happened to the market between 2024 and now, and all three point the same direction:

- **stablecoins became the product, not the plumbing.** stablecoin settlement volume overtook the card networks in aggregate terms and regulators stopped treating them as a threat and started writing rules for them. a stablecoin bill in the us and mica in europe did something crypto had never had: they told institutions *which* digital dollars were safe to touch. that turned stablecoins from a crypto-native tool into a tradfi distribution problem — and distribution is stellar's home turf.
- **rwa stopped being a whitepaper word.** tokenized treasuries went from a pitch deck to billions of dollars of live, yield-bearing, on-chain product issued by names like franklin templeton and ondo. tokenization is the tradfi-meets-crypto bridge, and it runs on the same requirements stellar optimized for a decade ago: cheap issuance, built-in compliance controls, and a network of regulated on/off-ramps.
- **the casino cooled and utility got repriced.** as the speculative premium bled out of "number go up" chains, the market started paying attention to chains that move real value for real users. stellar's boring became a feature.

stellar didn't pivot into this moment. the moment pivoted into stellar. the interesting question isn't whether the thesis is right — the on-chain data says it is — it's whether the ecosystem is actually *built* to capture it. that's what the rest of this maps.

## 2. the proof is in the issuers

if the thesis were wrong, the money wouldn't be here. it is.

**tokenized real-world assets on stellar: $2.33b, across 86 assets.** that is not defi-native tvl juiced by token incentives — it is treasuries and money-market funds tokenized by institutions:

| issuer | on-chain value |
|---|---|
| Spiko | $1.08b |
| Franklin Templeton | $596m |
| Ondo Finance | $530m |

three names, ~$2.2b of the total, and none of them is a crypto startup chasing a grant. these are regulated asset managers choosing stellar as settlement rails for real financial products. when a franklin templeton money-market fund lives on your chain, you are no longer a "crypto ecosystem" — you are financial infrastructure.

the stablecoin layer tells the same story from the other side. **23 verified stablecoins, ~$746m circulating, ~2.7m holders** — and again the interesting part isn't the total, it's the roster: circle (usdc/eurc), paxos, gmo trust, novatti, brale. regulated issuers, not anon mints. these are the digital dollars the new rules bless, and they chose to be here.

and the signal that this is only starting: the ecosystem's own conversation has moved to institutions. the most-cited recent ecosystem discussions in our research corpus aren't about apy — they're about **dtcc, rwas, and compliant privacy**. when the depository trust & clearing corporation — the plumbing under the entire us securities market — shows up in your ecosystem's ama, the addressable market stopped being "crypto users."

## 3. soroban is what makes it programmable

here's the part that would have killed this thesis two years ago: a payments rail that can't run logic can move a tokenized treasury, but it can't build a *market* around it. you need contracts — lending against the collateral, amms to price it, oracles to value it, compliance hooks to gate it.

that layer now exists. soroban, stellar's rust-based smart-contract runtime, matured from "testnet curiosity" to an audited, upgraded, production surface — the protocol has shipped upgradeable-contract standards, token-interface extensions, and multiple third-party security audits (veridise and others on soroban core). the index counts **130 protocol/contract projects** carrying **$8.3m** in scf funding — the highest average grant of any large category ($118k), which is what you'd expect when a chain is paying to stand up its programmable layer from scratch.

and a defi stack is visibly forming on top of it:

- **lending** is the tell. only 11 projects, but 8 are scf-funded — the highest funded-density of any vertical. blend leads as the reference money-market. a thin, funded lane sitting directly under $2.33b of rwa collateral is not a coincidence; it's the ecosystem building the rails to make that collateral productive.
- **dex/amm** (soroswap, aquarius, phoenix) and **oracles** (reflector, effectively the default) are already settled — infrastructure lanes with clear incumbents rather than open fields.

the strategic read: stellar is no longer a payments rail *or* a smart-contract chain. it's becoming programmable settlement for regulated value — and that's a category with very few real competitors.

## 4. the builder base is coherent, not random

889 active projects. 2,070 developers shipping 43,207 commits in the last 28 days. $40.7m of scf capital across 400 funded projects. those are healthy numbers, but the number that matters is the *shape*: **45% of active projects have taken scf funding.**

that's unusual, and it's the ecosystem's quiet advantage. most chains grow by throwing open the doors and hoping a casino emerges. stellar grows through a directed capital allocator — the community fund — that steers builders toward the thesis: payments, anchors, rwa infra, tooling. it's why the project mix is coherent (350 apps, 195 infra, 161 tooling, 130 protocol) instead of 800 forks of the same yield farm. the funding isn't just fuel; it's a rudder.

the flip side, honestly: a directed ecosystem is a smaller ecosystem. stellar isn't going to out-degen solana or out-tvl the ethereum l2s, and it shouldn't try. its bet is that the regulated, real-value slice of crypto is the slice that lasts — and that it owns that slice.

## 5. where the ground is still moving

a state-of report that only lists strengths is marketing. here's what's genuinely unresolved, and where 2026 gets decided:

- **privacy is the next unlock, and it's a compliance story, not a mixer story.** institutions can't settle real assets on a fully transparent ledger — you can't show a competitor your entire book. the ecosystem is actively working confidential-token and compliant-privacy-pool designs (the research corpus has live threads on both). this is the feature that turns "tradfi is experimenting on stellar" into "tradfi settles on stellar." watch it.
- **native defi tvl is still thin relative to the rwa base.** there's $2.33b of tokenized assets and a comparatively small pool of soroban-native amm/lending liquidity to work it. that gap *is* the opportunity — but until it closes, the "programmable" half of programmable-settlement is more promise than proof.
- **the agent economy is arriving on payments rails, and stellar is early.** the convergence of ai agents and money — machines that pay each other for services — needs exactly what stellar offers: cheap, fast, final settlement with stable value. the ecosystem's recent hackathons already feature agentic-payment builds (x402-style flows), and it's the frontier most aligned with where both crypto and ai are heading.
- **the conversion question is still unanswered.** we can see 2,717 hackathon participants enter the funnel; we can't yet see how many become funded, maintained products. wiring that built → shipped → abandoned pipeline is our next data workstream, because "how much of this actually survives" is the honest test of any ecosystem.

## the one-paragraph version

stellar spent a decade being early to a thesis the market didn't want yet: that crypto's durable value is moving regulated dollars and real assets, cheaply, with compliance built in. the market finally arrived — $2.33b of tokenized treasuries, regulated stablecoin issuers, and a maturing soroban contract layer are the proof — and the builder base is coherent because scf steers it toward that thesis. the open questions (native liquidity depth, privacy for institutions, agentic payments, real conversion) are exactly the questions of a chain that's winning its category and now has to grow it. boring won. the work now is making boring big.

## how we counted

no black boxes. the ecosystem figures are live and queryable: project + funding rollups at `stellarlight.xyz/api/analyze`, source freshness at `/api/status`, rwa tvl at `/api/rwa-tvl`, and the primary-source research corpus (seps, audits, sdf + ecosystem writing) at `/api/research`. two caveats we hold to: "active projects" (889) means live / pre-release / development and differs from the full indexed collection (918); and the $40.7m scf figure is cumulative across all historical rounds, not a single quarter. the macro claims about stablecoin and rwa adoption are the broader market context the on-chain stellar data sits inside — the stellar-specific numbers are all ours, measured live.

---

*report #1 in the stellarlight ecosystem series. the follow-ups go one level deeper on each layer — the rwa + stablecoin issuer stack, the soroban defi build-out, and where scf capital is actually steering the next wave of builders.*
