---
title: "the stellar defi landscape — h1 2026"
slug: stellar-defi-landscape-h1-2026
author: StellarLight
excerpt: "the defi stack on stellar, mapped vertical by vertical — dex/amm, lending, oracles, stablecoins, rwa. where it's crowded, where it's whitespace, and where the scf money actually sits."
category: ecosystem
tags:
  - defi
  - stellar
  - soroban
  - dex
  - lending
  - oracles
  - rwa
  - stablecoins
featured: true
contentType: markdown
---

# the stellar defi landscape — h1 2026

"is there real defi on stellar?" is the wrong question. there is. the better question is *where* — which lanes are already crowded, which are still one or two teams deep, and where scf has put its money. stellarlight indexes the whole builder ecosystem, so we can answer that with numbers instead of vibes.

this is the defi read off the index.

## the stack, vertical by vertical

each row is a project *type* cluster from the index. crowdedness is a 1–10 log-scaled score (size + scf-funded + winners) — it separates a 200-project lane from a 6-project lane instead of flattening them. scf $ is cumulative scf award value across funded projects in that cluster.

| vertical | projects | crowdedness | scf-funded | scf $ (cumulative) |
|---|---|---|---|---|
| dex / amm | **27** | 9/10 | 17 | **$1.48m** |
| lending | **11** | 7/10 | 8 | **$1.14m** |
| oracles (analytics) | **29** | 9/10 | 17 | **$1.55m** |
| rwa | **53** | 10/10 | 20 | **$1.67m** |
| bridge | **35** | 10/10 | 20 | **$1.95m** |
| stablecoin (as a type) | **1** | 1/10 | 0 | **$0** |

*(oracles are indexed under the analytics/data-feed cluster; the pure "stablecoin" type cluster is nearly empty because stablecoins get typed as payments/rwa — see "how we counted.")*

for context, the two biggest clusters in the whole index are payments (**121** projects, **$6.29m** scf) and sdk (**84**, **$2.82m**). defi lives a tier below that — real, funded, but narrower than the payments core.

## the money already on-chain

defi tvl on stellar isn't a fabricated number — the rwa layer is live and large. from `/api/rwa-tvl`:

| metric | value |
|---|---|
| stellar rwa tvl | **$2.33b** |
| tokenized assets | **86** |
| top issuer (Spiko) | **$1.08b** |
| Franklin Templeton | **$596.0m** |
| Ondo Finance | **$529.7m** |

that $2.33b is tokenized real-world assets (treasuries, money-market funds, usdc/eurc), not soroban-native amm/lending tvl. it's the deepest pool of value on the network by far — and it's the collateral the rest of the defi stack is being built to plug into.

the read:

1. **rwa is the crowded lane, and it's not close.** 53 projects, a 10/10 crowdedness score, $1.67m in scf, and $2.33b of actual tokenized value sitting on-chain. Spiko alone is $1.08b across 9 assets; Franklin Templeton and Ondo add another ~$1.1b. if you're building here you're not early — you're competing with tradfi issuers who've already shipped. the whitespace in rwa is the *middleware*: the amm, lending, and yield rails that let that $2.33b actually move.

2. **lending is the thinnest funded lane — that's the whitespace.** just 11 projects, 7/10 crowdedness, but 8 of them are scf-funded for $1.14m. that's the highest funded-density of any defi vertical (73% of the cluster took scf money) against the fewest competitors. Blend leads (the reference money-market), with Slender, OrbitCDP (cdp), YieldBack.Cash and Lumen Later (bnpl) filling adjacent niches. narrow field, money available, clear demand from the rwa collateral above it. if you want a funded lane that isn't already 50 teams deep, this is it.

3. **dex and oracles are settled, not open.** dex/amm (27 projects, 9/10) has clear leaders — Soroswap, Aquarius (AQUA), Phoenix, StellarBroker — and oracles (29, 9/10) is effectively decided by Reflector, with DIA, Band, and Redstone as cross-chain entrants. these are infrastructure lanes where a newcomer competes against incumbents with liquidity and integrations, not empty space. perps is the exception inside the "settled" tier: only 6 projects (Noether, Zenex, Turbolong, Stellars Finance) — genuinely thin, but leverage on a low-fee chain is a hard, unproven bet, which is why it's stayed small.

## how we counted

no black boxes. everything here is a live endpoint you can hit yourself:

- **clusters:** `curl "https://stellarlight.xyz/api/clusters?dimension=types"` — size, crowdedness (1–10 log-scaled), scfFundedCount, scfTotalUSD, and sample projects per type. this is the backbone table.
- **named projects per vertical:** `curl "https://stellarlight.xyz/api/projects/search?q=amm"` (and `q=lending`, `q=oracle`, `q=perps`, `q=dex`, `q=stablecoin`) — the real, named projects cited above.
- **tvl:** `curl "https://stellarlight.xyz/api/rwa-tvl"` — total $2.33b, 86 assets, top issuers.

three honest caveats:

- **scf $ is cumulative, not annual.** the $ figures are total historical scf award value across funded projects in a cluster, not h1-2026 flow. treat them as "how much scf has ever backed this lane," not a run-rate.
- **the "stablecoin" type cluster reads as empty (1 project, $0) — that's a typing artifact, not reality.** stablecoins are alive and well on stellar: `q=stablecoin` returns Circle (usdc/eurc), Glo Dollar, Brale, and CoopStable. they just get typed as payments or rwa in the cluster taxonomy, so the standalone "stablecoin" type looks bare. don't read it as "no stablecoins" — read it as "stablecoins are classified elsewhere."
- **tvl is rwa tvl, not native-defi tvl.** the $2.33b is tokenized real-world assets. soroban-native amm/lending tvl (the number defillama would show for the dex/lending protocols themselves) is a separate figure, and our per-protocol tvl coverage is still being expanded — so we're not quoting a native-defi tvl total we can't yet stand behind.
