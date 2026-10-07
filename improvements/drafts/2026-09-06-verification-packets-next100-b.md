# Verification packets — next-100 batch B (34 rows, 2026-09-06)

Rule applied: the product-state rule from `2026-09-05-verification-packets-top100.md` (corrections block) and `…-medium-regraded.md` ("How to read a verdict"), with the instrument list from `2026-09-06-deep-verify-b.md`. A Live verdict rests on the product's own state — a store release ≤90 days (iTunes lookup `currentVersionReleaseDate`, Play "Updated on"), chain activity (stellar.expert / Horizon / Soroban RPC), a working app or its own data endpoint, or a docs page that documents the Stellar product specifically — never a banner, title, "Launch App" CTA or marketing claim; empty or zero page metrics veto Live; a raw fetch of a client-rendered shell is could-not-check until rendered in a browser or its data endpoint is read; the second signal must be this row's own repository pushed ≤90 days; Inactive needs a parked / retired / removed page or repo, receipted; timeouts, 403s, DNS and TLS failures are could-not-check.

Every URL below was fetched **2026-09-06 03:20–04:20 UTC**. `asOf` is the evidence's own date (a store release date, a ledger date, a repo push); where the evidence is a page observed today the entry says "observed 2026-09-06". Client-rendered pages were read raw (curl, browser UA) and, where the raw fetch was a shell, rendered in a real browser after a 6–8 s wait (pay.codeln.com, komunitin.org, grantpicks.com, legasixstellar.vercel.app, home.dobprotocol.com, lantern.finance, app.lantern.finance, cyvers.ai, app.kuratek.com, app.k3-labs.com, withobsrvr.com). GitHub via `gh api`; stores via the iTunes lookup/search API and the Play Store page's "Updated on"; chain via stellar.expert's API, Horizon and Soroban RPC `getEvents` (mainnet.sorobanrpc.com, latest ledger 64,295,443). X / Twitter was not used as evidence for any row.

Nothing here touched the database. **Every verdict here is a recommendation; the owner's approval of a MOVE is what makes it human-verified.**

Recommended: **Live 14 · Development 4 · Pre-Release 4 · Inactive 1 · cannot-tell 11** (34 rows).
Confidence: **high 9 · medium 10 · low 4 · n/a 11** (the 11 cannot-tell rows carry no confidence; they keep their current basis).
Deaths: **1** — `equitx` (removed repo, receipted). Renames found: `globachain` → Zynta (zynta.com), `horizon-as-a-service` → Obsrvr Gateway.

## Summary

| slug | today (status / basis) | → verdict | conf | deciding evidence (date) |
|---|---|---|---|---|
| codelnpay | Live / source-inherited | **Live** | high | Play Store CodeLnPay "Updated on Aug 24, 2026", 1K+ downloads; own repo pushed 2026-08-10 |
| coindisco | Live / site-liveness | **Live** | high | App Store Coindisco v0.3.98 released 2026-09-05; Play updated 2026-09-04; site lists Stellar among DEX-purchase networks |
| coinspect | Live / site-liveness | **Live** | medium | own blog post dated 2026-08-05; own repo wallet-security-ranking pushed 2026-09-04 — no Stellar surface anywhere |
| comunitaria | Live / site-liveness | **Live** | high | ILLA social currency on mainnet: payments on 2026-09-05, 09-01, 08-12…; own Stellar repos pushed 2026-06-24 |
| copperx | Live / site-liveness | cannot-tell | — | docs list Ethereum/Polygon/Solana/BNB/Base/Arbitrum/Optimism/Tron — no Stellar; app and status hosts did not answer |
| crossmint | Live / site-liveness | **Live** | high | docs Supported Chains: Stellar ✅ (mainnet + testnet); own repo crossmint-stellar-wallets-demo pushed 2026-08-31 |
| cryptoconexin | Live / site-liveness | cannot-tell | — | education page is a static glossary; newest site content 2025-12-16 (264 d); org repo 2024-04 |
| cyvers | Live / site-liveness | cannot-tell | — | B2B page renders claims only ("$500B secured"); docs password-gated; no Stellar mention; org repos are 2024 forks |
| dobprotocol | Live / site-liveness | **Development** | medium | the app's own API: 7 Stellar-mainnet pools, every `total_distributed` = 0, RPC 0 events in 7 d; DEX "Testnet"; contracts released 2026-08-06/07 |
| elsa | Live / site-liveness | cannot-tell | — | corporate page (Borderless / UrbanPay), no app, no Stellar mention, no repo |
| emigro | Live / site-liveness | **Pre-Release** | medium | site: "Coming soon … Join the waitlist … when Emigro opens" (pivot to an immigration app); wallet app last released 2025-12-24 (256 d) |
| equitx | Live / site-liveness | **Inactive** | medium | linked repo removed (GitHub 404, receipted); TLS cert expired 2025-10-07; page frozen at "© 2024", newsletter form only |
| extractor | Live / site-liveness | **Live** | high | docs Supported Networks: Non-EVM … Stellar; own docs repo haas-labs/ext-mintlify pushed 2026-08-25 |
| fastbuka | Live / site-liveness | **Live** | medium | App Store Choppaddi v1.0 released 2026-08-03; Play updated 2026-08-30 — Stellar not visible on site or listing |
| gladius | Live / site-liveness | **Pre-Release** | low | site: "sandbox versions", "JOIN PARENT APP WAITLIST"; all org repos idle since 2024-07 |
| globachain | Live / source-inherited | cannot-tell | — | globachain.com → zynta.com (rebrand); app.zynta.com "System Maintenance in Progress"; linked repo 404 |
| goldsky | Live / site-liveness | **Live** | high | docs: "Stellar datasets are no longer available through Mirror. Use Turbo pipelines for Stellar data" (Turbo lists Stellar); own docs repo pushed 2026-09-04 |
| grantpicks | Live / site-liveness | **Pre-Release** | medium | grantpicks.com renders "Coming Soon" ×2; app.grantpicks.com Vercel DEPLOYMENT_DISABLED (receipted); contracts testnet-only (Nov 2024) |
| hito-wallet | Live / source-inherited | cannot-tell | — | hito.xyz sells a hardware wallet ("Bitcoin, ETH, ERC20"), no Stellar mention, no store app found; firmware repo 2026-01-17 |
| horizon-as-a-service | Live / site-liveness | **Live** | low | Obsrvr Gateway docs ("authenticated access to Stellar Horizon, Stellar RPC"); gateway RPC answers 401 (auth-gated); site says "Now in early access" |
| hot-protocol | Live / site-liveness | **Live** | low | HOT Bridge docs list Stellar (`STELLAR = 1100`, USDC on Stellar); iOS 2026-01-15 and Play 2025-06-15 are outside 90 d |
| humantech | Live / site-liveness | **Development** | medium | WaaP docs: "multi-chain Web3 wallet … covering EVM, Sui, and Solana" — no Stellar; Human-Wallet-On-Stellar repo "on-going work", pushed 2026-03-02 |
| interlinked | Live / site-liveness | **Development** | medium | the product contract exists only on testnet (created 2026-07-01; mainnet: not found); site: "public beta" |
| interstellar | Live / site-liveness | cannot-tell | — | DNS resolves (207.148.21.222) but HTTP/HTTPS/browser all fail — could-not-check |
| irl | Live / site-liveness | **Live** | high | the app's own API serves locations/points today; own repo hurley87/refraction pushed 2026-09-03 |
| jetpad | Live / site-liveness | **Live** | high | App Store JetPad v1.0.6 released 2026-08-27; Play updated 2026-09-03 (listing names Stellar 10×) |
| js-capacitor-passkey-kit | Live / site-liveness | cannot-tell | — | linked repo 404; renamed repo pushed 2026-02-19; npm 0.0.5 published 2026-02-02 — idle 7 months, not archived |
| k3-labs | Live / site-liveness | **Live** | low | docs "Stellar Blockchain": mainnet + testnet supported (page "Last updated 1 year ago"); app marketplace renders; org repos idle since 2025-05 |
| komunitin | Live / site-liveness | **Live** | high | komunitin.org/groups lists 15+ live exchange communities; docs carry a "Stellar model" page; own repo pushed 2026-09-03 |
| kura | Live / site-liveness | cannot-tell | — | app is a sign-up shell; a Stellar Disbursement Platform instance exists (login only); plans say "Coming soon · Join Waitlist" |
| lantern | Live / source-inherited | cannot-tell | — | landing renders (XLM among 13 collateral assets) but app.lantern.finance renders blank; curl 403 (Cloudflare); org has no repos |
| legasi | Live / site-liveness | **Development** | medium | own repo README: "**Network**: Stellar Testnet (Soroban)", deploy checklist unchecked (pushed 2025-12-04); vercel MVP is a $0 simulator |
| liqvidxyz | Live / site-liveness | **Pre-Release** | medium | liqvid.xyz/launch: "Liqvid Protocol Beta will be available soon"; app is a Log In / Sign Up shell |
| loto-punto | Live / site-liveness | cannot-tell | — | Google-Sites company page for lottery/remittance kiosks; no Stellar mention; repo victuol/stellar 2025-02-03 |

## Rows

### codelnpay — CodeLnPay (Payments) · SCF R25/R33/R42 $147,223

