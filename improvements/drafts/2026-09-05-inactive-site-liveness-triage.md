# Inactive rows whose only basis is `site-liveness` — evidence triage

**Observed 2026-09-05.** Every URL below was fetched during this pass; every
status/basis was read from the live API. Nothing here changes data.

## The class

`statusBasis: "site-liveness"` records **that a page answered**. It is evidence
*for* liveness. A row that says `status: "Inactive"` on that basis is asserting
a death from a fact that points the other way — the basis contradicts the
verdict it is cited for. Every row in this class is therefore mis-based by
construction, independent of whether the project is actually alive.

### The rules this triage runs under

1. A project's death comes from a **human-verified list only** — never bulk-marked.
2. A duplicate is hidden with **`status=Draft`** (reversible), never deleted.
3. **A live-200 page cannot stand as "observed dead."**
4. **Could-not-check** (timeout, 403, DNS failure) is never "not there."

## What the cohort actually is

The brief described 101 Inactive rows with 21 on `site-liveness`. Re-pulled today
against the authoritative collection (`/api/projects?where[status][equals]=Inactive`,
which unlike `/api/projects/search` does **not** drop lineage shadows):

| | count |
|---|---|
| Inactive rows total | **117** |
| ├─ `human-verified` | 75 |
| ├─ **`site-liveness`** | **31** |
| ├─ `product-integration` | 5 |
| ├─ `null` | 5 |
| └─ `source-inherited` | 1 |

The 31 is the real cohort — 11 more than the brief's 21. The gap is a **measurement
artefact, not a data change**: `/api/projects/search` excludes rows with
`canonicalSlug` set in browse mode (`where.canonicalSlug = { equals: null }`,
search/route.ts:1056), so a served-row pull cannot see lineage shadows — and 30 of
these 31 *are* lineage shadows. The same pull today returns 75 Inactive and exactly
**one** `site-liveness` row (`orbitcdp`).

**The brief's premise that `stellarexpert` and `balanced` "are now Draft" is wrong.**
Both are still `status: "Inactive"` with `canonicalSlug` set and a 2026-07-10 merge
note. They were lineage-linked, not Draft-hidden. Read back:
`/api/projects?where[slug][equals]=stellarexpert`.

### The shape of it

30 of 31 carry a `canonicalSlug` pointing at another row — they are already-merged
lineage shadows. **28 of 30 share the exact same domain apex as their keeper**
(the other two differ only by subdomain: `bim.finance` vs `exchange.bim.finance`,
`demo.stellarpassport.xyz` vs `stellarpassport.xyz`). **29 of 30 keepers are `Live`**
(the exception is `orbit-finance`, whose keeper `orbitcdp` is itself Inactive).

So the same URL was liveness-checked twice and produced `Live` on one row and
`Inactive` on its twin. That is not a judgement about any company — it is
"Inactive" used as a park-the-duplicate marker before `Draft` existed, exactly as
suspected. **No row in this cohort carries death evidence. Zero receipts were found.**

The remaining hide is therefore not cosmetic: these rows are still published, and
`/api/projects/resolve` serves their status to callers. Right now
`?q=alfred-pay` answers **"Alfred Pay — Inactive"**, sourced to `https://alfredpay.io/`,
a page that returns 200 with a live product. Draft removes that false claim.

## Evidence table

`same apex?` = shadow website and keeper website share a domain apex.
Every `serves today` cell is a fetch performed in this pass.

