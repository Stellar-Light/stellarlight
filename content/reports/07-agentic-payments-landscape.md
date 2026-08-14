---
title: "x402 vs MPP on Stellar: The Agentic-Payments Landscape, and When to Use Which"
slug: agentic-payments-x402-vs-mpp
author: StellarLight
excerpt: "two protocols now let machines pay over http on stellar — x402 and mpp — and the official docs present both without saying when to use which. this is that missing guide: the architectures, the trade-offs, the decision table, and the code evidence of who's actually building on each."
category: ecosystem
tags: agentic-payments, x402, mpp, soroban, ai-agents, payments
featured: false
publishedAt: "2026-08-14T22:30:00.000Z"
contentType: markdown
---

machines started paying each other over http this year, and stellar ended up with two ways to do it. both extend the same dusty corner of the web — the `402 Payment Required` status code, reserved since 1997 and unused for a quarter century — into a machine-readable payment negotiation. the official stellar docs present both protocols side by side and, as of this writing, do not say when to use which. that's the gap this entry fills.

everything here is grounded in the protocols' own documentation and in our code index (which verifies what repos actually implement, not what their readmes claim). sources and dates at the end.

## the two protocols, precisely

**x402** is the open standard that started the category — originated by the coinbase developer platform in 2025, now governed by the x402 foundation whose members include cloudflare, aws, stripe, vercel, messari, alchemy, nansen, and quicknode. the flow: a client requests a resource, the server answers `402` with payment terms, the client pays in stablecoins, the server delivers. no accounts, no api keys, no kyc. it is blockchain-agnostic — evm chains, solana, "and more" — and at the time of writing the x402 site reports roughly 75 million transactions and $24 million in volume over the trailing 30 days across its ecosystem.

**on stellar specifically**, x402 works through soroban authorization entries with **facilitator-based verification and settlement** — a facilitator service verifies the payment authorization and settles it on-chain on the server's behalf. the official adapter is `stellar/x402-stellar`.

**mpp — the machine payments protocol** — is "the http 402-based protocol for machine-to-machine payments" (the official sdk's own words), implemented on stellar via `stellar/stellar-mpp-sdk`, which plugs the `stellar` payment method into the mppx framework under the http payment authentication scheme. industry coverage attributes mpp's development to stripe and tempo with a spring-2026 stellar launch and an ietf standardization push — we have not verified those claims against a primary source, so treat them as reporting, not record. what the stellar docs do state precisely: mpp keeps the same `402` negotiation but changes the settlement architecture — **direct on-chain settlement via soroban sac token transfers, with no external facilitator**. it supports two intents:

- **charge mode** — each request settles as an individual sac transfer. two credential styles: *pull* (default — the client signs the soroban authorization entries, the server broadcasts; a sponsored path lets servers cover network fees) and *push* (the client broadcasts itself and hands the server a `signedHash` proving control of the paying account).
- **session mode** — unidirectional payment channels for high-frequency use: deposit once, then pay per-request with signed cumulative commitments entirely off-chain; the server closes the channel and settles whenever convenient.

the relationship, stated plainly: **these are not rivals so much as two settlement architectures over the same negotiation layer.** x402 brings a large cross-chain ecosystem and a facilitator model; mpp brings stellar-native direct settlement and a channel construction for volume.

## when to use which — the missing guide

| your situation | use | why |
| --- | --- | --- |
| you already sell through the x402 ecosystem (bazaar listings, evm/solana buyers) and want stellar as one more rail | **x402** | one integration, every chain the foundation ecosystem reaches; the facilitator abstracts stellar's specifics away |
| you want per-request payments with **no third party in the settlement path** | **mpp charge** | direct sac transfer from payer to you; the only trust surface is the chain itself |
| an agent will hit your api hundreds or thousands of times (inference calls, per-row data queries, streaming) | **mpp session** | one on-chain deposit, off-chain signed commitments per request, one settlement — per-payment cost approaches zero |
| your buyers are ai agents whose frameworks already speak x402 | **x402** | meet the demand where it is; the buyer-side tooling maturity is the x402 ecosystem's strongest asset today |
| you need server-sponsored fees so clients pay zero network cost | **mpp charge (pull, sponsored)** | the sponsored path is a first-class credential mode |
| you're choosing for the long term and the standards race worries you | **either, behind an abstraction** | both camps aim at becoming "the" http payment standard (x402 via its foundation; mpp via the mppx framework and a reported standards push) — genuinely undecided, and the dominant third-party pattern below already hedges it |

the honest caveats: x402's volume numbers are ecosystem-wide, not stellar-specific — stellar-lane volume is not separately published, and the machine-payments race the industry press describes (x402 on base, soroban on stellar, solana) is a race whose stellar leg is early. mpp's stellar-side adoption is measured in single-digit code-verified implementations today (see below). anyone selling you certainty here is selling narrative.

## who's actually building — code evidence, not readmes

our index scans repository source and verifies which sdk surfaces the code actually uses. as of 2026-08-14:

- **4 repos carry code-verified x402 capability**: `stellar/x402-stellar` (the official adapter), `mpprouter/rozo-mpprouter`, `rajkaria/toll`, and `dfns/dfns-solutions`.
- **3 repos carry code-verified mpp capability**: `stellar/stellar-mpp-sdk` (the official sdk), `mpprouter/rozo-mpprouter`, and `rajkaria/toll`.
- note the overlap: **rozo-mpprouter and toll implement both** — the bridging/router pattern (accept x402 demand, settle wherever) is already the empirically dominant third-party design, which supports the implement-behind-an-abstraction advice above.
- 42 repos in the index mention x402 by keyword; the gap between 42 mentions and 4 code-verified implementations is the usual ratio of narrative to shipping.

these numbers update continuously as our scanner walks the corpus — query them live: [`/api/repos/search?q=payments&capability=x402`](https://stellarlight.xyz/api/repos/search?q=payments&capability=x402) and [`capability=mpp`](https://stellarlight.xyz/api/repos/search?q=payments&capability=mpp).

## sources

- x402 protocol site (read 2026-08-14): x402.org — flow, foundation membership, 30-day ecosystem stats
- stellar developer docs, agentic payments (read 2026-08-14): developers.stellar.org/docs/build/agentic-payments — both protocols' stellar architectures, verbatim
- stellar developer docs, mpp (read 2026-08-14): developers.stellar.org/docs/build/agentic-payments/mpp — charge/session modes, credential styles
- stellar/stellar-mpp-sdk (read 2026-08-14: MPP self-description, mppx framework, charge intent) and stellar/x402-stellar repositories
- stellarlight.xyz code index (2026-08-14): capability-verified implementation counts