Today: Live / source-inherited / 2026-08-19 / lumenloop yaml.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (raw) | https://pay.codeln.com/ | 200 · "CodelnPay" · 9 chars — client-rendered shell → could-not-check by fetch |
| website (browser, 6 s) | https://pay.codeln.com/ | renders "Web3-powered Payroll for Remote Workforce … Pay remote teams in fiat or USDC … Send salaries in USD, GBP, EUR, or USDC" — a marketing page with "Get Started" |
| Play Store | https://play.google.com/store/apps/details?id=com.codeln.codelnpay | "CodeLnPay" · **Updated on Aug 24, 2026** · 1K+ downloads · released Sep 5, 2025 · description "cross-border salary disbursement" |
| App Store | https://itunes.apple.com/search?term=codelnpay&entity=software&country=us | no iOS app |
| own repo | https://api.github.com/repos/CodelnGhana/codelnpay-project | pushed **2026-08-10** · README: code is private, links the Play listing and stellar.org |
| org | https://api.github.com/users/codelnghana/repos?sort=pushed | codelnpay-project 2026-08-10, then 2022 repos |

**RECOMMENDED: Live · high.** Deciding evidence: https://play.google.com/store/apps/details?id=com.codeln.codelnpay — "Updated on Aug 24, 2026" (13 d). Second signal: the row's own repo pushed 2026-08-10 (27 d). Stellar is named only in the repo README; the listing says USDC.

### coindisco — Coindisco (Payments) · SCF R30 $96,000

Today: Live / site-liveness / 2026-08-17 / https://coindisco.com/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://coindisco.com/ | 200 · "Coindisco \| The best way to buy crypto" · 6,859 chars · "Supported networks for DEX purchases: Ethereum, Base, Solana, BNB Smart Chain, **Stellar**, Arbitrum" · store links |
| App Store | https://itunes.apple.com/search?term=coindisco&entity=software&country=us | id6445888906 "Coindisco – Buy & Sell Crypto" · Coindisco Limited · v0.3.98 · `currentVersionReleaseDate` **2026-09-05** · first 2023-03-16 |
| Play Store | https://play.google.com/store/apps/details?id=com.coindisco | **Updated on Sep 4, 2026** · 5K+ downloads (listing text does not name Stellar) |
| linked repo | https://api.github.com/repos/coindisco/galaxy-ramp | **404** |
| org | https://api.github.com/users/coindisco/repos | 0 public repos |

**RECOMMENDED: Live · high.** Deciding evidence: https://itunes.apple.com/lookup?id=6445888906&country=us — release 2026-09-05 (1 d); the Play build of 2026-09-04 is the independent second signal. Row fix: `links.github` points at a removed repo (`coindisco/galaxy-ramp`); the org has nothing public.

### coinspect — Coinspect (Security) · no award

Today: Live / site-liveness / 2026-08-27 / https://coinspect.com/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://www.coinspect.com/ | 200 · "Coinspect: Web3 Security Services Beyond Smart Contract Audits" · 5,024 chars · services + Wallet Ranking; the word "Stellar" does not appear |
| blog | https://www.coinspect.com/blog | "Ill Bloom: Investigating a Wallet Generation Vulnerability…" **August 5, 2026**; "Introducing the Wallet Security Framework" July 16, 2026 |
| org | https://api.github.com/users/coinspect/repos?sort=pushed | wallet-security-ranking **2026-09-04**, wallet-security-framework 2026-09-01, dappfence 2026-06-01 |
| Stellar surface | site + blog grep | none |

**RECOMMENDED: Live · medium.** Deciding evidence: https://www.coinspect.com/blog — a post dated 2026-08-05 (32 d), plus the firm's own open-source repo pushed 2026-09-04. Like `ichi`, the open question is relevance, not liveness: nothing on the web shows a Stellar product or audit; the row has no award and no linked repo.

### comunitaria — Comunitaria (Payments) · SCF R34 $49,000

Today: Live / site-liveness / 2026-08-17 / https://comunitaria.com/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://comunitaria.com/ | 200 · "Comunitaria" · 1,589 chars · SBIC, "moneda social ILLA", latest post "O Porriño cambia su banco de alimentos por una tarjeta" **28 de agosto de 2026**; /moneda-social 404 |
| on-chain: asset | https://api.stellar.expert/explorer/public/asset?search=ILLA | ILLA-GCHNDY2LTV5VZYE3FRTRFN2GMENYBUNNP3IUY6TQKOIJSO2YLKCH5END · created 2025-11-12 · 212 payments lifetime · 116 trustlines |
| on-chain: activity | https://api.stellar.expert/explorer/public/asset/ILLA-GCHNDY2LTV5VZYE3FRTRFN2GMENYBUNNP3IUY6TQKOIJSO2YLKCH5END/stats-history | rows with payments on **2026-09-05** (1), 2026-09-01 (2), 08-12, 08-07, 08-06, 08-05, 08-01, 07-31 … — steady small-volume use; a new trustline authorised 2026-08-07 |
| on-chain: issuer | https://horizon.stellar.org/accounts/GCHNDY2LTV5VZYE3FRTRFN2GMENYBUNNP3IUY6TQKOIJSO2YLKCH5END/operations?order=desc&limit=5 | `allow_trust` ILLA + `create_account` 2026-08-07 |
| own repos | https://api.github.com/users/comunitaria/repos?sort=pushed | comunitaria-stellar-dashboard **2026-06-24**, comunitaria-stellar-wallet 2026-06-24 (README: Android wallets for the social currency, Horizon config) |
| linked repo | bitbucket.org/vestigiadesarrollo | not a GitHub repo; not fetched |
| stores | https://itunes.apple.com/search?term=comunitaria&entity=software&country=us | no Comunitaria app (Android APKs are self-built per the README) |

**RECOMMENDED: Live · high.** Deciding evidence: https://api.stellar.expert/explorer/public/asset/ILLA-GCHNDY2LTV5VZYE3FRTRFN2GMENYBUNNP3IUY6TQKOIJSO2YLKCH5END/stats-history — ILLA payments on 2026-09-05. The product's state is on-chain (the social currency moves), and the row's own Stellar repos were pushed 74 days ago. Row fixes: attach the ILLA asset under `onchain`; `links.github` → `comunitaria/comunitaria-stellar-wallet`.

### copperx — Copperx (Payments) · no award

Today: Live / site-liveness / 2026-08-17 / https://copperx.io/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://copperx.io/ | 200 · "Copperx \| Stablecoin Platform for Cross-Border Payments" · 2,447 chars · integrations "Stripe Private beta · Shopify Private beta"; no Stellar mention |
| docs | https://docs.copperx.io/getting-started/key-concepts-and-terminology | "Supported Chains … Ethereum, Polygon, Solana, BNB Smart Chain, Base, Arbitrum, Optimism, Tron" — **no Stellar** |
| app | https://app.copperx.io/ | no answer (transport failure) — could-not-check |
| status | https://status.copperx.io/ | no answer — could-not-check |
| org | https://api.github.com/users/copperxhq/repos?sort=pushed | countries 2026-06-05, mintlify-docs 2026-01-26, safe forks 2024 — none is the product |

**RECOMMENDED: cannot-tell.** No product-state instrument answered: the app and status hosts failed, the docs are live but list no Stellar chain, and the org has no product repo. Relevance flag: the product's own supported-chain list omits Stellar. What would decide: app.copperx.io rendering, or Stellar appearing in the docs' chain list.

### crossmint — Crossmint (Payments) · no award

Today: Live / site-liveness / 2026-08-27 / https://crossmint.com/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://crossmint.com/ → https://www.crossmint.com/ | 200 · "Stablecoin Platform & APIs for Enterprises \| Crossmint" · 7,049 chars |
| docs: chains | https://docs.crossmint.com/introduction/supported-chains | table row "**Stellar ✅ ✱ ✅ ✱ stellar stellar-testnet**"; "Stellar is supported in the EU and Rest of World, but not the US" for onramps |
| own Stellar repo | https://api.github.com/repos/Crossmint/crossmint-stellar-wallets-demo | pushed **2026-08-31** · "reference web app showcasing Crossmint wallet features on Stellar" · homepage crossmint-stellar-wallets-demo.vercel.app |
| org | https://api.github.com/users/crossmint/repos?sort=pushed | crossmint-sdk 2026-09-04, card-permissions-quickstart 2026-09-04, crossmint-checkout-swift 2026-09-03 |

**RECOMMENDED: Live · high.** Deciding evidence: https://docs.crossmint.com/introduction/supported-chains — the product's own docs list Stellar mainnet and testnet as supported (observed 2026-09-06), and a Stellar-specific repo of the product was pushed 6 days ago. Row fix: `links.github` → `Crossmint/crossmint-stellar-wallets-demo`.

### cryptoconexin — Cryptoconexión (Education) · SCF R25 $15,000

Today: Live / site-liveness / 2026-08-27 / https://cryptoconexion.com/stellar-edu.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://cryptoconexion.com/stellar-edu/ | 200 · "StellarEdu • CryptoConexión" · 13,402 chars · a bilingual Stellar glossary (testnet, transacción…) — static, undated |
| site home | https://cryptoconexion.com/ | 200 · newest articles "Devconnect 2025" **noviembre 25, 2025**, "¿Qué es Celo?" diciembre 16, 2025 — nothing in 2026 |
| org | https://api.github.com/users/cryptoconexion/repos?sort=pushed | onchain-loteria-frame 2024-04-23 |

**RECOMMENDED: cannot-tell.** The education page is the product and it is up, but it carries no date and the site's newest content is 264 days old; no wind-down statement either. What would decide: a dated 2026 post or course on the site.

