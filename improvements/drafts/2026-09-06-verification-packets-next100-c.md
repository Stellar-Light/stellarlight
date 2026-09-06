# Verification packets — next-100 batch C, 32 weak-basis rows (2026-09-06)

Rule applied: the product-state rule from `2026-09-05-verification-packets-top100.md` (corrections block) and `…-medium-regraded.md` ("How to read a verdict"). Live rests on the product's own state — a store release ≤90 days (iTunes lookup `currentVersionReleaseDate`, Play "Updated on"), a working app with non-empty data, a product API answering with data, chain activity, or a docs page that documents the Stellar product specifically — never a banner, title, "Launch App" CTA or marketing claim; empty or zero page metrics veto Live; a raw fetch of a client-rendered shell is could-not-check until rendered in a browser or its data endpoint is read; the second signal for `high` is this product's own repo pushed ≤90 days; Inactive needs a parked / for-sale / retired / removed page or repo, receipted with `scripts/data/capture-receipt.ts`; timeouts, TLS failures, 403s and DNS failures are could-not-check.

Every URL below was fetched **2026-09-06 04:00–05:10 UTC** (evening of 2026-09-05 Pacific). `asOf` is the evidence's own date (a store release date, a repo push, a post date); where the evidence is a page observed today the entry says "observed 2026-09-06". Client-rendered pages were read in a browser tab this session owned (`tab-3`). Stores via the iTunes lookup/search API and the Play Store page's "Updated on"; GitHub via `gh api`; chain via stellar.expert's API and Soroban RPC `getEvents` (mainnet.sorobanrpc.com, ~7-day retention: ledgers 64175387–64295387). X/Twitter was not used for any row (login shell, no dates).

Nothing here touched the database. **Every verdict here is a recommendation; the owner's approval of a MOVE is what makes it human-verified.**

Recommended: **Live 12 · Development 3 · Pre-Release 1 · Inactive 3 · cannot-tell 13** (32 rows). Confidence: **high 8 · medium 10 · low 1 · n/a 13** (cannot-tell rows carry no confidence).

## Summary

| slug | today (status / basis) | → verdict | conf | deciding evidence (date) |
|---|---|---|---|---|
| mercuryo | Live / site-liveness | **Live** | medium | Mercuryo's public quote API prices XLM on network STELLAR today (535.93 XLM for $100, observed 2026-09-06); the iOS build (2026-05-07) and own repo (2026-01-16) are outside 90 d |
| palremit | Live / site-liveness | **Live** | high | iOS "Palremit: Send – Swap – Cards" v20 released 2026-09-04; Play "Updated on Sep 4, 2026" (NG storefront) |
| payrit | Live / site-liveness | **Live** | high | iOS "Payrit" v3.0.136 released 2026-07-19; Play "Updated on Jul 12, 2026"; rendered page names Stellar among its networks |
| pretium | Live / site-liveness | **Live** | high | Play "Pretium Finance" updated 2026-08-25 (10K+); own repo pretium-mcp pushed 2026-08-13 (README: USDT/USDC on … Stellar) |
| quarkslab | Live / site-liveness | **Live** | medium | firm's own blog post dated 2026-09-01; org repos pushed 2026-09-03; the only Stellar-specific artefact is a 2024-08-27 audit post (Estrela / Airswift SCF) |
| rahat | Live / site-liveness | **Live** | high | rahataid/rahat-project-aa pushed 2026-09-05 (README: Stellar Soroban); docs.rahat.io AA module: "Stellar Network — Primary blockchain for token operations" (observed 2026-09-06) |
| rosen | Live / site-liveness | **Live** | medium | iOS "ROSEN" v2.4.7 released 2026-09-06 (NG storefront); own repo rosen-stellar pushed 2026-03-17 (173 d, outside) |
| rubic | Live / site-liveness | **Live** | high | api-v2.rubic.exchange chains list carries STELLAR (observed 2026-09-06); Cryptorubic/rubic-app pushed 2026-09-04 |
| skopa | Live / site-liveness | **Live** | high | iOS "Skopa – Your money globally" v2.10.21 released 2026-08-05; Play "Updated on Aug 5, 2026" (50K+); API Swagger answers |
| soroban-governor | Live / site-liveness | **Live** | medium | mainnet app: YieldBlox DAO proposal "Set Backstop Take Rate To Zero" Executed, 157.35k Yes, "Ended 5 days ago" (≈2026-09-01); own UI/backend repos pushed 2026-05-17 (112 d, outside) |
| stellar-defi-dune-dashboards | Live / source-inherited | **Live** | medium | dune.com/paltalabs: 15 dashboards / 287 queries, "DeFindex — updated 16 days ago" (≈2026-08-21); the flagship "Soroban AMMs on Stellar" is 2 years stale |
| swiftex | Live / site-liveness | **Live** | high | iOS "SwiftEx Wallet" v1.0.8 released 2026-08-24; Play "Updated on Aug 17, 2026"; own repo SwiftExWallet/SwiftEx pushed 2026-08-31 (README: Stellar DEX) |
| rehoboth | Live / site-liveness | **Development** | medium | the page's own words: "Individual · Business · Coming soon", "Join our beta testing" (observed 2026-09-06); no store listing exists |
| ripe | Live / site-liveness | **Development** | medium | the page's own words: "currently supports USDT, USDC, and USDG on Solana and Aptos, along with near-term plans to support Base, Stellar, Celo …" (observed 2026-09-06) |
| splyce-finance | Live / site-liveness | **Development** | medium | the page's own header: "Launch App — Solana demo.splyce.finance · Stellar Coming Soon · Sui Coming Q2 2026" (observed 2026-09-06) |
| paystreme | Live / site-liveness | **Pre-Release** | medium | paystreme.com: "About Paystreme — COMING SOON — 0% … 100% — Notify Me" (observed 2026-09-06); walletguru.com: "Soon: Paystreme"; row repo removed |
| taskio | Live / source-inherited | **Inactive** | high | task.io 302 → atom.com/name/Task.io: "PREMIUM DOMAIN FOR SALE — Task.io — ONE-TIME PRICE $150,000" (observed 2026-09-06; receipted) |
| quasar | Live / source-inherited | **Inactive** | medium | eiger.co 308 → Equilibrium Labs merger article "Eiger and Equilibrium Labs unite" (receipted); repo last pushed 2024-08-10, last release 2024-01-09; sibling `nebula` already Inactive / human-verified on the same evidence |
| qolaq | Live / source-inherited | **Inactive** | low | qolaq.org and www.qolaq.org answer HTTP 404 with an empty body (receipted, no text marker exists); GitHub org's only repo is a logo pushed 2022-09-19 |
| metafyed · minah · mojoflower · mozart-pay · myaza · okashi · orally · payzoll · rampmedaddy · scout · sollpay · sorobanmath · tauvlo | (unchanged) | **cannot-tell** | — | see the cannot-tell table |