| slug | name | website | near-duplicate of | same apex? | serves today (fetched) | dated signal of death / of life | recommended action |
|---|---|---|---|---|---|---|---|
| aha-labs | Aha Labs | https://theaha.co/ | `the-aha-company` (Live) | yes | 200, 134KB → https://www.theaha.co/ — "The Aha Company" | none of death; keeper Live on `repo-activity` | hide-as-duplicate → `the-aha-company` |
| alfred-pay | Alfred Pay | https://alfredpay.io/ | `alfred` (Live) | yes | 200, 65KB — "alfred \| Stablecoin Payment Infrastructure for Latin America" | none of death; keeper `alfred` is **Live on this same URL** | hide-as-duplicate → `alfred` |
| baf-nework | BAF Network | https://blockchainacceleration.org/ | `baf` (Live) | yes | 200, 32KB → https://www.blockchainacceleration.org/ — "Home" | none of death; slug is a typo ("nework") of the keeper | hide-as-duplicate → `baf` |
| balanced | Balanced | https://balanced.network/ | `balanced-network` (Live) | yes | 200, 18KB — "Cross-chain DeFi that's actually usable \| Balanced" | none of death; row's own note says "Duplicate record … Merged 2026-07-10" | hide-as-duplicate → `balanced-network` |
| band-protocol | Band Protocol | https://bandprotocol.com/ | `band` (Live) | yes | 200, 187KB → https://www.bandprotocol.com/ — "Band \| The Unified Data Layer for AI and Web3" | none of death; keeper Live on `onchain-activity` | hide-as-duplicate → `band` |
| bim | BIM | https://bim.finance/ | `bim-exchange` (Live) | subdomain | 200, 50KB — "BIM Finance" | none of death; shadow = marketing apex, keeper = `exchange.bim.finance` app | hide-as-duplicate → `bim-exchange` |
| blockeden | BlockEden | https://blockeden.xyz/ | `blockedenxyz` (Live) | yes | 200, 58KB — "BlockEden.xyz \| Web3 Infrastructure & Crypto Payments for Merchants" | none of death | hide-as-duplicate → `blockedenxyz` |
| blox-global | Blox Global | https://blox.global/ | `blox` (Live) | yes | 200, 102KB → https://blox.global/en — "Blox — The Financial Operating System for Digital Assets" | none of death | hide-as-duplicate → `blox` |
| cashabroad | CashAbroad | https://cashabroad.one/ | `cash-abroad` (Live) | yes | 200, 2.7KB → https://www.cashabroad.one/ — Vite SPA shell, "CashAbroad", live LinkedIn Insight tag | none of death; thin body is an SPA shell, not a parked page | hide-as-duplicate → `cash-abroad` |
| coca-wallet | COCA Wallet | https://coca.xyz/ | `coca` (Live) | yes | 200, 200KB+ → https://www.coca.xyz/ (title JS-rendered) | none of death | hide-as-duplicate → `coca` |
| coinsph | Coins.ph | https://coins.ph/ | `coins-ph` (Live) | yes | 200, 819KB → https://www.coins.ph/en-ph — "Coins.ph \| The All-in-One E-Wallet & Crypto Super App for Filipinos" | none of death | hide-as-duplicate → `coins-ph` |
| diameter | Diameter | https://diameterpay.com/ | `diameter-pay` (Live) | yes | 200, 85KB — "Diameter Pay – Global Payments for Banks and FIs" | none of death | hide-as-duplicate → `diameter-pay` |
| digibank-sdp | Digibank \| SDP | https://digibankar.com/ | `digibank` (Live) | yes | 200, 113KB — "دجي بناكر (البنك الرقمي) - خدمات مالية للجميع" | none of death; SDP row is a submission-title variant | hide-as-duplicate → `digibank` |
| elroy-app | Elroy App | https://elroy.app/ | `elroy` (Live) | yes | 200, 200KB → https://www.elroy.app/ — **"Elroy App Update \| Service Retired \| BOSS Money"**; body: "Elroy Has Joined the BOSS Family … Thank you to everyone who supported Elroy along the way." | **product retired** (undated on-page) | hide-as-duplicate → `elroy` — **and see keeper review** |
| expand | Expand | https://expand.network/ | `expand-network` (Live) | yes | 200, 112KB → https://www.expand.network/ — "expand.network by Blockdaemon – A Unified DeFi API" | none of death; acquired/rebranded under Blockdaemon, still shipping | hide-as-duplicate → `expand-network` |
| gateway | Gateway | https://gateway.fm/ | `gatewayfm` (Live) | yes | 200, 129KB — "Institutional infrastructure orchestration" | none of death; keeper Live on `human-verified` | hide-as-duplicate → `gatewayfm` |
| honeycoin | Honeycoin | https://honeycoin.app/ | `honey-coin` (Live) | yes | 200, 144KB — "HoneyCoin for Businesses \| Global Payments & Treasury" | none of death | hide-as-duplicate → `honey-coin` |
| huma-finance | Huma Finance | https://huma.finance/ | `huma` (Live) | yes | 200, 200KB+ — "Real Yield from Real Payment Flows · Huma Finance" | none of death | hide-as-duplicate → `huma` |
| liqvid | Liqvid | https://liqvid.xyz/ | `liqvidxyz` (Live) | yes | 200, 200KB+ — "Liqvid" | none of death | hide-as-duplicate → `liqvidxyz` |
| mica-rent | Mica Rent | https://mica.rent/ | `mica` (Live) | yes | 200, 2.5KB — SPA shell, "Mica Rent", `og:url` = https://catatumbo.mica.rent/, desc "Sigamos simplificando rentar" | none of death; thin body is an SPA shell | hide-as-duplicate → `mica` |
| orbit-finance | Orbit Finance | https://orbitcdp.finance/ | `orbitcdp` (**Inactive**) | yes | 200, 37KB — "Orbit CDP — Collateralized Debt Protocol on Stellar" | see the `orbitcdp` row | hide-as-duplicate → `orbitcdp` |
| **orbitcdp** | OrbitCDP | https://orbitcdp.finance/ | **not a shadow** (keeper, `canonicalSlug: null`) | n/a | 200, 37KB — full product page, "Live on Stellar", "Launch App" → https://mainnet.blend.capital/dashboard/?poolId=CAE7QVOMBLZ53CDRGK3UNRRHG5EZ5NQA7HHTFASEMYBWHG6MDFZTYHXC | **LIFE:** pool contract XLM + oUSD balances updated **2026-08-23** (`api.stellar.expert/explorer/public/contract/CAE7QVOM…/value`); oUSD supply 189,999, 71 trustlines (32 funded), 2,528 payments, 26,580 trades. **PIVOT (not death):** `orbit-contracts` last push 2026-01-23, `orbit-ui-updated` 2026-03-15, while the same org ships `zenex-sdk-js` 2026-08-26 / `relayer-plugin-zenex` 2026-08-27; X handle is now "Zenith Protocols \| Zenex". **No public shutdown announcement found.** | **reopen-as-Live** |
| passport | Stellar Passport | https://demo.stellarpassport.xyz/ | `stellar-passport` (Live) | subdomain | 200, 14KB — "Stellar Passport — Explore the Stellar Ecosystem (Beta · Testnet)" | none of death | **no action — operator-vetoed cluster (SDF-verified row)** |
| reclaim-protocol | Reclaim Protocol | https://reclaimprotocol.org/ | `reclaim` (Live) | yes | 200, 74KB → https://www.reclaimprotocol.org/ — "Global Verification from $0.10 at Scale \| Reclaim Protocol" | none of death; keeper Live on `repo-activity` | hide-as-duplicate → `reclaim` |
| ripe-money | Ripe Money | https://ripe.money/ | `ripe` (Live) | yes | 200, 146KB → https://www.ripe.money/ — "Ripe" | none of death | hide-as-duplicate → `ripe` |
| sorobanhub | SorobanHub | https://sorobanhub.com/ | `soroban-hub` (Live) | yes | 200, 10KB — "Home \| SorobanHub", docs site with product copy | none of death; keeper Live on `repo-activity` (Creit-Tech) | hide-as-duplicate → `soroban-hub` |
| sorobanpulse | SorobanPulse | https://sorobanpulse.app/ | `soroban-pulse` (Live) | yes | 200 but **114 bytes**: `window.onload → /lander`, which is a **GoDaddy parked-domain lander** (`window._trfd.push({ap:"parking"})`, `img1.wsimg.com/parking-lander`) | **domain parked** — product gone | hide-as-duplicate → `soroban-pulse` — **and see keeper review** |
| stellarexpert | StellarExpert | https://stellar.expert/ | `stellar-expert` (Live) | yes | 200, 3.2KB — "StellarExpert \| Stellar XLM block explorer and analytics platform" (JS SPA shell, not parked) | none of death; row's own note says "Duplicate record … Merged 2026-07-10" | hide-as-duplicate → `stellar-expert` |
| trace-finance | Trace Finance | https://tracefinance.com/ | `trace` (Live) | yes | 200, 32KB → https://www.tracefinance.com/ — "Trace — Payments & stablecoin infrastructure for Brazil and LatAm" | none of death | hide-as-duplicate → `trace` |
| volta | Volta | https://voltacircuit.com/ | `volta-circuit` (Live) | yes | 200, 40KB — "Home - Volta Circuit" | none of death | hide-as-duplicate → `volta-circuit` |
| zkliquid | ZKLiquid | https://liquids.fi/ | `liquidsfi` (Live) | yes | 200 → https://www.liquids.fi/ — "Omni Liquidity & Inter-Chain Messaging Protocol" (495-byte SPA shell) | none of death; shadow's own description records the ZKLiquid→LiquidsFi rebrand | hide-as-duplicate → `liquidsfi` |