### cyvers — CyVers (Security, AI) · SCF R26 $49,996

Today: Live / site-liveness / 2026-08-17 / https://cyvers.ai/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (raw) | https://cyvers.ai/ | 200 · 1,681 chars of Webflow CMS boilerplate ("manages 4 data types including testimonials") |
| website (browser, 6 s) | https://cyvers.ai/ | renders "#1 WEB3 THREAT PREVENTION … $500B Funds Secured · $800M Losses Prevented · 99.9% Accuracy · Book a Demo" — claims, no product surface |
| blog | https://cyvers.ai/blog | same CMS boilerplate; no dated posts readable |
| docs | https://docs.cyvers.ai/ | → /password — "Vigilens · Password Protected" |
| org | https://api.github.com/users/cyvers-ai/repos?sort=pushed | mapstructure fork 2024-11-30, cuid2 fork 2024-06-03, oswar 2024-02-14 |
| Stellar surface | site grep | none |

**RECOMMENDED: cannot-tell.** A B2B SaaS behind "Book a Demo" with password-gated docs; no metrics, app, store or chain surface, and no Stellar mention. What would decide: a dated blog post or changelog, or a Stellar page in the docs.

### dobprotocol — Dobprotocol (RWA) · SCF R37 $143,330

Today: Live / site-liveness / 2026-08-17 / https://linktr.ee/dobprotocol (the row's website is a Linktree).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| row website | https://linktr.ee/dobprotocol | 200 · Linktree · not a product page |
| product site | https://www.dobprotocol.com/ | 200 · 4,150 chars · "Capital Live · Token Studio Live · Validator Live · **Dex Testnet**" · "Asset Pipeline $79M · Live Deals 5 · Tokenized Assets 44+" (claims) · "Smart contracts undergoing formal audit" · Waitlist link |
| docs | https://docs.dobprotocol.com/ecosystem/networks/ | Token Studio pools: Stellar Mainnet "Yes"; API example `GET /api/pool?network_id=10`; contracts SEP-55 verified on Stellar mainnet + testnet |
| app (raw) | https://app.dobprotocol.com/ · https://home.dobprotocol.com/ | 12-char Angular shells → could-not-check by fetch |
| app (browser, 8 s) | https://home.dobprotocol.com/ | featured card "Stellar Mainnet · Andes Quantum Data Centers · ESTIMATED APR 22.7% · **PARTICIPANTS 0 / 1,000,000 · TOTAL DISTRIBUTED 0 · NEXT PAYOUT Not scheduled**"; /marketplace → "To see this content, sign in" |
| app's own API | https://home.dobprotocol.com/api/pool/featured?network_id=10 | 200 · 9 featured pools: 7 on `stellar-mainnet` (Qhuyiri Drilling CASEG6…, Planta Solar Atacama CCT5TL…, AQDC CCRPQ4…, eHive Airdrop Pool CDAI6K…, SolarData CDPNBR…, NetSpot CDH276…, Micro Hidroeléctrica CCFDWR…) — **every `total_distributed` = "0"**, `num_participants` 0/0/0/1/1/1/64 (the 64 is an airdrop pool), `next_distribution_text` "Not scheduled" on five; 2 pools on Base (169 USDC distributed on one) |
| on-chain | https://api.stellar.expert/explorer/public/contract/CDAI6KE62VKO6BDTL7TZX3DVWHUZEIQYMNVUQGP2REEA66ZWX3E2AC4B (and CASEG6…, CCRPQ4…, CCFDWR…) | real mainnet contracts: created 2026-02-19 / 04-24 / 06-20 / 06-26, storage 66 / 1 / 1 / 3 entries |
| on-chain: RPC getEvents (7-day window, 5 pool contracts) | POST https://mainnet.sorobanrpc.com `getEvents` startLedger 64175443 | **0 events** |
| DEX | https://dex.dobprotocol.com/ | 200 · bundle carries "Testnet"; stellar-exit-contracts README: "Live on **testnet** since 2026-08-17 … Nothing is deployed to mainnet." |
| own repos | https://api.github.com/repos/Dobprotocol/stellar-distribution-contracts | pushed **2026-08-07**; releases splitter v2.2.0 2026-08-06, crowdfunding v0.3.0 2026-08-07; README "Deployed Contracts · Mainnet · Splitter" (WASM hash only); org: stellar-exit-contracts 2026-08-19 |

**RECOMMENDED: Development · medium.** Deciding evidence: https://home.dobprotocol.com/api/pool/featured?network_id=10 — the product's own API shows seven Stellar-mainnet pools with zero distributed and no events this week (observed 2026-09-06); the DEX is on testnet by its own README. Lesson-2 veto: zero metrics on the product's own surface. Not Inactive: contracts were released a month ago and the org pushed 18 days ago. Live is the alternative if the owner reads deployed mainnet pools with a handful of participants as a live product; the deciding URL supports either. Row fix: `links.website` → https://www.dobprotocol.com (the Linktree is not the product).

### elsa — Elsa (Wallet, Payments) · no award

Today: Live / site-liveness / 2026-08-17 / https://elsa.care/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://elsa.care/ | 200 · "Elsa Care Technologies — Payments technology" · 2,517 chars · products Borderless / UrbanPay, "Programmable USDC escrow", "Investor portal"; no app link, no store link, no Stellar mention |
| stores | https://itunes.apple.com/search?term=elsa+care&entity=software&country=us | no Elsa fintech app |
| org | https://api.github.com/users/elsa-care/repos | 404 (no such org) |

**RECOMMENDED: cannot-tell.** Corporate page only; nothing shows product state and nothing shows a wind-down. What would decide: an app / dashboard URL or a store listing.

### emigro — Emigro (Payments, Wallet) · no award

Today: Live / site-liveness / 2026-08-17 / https://emigro.co/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://emigro.co/ | 200 · "Emigro — Your move to Brazil, in one place" · 3,057 chars · "**Join the waitlist** … **Coming soon** … Join the early-access list … we'll let you know **when Emigro opens**" — an immigration-guidance app, not the payments wallet the row describes |
| App Store | https://itunes.apple.com/search?term=emigro&entity=software&country=us | id6475793514 "Emigro \| Pay Without Borders" · Emigro Inc. · v2.10.0 · released **2025-12-24** (256 d) · bundle co.emigro.app |
| Play Store | https://play.google.com/store/apps/details?id=co.emigro.app | "Updated on Dec 24, 2025" · 100+ downloads |
| org | https://api.github.com/users/emigro/repos | 0 public repos |

**RECOMMENDED: Pre-Release · medium.** Deciding evidence: https://emigro.co/ — the product's own page is a waitlist for a product that "opens" later (observed 2026-09-06). The Stellar wallet ("Pay Without Borders") still installs but its last release is 256 days old and the site no longer describes it. Downgrade presented, not asserted: if the owner reads the wallet as retired, that needs a retirement statement (none found) — this file does not recommend Inactive.

### equitx — EquitX (RWA) · SCF R26/R31 $150,300

Today: Live / site-liveness / 2026-08-17 / https://equitx.com/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (TLS) | https://equitx.com/ | Python: `certificate has expired`; `openssl s_client`: **notAfter Oct 7 11:14:54 2025 GMT** (expired 11 months) |
| website (curl -k) | https://equitx.com/ | 200 · "EquitX" · 1,037 chars · "Private Equity, Publicly Empowered · Join The Movement · Get Exclusive Insights & Updates · Subscribe · **© 2024**" — a newsletter form, no app, no Stellar mention |
| linked repo | https://api.github.com/repos/EquitXCompany/equitx-project | **404 "Not Found"** |
| org | https://api.github.com/users/equitxcompany/repos | 0 public repos |
| stores | — | none named anywhere |

**RECOMMENDED: Inactive · medium.** Deciding evidence: https://api.github.com/repos/EquitXCompany/equitx-project — the product's only artifact was removed (observed 2026-09-06), the site's certificate lapsed in October 2025 and the page has not moved since 2024. Same class as `didstellar` / `transfermole` (removed repo, not a wind-down statement) — the weakest Inactive class; SCF $150,300 is a reason for an owner look before applying. Receipt (run, marker FOUND in text): `pnpm exec tsx scripts/data/capture-receipt.ts equitx https://api.github.com/repos/EquitXCompany/equitx-project "Not Found"` → `improvements/receipts/equitx-2026-09-06.json` (httpStatus 404).

### extractor — Extractor (Security) · SCF R21 $50,000

Today: Live / site-liveness / 2026-08-27 / https://extractor.live/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://www.extractor.live/ | 200 · "Extractor by Hacken \| On-Chain Risk Monitoring…" · 8,170 chars · "EVM and non-EVM chains, including … **Stellar**, ICP, VeChain" · Log In |
| docs: networks | https://docs.extractor.live/supported-networks | "Non-EVM: Bitcoin, Tron, **Stellar**, VeChain, ICP, ZetaChain, Somnia" |
| docs index | https://docs.extractor.live/llms.txt | Security Monitoring, AML Detector, Advanced Monitoring triggers |
| linked repo | https://api.github.com/repos/haas-labs/extractor | pushed 2024-05-01 ("Extractor Product", 0 stars) — idle |
| own docs repo | https://api.github.com/repos/haas-labs/ext-mintlify | pushed **2026-08-25** (the Extractor docs source) |
| org | https://api.github.com/users/haas-labs/repos?sort=pushed | ext-mintlify 2026-08-25, core3-pol-detectors 2026-08-18, severity-formula 2026-06-16 |