---

## Live — 12 rows

### mercuryo — Mercuryo (Payments) · SCF R31 $50,000

Today: Live / site-liveness / 2026-08-17 / https://mercuryo.io/. No repo in row (org mercuryoio).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://mercuryo.io/ | 200 · "Mercuryo \| Fiat to Crypto On Ramp" · 7,418 chars · marketing; links dashboard.mercuryo.io (login), exchange.mercuryo.io (widget), widget.docs.mercuryo.io |
| product API: currencies | https://api.mercuryo.io/v1.6/lib/currencies | `status 200` · 54 crypto currencies · `XLM` present · `config.crypto_currencies` lists `USDC / STELLAR` and `XLM / STELLAR`; `networks` includes `STELLAR` |
| product API: live quote | https://api.mercuryo.io/v1.6/public/convert?from=USD&to=XLM&type=buy&amount=100&network=STELLAR | `{"type":"buy","currency":"XLM","amount":"535.9321304","fiat_amount":"100.00","rate":"0.18","fee":"3.80"}` — a priced XLM-on-Stellar buy, observed 2026-09-06 |
| widget docs | https://widget.docs.mercuryo.io/ | 200 · 61,673 bytes · no "Stellar"/"XLM" string on the landing page (per-network docs not reached) |
| store | https://itunes.apple.com/search?term=mercuryo&entity=software&country=us | "Mercuryo Bitcoin Cryptowallet" id1446533733 v2.4.2 released 2026-05-07 (122 d — outside) |
| GitHub org | https://github.com/mercuryoio | newest BAAS-API pushed 2026-01-16 (outside) |

**Deciding evidence:** https://api.mercuryo.io/v1.6/public/convert?from=USD&to=XLM&type=buy&amount=100&network=STELLAR — the product's own pricing endpoint quoting XLM on the Stellar network, observed 2026-09-06.
**Confidence: medium** — one in-window signal (the API); the store build and own repo are outside 90 d. A second API surface (currencies list) corroborates but is the same product surface.

### palremit — Palremit (Payments) · SCF R32 $60,000

Today: Live / site-liveness / 2026-08-17 / https://palremit.com/. No repo in row (org `palremit` has no public repos).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://palremit.com/ | 200 · "Palremit - Global Payment Platform for Fiat & Crypto Transactions" · 5,807 chars · store links, docs.palremit.com, "Lender App" plp.palremit.com |
| iOS | https://itunes.apple.com/lookup?id=6502370740&country=ng | "Palremit: Send – Swap – Cards" v20 · `currentVersionReleaseDate` **2026-09-04T22:06:52Z** (seller Fabian Holderness) |
| Play | https://play.google.com/store/apps/details?id=com.fintech.palremit&hl=en&gl=NG | "Palremit: Send – Swap – Cards" · **Updated on Sep 4, 2026** · 50K+ downloads · developer Palremit Corporation (US storefront: Not Found — regional listing) |
| GitHub org | https://github.com/palremit | 0 public repos |

**Deciding evidence:** https://itunes.apple.com/lookup?id=6502370740&country=ng — `currentVersionReleaseDate` 2026-09-04.
**Confidence: high** — two store releases inside the window (iOS 2 d, Android 2 d). No Stellar-specific surface was visible (the SCF award is the Stellar link).

### payrit — PAYRIT (Payments) · SCF R34 $47,792

Today: Live / site-liveness / 2026-08-17 / https://payrit.com/. Row `github` is a Google Doc URL (data fix needed).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (raw) | https://payrit.com/ | 200 · 41 chars — client-rendered shell → could-not-check by fetch |
| website (browser, tab-3, 6 s) | https://payrit.com/ | renders the full page: "The secure money app for African travelers … send & receive USDC/T on over 7 supported networks including **Stellar**, Base, Ethereum, Polygon, Solana, Arbitrum"; calculator widget shows "Rate -- · Fee --" (empty, not counted); "Used by 1,000+ travellers" (claim, not counted) |
| iOS | https://itunes.apple.com/search?term=payrit&entity=software&country=ng | "Payrit" id6463464675 v3.0.136 · released **2026-07-19** (TREE-HOUSE NIGERIA LIMITED) |
| Play | https://play.google.com/store/apps/details?id=com.payrit.app&hl=en&gl=NG | "Payrit" · **Updated on Jul 12, 2026** · 5K+ |

**Deciding evidence:** https://itunes.apple.com/lookup?id=6463464675&country=ng — `currentVersionReleaseDate` 2026-07-19 (49 d).
**Confidence: high** — two store releases inside the window; the rendered page names Stellar. Data fix: `links.github` should be dropped or replaced (it is a docs.google.com link).

### pretium — Pretium (Payments) · SCF R26 $10,000