> Four sites returned HTTP 308 to a `www.` host on the first pass (`coinsph`,
> `expand`, `trace-finance`, `zkliquid`); all four were re-fetched following
> redirects and returned 200 with product content. **No row ended as
> could-not-check.**

## Two keepers that are wrong in the other direction

Not part of the Inactive cohort — found because this pass fetched the shadow's
URL, which is also the keeper's URL. Both are `Live` on `site-liveness`, and in
both cases site-liveness read a 200 off a page that announces the product is gone.
This is the same defect as the cohort, mirrored: **a 200 is not a product.**

| slug | current | what the URL actually serves | suggested |
|---|---|---|---|
| `elroy` | Live / `site-liveness` / asOf 2026-08-27 | https://www.elroy.app/ — "Service Retired": *"Elroy Has Joined the BOSS Family"* | route to the human-verified list; Inactive **with this receipt** |
| `soroban-pulse` | Live / `site-liveness` / asOf 2026-08-27 | https://sorobanpulse.app/ — 114 bytes → GoDaddy parked-domain lander | route to the human-verified list; Inactive **with this receipt** |

Neither is proposed as an automated write: rule 1 says a death is human-verified only.
This is the evidence packet for that verdict, not the verdict.

## Confirmed against the dedup detector's FUZZY list