**RECOMMENDED: Live · high.** Deciding evidence: https://docs.extractor.live/supported-networks — the product's own docs list Stellar as a monitored network (observed 2026-09-06); the docs repo was pushed 12 days ago. The product itself is login-gated (no metrics visible). Row fix: `links.github` → `haas-labs/ext-mintlify` (the linked repo is idle since 2024).

### fastbuka — Fastbuka / Choppaddi (Payments) · SCF R9/R35/R38/R44

Today: Live / site-liveness / 2026-07-10 / https://choppaddi.com/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://choppaddi.com/ | 200 · "Choppaddi" · 4,416 chars · "One Marketplace. Shop everything. Pay anyone" · store links; grep stellar/xlm/usdc/crypto: **none** |
| old domain | https://fastbuka.com/ | 503 "no available server" |
| App Store | https://itunes.apple.com/search?term=choppaddi&entity=software&country=us | id6761775761 "Choppaddi" · Progress Eyaadah · v1.0 · released **2026-08-03** · bundle com.fastbuka.customer |
| Play Store | https://play.google.com/store/apps/details?id=com.fastbuka.customer | "Updated on **Aug 30, 2026**" · 100+ downloads · description: food/marketplace, "wallet, cards" — no Stellar |
| org | https://api.github.com/users/fastbuka/repos?sort=pushed | welcome.fastbuka.com 2025-03-08 |

**RECOMMENDED: Live · medium.** Deciding evidence: https://itunes.apple.com/lookup?id=6761775761&country=us — a store release 2026-08-03, with the Play build of 2026-08-30 as the second signal. Medium, not high: the Stellar integration the SCF awards funded is not visible on the site, the listings or any public repo — Live says "the company's marketplace app ships", not "the Stellar rail is live".

### gladius — Gladius (Gaming, NFT) · SCF R23 $45,000

Today: Live / site-liveness / 2026-08-17 / https://gladiusclub.com/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://gladiusclub.com/ | 200 · "Gladius" · 1,877 chars · "We have prepared a **sandbox versions** of Club Coach and Athlete apps … TRY STUDENT APP … Pay for Sport Clubs subscriptions using Stellar Anchors … **JOIN PARENT APP WAITLIST**" |
| docs | https://gladiusclub.gitbook.io/docs | "The Gladius Club Economic Model · Gladius Coin Emitter Contract · Subscriptions Contract · NFT Contract · Stellar Anchors and Payments" — design docs, undated |
| org | https://api.github.com/users/gladiusclub/repos?sort=pushed | gladius-backend 2024-07-28, gladius-contracts 2024-07-26, gladius-frontend 2024-05-27 — all idle ~2 years |
| stores | https://itunes.apple.com/search?term=gladius+club&entity=software&country=us | no Gladius app |

**RECOMMENDED: Pre-Release · low.** Deciding evidence: https://gladiusclub.com/ — the product's own words are "sandbox" and "waitlist" (observed 2026-09-06). Low because the only dated signals are repos idle since July 2024: this reads as a stalled pre-launch rather than an active one, but no parked or retired page exists, so Inactive is not available under the rule. What would move it: an owner who knows the team, or a store/app release.

### globachain — Globachain → Zynta (Payments) · SCF R29/R36 $138,500

Today: Live / source-inherited / 2026-08-19 / lumenloop yaml (no website in row).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| domain | https://globachain.com/ · https://globachain.io/ | both 301 → **https://zynta.com/** · "Zynta — Stablecoin Payment Infrastructure for Africa & Europe" · 9,764 chars · "Convert between fiat and crypto across Solana, Ethereum, **Stellar**, and more" · "$300M+ Processed" (claim) · row's X handle is @zyntafinance |
| API page | https://zynta.com/api-services/ | "Sandbox Environment · SDKs Node.js, Python, PHP · OpenAPI spec" — no public docs URL |
| app | https://app.zynta.com/login/personal | 200 · "**System Maintenance in Progress** … temporarily unavailable due to routine updates" |
| linked repo | https://api.github.com/repos/Blocverse01/Globachain-DApp | **404**; org globachain 0 repos; user Blocverse01's newest are azza-* repos (2026-08-30) — a different name again, not row data |
| SCF | https://communityfund.stellar.org/backend/projects (list) | globachain-lbs · "Applications" · last awarded round 36 |

**RECOMMENDED: cannot-tell.** The project rebranded to Zynta and its app is in maintenance today; nothing verifies product state and nothing says retired. Row fixes regardless of verdict: `links.website` → https://zynta.com, name/alias "Zynta", drop the 404 repo. What would decide: app.zynta.com back up, public API docs, or a store listing.

### goldsky — Goldsky (Analytics) · SCF R19 $128,000

Today: Live / site-liveness / 2026-08-17 / https://goldsky.com/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://goldsky.com/ | 200 · "Real-time Blockchain Data for Onchain Finance - Goldsky" · 6,895 chars · Stellar named |
| docs: networks | https://docs.goldsky.com/chains/supported-networks | "**Stellar** — Stellar datasets are no longer available through Mirror. Use Turbo pipelines for Stellar data"; Turbo "is the only product that supports these non-EVM sources: Solana, Bitcoin, Stellar, NEAR" |
| linked repo | https://api.github.com/repos/indexed-xyz/docs | pushed 2025-04-29 (indexed.xyz docs — an older Goldsky property) |
| own docs repo | https://api.github.com/repos/goldsky-io/mintlify-docs | pushed **2026-09-04** |
| org | https://api.github.com/users/goldsky-io/repos?sort=pushed | streamling 2026-09-05, streamling-community-plugins 2026-09-04, documentation-examples 2026-09-01 |

**RECOMMENDED: Live · high.** Deciding evidence: https://docs.goldsky.com/chains/supported-networks — the product's own docs document Stellar support (via Turbo pipelines; Mirror dropped it) (observed 2026-09-06); the docs repo was pushed 2 days ago. Row fix: `links.github` → `goldsky-io/mintlify-docs`; note the Stellar surface moved from Mirror to Turbo.

### grantpicks — GrantPicks by PotLock (Social Impact) · SCF R27 $50,000

Today: Live / site-liveness / 2026-08-27 / https://potlock.org/ (the parent's site).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| row website | https://potlock.org/ → https://www.potlock.org/ | 200 · "POTLOCK \| Open Funding Stack & AI-PGF" · 21,786 chars — the parent, not GrantPicks |
| product site (raw) | https://grantpicks.com/ → www | 200 · 10 chars — shell |
| product site (browser, 7 s) | https://www.grantpicks.com/ | renders "GrantPicks · **Coming Soon** · Introducing GrantPicks · HEAD TO HEAD CONTESTS FOR PROJECT FUNDING · Coming Soon · Learn More" |
| app | https://app.grantpicks.com/ | **402 · "Payment required · DEPLOYMENT_DISABLED"** (Vercel) |
| own repo | https://api.github.com/repos/PotLock/grantpicks | pushed 2026-03-10 (180 d) · README: Staging staging.grantpicks.com, Testnet testnet.grantpicks.com, "Stellar Contracts **Testnet** (Updated: 5th Nov 2024)" CABHQG…, CBEW52…, CBG2JA… |
| org | https://api.github.com/users/potlock/repos?sort=pushed | django-indexer 2026-07-26, aipgf-landing 2026-06-16 — not this product |

**RECOMMENDED: Pre-Release · medium.** Deciding evidence: https://www.grantpicks.com/ — the product's own landing says "Coming Soon" twice (observed 2026-09-06); its app deployment is disabled and its contracts were only ever listed on testnet. Inactive is the alternative (a disabled deployment is the `muwp` class) — the receipt is already captured in case the owner takes it: `pnpm exec tsx scripts/data/capture-receipt.ts grantpicks https://app.grantpicks.com/ "DEPLOYMENT_DISABLED" "Payment required"` → `improvements/receipts/grantpicks-2026-09-06.json` (httpStatus 402, both markers FOUND in text). Row fix: `links.website` → https://www.grantpicks.com.

### hito-wallet — Hito Wallet (Wallet) · SCF R38 $50,000

Today: Live / source-inherited / 2026-08-19 / lumenloop yaml.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (TLS) | https://hito.xyz/ | Python: hostname mismatch (cert CN=www.hito.xyz, valid 2026-08-20 → 2026-11-18); curl follows fine |
| website | https://hito.xyz/ | 200 · "Hito. Crypto Wallet" · 5,019 chars · hardware cold wallet, "600+ digital assets — including Bitcoin, ETH, and ERC20 tokens", shop link; **no Stellar / XLM mention**, no store links |
| stores | https://itunes.apple.com/search?term=hito+wallet&entity=software&country=us (also gb, ee, de) | no Hito app |
| linked repo | https://api.github.com/repos/mishabunte/hito-firmware-rust | pushed 2026-01-17 (232 d) |
| user | https://api.github.com/users/mishabunte/repos?sort=pushed | hito-zcash-milestone-3 2026-09-01, Human-Bond 2026-08-02 — Zcash work, not Stellar |

**RECOMMENDED: cannot-tell.** The company sells a wallet, but nothing public shows Stellar support shipped (the SCF-funded deliverable) and nothing shows retirement. What would decide: Stellar/XLM in the wallet's supported-asset list, a firmware release ≤90 d, or the companion app in a store.

### horizon-as-a-service — Horizon-as-a-Service → Obsrvr Gateway (RPC) · SCF R11/R13 $32,500