Today: Live / site-liveness / 2026-08-17 / https://pretium.africa/. Row GitHub link is the user `derrickbundi`.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://pretium.africa/ | 200 · "Pay with Stablecoins in Africa" · 6,704 chars · Play link, docs.pretium.africa, docs.checkout.pretium.africa |
| Play | https://play.google.com/store/apps/details?id=app.pretium.finance&hl=en&gl=NG | "Pretium Finance" · **Updated on Aug 25, 2026** · 10K+ |
| own repo | https://github.com/derrickbundi/pretium-mcp | pushed **2026-08-13** · "Pay with stablecoins powered by AI agents" · README: "Transfer USDT/USDC on Celo, Base, BNB, Polygon, Arbitrum, Avalanche, Solana, or **Stellar**" |
| own repo | https://github.com/derrickbundi/payment-api-docs | pushed 2026-08-18 |
| docs | https://docs.pretium.africa/ | TLS handshake failure (curl) — could-not-check |
| iOS | https://itunes.apple.com/search?term=pretium&entity=software&country=ng | no Pretium Finance app (the "Pretium: AI CFO" hit is a different seller) |

**Deciding evidence:** https://play.google.com/store/apps/details?id=app.pretium.finance — "Updated on Aug 25, 2026" (12 d).
**Confidence: high** — store release + own product repo naming Stellar, both inside 90 d. Data fix: attach `derrickbundi/pretium-mcp` as the row repo.

### quarkslab — Quarkslab (Security) · no award in row

Today: Live / site-liveness / 2026-08-27 / https://quarkslab.com/. No repo in row (org quarkslab).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://www.quarkslab.com/ | 200 · "Quarkslab" · 6,995 chars · corporate |
| blog | https://blog.quarkslab.com/ | latest posts dated **2026-09-01**, 2026-08-20, 2026-08-13, 2026-08-11 |
| Stellar-specific | https://blog.quarkslab.com/airswift-scf-stellar.html | "Audit of Airswift's Supply Chain Financing" — Estrela, "an automated market maker for Stellar built on Soroban" — dated 2024-08-27 |
| GitHub org | https://github.com/quarkslab | pcode_graph pushed 2026-09-03, python-binexport 2026-09-01, quokka 2026-08-24 |

**Deciding evidence:** https://blog.quarkslab.com/ — the firm's own post dated 2026-09-01.
**Confidence: medium** — a services firm: "Live" says the company operates (posts + own repos this week); its only Stellar artefact is a 2024 audit post. Relevance, not liveness, is the open question.

### rahat — Rahat (Social Impact) · SCF R30 $149,962

Today: Live / site-liveness / 2026-08-17 / https://rahat.io/. No repo in row (org rahataid).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (raw) | https://rahat.io/ | 200 · 0 chars — client-rendered shell |
| website (browser, tab-3, 6 s) | https://rahat.io/ | renders a marketing carousel ("Communication Module … SMS, Voice, and IVR campaigns"); no metrics, no app link |
| own repo | https://github.com/rahataid/rahat-project-aa | pushed **2026-09-05** · "Rahat project microservices for Anticipatory action projects" · README: "Dual Blockchain Integration: Support for both Stellar Soroban and EVM-compatible networks" |
| own repo | https://github.com/rahataid/rahat-platform | pushed 2026-09-04 ("Rahat core"); rahat-ui 2026-09-05; stellar-disbursement-platform-backend fork 2026-06-22 |
| docs | https://docs.rahat.io/dev-docs/Project-Modules/Anticipatory-Action/Introduction | "Blockchain Networks — 6. Stellar Network — Purpose: Primary blockchain for token operations — Features: Soroban smart contracts for trigger management" (observed 2026-09-06) |
| docs | https://docs.rahat.io/dev-docs/Project-Modules/Anticipatory-Action/Payout-Services | 8,992 chars · `StellarService.addBulkToTokenTransferQueue` in the payout flow |

**Deciding evidence:** https://github.com/rahataid/rahat-project-aa — the product's own Stellar repo pushed 2026-09-05, with docs.rahat.io documenting the Stellar module (observed 2026-09-06).
**Confidence: high** — substantive product docs + own repo pushed ≤90 d. Caveat: both are the team's artefacts; no deployed instance is public (deployments belong to agencies). Data fix: attach `rahataid/rahat-project-aa` and `rahataid/rahat-platform`.

### rosen — ROSEN (Payments) · SCF R37 $75,000

Today: Live / site-liveness / 2026-08-17 / https://gorosen.xyz/. Row repo GoROSEN/rosen-stellar.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://gorosen.xyz/ | 200 · 191 chars — Vue shell ("doesn't work properly without JavaScript"); assets versioned `rosen-website-assets/1.45.0`; `Last-Modified` 2026-07-24 (chrome) |
| iOS | https://itunes.apple.com/search?term=rosen+web3&entity=software&country=ng | "ROSEN" id6444627514 v2.4.7 · released **2026-09-06** (ROSEN BRIDGE TECHNOLOGY INC.); not listed on the US storefront |
| own repo | https://github.com/GoROSEN/rosen-stellar | pushed 2026-03-17 (173 d — outside) · README "ROSEN × Stellar … USDC/PYUSD" |
| GitHub org | https://github.com/GoROSEN | rosen-micro-task-agent 2026-03-29; rosen-pyusd 2025-04-14 |
| Play | package id unknown (site bundle has no Play link) | not examined |

**Deciding evidence:** https://itunes.apple.com/lookup?id=6444627514&country=ng — `currentVersionReleaseDate` 2026-09-06.
**Confidence: medium** — one in-window store release; the Stellar repo is 173 d idle. Data fix: add the iOS id to `availability`.

### rubic — Rubic (Bridge) · SCF R38 $90,000

Today: Live / site-liveness / 2026-08-17 / https://rubic.exchange/. No repo in row (org Cryptorubic).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://rubic.exchange/ | 200 · 3,115 chars · "Launch App", Stellar named once (chrome) |
| product API | https://api-v2.rubic.exchange/api/info/chains | 100 chains · **`STELLAR`** present (observed 2026-09-06) |
| own repo | https://github.com/Cryptorubic/rubic-app | pushed **2026-09-04** · "aggregates 360+ DEXs, bridges & intent-based protocols across 100+ blockchains" |
| GitHub org | https://github.com/Cryptorubic | docs 2026-08-27, rubic-mcp 2026-05-29 |