`gh run view 33945510647 --log` (dedup, 2026-09-05 04:48) printed
`FUZZY (review only, NOT proposed for action): 75`. **This table confirms 12 of
them as real, already-merged duplicates:**

Alfred ~ Alfred Pay · Band ~ Band Protocol · BlockEden ~ BlockEden.xyz ·
Blox ~ Blox Global · Coca ~ COCA Wallet · Diameter ~ Diameter Pay ·
Digibank ~ Digibank | SDP · Elroy ~ Elroy App · Expand ~ Expand Network ·
Gateway ~ Gateway.fm · Huma ~ Huma Finance · Liqvid ~ Liqvid.xyz

Only the first 40 fuzzy lines are printed (`fuzzy.slice(0, 40)`,
detect-duplicate-projects.ts:205) and the log ends at "Merkl ~ Meru" with
"…and 35 more", so pairs alphabetically after that — which would include
Mica/Ripe/Trace/Volta/SorobanHub/SorobanPulse/Reclaim/StellarExpert — **could not
be verified against the detector output** even though this table confirms those
merges independently.

**The fuzzy lane is mostly stale noise.** The fuzzy pass is a pure prefix /
one-edit comparison over `names` and does **not** filter rows that already carry
a `canonicalSlug`. Every one of the 12 above was merged on 2026-07-10; the
detector has re-printed them at every run since, and at a 40-line print cap that
noise can push a genuinely new pair off the end of the list unseen.