Today: Live / site-liveness / 2026-08-27 / https://withobsrvr.com/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (raw) | https://www.withobsrvr.com/ | 200 · 63 chars — shell |
| website (browser, 6 s) | https://withobsrvr.com/ | "OBSRVR · **Now in early access · SCF #42** · Ship on Stellar without building the data layer … Request access"; the "ledger-stream · mainnet live · seq 62,551,419" ticker is a mock (mainnet is at 64.29M; timestamps fixed at 14:33) |
| docs | https://docs.withobsrvr.com/ | 200 · "All systems operational · ledger 55,812,406" (stale figure) · products Lake / Flow / **Gateway** ("Drop-in Horizon and Stellar RPC access") |
| docs: Gateway | https://docs.withobsrvr.com/docs/gateway/overview/ | "Gateway provides authenticated access to Stellar Horizon, Stellar RPC, and Lake APIs" · endpoints gateway.withobsrvr.com/horizon/mainnet, /rpc/mainnet, /lake/v1/mainnet |
| RPC | POST https://gateway.withobsrvr.com/rpc/mainnet/ `getHealth` | **401 "Unauthorized: Missing or invalid Authorization header"** — the endpoint exists and is key-gated |
| legacy nodes | https://rpc.nodeswithobsrvr.co/ · https://stellar.nodeswithobsrvr.co/ | no answer (transport failure) |
| linked repo | https://api.github.com/repos/withObsrvr/nomad-pack-web3-registry | pushed 2025-08-15 (387 d) — a Nomad pack registry, not the product |
| docs repo | https://api.github.com/repos/withObsrvr/docs | pushed 2026-05-16 (113 d) |
| org | https://api.github.com/users/withobsrvr/repos?sort=pushed | stellarbeat 2026-08-24, rs-stellar-history-archive-hasher 2026-08-24, stellar-extract 2026-08-18, obsrvr-stellar-components 2026-08-06 |

**RECOMMENDED: Live · low.** Deciding evidence: https://docs.withobsrvr.com/docs/gateway/overview/ — the product's own docs document the hosted Horizon/RPC gateway (observed 2026-09-06), and the gateway host answers (401 without a key). Low because no instrument returned data: the RPC is key-gated, the docs' ledger counter is stale, and no row-linked repo moved in 90 days (org repos did). Downgrade presented, not asserted: the site labels the platform "Now in early access" — Pre-Release if the owner holds that line. Row fixes: name → "Obsrvr (Gateway)"; `links.github` → `withObsrvr/docs` or `withObsrvr/stellar-extract`.

### hot-protocol — HOT Protocol (Security) · no award

Today: Live / site-liveness / 2026-08-17 / https://hot-labs.org/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://hot-labs.org/ | 200 · "HOT Protocol \| HOT Labs \| Chain abstraction" · 5,411 chars · "30M+ Total wallets · 1B+ Transactions" (claims) · roadmap "Stellar Bridge 100%" · partners list "Stellar Foundation" |
| docs | https://docs.hotdao.ai/ · https://docs.hotdao.ai/omni-tokens.md | HOT Bridge page: "on Stellar: `Asset("USDC", "PUBLIC_NETWORK_PASSPHRASE").to_xdr_bytes()`", chain id "STELLAR = 1100" — Stellar is a documented bridge target |
| App Store | https://itunes.apple.com/search?term=HOT+Wallet&entity=software&country=us | id6740916148 "HOT — Crypto Wallet" · HERE Wallet, Inc · v1.0.3 · released **2026-01-15** (234 d) |
| Play Store | https://play.google.com/store/apps/details?id=app.herewallet.hot | "Updated on **Jun 15, 2025**" · 500K+ downloads · listing names Stellar 4× |
| Telegram mini-app | https://t.me/herewalletbot/app | not checkable from here |
| linked repo | https://api.github.com/repos/hot-dao/hot-connector → hot-dao/kit | pushed 2026-02-20 (198 d) |
| org | https://api.github.com/users/hot-dao/repos?sort=pushed | pitchtalk-hachathon 2026-07-06, hot-validation-sdk 2026-06-14, omni-sdk 2026-04-30 |
| on-chain | https://api.stellar.expert/explorer/public/asset?search=hot-labs | no HOT-domain asset; no bridge contract address published in the docs |

**RECOMMENDED: Live · low.** Deciding evidence: https://docs.hotdao.ai/omni-tokens.md — the product's own bridge docs document Stellar specifically (observed 2026-09-06). Low: both store builds are outside 90 days, the main product is a Telegram mini-app this check cannot open, and no on-chain bridge address is published. cannot-tell is the alternative if the owner wants a dated signal.

### humantech — human.tech (Wallet) · SCF R34 $150,000

Today: Live / site-liveness / 2026-08-17 / https://human.tech/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://human.tech/ | 200 · "human.tech" · 8,100 chars · now "AI strategy consultations for organizations · Put AI to work & keep humans in the loop" — the company page |
| product portal | https://welcome.human.tech/ | 200 · 129 chars · "Human Passport · Human Wallet · Begin by verifying your humanity · Connect Wallet" |
| wallet docs | https://docs.wallet.human.tech/ → https://docs.waap.human.tech/ · llms.txt | "WaaP is a multi-chain Web3 wallet by human.tech covering **EVM, Sui, and Solana**" · Supported chains pages: EVM, Sui — **no Stellar** |
| linked repo | https://api.github.com/repos/holosoe/Human-Wallet-On-Stellar | pushed **2026-03-02** (188 d) · README: "refer to `stellar` branch for the **on-going work**", WIP docs |
| org | https://api.github.com/users/holonym-foundation/repos?sort=pushed | id-server 2026-09-03, waap-help-center 2026-09-03 (the company is active; none of these is the Stellar wallet) |

**RECOMMENDED: Development · medium.** Deciding evidence: https://docs.waap.human.tech/ — the wallet's own docs list EVM, Sui and Solana and no Stellar (observed 2026-09-06), while the Stellar wallet repo calls itself on-going work and last moved in March. The company is alive; the Stellar product is in development. Live is the alternative only if the owner reads "human.tech" as the company rather than the Stellar wallet the SCF award funded.

### interlinked — Interlinked (SDK) · SCF R36 $30,000

Today: Live / site-liveness / 2026-08-17 / https://inl.one/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://inl.one/ | 200 · "Interlinked" · 3,889 chars · "Short links, backed by a public ledger … **Live on Stellar** … No account required to create a public link … Is Interlinked still in beta? **Yes — we're in public beta** … Core functionality is live on-chain today"; link builder renders server-side; /api/health 200 |
| docs | https://interlinked-1.gitbook.io/interlinked-docs | 200 · GitBook, no network stated on the landing |
| linked repo | https://api.github.com/repos/antontat27/interlinked-backend | **404** |
| own repo (renamed) | https://api.github.com/repos/antontat27/interlinked | pushed **2026-07-02** (66 d) · README: `STELLAR_NETWORK` default `testnet`; deployed contract CCBGT2AD2GW5UCNFVP6WA46LK6CDDEUSFQBWF6EKEX5T63TA3L2RLPND |
| on-chain: mainnet | https://api.stellar.expert/explorer/public/contract/CCBGT2AD2GW5UCNFVP6WA46LK6CDDEUSFQBWF6EKEX5T63TA3L2RLPND | "Contract was not found on the ledger" (also CBKR4W… not found) |
| on-chain: testnet | https://api.stellar.expert/explorer/testnet/contract/CCBGT2AD2GW5UCNFVP6WA46LK6CDDEUSFQBWF6EKEX5T63TA3L2RLPND | created **2026-07-01** · 14 storage entries — real use, on testnet |
| bundle | https://inl.one/_/js/web_auth.js | no network passphrase or Horizon host in the client JS (the write happens server-side) |

**RECOMMENDED: Development · medium.** Deciding evidence: https://api.stellar.expert/explorer/testnet/contract/CCBGT2AD2GW5UCNFVP6WA46LK6CDDEUSFQBWF6EKEX5T63TA3L2RLPND — the only deployed product contract is on testnet, and the same id does not exist on mainnet (observed 2026-09-06); the site itself says "public beta". Presented, not asserted: the site also says "Live on Stellar", and a link can be created without an account — if the owner knows the service writes to mainnet (a newer contract the README does not name), Live/medium on the same page. Row fix: `links.github` → `antontat27/interlinked`.

### interstellar — Interstellar (Wallet, DEX) · no award

Today: Live / site-liveness / 2026-07-16 / https://interstellar.exchange/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://interstellar.exchange/ | Python: timeout; curl http + https: 000 (connection failed); browser: navigation failed |
| DNS | `dig interstellar.exchange` | CNAME proxy.interstellar.cm → 207.148.21.222 (resolves) |
| org | https://api.github.com/users/stellarterm/repos?sort=pushed | stellarterm 2026-08-25 — the StellarTerm client, a different product from the row's website |

**RECOMMENDED: cannot-tell (could-not-check).** The host resolves but never answers; a transport failure is not a death observation. What would decide: the site answering (or a parked page) on a re-check, or the owner confirming the row's relation to StellarTerm.

### irl — IRL (NFT) · SCF R38 $137,000