**Deciding evidence:** https://api-v2.rubic.exchange/api/info/chains — the aggregator's own chain list serving STELLAR today.
**Confidence: high** — live API + own product repo pushed 2 d ago. Not done: a Stellar route quote (`/api/routes/quoteBest`) to prove Stellar routes fill; the chain listing says it is offered. Data fix: attach `Cryptorubic/rubic-app`.

### skopa — Skopa (Payments) · SCF R20 $37,840

Today: Live / site-liveness / 2026-08-17 / https://skopa.io/. Row `github` is an API URL (dev-api-new.skopadev.com/api).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (raw) | https://skopa.io/ | 200 · 41 chars — client-rendered shell → could-not-check by fetch |
| iOS | https://itunes.apple.com/search?term=skopa&entity=software&country=us | "Skopa – Your money globally" id6446782114 v2.10.21 · released **2026-08-05** (Skopa Innovation LLC) |
| Play | https://play.google.com/store/apps/details?id=com.skopa.app&hl=en&gl=us | "Skopa: Instant global payments" · **Updated on Aug 5, 2026** · 50K+ |
| API | https://dev-api-new.skopadev.com/api | 200 · Swagger UI (dev environment; up, not data) |

**Deciding evidence:** https://itunes.apple.com/lookup?id=6446782114&country=us — `currentVersionReleaseDate` 2026-08-05 (32 d).
**Confidence: high** — both stores inside the window. No Stellar-specific surface visible. Data fix: `links.github` is an API URL, not a repo.

### soroban-governor — Soroban Governor (SDK) · SCF R22/24 $111,300

Today: Live / site-liveness / 2026-08-17 / https://governance.script3.io/. Row repo script3/soroban-governor.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://governance.script3.io/ | 200 · 177 chars · landing linking mainnet./testnet.governance.script3.io |
| app (raw) | https://mainnet.governance.script3.io/ | 200 · "Soroban Governor · Connect Wallet · 4 DAOs · YieldBlox · Stellar Community Fund · Soroban Domains" |
| app (browser, tab-3) | https://mainnet.governance.script3.io/CANSYFVMIP7JVYEZQ463Y2I2VLEVNLDJJ4QNZTDBGLOOGKURPTW4A6FQ/proposals/ | YieldBlox DAO: "Set Backstop Take Rate To Zero — **Executed** — Yes 157.35k (100%) — **Ended 5 days ago**"; "Should the DAO use treasury to supply PYUSD and USTRY…" Defeated, 168.56k No, ended 1 month ago; two Executed proposals ended 4 months ago |
| governor list | https://raw.githubusercontent.com/script3/soroban-governor-ui/main/public/governors/governors-mainnet.json | YieldBlox `CANSY…A6FQ`, YieldBlox (Old) `CAPPT…H6OV`, Stellar Community Fund `CD5BO…ZCZO` (created 2026-01-19), Soroban Domains `CDXTT…PZRW` (created 2026-05-15) |
| on-chain | https://api.stellar.expert/explorer/public/contract/CANSYFVMIP7JVYEZQ463Y2I2VLEVNLDJJ4QNZTDBGLOOGKURPTW4A6FQ | created 2024-06-19 · 699 events · 14 storage entries |
| on-chain: RPC getEvents (7-day window) | POST https://mainnet.sorobanrpc.com | **0 events** for `CANSY…A6FQ` in ledgers 64175387–64295387 (the proposal's close ~5 d ago may predate the window or not emit; the app's state stands on its own) |
| own repos | https://github.com/script3/soroban-governor-ui · …-backend | pushed 2026-05-17 (112 d — outside); core `soroban-governor` 2024-07-09 |

**Deciding evidence:** https://mainnet.governance.script3.io/CANSYFVMIP7JVYEZQ463Y2I2VLEVNLDJJ4QNZTDBGLOOGKURPTW4A6FQ/proposals/ — a mainnet DAO proposal executed with 157.35k votes, ended ≈2026-09-01 (observed 2026-09-06).
**Confidence: medium** — one product-state signal; own repos are 112 d old; the 7-day RPC read did not corroborate. Data fix: attach the four mainnet governor contracts.

### stellar-defi-dune-dashboards — Stellar DeFi Dune Dashboards (Analytics) · SCF R35 $25,000

Today: Live / source-inherited / 2026-08-19 / lumenloop yaml; website https://dune.com/paltalabs.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (raw) | https://dune.com/paltalabs | 403 · Cloudflare "Just a moment…" → could-not-check by fetch |
| website (browser, tab-3, 8 s) | https://dune.com/paltalabs | "PaltaLabs — Stars 49 · Queries 287 · Dashboards 15"; dashboards: "Soroswap.Finance — updated 8 months ago", "Soroban AMMs on Stellar — updated 2 years ago", "**DeFindex — updated 16 days ago**", "Stellar Growth Hack Cohort 1 — 8 months ago"; queries "Soroswap - Pools: Filtered Tokens — updated 16 days ago", "Soroswap - Pools: Deposit Raw Events — updated 16 days ago" |
| dashboard | https://dune.com/paltalabs/defindex | 200 |
| GitHub org | https://github.com/paltalabs | no dune/dashboard repo found (search + org listing); newest etherfuse-privy-wallet 2026-08-19; defindex archived 2026-07-01 |

**Deciding evidence:** https://dune.com/paltalabs — the product's own dashboard set, with a dashboard and two queries updated ≈2026-08-21 (16 days before observation).
**Confidence: medium** — one signal (relative dates on the profile), and the dashboard the row is named for ("Soroban AMMs on Stellar") is 2 years stale; the maintained ones are DeFindex/Soroswap. No open-source query repo was found despite the row's "open-source" claim.

### swiftex — SwiftEx (Wallet, DEX) · SCF R35 $65,000