## Not verified

- **No writes, no dry-run of any mutation.** Nothing was executed against production.
- The `elroy.app` retirement page carries **no date**; "when" is unestablished.
- `orbitcdp`: `app.orbitcdp.finance` returned **code 000** (no response). Per rule 4
  that is **could-not-check**, and it is *not* used as evidence — the reopen rests on
  the 2026-08-23 on-chain balance updates and the 200 marketing site.
- `orbitcdp`'s `lifecycle.note` asserts *"Shut down in 2026 — team pivoted to Zenex"*.
  The pivot half is corroborated (zenex-* repos, renamed X handle); the **shutdown
  half is unsourced and contradicted by on-chain activity**. It needs an owner
  correction either way.
- The two keeper-review rows are **evidence packets, not verdicts** — a human signs
  a death, never this pass.
- Whether `stellar-passport`'s veto still stands was not re-litigated.

## Machine section

```json
{
  "generatedAt": "2026-09-05",
  "cohort": "projects.status=Inactive AND statusBasis=site-liveness",
  "cohortSize": 31,
  "note": "hide[] = set status=Draft (reversible) on slug; keeper is the canonicalSlug already recorded on the row. noAction[] and keeperReview[] are extra keys outside the four requested arrays: noAction must not be acted on, keeperReview concerns Live rows outside this cohort.",
  "hide": [
    {"slug": "aha-labs", "keeper": "the-aha-company", "why": "same apex theaha.co; keeper Live; canonicalSlug already set"},
    {"slug": "alfred-pay", "keeper": "alfred", "why": "same apex alfredpay.io; keeper Live on the same URL (200)"},
    {"slug": "baf-nework", "keeper": "baf", "why": "typo slug; same apex blockchainacceleration.org; keeper Live"},
    {"slug": "balanced", "keeper": "balanced-network", "why": "same apex balanced.network; row's own note records the 2026-07-10 merge"},
    {"slug": "band-protocol", "keeper": "band", "why": "same apex bandprotocol.com; keeper Live on onchain-activity"},
    {"slug": "bim", "keeper": "bim-exchange", "why": "same apex bim.finance (keeper on exchange. subdomain); keeper Live"},
    {"slug": "blockeden", "keeper": "blockedenxyz", "why": "same apex blockeden.xyz; keeper Live"},
    {"slug": "blox-global", "keeper": "blox", "why": "same apex blox.global; keeper Live"},
    {"slug": "cashabroad", "keeper": "cash-abroad", "why": "same apex cashabroad.one; keeper Live"},
    {"slug": "coca-wallet", "keeper": "coca", "why": "same apex coca.xyz; keeper Live"},
    {"slug": "coinsph", "keeper": "coins-ph", "why": "same apex coins.ph; keeper Live"},
    {"slug": "diameter", "keeper": "diameter-pay", "why": "same apex diameterpay.com; keeper Live"},
    {"slug": "digibank-sdp", "keeper": "digibank", "why": "same apex digibankar.com; submission-title variant"},
    {"slug": "elroy-app", "keeper": "elroy", "why": "same apex elroy.app; merge is correct — but see keeperReview: the keeper is wrongly Live"},
    {"slug": "expand", "keeper": "expand-network", "why": "same apex expand.network; keeper Live"},
    {"slug": "gateway", "keeper": "gatewayfm", "why": "same apex gateway.fm; keeper Live on human-verified"},
    {"slug": "honeycoin", "keeper": "honey-coin", "why": "same apex honeycoin.app; keeper Live"},
    {"slug": "huma-finance", "keeper": "huma", "why": "same apex huma.finance; keeper Live"},
    {"slug": "liqvid", "keeper": "liqvidxyz", "why": "same apex liqvid.xyz; keeper Live"},
    {"slug": "mica-rent", "keeper": "mica", "why": "same apex mica.rent; keeper Live"},
    {"slug": "orbit-finance", "keeper": "orbitcdp", "why": "same apex orbitcdp.finance; keeper is orbitcdp (see reopen)"},
    {"slug": "reclaim-protocol", "keeper": "reclaim", "why": "same apex reclaimprotocol.org; keeper Live on repo-activity"},
    {"slug": "ripe-money", "keeper": "ripe", "why": "same apex ripe.money; keeper Live"},
    {"slug": "sorobanhub", "keeper": "soroban-hub", "why": "same apex sorobanhub.com; keeper Live on repo-activity"},
    {"slug": "sorobanpulse", "keeper": "soroban-pulse", "why": "same apex sorobanpulse.app; merge is correct — but see keeperReview: domain is parked"},
    {"slug": "stellarexpert", "keeper": "stellar-expert", "why": "same apex stellar.expert; row's own note records the 2026-07-10 merge"},
    {"slug": "trace-finance", "keeper": "trace", "why": "same apex tracefinance.com; keeper Live"},
    {"slug": "volta", "keeper": "volta-circuit", "why": "same apex voltacircuit.com; keeper Live"},
    {"slug": "zkliquid", "keeper": "liquidsfi", "why": "same apex liquids.fi; shadow's own description records the ZKLiquid->LiquidsFi rebrand"}
  ],
  "receipt": [],
  "reopen": [
    {
      "slug": "orbitcdp",
      "evidenceUrl": "https://api.stellar.expert/explorer/public/contract/CAE7QVOMBLZ53CDRGK3UNRRHG5EZ5NQA7HHTFASEMYBWHG6MDFZTYHXC/value",
      "observedAt": "2026-09-05",
      "why": "Inactive rests on site-liveness, and https://orbitcdp.finance/ returns 200 with a full product page whose Launch App points at a live Blend mainnet pool. That pool's XLM and oUSD balances were updated 2026-08-23 — six days AFTER the row's statusAsOf of 2026-08-17. oUSD: supply 189,999, 71 trustlines (32 funded), 26,580 trades. The team pivoted new development to Zenex (zenex-sdk-js pushed 2026-08-26; orbit-contracts last pushed 2026-01-23), but a dev pivot is not a shutdown and no public shutdown announcement was found. lifecycle.note claiming 'Shut down in 2026' is unsourced and needs owner correction."
    }
  ],
  "couldNotCheck": [],
  "noAction": [
    {"slug": "passport", "keeper": "stellar-passport", "why": "operator-vetoed dedup cluster (SDF-verified row). demo.stellarpassport.xyz returns 200; recorded for completeness, deliberately excluded from hide[]. DO NOT ACT."}
  ],
  "keeperReview": [
    {
      "slug": "elroy",
      "currentStatus": "Live",
      "currentBasis": "site-liveness",
      "evidenceUrl": "https://www.elroy.app/",
      "observedAt": "2026-09-05",
      "why": "The page site-liveness read as 'Live' is a retirement notice: title 'Elroy App Update | Service Retired | BOSS Money', body 'Elroy Has Joined the BOSS Family'. No date on the page. Needs a human verdict — do not auto-write."
    },
    {
      "slug": "soroban-pulse",
      "currentStatus": "Live",
      "currentBasis": "site-liveness",
      "evidenceUrl": "https://sorobanpulse.app/lander",
      "observedAt": "2026-09-05",
      "why": "sorobanpulse.app returns 200 with a 114-byte body that JS-redirects to /lander, a GoDaddy parked-domain lander (window._trfd ap:'parking', img1.wsimg.com/parking-lander). A parked domain answered 200 and was scored Live. Needs a human verdict — do not auto-write."
    }
  ]
}
```