Today: Live / site-liveness / 2026-07-13 / https://irl.energy/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://irl.energy/ → https://www.irl.energy/ | 200 · "IRL" · 4,330 chars · "Your Global Guide To What's Good · New York … 2000+ DJs, musicians, and visual artists" · SIGN UP |
| app's own API | https://www.irl.energy/api/locations | **200 · `{"success":true,"data":{"locations":[{"id":16676,"name":"DAYS", …"points_value":100,…}` — live location/points data** (undated records) |
| own repo | https://api.github.com/repos/hurley87/refraction | pushed **2026-09-03** (3 d) · README "IRL is a rewards app for cultural events and locations … Stellar / Soroban (optional): auto-selects testnet in development and **mainnet in production**", contract addresses via env (not published); feature status "Live: Privy auth, interactive map, check-ins…" |
| stores | https://itunes.apple.com/search?term=IRL+energy&entity=software&country=us | no IRL app (web app) |

**RECOMMENDED: Live · high.** Deciding evidence: https://www.irl.energy/api/locations — the product's own backend serving its data (observed 2026-09-06), with the row's own repo pushed 3 days ago. Relevance note: the Stellar contracts are configured by environment and not published, so Stellar usage is not visible from outside; the SCF award (R38) is the reason the row exists.

### jetpad — JetPad (Payments) · SCF R34/R43 $150,000

Today: Live / site-liveness / 2026-08-17 / https://jetpad.finance/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://jetpad.finance/ | 200 · "JetPad Wallet - The Ultimate Web3 Smart Wallet" · 5,118 chars · Stellar named · store links |
| App Store | https://itunes.apple.com/lookup?id=6748644408&country=ng | "JetPad: Buy & Sell Crypto" · Jetpad Digital Limited · v1.0.6 · `currentVersionReleaseDate` **2026-08-27** · first 2025-10-07 · bundle com.jetpadwallet.app |
| Play Store | https://play.google.com/store/apps/details?id=com.jetpadwallet.app | "Updated on **Sep 3, 2026**" · 100+ downloads · listing names Stellar 10× |
| linked repo | https://api.github.com/repos/jetpad-digital-limited/jetpad-wallet | **404**; org has 0 public repos |

**RECOMMENDED: Live · high.** Deciding evidence: https://itunes.apple.com/lookup?id=6748644408&country=ng — release 2026-08-27 (10 d); the Play build of 2026-09-03 is the independent second signal, and the listing itself names Stellar. Row fix: the linked repo is gone.

### js-capacitor-passkey-kit — JS-Capacitor Passkey Kit (SDK, Security) · SCF R40 $10,000

Today: Live / site-liveness / 2026-08-17 / https://argo-navis.dev/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://argo-navis.dev/ | 200 · "Argo Navis Dev" · 2,094 chars · the vendor's studio page (Stellar / Soroban services) |
| linked repo | https://api.github.com/repos/argo-navis-dev/js-capacitor-passkey-kit | **404** |
| own repo (renamed) | https://api.github.com/repos/Argo-Navis-Dev/capacitor-passkey-plugin | pushed **2026-02-19** (199 d) · not archived · "WebAuthn based passkey creation and authentication across Android, iOS, and web" |
| npm | https://registry.npmjs.org/capacitor-passkey-plugin | repository → Argo-Navis-Dev/capacitor-passkey-plugin · versions 0.0.2 2025-08-28 … **0.0.5 2026-02-02** |
| org | https://api.github.com/users/argo-navis-dev/repos?sort=pushed | php-anchor-sdk 2026-03-29, capacitor-passkey-plugin 2026-02-19, capacitor-passkey-demo 2026-02-14 |

**RECOMMENDED: cannot-tell.** An SDK's state is its repo and package: published, 7 months idle, not archived — neither a live signal in the window nor a retirement (the `open-gamefi-sdk` class). Row fix: `links.github` → `Argo-Navis-Dev/capacitor-passkey-plugin`. What would decide: a release/publish ≤90 d, or the repo archived.

### k3-labs — K3 Labs (SDK) · SCF R31 $75,000

Today: Live / site-liveness / 2026-08-27 / https://k3-labs.com/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://k3-labs.com/ → www | 200 · "K3 Labs - Blockchain. Made. Simple" · 2,371 chars · AI orchestrations · Sign in |
| docs: Stellar | https://docs.k3-labs.com/introduction/stellar-blockchain | "K3 Labs now fully supports the Stellar blockchain, including Soroban smart contracts, across both **mainnet and testnet**" · triggers/read/write against mainnet contracts (Blend example CDVQVK…) · "**Last updated 1 year ago**"; a second page "Deploying & Writing to a Stellar Smart Contract (Oracle Example)" |
| app (raw) | https://app.k3-labs.com/ | 7 chars — shell |
| app (browser, 6 s) | https://app.k3-labs.com/ | renders "Web3 Orchestrator … Agent Marketplace · All Agents · Free Agents · Premium Agents" (marketplace shell before sign-in; no counts visible) |
| org | https://api.github.com/users/k3-labs/repos?sort=pushed | stellar-data-contract 2025-05-12, safe-module 2025-03-28, stellar-increment-contract 2025-03-13 — idle 16 months |

**RECOMMENDED: Live · low.** Deciding evidence: https://docs.k3-labs.com/introduction/stellar-blockchain — the product's own docs document the Stellar integration specifically, mainnet included (observed 2026-09-06). Low: the page is a year old by its own footer, the app shows no state before sign-in, and every org repo is idle. cannot-tell is the alternative if the owner wants a dated signal.

### komunitin — Komunitin (Payments, Security) · SCF R26 $44,850

Today: Live / site-liveness / 2026-08-17 / https://komunitin.org/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (raw) | https://komunitin.org/ | 200 · 9 chars — shell |
| website (browser, 6 s) | https://komunitin.org/ | "Open System for Exchange Communities · FIND YOUR LOCAL COMMUNITY · LOG IN · NEW COMMUNITY" |
| app: groups | https://komunitin.org/groups (browser) | lists real communities: El Poblet (COOP), Autocostruttori (SUDO), De Gota en Gota, ECO Tarragona (ECOS), Ecoxarxa del Bages (HORA), Ecoxarxa Garrotxa, Greencoin, LocalforLocal (NGI), Rete di scambio Pesaro-Urbino, Sinèrgics Coworking, TimeInWest, Xarxa FLOC, Xarxa La Clota … each with EXPLORE / SIGN UP |
| docs | https://docs.komunitin.org/ · llms.txt | "Technology › Accounting › **Stellar model**" (https://docs.komunitin.org/technology/accounting/stellar-model) — the Stellar-specific design page |
| demo | https://demo.komunitin.org/ | same client shell (renders the app) |
| own repo | https://api.github.com/repos/community-exchange-network/komunitin | pushed **2026-09-03** (3 d) · 22 stars · "Open System for Exchange Communities" |
| org | https://api.github.com/users/community-exchange-network/repos?sort=pushed | komunitin 2026-09-03, community-exchange-network-website 2026-09-03 |

**RECOMMENDED: Live · high.** Deciding evidence: https://komunitin.org/groups — the app serving its live community directory (observed 2026-09-06), with the row's own repo pushed 3 days ago and a docs page dedicated to the Stellar accounting model.

### kura — Kura (Payments) · SCF R27/R31 $147,300

Today: Live / site-liveness / 2026-08-27 / https://kuratek.com/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://www.kuratek.com/ | 200 · "Kura Payments" · 3,185 chars · every plan tile "Spending Limit **Coming soon** … **Join Waitlist**"; a "Send money now · Sponsor" one-time flow |
| app (raw) | https://app.kuratek.com/ | 200 · 0 chars — shell |
| app (browser, 7 s) | https://app.kuratek.com/ | "Kura Finance · Create an account · Sign up as Sponsor / Vendor · Phone Number · Cybrid User Agreement" — a sign-up gate |
| SDP | https://default.dashboard.disbursement-platform.kuratek.com/ | 200 · "Stellar Disbursement Platform" (an SDP dashboard login — a deployed Stellar component) |
| stores | https://itunes.apple.com/search?term=kura+payments&entity=software&country=us (also "kura") | no Kura Payments app ("Kura: Modern USD Finance" is a different seller) |
| org | https://api.github.com/users/kuraapp/repos | 0 public repos |

**RECOMMENDED: cannot-tell.** A deployed SDP instance and a sign-up gate exist, but nothing shows a transaction, a user count or a release, and the plans call themselves coming soon. What would decide: a completed transfer visible on-chain from the SDP distribution account, a store release, or the owner's knowledge of the team.

### lantern — Lantern (Lending) · SCF R29 $48,483

Today: Live / source-inherited / 2026-08-19 / lumenloop yaml.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (curl) | https://lantern.finance/ | **403** "Attention Required! \| Cloudflare" — could-not-check by fetch (same for /app and /docs hosts) |
| website (browser, 6 s) | https://lantern.finance/ | renders "Borrow against your crypto … Get a loan · 415-365-0100 · Trustpilot 4.9 · 145 reviews"; collateral picker lists XRP ETH SOL BTC LTC DOGE **XLM Stellar** ADA HBAR BCH LINK SUI XDC; "XRP Price: $1.42" live quote; "BitGo custodian · Insured up to $250M" (claims) |
| app (browser, 6 s) | https://app.lantern.finance/ | **renders blank** (no title, no text) |
| Trustpilot | https://www.trustpilot.com/review/lantern.finance | 403 "Verifying Connection" — could-not-check |
| org | https://api.github.com/users/lanternfi/repos | 0 public repos |