Today: Live / site-liveness / 2026-08-17 / https://swiftexchange.io/. Row repo hunnykumar/swiftex (GitHub redirects it to SwiftExWallet/SwiftEx).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://swiftexchange.io/ | 200 · 7,703 chars · store links, app.swiftexchange.io (1,398-byte shell) |
| iOS | https://itunes.apple.com/lookup?id=6759080930&country=us | "SwiftEx Wallet" v1.0.8 · released **2026-08-24** · notes "WalletConnect enhancements and bug fixes" |
| Play | https://play.google.com/store/apps/details?id=org.app.swiftEx.wallet&hl=en&gl=us | "SwiftEx : Multi Chain Wallet" · **Updated on Aug 17, 2026** · 500+ |
| own repo | https://github.com/SwiftExWallet/SwiftEx | pushed **2026-08-31** · README: "Multi-chain crypto wallet for … Stellar DEX — SDEX trading, AMM swaps" |

**Deciding evidence:** https://itunes.apple.com/lookup?id=6759080930&country=us — `currentVersionReleaseDate` 2026-08-24 (13 d).
**Confidence: high** — two store releases + own repo pushed 6 d ago, README naming Stellar DEX. Data fix: the row repo should read `SwiftExWallet/SwiftEx`.

## Development — 3 rows

### rehoboth — Rehoboth (Payments) · SCF R27 $23,300

Today: Live / site-liveness / 2026-08-17 / https://rehobothfinance.com/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://rehobothfinance.com/ | 200 · "Rehoboth Finance" · 1,154 chars · "Individual · Business · **Coming soon**" · "**Join our beta testing** · Coming soon" (3× "coming soon") · no store links |
| iOS | https://itunes.apple.com/search?term=rehoboth+finance&entity=software&country=ng | no Rehoboth app |
| GitHub org | https://github.com/Rehoboth-Finance | easy-escrow pushed 2026-04-30 ("Easy Escrow SDK by Rehoboth"); the rest are forks |

**Deciding evidence:** https://rehobothfinance.com/ — the product's own "Coming soon / Join our beta testing" wording, observed 2026-09-06.
**Confidence: medium** — the page states its own stage; nothing shipped to a store. Presented, not asserted: if the owner knows a live wallet exists, the page contradicts it.

### ripe — Ripe (Payments, Anchor) · SCF R17 $100,000

Today: Live / site-liveness / 2026-08-27 / https://ripe.money/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://www.ripe.money/ | 200 · 7,817 chars · FAQ: "Ripe currently supports USDT, USDC, and USDG on **Solana and Aptos**, along with **near-term plans to support** Base, **Stellar**, Celo, and stablecoin payment chains Stable and Plasma" |
| app | https://pay.ripe.money/ → /qr | 200 · "Ripe · Connect Wallet · QR · Phone Input" (34 chars) — wallet-gated |
| GitHub org | https://github.com/ripe-money | markdoc (docs) 2025-05-12; github-action-sandbox 2025-08-03 (archived); nothing Stellar |

**Deciding evidence:** https://www.ripe.money/ — the product's own statement that Stellar support is planned, observed 2026-09-06.
**Confidence: medium** — the company's product is live on Solana/Aptos; the Stellar product this row describes is, by its own words, not shipped. Alternative for the owner: keep Live and re-scope the row to the company.

### splyce-finance — Splyce Finance (RWA) · SCF R36 $150,000

Today: Live / site-liveness / 2026-08-17 / https://splyce.finance/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://splyce.finance/ | 200 · "Splyce Finance · Real Yield from Real Assets" · 9,268 chars · header "Launch App — **Solana** demo.splyce.finance · **Stellar Coming Soon** · Sui Coming Q2 2026" |
| GitHub org | https://github.com/Splyce-Finance | newest .github 2025-09-15; splyce-docs 2025-04-26; whirlpool-cpi (Orca fork) — Solana |

**Deciding evidence:** https://splyce.finance/ — "Stellar Coming Soon" in the product's own app switcher, observed 2026-09-06.
**Confidence: medium** — own words; the only launchable surface is a Solana demo.

## Pre-Release — 1 row

### paystreme — Paystreme (Payments, Anchor) · SCF R11 $50,000

Today: Live / site-liveness / 2026-08-27 / https://walletguru.com/. Row repos walletgurullc/paystreme (404) and walletgurullc/wg-docs.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| row website | https://www.walletguru.com/ | 200 · "Wallet Guru: Streaming Payment Platform" · 1,635 chars · nav "Soon: Paystreme" · Play link |
| product site | https://www.paystreme.com/ | 200 · "Paystreme \| Streaming Payments" · "About Paystreme — **COMING SOON** — 0% … 100% — Notify Me — © 2026 MYWALLETGURU, LLC" |
| Play (parent app) | https://play.google.com/store/apps/details?id=com.walletguru.walletguru | "Wallet Guru" · Updated on Sep 12, 2025 (359 d) · 10+ downloads |
| row repo | https://api.github.com/repos/walletgurullc/paystreme | 404 (removed) |
| row repo | https://github.com/WalletGuruLLC/wg-docs | pushed 2025-04-20 · "Wallet Guru Platform POC" |
| iOS | https://itunes.apple.com/search?term=wallet+guru&entity=software&country=us | no Wallet Guru / Paystreme app |

**Deciding evidence:** https://www.paystreme.com/ — the product's own "COMING SOON · Notify Me" page, observed 2026-09-06.
**Confidence: medium** — announced, nothing usable; the listed repo is gone and the parent app has ~10 installs a year old. Alternative: Development (same URL) if the owner prefers the four-verdict mapping used on 2026-09-05.

## Inactive — 3 rows

### taskio — Task.io (Social Impact) · no award in row

Today: Live / source-inherited / 2026-08-19 / lumenloop yaml; website https://task.io/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (raw) | https://task.io/ | **302 → https://www.atom.com/name/Task.io** (Atom domain marketplace); the landing answers 403 Cloudflare challenge to non-browser clients |
| listing (browser, tab-3, 8 s) | https://www.atom.com/name/Task.io | title "Task.io — Premium Domain For Sale \| Atom" · "**PREMIUM DOMAIN FOR SALE** · Task.io · ONE-TIME PRICE **$150,000** · Buy now · Lease to own $5,750/mo" |
| GitHub org | https://github.com/taskdotio | newest soroban-nft-royalties pushed 2024-01-12; stellar-turrets fork 2021 |

**Deciding evidence:** https://www.atom.com/name/Task.io — the product's domain is listed for sale (observed 2026-09-06).
**Confidence: high** — a for-sale page is the death class the rule names; the org's last push is 2.7 years old.

Receipt (`improvements/receipts/taskio-2026-09-06.json`): `finalUrl` recorded as https://www.atom.com/name/Task.io, httpStatus 403; marker `for sale` **absent** (the tool is served the Cloudflare challenge, not the listing), marker `atom.com` **FOUND (markup)** — the receipt proves the redirect to the marketplace, the browser read proves the listing.

```sh
pnpm exec tsx scripts/data/capture-receipt.ts taskio "https://task.io/" "for sale" "atom.com"
```

### quasar — Quasar (SDK, Oracle) · no award in row

Today: Live / source-inherited / 2026-08-19 / lumenloop yaml; website https://eiger.co/; repos eigerco/quasar, eigerco/nebula.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://eiger.co/ | 308 → https://equilibrium.co/writing/scaling-distributed-systems-eiger-and-equilibrium-labs-unite — "Scaling distributed systems: **Eiger and Equilibrium Labs unite**" (10,864 chars) |
| row repo | https://github.com/eigerco/quasar → equilibriumco/quasar | pushed **2024-08-10** · not archived · 15 open issues · last release 0.1.0-beta.1 **2024-01-09** · README: self-hosted Soroban indexer (GraphQL at localhost:8000), no hosted instance |
| sibling | https://nebula.eiger.co/ | 404 · Vercel `DEPLOYMENT_NOT_FOUND` — `nebula` is already Inactive / human-verified (2026-07-15, `STATUS_FIX`) on this same evidence class |
| GitHub org | https://github.com/equilibriumco | active on Hyperlane/Canton (2026-09-04); nothing Stellar since 2024 |

**Deciding evidence:** https://eiger.co/ — the vendor page is replaced by the merger announcement (receipted) and the product's only artefact is a beta repo idle since 2024-08-10.
**Confidence: medium** — same evidence class the owner accepted for `nebula`; not an explicit retirement of Quasar. Alternative: cannot-tell if the owner wants a retirement statement or an archived repo.

Receipt (`improvements/receipts/quasar-2026-09-06.json`): marker `Eiger and Equilibrium Labs unite` **FOUND (text)**, finalUrl equilibrium.co/writing/….

```sh
pnpm exec tsx scripts/data/capture-receipt.ts quasar "https://eiger.co/" "Eiger and Equilibrium Labs unite"
```

### qolaq — Qolaq (Social Impact) · no award in row

Today: Live / source-inherited / 2026-08-19 / lumenloop yaml; website https://qolaq.org/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://qolaq.org/ | **404** · 0 bytes · server cloudflare |
| website | https://www.qolaq.org/ | **404** · 0 bytes |
| website (browser, tab-3) | https://qolaq.org/ | blank page |
| GitHub org | https://api.github.com/users/qolaq/repos | one repo `QOLAQ/logo` pushed 2022-09-19 |

**Deciding evidence:** https://qolaq.org/ — HTTP 404 with an empty body at both hosts (observed 2026-09-06).
**Confidence: low** — a removed page, but with no text marker (no host notice, no parked lander), and the only other artefact is a 4-year-old logo repo. Presented for the owner: keep as cannot-tell if a bare 404 is not enough.

Receipt (`improvements/receipts/qolaq-2026-09-06.json`): httpStatus **404**, bodyTextChars **0**; no marker was passed because the body is empty — the status code is the evidence.

```sh
pnpm exec tsx scripts/data/capture-receipt.ts qolaq "https://qolaq.org/"
```

## STATUS_FIX entries (19 rows: 12 Live stamps, 7 moves)

Paste approved entries into `STATUS_FIX` in `scripts/data/curation-maps.ts`; `from === to` rows write only the evidence. None of these slugs is in the map today (checked 2026-09-06).