**RECOMMENDED: cannot-tell.** The landing is substantive and names XLM as collateral, but the app renders nothing, curl is blocked, and no dated signal (review, release, repo) could be read. What would decide: app.lantern.finance rendering a loan flow, or a dated Trustpilot review from a browser that passes the check.

### legasi — Legasi (Lending, RWA) · SCF R40 $93,660

Today: Live / site-liveness / 2026-08-27 / https://legasi.io/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://legasi.io/ → https://www.legasi.io/en | 200 · "Legasi - Crypto-Backed Lombard Credit" · 1,842 chars · "The Institutional Credit Layer for Digital Assets · Join" — corporate page, no app link |
| linked repo | https://api.github.com/repos/legasicrypto/borrowing-protocol | pushed **2025-12-04** (276 d) · homepage legasixstellar.vercel.app · README "Legasi × Stellar Lending Protocol **MVP** … **Network: Stellar Testnet (Soroban)** … Deployment Checklist: [ ] Deploy Soroban contracts to testnet [ ] Update contract addresses" |
| MVP (raw) | https://legasixstellar.vercel.app/ | 200 · 32 chars — shell |
| MVP (browser, 6 s) | https://legasixstellar.vercel.app/ | renders a loan simulator: collateral SOL / USDC, "≈ $0.00", "You will borrow €0 of €0 max", "Launch App" |
| org | https://api.github.com/users/legasicrypto/repos?sort=pushed | stellar-zk-private-audit 2026-07-04, agent-credit-rail 2026-05-19, agent-payment-xrpl 2026-04-11 — Stellar work continues in other repos |

**RECOMMENDED: Development · medium.** Deciding evidence: https://github.com/legasicrypto/borrowing-protocol — the product's own README declares a testnet MVP with an unchecked deployment checklist (pushed 2025-12-04). Not Inactive: the org pushed Stellar work in July. Row fix: `links.website` could point at the MVP (legasixstellar.vercel.app) rather than the corporate site.

### liqvidxyz — Liqvid.xyz (RWA) · SCF R37

Today: Live / site-liveness / 2026-08-17 / https://liqvid.xyz/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://liqvid.xyz/ | 200 · "Liqvid" · 5,929 chars · "White list · LQVD token · Launch App · **Launch Beta**" |
| launch page | https://liqvid.xyz/launch | "**Liqvid Protocol Beta will be available soon.** Please enter your email to receive a notification and be among the first to try it." |
| app | https://app.liqvid.xyz/ → /welcome | "Welcome to Liqvid platform · Log In · Sign Up" — 48 chars, a sign-in shell |
| linked repo | https://api.github.com/repos/asterizm-protocol/asterizm-contracts-stellar | pushed 2026-05-25 (104 d) · README: mainnet deploy commands for the Asterizm relayer (admin GABWGZ…), a testnet token example CDKQXU… |
| on-chain | https://horizon.stellar.org/accounts/GABWGZAYSXK6346WF6BSNLIK6X75NF73JQRLAYBMJKWUU5ESV7NKKFAU/operations?order=desc&limit=5 | payments 2026-07-09 … 07-04 — the Asterizm admin account (a messaging protocol by the same team), not a Liqvid pool |
| third-party | https://app.rwa.xyz/platforms/liqvid (linked from the site) | not fetched (gated) |

**RECOMMENDED: Pre-Release · medium.** Deciding evidence: https://liqvid.xyz/launch — the product's own launch page says the beta "will be available soon" (observed 2026-09-06); the app is a sign-in shell. The linked repo is the Asterizm cross-chain contracts, not a Liqvid product surface.

### loto-punto — Loto Punto (Payments, AI, Security) · SCF R34 $75,975

Today: Live / site-liveness / 2026-09-01 / https://lotopunto.co/.

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website (TLS) | https://lotopunto.co/ | Python: `tlsv1 alert protocol version`; curl negotiates TLSv1.3 fine |
| website | https://www.lotopunto.co/ | 200 · "Personas" (Google Sites) · 2,131 chars · Colombian lottery / bill-pay / "Giros Internacionales" kiosks, "Localiza el Kiosko más cercano"; no Stellar / crypto mention |
| linked repo | https://api.github.com/repos/victuol/stellar | pushed 2025-02-03 (580 d) |
| stores | — | none named |

**RECOMMENDED: cannot-tell.** The company page is up but shows nothing about the SCF-funded Stellar remittance kiosks; the only Stellar artifact is a repo idle 19 months. What would decide: a Stellar/USDC remittance surface on the site or in a kiosk app, or a repo push.

## STATUS_FIX entries (recommendations — owner approval makes them human-verified)

`from` = the live status today (every row is Live). `to` = the recommended verdict. Rows marked "(low)" are listed for completeness; the previous batches applied high (and then re-graded medium) tiers only — the owner may prefer to leave the four low-confidence Live stamps unapplied. cannot-tell rows have no entry and keep their current basis.

```json
{
  "codelnpay": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-08-24",
    "sourceUrl": "https://play.google.com/store/apps/details?id=com.codeln.codelnpay",
    "note": "Packet next100-b 2026-09-06: Play Store CodeLnPay 'Updated on Aug 24, 2026', 1K+ downloads; own repo CodelnGhana/codelnpay-project pushed 2026-08-10; pay.codeln.com renders a payroll marketing page in a browser (raw fetch is a shell); no iOS app (high)."
  },
  "coindisco": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-05",
    "sourceUrl": "https://itunes.apple.com/lookup?id=6445888906&country=us",
    "note": "Packet next100-b 2026-09-06: App Store Coindisco v0.3.98 currentVersionReleaseDate 2026-09-05; Play updated 2026-09-04 (5K+); coindisco.com lists Stellar among DEX-purchase networks; linked repo coindisco/galaxy-ramp is 404 and the org has no public repos (high)."
  },
  "coinspect": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-08-05",
    "sourceUrl": "https://www.coinspect.com/blog",
    "note": "Packet next100-b 2026-09-06: own blog post 'Ill Bloom' dated 2026-08-05; own repo coinspect/wallet-security-ranking pushed 2026-09-04. No Stellar surface on the site, blog or repos — relevance, not liveness, is the open question (medium)."
  },
  "comunitaria": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-05",
    "sourceUrl": "https://api.stellar.expert/explorer/public/asset/ILLA-GCHNDY2LTV5VZYE3FRTRFN2GMENYBUNNP3IUY6TQKOIJSO2YLKCH5END/stats-history",
    "note": "Packet next100-b 2026-09-06: ILLA social currency (issuer GCHNDY2L…H5END, created 2025-11-12, 116 trustlines) shows payments on 2026-09-05, 09-01, 08-12, 08-07…; own repos comunitaria-stellar-wallet / -dashboard pushed 2026-06-24; site blog post 2026-08-28 (high)."
  },
  "crossmint": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://docs.crossmint.com/introduction/supported-chains",
    "note": "Packet next100-b 2026-09-06: docs Supported Chains lists Stellar (stellar / stellar-testnet) with wallets + checkout ticks, observed 2026-09-06; own repo Crossmint/crossmint-stellar-wallets-demo pushed 2026-08-31 (reference Stellar wallet app on staging) (high)."
  },
  "dobprotocol": {
    "from": "Live", "to": "Development", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://home.dobprotocol.com/api/pool/featured?network_id=10",
    "note": "Packet next100-b 2026-09-06: the app's own API returns 7 Stellar-mainnet pools with total_distributed 0 and participants 0/0/0/1/1/1/64 (airdrop), next payout 'Not scheduled'; Soroban RPC getEvents on 5 pool contracts: 0 events in 7 days; DobDex is testnet by its own README; contracts released 2026-08-06/07, org pushed 2026-08-19. Live is the alternative if the owner reads deployed mainnet pools as live; website should be dobprotocol.com not the Linktree (medium)."
  },
  "emigro": {
    "from": "Live", "to": "Pre-Release", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://emigro.co/",
    "note": "Packet next100-b 2026-09-06: emigro.co now pitches an immigration app — 'Coming soon … Join the waitlist … when Emigro opens' (observed 2026-09-06); the Stellar wallet 'Emigro | Pay Without Borders' (iOS id6475793514 / Play co.emigro.app) last released 2025-12-24 (256 d); no public repos (medium)."
  },
  "equitx": {
    "from": "Live", "to": "Inactive", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://api.github.com/repos/EquitXCompany/equitx-project",
    "note": "Packet next100-b 2026-09-06: linked repo removed (GitHub 404, receipt improvements/receipts/equitx-2026-09-06.json marker 'Not Found' in text); org has 0 public repos; equitx.com TLS certificate expired 2025-10-07; page is a '© 2024' newsletter form with no app or Stellar mention. Removed-repo class (didstellar/transfermole); SCF R26/R31 $150,300 — owner look advised (medium)."
  },
  "extractor": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://docs.extractor.live/supported-networks",
    "note": "Packet next100-b 2026-09-06: Extractor docs Supported Networks lists Stellar under Non-EVM (observed 2026-09-06); own docs repo haas-labs/ext-mintlify pushed 2026-08-25; extractor.live names Stellar among monitored chains; product is login-gated. Linked repo haas-labs/extractor idle since 2024-05 (high)."
  },
  "fastbuka": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-08-30",
    "sourceUrl": "https://play.google.com/store/apps/details?id=com.fastbuka.customer",
    "note": "Packet next100-b 2026-09-06: Play 'Choppaddi' (com.fastbuka.customer) Updated on Aug 30, 2026; App Store Choppaddi v1.0 released 2026-08-03 (id6761775761); choppaddi.com and both listings name no Stellar/USDC rail; fastbuka.com 503; org repo 2025-03. The marketplace app ships; the Stellar integration is not visible (medium)."
  },
  "gladius": {
    "from": "Live", "to": "Pre-Release", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://gladiusclub.com/",
    "note": "Packet next100-b 2026-09-06: gladiusclub.com offers 'sandbox versions' of the coach/athlete apps and 'JOIN PARENT APP WAITLIST' (observed 2026-09-06); gitbook docs undated; all org repos idle since 2024-07; no store app. Stalled pre-launch; no parked/retired page so Inactive is unavailable (low)."
  },
  "goldsky": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://docs.goldsky.com/chains/supported-networks",
    "note": "Packet next100-b 2026-09-06: docs state 'Stellar datasets are no longer available through Mirror. Use Turbo pipelines for Stellar data' and list Stellar under Turbo's non-EVM sources (observed 2026-09-06); own docs repo goldsky-io/mintlify-docs pushed 2026-09-04; org pushes daily. Linked repo indexed-xyz/docs is the older property (2025-04) (high)."
  },
  "grantpicks": {
    "from": "Live", "to": "Pre-Release", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://www.grantpicks.com/",
    "note": "Packet next100-b 2026-09-06: grantpicks.com renders 'Coming Soon' twice (browser, observed 2026-09-06); app.grantpicks.com is Vercel 402 DEPLOYMENT_DISABLED (receipt improvements/receipts/grantpicks-2026-09-06.json); PotLock/grantpicks README lists Stellar contracts on testnet only (Nov 2024), pushed 2026-03-10. Inactive is the alternative on the disabled deployment (medium)."
  },
  "horizon-as-a-service": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://docs.withobsrvr.com/docs/gateway/overview/",
    "note": "Packet next100-b 2026-09-06: Obsrvr Gateway docs document authenticated Horizon + Stellar RPC access (observed 2026-09-06); gateway.withobsrvr.com/rpc/mainnet answers 401 without a key; withobsrvr.com says 'Now in early access · SCF #42' (Pre-Release if the owner holds that line); org repos stellarbeat / stellar-extract pushed 2026-08; linked repo nomad-pack-web3-registry idle since 2025-08. Product is now Obsrvr, not 'Horizon-as-a-Service' (low)."
  },
  "hot-protocol": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://docs.hotdao.ai/omni-tokens.md",
    "note": "Packet next100-b 2026-09-06: HOT Bridge docs list Stellar (STELLAR = 1100, USDC on Stellar) (observed 2026-09-06); HOT Wallet iOS v1.0.3 released 2026-01-15 and Play updated 2025-06-15 (500K+) are outside 90 d; main product is a Telegram mini-app not checkable here; no bridge address published on-chain (low)."
  },
  "humantech": {
    "from": "Live", "to": "Development", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://docs.waap.human.tech/",
    "note": "Packet next100-b 2026-09-06: the wallet's own docs (WaaP) cover 'EVM, Sui, and Solana' with no Stellar (observed 2026-09-06); holosoe/Human-Wallet-On-Stellar README says on-going work on the stellar branch, pushed 2026-03-02; human.tech is now an AI-consulting company page; welcome.human.tech is a Connect Wallet gate (medium)."
  },
  "interlinked": {
    "from": "Live", "to": "Development", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://api.stellar.expert/explorer/testnet/contract/CCBGT2AD2GW5UCNFVP6WA46LK6CDDEUSFQBWF6EKEX5T63TA3L2RLPND",
    "note": "Packet next100-b 2026-09-06: the product contract named in the repo README exists on testnet only (created 2026-07-01, 14 storage entries) and is not found on mainnet; inl.one says 'public beta' alongside 'Live on Stellar'; repo antontat27/interlinked pushed 2026-07-02 (linked interlinked-backend is 404). Live if the owner confirms mainnet writes (medium)."
  },
  "irl": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://www.irl.energy/api/locations",
    "note": "Packet next100-b 2026-09-06: the app's own API returns live locations with points values (observed 2026-09-06); own repo hurley87/refraction pushed 2026-09-03 (README: Stellar/Soroban contracts, mainnet in production, addresses via env); www.irl.energy renders the city-guide app. Stellar usage not externally visible (high)."
  },
  "jetpad": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-08-27",
    "sourceUrl": "https://itunes.apple.com/lookup?id=6748644408&country=ng",
    "note": "Packet next100-b 2026-09-06: App Store 'JetPad: Buy & Sell Crypto' v1.0.6 currentVersionReleaseDate 2026-08-27; Play com.jetpadwallet.app updated 2026-09-03, listing names Stellar 10×; linked repo jetpad-digital-limited/jetpad-wallet is 404 (high)."
  },
  "k3-labs": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://docs.k3-labs.com/introduction/stellar-blockchain",
    "note": "Packet next100-b 2026-09-06: docs 'Stellar Blockchain' page documents mainnet + testnet triggers/reads/writes (Blend contract example), footer 'Last updated 1 year ago' (observed 2026-09-06); app.k3-labs.com renders an agent marketplace shell before sign-in; org repos idle since 2025-05 (low)."
  },
  "komunitin": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://komunitin.org/groups",
    "note": "Packet next100-b 2026-09-06: the app lists 15+ live exchange communities (El Poblet, Ecoxarxa del Bages, Greencoin, TimeInWest …) in a browser (observed 2026-09-06; raw fetch is a shell); docs carry a 'Stellar model' accounting page; own repo community-exchange-network/komunitin pushed 2026-09-03 (high)."
  },
  "legasi": {
    "from": "Live", "to": "Development", "basis": "human-verified", "asOf": "2025-12-04",
    "sourceUrl": "https://github.com/legasicrypto/borrowing-protocol",
    "note": "Packet next100-b 2026-09-06: own repo README 'Legasi × Stellar Lending Protocol MVP … Network: Stellar Testnet (Soroban)' with an unchecked deployment checklist, pushed 2025-12-04; legasixstellar.vercel.app renders a $0 loan simulator (SOL/USDC collateral); legasi.io is the corporate page; org pushed stellar-zk-private-audit 2026-07-04 (medium)."
  },
  "liqvidxyz": {
    "from": "Live", "to": "Pre-Release", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://liqvid.xyz/launch",
    "note": "Packet next100-b 2026-09-06: launch page says 'Liqvid Protocol Beta will be available soon' with an email form (observed 2026-09-06); app.liqvid.xyz is a Log In / Sign Up shell; linked repo is the Asterizm cross-chain contracts (pushed 2026-05-25), whose admin account pays on mainnet but is not a Liqvid pool (medium)."
  }
}
```

## cannot-tell — 11 rows (no entry; row keeps its current basis)

| slug | what was seen | what would decide it |
|---|---|---|
| copperx | docs chain list has no Stellar; app.copperx.io and status.copperx.io did not answer; org has no product repo | app rendering, or Stellar in the docs' supported chains |
| cryptoconexin | static glossary page; newest site content 2025-12-16; org repo 2024-04 | a dated 2026 post/course on the site |
| cyvers | B2B claims page, password-gated docs, no Stellar mention, org repos 2024 forks | a dated changelog/blog, or a Stellar page in the docs |
| elsa | corporate page, no app/store/repo, no Stellar mention | an app or dashboard URL, or a store listing |
| globachain | rebranded to Zynta (zynta.com, Stellar named); app.zynta.com in maintenance; linked repo 404 | app up, public API docs, or a store release — plus a website/name fix to Zynta |
| hito-wallet | hardware-wallet shop page (no Stellar/XLM), no store app, firmware repo 2026-01-17 | XLM in the supported-asset list, a firmware release ≤90 d, or the companion app |
| interstellar | DNS resolves, HTTP/HTTPS/browser all fail (could-not-check) | the host answering (or a parked page) on re-check |
| js-capacitor-passkey-kit | renamed repo pushed 2026-02-19, npm 0.0.5 2026-02-02, not archived | a publish/release ≤90 d, or the repo archived — plus a repo fix |
| kura | sign-up shell + an SDP dashboard login; plans "Coming soon · Join Waitlist"; no store app; org empty | an on-chain disbursement from the SDP account, or a store release |
| lantern | landing renders (XLM collateral) but app.lantern.finance renders blank; curl 403; Trustpilot 403; org empty | the app rendering a loan flow, or a dated review read from a browser |
| loto-punto | Google-Sites kiosk company page, no Stellar mention, repo 2025-02-03 | a Stellar/USDC remittance surface, or a repo push |

## Not examined / limits

- X / Twitter for all 34 rows (login shell; never evidence). Telegram mini-apps (HOT Wallet, JetPad's channel) and Trustpilot (403) could not be opened from here.
- No link was created on inl.one and no account was opened anywhere; sign-in gates (app.dobprotocol.com marketplace, app.kuratek.com, app.liqvid.xyz, app.k3-labs.com, app.zynta.com) were read only to the gate.
- `comunitaria`'s linked Bitbucket workspace was not fetched (not GitHub); the GitHub org's Stellar repos stood in.
- stellar.expert's contract endpoint reports no invocation counter, so recent activity for dob's pools was read from Soroban RPC's 7-day `getEvents` window only; older invocations would not show — the API's own `total_distributed = 0` is the deciding number, not the event count.
- `hot-protocol`'s bridge contract and `irl`'s Soroban contracts are not published anywhere fetchable, so neither could be checked on-chain.