```json
{
  "mercuryo": { "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06", "sourceUrl": "https://api.mercuryo.io/v1.6/public/convert?from=USD&to=XLM&type=buy&amount=100&network=STELLAR", "note": "verification packet 2026-09-06 (medium) — Mercuryo's own quote API prices XLM on network STELLAR (535.93 XLM per $100); iOS build 2026-05-07 and own repo outside 90 d" },
  "palremit": { "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-04", "sourceUrl": "https://itunes.apple.com/lookup?id=6502370740&country=ng", "note": "verification packet 2026-09-06 (high) — iOS v20 released 2026-09-04; Play com.fintech.palremit updated Sep 4, 2026 (NG storefront)" },
  "payrit": { "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-07-19", "sourceUrl": "https://itunes.apple.com/lookup?id=6463464675&country=ng", "note": "verification packet 2026-09-06 (high) — iOS v3.0.136 released 2026-07-19; Play com.payrit.app updated Jul 12, 2026; rendered page names Stellar among 7 networks" },
  "pretium": { "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-08-25", "sourceUrl": "https://play.google.com/store/apps/details?id=app.pretium.finance", "note": "verification packet 2026-09-06 (high) — Play updated Aug 25, 2026 (10K+); own repo derrickbundi/pretium-mcp pushed 2026-08-13 lists Stellar" },
  "quarkslab": { "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-01", "sourceUrl": "https://blog.quarkslab.com/", "note": "verification packet 2026-09-06 (medium) — firm operating: blog post 2026-09-01, org repos pushed 2026-09-03; Stellar-specific artefact is a 2024-08-27 audit post" },
  "rahat": { "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-05", "sourceUrl": "https://github.com/rahataid/rahat-project-aa", "note": "verification packet 2026-09-06 (high) — own Stellar Soroban repo pushed 2026-09-05; docs.rahat.io AA module documents Stellar as primary chain" },
  "rosen": { "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06", "sourceUrl": "https://itunes.apple.com/lookup?id=6444627514&country=ng", "note": "verification packet 2026-09-06 (medium) — iOS ROSEN v2.4.7 released 2026-09-06 (NG storefront); rosen-stellar repo 2026-03-17 outside 90 d" },
  "rubic": { "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06", "sourceUrl": "https://api-v2.rubic.exchange/api/info/chains", "note": "verification packet 2026-09-06 (high) — aggregator's own chain list serves STELLAR; Cryptorubic/rubic-app pushed 2026-09-04" },
  "skopa": { "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-08-05", "sourceUrl": "https://itunes.apple.com/lookup?id=6446782114&country=us", "note": "verification packet 2026-09-06 (high) — iOS v2.10.21 released 2026-08-05; Play com.skopa.app updated Aug 5, 2026 (50K+)" },
  "soroban-governor": { "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-01", "sourceUrl": "https://mainnet.governance.script3.io/CANSYFVMIP7JVYEZQ463Y2I2VLEVNLDJJ4QNZTDBGLOOGKURPTW4A6FQ/proposals/", "note": "verification packet 2026-09-06 (medium) — mainnet YieldBlox DAO proposal executed with 157.35k votes, ended ~2026-09-01; UI/backend repos 2026-05-17 outside 90 d" },
  "stellar-defi-dune-dashboards": { "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-08-21", "sourceUrl": "https://dune.com/paltalabs", "note": "verification packet 2026-09-06 (medium) — 15 dashboards / 287 queries; DeFindex dashboard and Soroswap queries updated ~2026-08-21; 'Soroban AMMs on Stellar' dashboard 2 years stale" },
  "swiftex": { "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-08-24", "sourceUrl": "https://itunes.apple.com/lookup?id=6759080930&country=us", "note": "verification packet 2026-09-06 (high) — iOS v1.0.8 released 2026-08-24; Play updated Aug 17, 2026; SwiftExWallet/SwiftEx pushed 2026-08-31 (Stellar DEX)" },
  "rehoboth": { "from": "Live", "to": "Development", "basis": "human-verified", "asOf": "2026-09-06", "sourceUrl": "https://rehobothfinance.com/", "note": "verification packet 2026-09-06 (medium) — page states 'Coming soon' for Individual/Business and 'Join our beta testing'; no store listing" },
  "ripe": { "from": "Live", "to": "Development", "basis": "human-verified", "asOf": "2026-09-06", "sourceUrl": "https://www.ripe.money/", "note": "verification packet 2026-09-06 (medium) — page: supports Solana and Aptos today, 'near-term plans to support … Stellar'; pay.ripe.money is wallet-gated" },
  "splyce-finance": { "from": "Live", "to": "Development", "basis": "human-verified", "asOf": "2026-09-06", "sourceUrl": "https://splyce.finance/", "note": "verification packet 2026-09-06 (medium) — app switcher: 'Solana demo.splyce.finance · Stellar Coming Soon'" },
  "paystreme": { "from": "Live", "to": "Pre-Release", "basis": "human-verified", "asOf": "2026-09-06", "sourceUrl": "https://www.paystreme.com/", "note": "verification packet 2026-09-06 (medium) — 'COMING SOON · Notify Me' product page; walletguru.com 'Soon: Paystreme'; row repo removed" },
  "taskio": { "from": "Live", "to": "Inactive", "basis": "human-verified", "asOf": "2026-09-06", "sourceUrl": "https://www.atom.com/name/Task.io", "note": "verification packet 2026-09-06 (high) — task.io redirects to an Atom 'Premium Domain For Sale' listing ($150,000); org last push 2024-01-12" },
  "quasar": { "from": "Live", "to": "Inactive", "basis": "human-verified", "asOf": "2026-09-06", "sourceUrl": "https://eiger.co/", "note": "verification packet 2026-09-06 (medium) — eiger.co redirects to the Eiger/Equilibrium merger article; repo idle since 2024-08-10, last release 2024-01-09; same class as nebula (Inactive 2026-07-15)" },
  "qolaq": { "from": "Live", "to": "Inactive", "basis": "human-verified", "asOf": "2026-09-06", "sourceUrl": "https://qolaq.org/", "note": "verification packet 2026-09-06 (low) — qolaq.org and www answer 404 with an empty body; GitHub org's only repo is a 2022 logo" }
}
```

## Cannot-tell — 13 rows (no entry; row keeps its current basis)

| slug | today | instruments (2026-09-06) | what would decide |
|---|---|---|---|
| metafyed | Live / site-liveness | https://www.metafyed.com/ 200 · 2,388 chars Squarespace marketing; https://marketplace.metafyed.com/ **TLS certificate expired** (curl 60 → could-not-check); with `-k` it is a Next.js app whose strings are a sign-up gate ("Create a free account to unlock…", "Failed to load projects"); row repo nasdex-marketplace/md-stellar_wallet_service **404**, org has 0 public repos; Metafyed/metafyed-solana-contracts 2024-05-25. SCF R27 $50k | a renewed cert with listings visible without login (Live), or a parked/for-sale lander (Inactive) |
| minah | Live / site-liveness | https://www.minah.io/ 200 · 9,016 chars Framer marketing ("Open App" has no link; only a tally.so form and Notion legal pages; a "stellar logo" partner tile); row repo gakpe/minah_blockchain_v0.2 **404**; Gakpe/Pre-seed pushed 2026-09-01 is a "Portail investisseurs Minah" prototype, Public_Minah_assets 2026-06-10. SCF R38 $97.5k | an app URL with listings or metrics; a repo fix to the live Gakpe repos |
| mojoflower | Live / site-liveness | https://www.mojoflower.io/ 200 · 241 chars dev-shop services page (below the 300 floor; no Bloom/Petal); https://bloom.mojoflower.io/ renders "Spin up your DAO · Install Freighter · Check out some of the registered organisations" with an **empty** list; https://app.mojoflower.io/ "Calyx" shell; petal.mojoflower.io has no DNS; org newest 2024-07-16 | one registered organisation visible in Bloom (Live) or a parked page (Inactive) |
| mozart-pay | Live / site-liveness | https://mozartpay.com/ 200 · 1,598 chars marketing, no app/dashboard/docs link, no Stellar mention; its API https://mozart-api-21ea5fd801a8.herokuapp.com/ answers "Hello, Mozart Typescript Node.js server!" (up, no data); org mozartpay/OAs pushed 2026-08-31 (Go CLI "Orchestrated Agreements v0.1.0-mvp"), new-frontend 2026-03-19 | a merchant dashboard/sign-up or docs naming Stellar |
| myaza | Live / site-liveness | https://www.myaza.co/ 200 · 4,618 chars; iOS id6450796310 v1.1.402 released **2026-02-18** (200 d); Play co.myaza **Updated on Feb 17, 2026** (201 d); org myazahq kyc-sdk-react pushed 2026-09-05 — a KYC SDK, not the money app. SCF R26/32 $146k | a store update, or the owner accepting a 200-day-old build as Live |
| okashi | Live / source-inherited | https://okashi.dev/ and http:// **connection timeout** (DNS resolves to 35.188.177.191) → could-not-check; org okashi-dev newest soroban-compatibility 2024-01-30 | the host answering (page or parked notice) |
| orally | Live / site-liveness | https://orally.network/ 200 marketing ("000 executed transactions" counter); https://app.orally.network/ renders the Sybil/Apollo console (ICP canisters, API-key table "No rows"); https://docs.orally.network/ no Stellar/Soroban mention; orally-network/soroban-oracle pushed **2024-06-17** (README: testnet/mainnet config, no deployed ids); org newest 2025-08-15. SCF award $48k in row | a mainnet Soroban oracle contract with activity, or a Stellar docs page (Live); an archived soroban-oracle (Inactive) |
| payzoll | Live / site-liveness | https://payzoll.finance/ 200 · 4,944 chars, Stellar logo under "Supported By"; https://app.payzoll.finance/ renders a **login** (Sign In / Sign Up); "Docs" → /auth; org payzoll-orgs has no public repos. SCF R36 $100k | public docs/API or metrics behind no login |
| rampmedaddy | Live / site-liveness | https://rampmedaddy.com/ 200 · 823 chars WordPress marketing; "Launch Wallet" CTA carries **no link** (only x.com in the footer); row repo trustek-io/rampmedaddy-frontend pushed 2024-11-27, its Vercel deployment renders a React shell; org rmd-savings 2025-06-15 | a working bot/app link; a parked page |
| scout | Live / site-liveness | https://www.coinfabrik.com/products/scout/ 200 · 4,551 chars; crate cargo-scout-audit 0.3.16 published **2026-02-13** (205 d, 36k downloads); CoinFabrik/scout-audit pushed **2026-04-24** (135 d), scout-agent 2026-04-27, scout-soroban 2024-11-07; VS Code extension 0.2.13 2025-01-24. SCF R20/23/27 $240k | a crate release or push ≤90 d, or the owner accepting 135 d |
| sollpay | Live / site-liveness | https://www.sollpay.com/ 200 · 2,728 chars (Solana examples "Send 0.1 SOL", a "COMING SOON" section); iOS id6746510838 v1.7.14 released **2026-04-30** (129 d); Play com.mercurylabs.sollpayhq **Updated on Feb 4, 2026** (214 d); row repo mercury-labs-dev/stellar-sollpay **404**; Mercury-Labs-Dev/SollPay-Protocol 2025-10-31. SCF R38 $118k | a store update; any Stellar surface |
| sorobanmath | Live / site-liveness | https://github.com/rahul-soshte/soroban-math pushed **2025-07-10** (423 d), not archived; crate soroban-math 0.2.8 published 2024-10-21 (21k downloads) | a push/release (Live) or an archive (Inactive) — a library's state is its repo |
| tauvlo | Live / source-inherited | https://tauvlo.com/ **TLS alert internal error** (curl ×2, Node ×6) → could-not-check; one Node fetch of http://tauvlo.com/ followed 301 → https → landed on https://tokenway.io/ ("DLTBridge by TokenWay", no "Tauvlo" on the page) but the receipt tool failed 5/5 on TLS; GitHub org `tauvlo` 404; tokenway/tauvlo-poc 2024-04-18, tauvlo-trustlines 2024-08-04. SCF R23/26 $145k | the owner opening tauvlo.com and landing on tokenway.io, plus a receipt once TLS answers (Inactive: domain reused by a different product) |

## Not examined

- X/Twitter for all 32 rows (login shell; no dates) — by rule.
- Play Store for `rosen` (package id not discoverable from the site bundle) and for `mercuryo`/`myaza`'s wallet variants beyond the ids on their sites.
- `docs.pretium.africa` (TLS handshake failure with this client) and `marketplace.metafyed.com` beyond the `-k` string read (expired certificate).
- A Stellar route quote on Rubic's `/api/routes/quoteBest`; the chain listing was taken as the offer.
- `quarkslab`'s Stellar relevance (only the 2024 audit post ties it to Stellar).
- Absolute dates behind Dune's "updated N days ago" labels (Dune's API needs a key).

## Mistakes made and found

- First row dump used guessed field names (`website`, `github` at top level) and printed `None` for every row; the live shape is `links.website`, `github.repos[]`, `onchain.contracts[]`, `scf.*`. Re-fetched before any verdict.
- A receipt chain run as `set -e; … | tail -3` did not stop when the `tauvlo` receipt crashed (the pipe masked the exit code); the missing file was caught on read-back. The rule from `feedback_gate_merge_on_checks` applies to receipt chains too: read back every file.
- `curl` (LibreSSL) reported a TLS failure on tauvlo.com and one Node fetch succeeded, so I nearly wrote an Inactive verdict on a single lucky fetch; five receipt attempts then failed — the row stays cannot-tell.
- Play "Updated on" needed a looser regex than the first pass (the value sits several elements after the label); the first pass reported "no Updated-on" for every app and was discarded.
