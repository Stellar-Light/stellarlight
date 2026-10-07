# Deep verification B — 8 undecided rows (2026-09-06)

Rule applied: the product-state rule from `2026-09-05-verification-packets-top100.md` (corrections block) and `…-medium-regraded.md` ("How to read a verdict"). A Live verdict rests on the product's own state — chain activity, a working app, a store release, an API answering with data — never on a banner, title, "Launch App" CTA or marketing claim; empty or zero metrics veto Live; a raw fetch of a client-rendered shell is could-not-check until the app's own endpoint or an on-chain/store signal is read; the second signal must be this product's own repo pushed ≤90 days; Inactive needs a parked / retired / removed page or repo, receipted.

Every URL below was fetched **2026-09-06 01:52–02:12 UTC** (evening of 2026-09-05 Pacific). `asOf` is the evidence's own date; where the evidence is a page observed today the entry says so. Client-rendered pages were read twice: raw (`urllib`, browser UA) and, where it mattered, rendered in a real browser after an 8 s wait (Normal savings, Splito app, Token Tails game, inference-lang.org, stellar.expert contract activity, DeFindex dapp). GitHub via `gh api`; stores via the iTunes lookup API and the Play Store page's "Updated on"; chain via stellar.expert's API, Horizon and Soroban RPC `getEvents` (mainnet.sorobanrpc.com, 7-day retention: ledgers 64173030–64293989).

Nothing here touched the database. **Every verdict is a recommendation; the owner's approval is what makes it human-verified.**

Recommended: **Live 5 (normal, zebec, inference, token-tails, splito) · Development 2 (vanna-finance, the-give-hub) · cannot-tell 1 (spydra)** · Inactive 0. Confidence: high 4 · medium 2 · low 1 · n/a 1.

## Summary

| slug | today (status / basis) | → verdict | conf | deciding evidence (date) |
|---|---|---|---|---|
| normal | Live / site-liveness (stamp withdrawn 09-05) | **Live** | high | Normal's own USDC savings vault on mainnet (nUSDC · DeFindex-Vault-NormalUSDC, `CAWM…IMWR`) invoked by users: withdraw 2026-09-02 11:39 UTC, 10,050 USDC withdraw 2026-09-01, 130,345 USDC deposit 2026-08-26 |
| vanna-finance | Live / site-liveness (stamp withdrawn 09-05) | **Development** | high | docs: "All contracts are deployed on **Stellar Testnet**. Mainnet addresses will be published at launch." (observed 2026-09-06) |
| zebec | Live / site-liveness (stamp withdrawn 09-05) | **Live** | high | Zebec's Stellar **mainnet** payroll contract `CBGU…SZIW` (the `mainnet` address in its npm SDK) invoked 2026-09-05 08:53 UTC; SuperApp iOS released 2026-08-28 |
| inference | Live / human-verified (09-05) | **Live** (stamp stands, re-based) | medium | GitHub release v0.0.5 with compiler binaries, 2026-07-27; VS Code extension 0.0.5 same day; own repo pushed 2026-09-05 |
| token-tails | Live / human-verified (09-05) | **Live** | low | the game's API serves its leaderboard (50 users) today; both store builds date 2026-03-06 (184 d) |
| splito | Live / human-verified (09-05) | **Live** | medium | app.splito.io renders a working no-account request builder (USDC/XLM on Stellar) today; backend enforces sessions; own repo pushed 2026-08-28 |
| spydra | Live / human-verified (09-05) | **cannot-tell** | — | console is an Auth0 login; docs carry no Stellar/Soroban page; the 09-05 stamp rests on a marketing page + a Microsoft fork → recommend withdrawing the stamp |
| the-give-hub | Live / human-verified (09-05) | **Development** | high | the app's own API returns `[]` for campaigns (all / active / the featured id) and donations; app shell "Unable to Load Content" (observed 2026-09-06) |

## Rows

### normal — Normal (Stablecoin, Yield) · SCF R31/R35 $200,000

Today: Live / site-liveness / 2026-09-05 / https://www.normalfinance.io/ (human-verified stamp withdrawn 09-05: linked repo 404, org-newest substituted).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://www.normalfinance.io/ | 200 · "Home \| Normal" · 8,996 chars. The "Your Normal Portfolio $3,306.36" card is a mock; "Built on Stellar · Audited by Halborn" is chrome. No app link; "Login" is a JS wallet-connect (Turnkey embedded wallets — `api.turnkey.com` in the bundle). |
| app page (raw) | https://www.normalfinance.io/savings | 200 · 350 chars (header + footer only) — client-rendered shell → could-not-check by fetch |
| app page (browser, 8 s) | https://www.normalfinance.io/savings | renders "Connect your wallet — Sign in to view your savings and start earning yield. Sign in" — a sign-in gate, no public metrics |
| app bundle | `/_next/static/chunks/*` from /savings (5.3 MB) | `DEFINDEX_VAULT_ADDRESS: CAWM7NKSYG2ITJW2MYYJWJ5ULGCJLDB6MXZIWPL3VPRG5TDVLJ66IMWR`, `NORMAL_HOT_A: GAYPA6P3…NPJD`, USDC/XLM SACs, Reflector oracles, `horizon-testnet` + a paid mainnet RPC, wallet kit (xBull, Lobstr, Ledger, WalletConnect) |
| on-chain: vault | https://api.stellar.expert/explorer/public/contract/CAWM7NKSYG2ITJW2MYYJWJ5ULGCJLDB6MXZIWPL3VPRG5TDVLJ66IMWR | created 2026-02-10, 453 events, 20 storage entries; page title "nUSDC (DeFindex-Vault-NormalUSDC)" |
| on-chain: vault activity (browser) | https://stellar.expert/explorer/public/contract/CAWM7NKSYG2ITJW2MYYJWJ5ULGCJLDB6MXZIWPL3VPRG5TDVLJ66IMWR (Contract Activity tab) | `withdraw` 2026-09-02 11:39:43 UTC (GD6V…OY3X); `withdraw` 2,250 USDC 2026-09-01 12:11; `withdraw` 10,050 USDC 2026-09-01 11:58 (GCVC…4MWE); `deposit`/`withdraw` 2026-08-28 ×4; `deposit` 130,345 USDC 2026-08-26 22:53 and `withdraw` 131,131 USDC 2026-08-26 19:50 (GCVC…4MWE); `deposit` 1,164 USDC 2026-08-22; `withdraw` 7,626 USDC 2026-08-20 — six distinct user accounts in 14 days |
| on-chain: tx (Horizon) | https://horizon.stellar.org/transactions/46e4f3075bea41c472302556831e6317dec8661fa69109ff96035a9b0fe809e3 | `created_at` 2026-09-02T11:39:43Z, successful, source GD6VNX3Y…OOY3X |
| on-chain: tx (Horizon) | https://horizon.stellar.org/transactions/8942a68d670d8444fb377de3f9b424fdf2b3345c86a3afe41c68648eb000f2f6 | `created_at` 2026-09-01T11:58:50Z, successful, source GCVCVOJM…RB4MWE |
| on-chain: RPC getEvents (vault, 7-day window) | POST https://mainnet.sorobanrpc.com `getEvents` contractIds=[CAWM…IMWR] | **0 events** — the vault emits no events of its own (the invocations above are real); see "Mistakes" |
| on-chain: DeFindex dapp (browser) | https://app.defindex.io/vault/CAWM7NKSYG2ITJW2MYYJWJ5ULGCJLDB6MXZIWPL3VPRG5TDVLJ66IMWR | "Blend Vault · Available $100,000 · Holdings $100,000 · Deposits $100,000" — three identical round figures; recorded, not relied on |
| on-chain: hot account | https://horizon.stellar.org/accounts/GAYPA6P3GUDNTZZEJQN6TMP64Y63M63KFTJ5MGLSMH7G6FMJ3CQSNPJD/operations?order=desc&limit=3 | last ops 2026-07-09 / 07-08 / 07-06 (payments); balances 0 BLND / nBTC / nETH |
| on-chain: synthetic assets | https://api.stellar.expert/explorer/public/asset?search=normal&limit=5 | nXRP (domain normalfinance.io, created 2026-01-19, 30 trustlines, 66 payments lifetime); stats-history: 0 payments on every row since 2026-06-25 — dormant |
| roadmap | https://www.normalfinance.io/roadmap | 200 · 4,318 chars · "Roadmap · updated weekly · Next ship August 2026"; claims "Shipped Jan 2025 Normal Savings launched — live on Stellar mainnet", "Shipped Apr 2026 Hit $24M total deposits" (claims, not state — the vault's visible flow is tens of thousands, not millions) |
| blog | https://normalfi.substack.com/feed | latest post "Normal is going mobile" 2026-09-02 ("strong existing user base" — claim) |
| docs | https://normalfi.gitbook.io/normal | 200 · Start Here / Whitepaper / Getting Started — no app link |
| linked repo | https://api.github.com/repos/normalfinance/normal-v1 | **404** |
| own repo | https://api.github.com/repos/normalfinance/normal-v1-interface | pushed **2026-09-02** · "Open source interfaces for the Normal protocol" · homepage normalfinance.io — this product's UI repo |
| org | https://api.github.com/users/normalfinance/repos?sort=pushed | 14 repos; stellar-v1 2026-03-03, normal-stellar-amm 2025-11-06, mobile 2025-11-06 |
| stores | https://itunes.apple.com/search?term=normal+finance&entity=software&country=us | no Normal app (roadmap: "Normal Mobile App — Planned Q4 2026") |

**RECOMMENDED: Live · high.** Deciding evidence: https://horizon.stellar.org/transactions/46e4f3075bea41c472302556831e6317dec8661fa69109ff96035a9b0fe809e3 — a user `withdraw` on Normal's own USDC savings vault, 2026-09-02. The product's state is on-chain: real deposits and withdrawals by six accounts in the last two weeks; the interface repo is 4 days old. The sign-in gate on the site is not a shell, and the RPC's "0 events" was the instrument's blind spot, not the product's. Not supported by anything seen: the "$24M TVL" claim. Row fixes to consider: `links.github` → `normalfinance/normal-v1-interface` (the linked `normal-v1` is gone); attach `CAWM…IMWR` under `onchain.contracts` so the next check reads the vault instead of the page.

### vanna-finance — Vanna Finance (Lending) · no award

Today: Live / site-liveness / 2026-09-05 / https://vanna.finance/ (stamp withdrawn 09-05: linked repo 404, org-newest substituted).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://vanna.finance/ | 200 · "Vanna — Composable Undercollateralized Credit for DeFi" · 7,959 chars · three "Launch App" CTAs; footer "Built on Stellar · Base · Arbitrum · Optimism" |
| Launch App target | https://test.stellar.vanna.finance/ | 200 · "Vanna — Leveraged Yield & Margin on Stellar" · 936 chars rendered (Connect Wallet); its bundle calls `https://amm-api-testnet.aqua.network/pools/` — a **testnet** front-end |
| docs Launch App target | https://app.vanna.finance | DNS failure (nodename not known) — could-not-check; docs' second link https://test-stellar.vanna.finance/ also DNS-fails |
| docs | https://docs.vanna.finance/home | 200 (Mintlify) · "Build on Vanna … on Stellar and Base"; llms.txt: "Connect Your Wallet … claiming testnet tokens from the faucet" |
| docs: deployed contracts | https://docs.vanna.finance/developers/deployed-contracts.md | 200 · "All contracts are deployed on **Stellar Testnet**. Mainnet addresses will be published at launch." · passphrase `Test SDF Network ; September 2015` · "These addresses are testnet only." |
| linked repo | https://api.github.com/repos/vannafinance/protocol_v1_soroban | **404** |
| org | https://api.github.com/users/vannafinance/repos?sort=pushed | 5 repos: mercury-stellar-backend 2026-09-02 (homepage https://mercury-stellar-backend.vercel.app → **402** Vercel "Payment required"), Zonymous 2026-09-01, three homepage repos |
| on-chain | none in row; docs list testnet addresses only | — |

**RECOMMENDED: Development · high.** Deciding evidence: https://docs.vanna.finance/developers/deployed-contracts.md — the product's own docs say every contract is on testnet and mainnet "will be published at launch" (observed 2026-09-06). The only app that resolves is `test.stellar.…`; the mainnet app host does not exist. Not Inactive: an active testnet app, docs and a 4-day-old backend push. Receipt (markers confirmed in text): `pnpm exec tsx scripts/data/capture-receipt.ts vanna-finance https://docs.vanna.finance/developers/deployed-contracts.md "All contracts are deployed on **Stellar Testnet**" "Mainnet addresses will be published at launch"` → `improvements/receipts/vanna-finance-2026-09-06.json`. Row fix: `links.github` → `vannafinance/mercury-stellar-backend` only if the owner confirms it is this product (its deployment is disabled).

### zebec — Zebec (Payments) · no award

Today: Live / site-liveness / 2026-09-05 / https://zebec.io/ (stamp withdrawn 09-05: one repo shared with wagelink).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://zebec.io/ | 200 · "Zebec Network \| Real-Time Crypto Payroll & Payments" · 1,909 chars · the word "Stellar" does not appear in the rendered text |
| docs: supported chains | https://docs.zebec.io/zebec-product-information/supported-chains | 200 · table row "Stellar · STELLAR · Mainnet · XLM" (also in the .md) |
| docs: Stellar SDK | https://docs.zebec.io/developer-docs/sdks/streaming-sdk/stellar-streaming-sdk | 200 · "Stellar Streaming SDK — TypeScript SDK for Zebec payment streams on Stellar via Soroban" · `npm install @zebec-network/stellar-payroll-sdk` · example uses the testnet contract `CDWK…Q4YU` |
| npm | https://registry.npmjs.org/@zebec-network/stellar-payroll-sdk | 3.2.4 · created 2026-05-10 · modified **2026-08-17**; tarball hardcodes `mainnet: "CBGU4YF7RZR2JRYQ6YXYJCROX47FJ3GFRWQSJJEEF5NAWU2OO3NUSZIW"`, `testnet: "CCNE…3EFA"` |
| on-chain: mainnet contract | https://api.stellar.expert/explorer/public/contract/CBGU4YF7RZR2JRYQ6YXYJCROX47FJ3GFRWQSJJEEF5NAWU2OO3NUSZIW | created 2026-06-25 · **1,725 events** · 532 storage entries · 5 versions |
| on-chain: RPC getEvents (24 h window) | POST https://mainnet.sorobanrpc.com `getEvents` contractIds=[CBGU…SZIW] | 12 events at ledgers 64282864–64282866, `ledgerClosedAt` **2026-09-05T08:53:26Z** / 08:53:37Z |
| on-chain: tx (Horizon) | https://horizon.stellar.org/transactions/5797fe8a7bd572efbcf19ca80f1ff402aa59c5426adbe2acdd3757a5806cbcaf | `created_at` 2026-09-05T08:53:26Z · successful · `invoke_host_function` · source GADCZJVC…OIYKV |
| testnet contract | https://api.stellar.expert/explorer/testnet/contract/CDWK5GRLUB24FMWLWEAS3NLU2JCDW7T3BMU7HWKGEZEDJRXXESGLQ4YU | 33 events (docs example) |
| App Store | https://itunes.apple.com/lookup?id=6757870351&country=us | "Zebec SuperApp" · Payroll Growth Partners, LLC · v0.08.26 · `currentVersionReleaseDate` **2026-08-28** · first release 2026-07-10 |
| Google Play | https://play.google.com/store/apps/details?id=com.zebecrn&hl=en | "Updated on Aug 27, 2026" · 1K+ downloads · 133 reviews |
| web SuperApp | https://superapp.zebec.io/stellar | → `/auth?next=%2Fstellar` (email-code sign-in) — a `/stellar` route exists behind auth; `/solana/vault` is the default |
| announcements | https://zebec.io/blog/zebec-brings-streaming-payroll-to-stellar · https://zebec.io/blog/zebec-launches-enterprise-payroll-on-stellar | 200 each (no date in the page text); web search: SDF named Zebec its stablecoin-payroll provider 2026-03-19 (corroboration only) |
| linked repo | none in row; org https://api.github.com/users/zebec-protocol/repos | canton-dev-fund fork 2026-09-02 (not evidence), zebec-canton-payroll 2026-05-15; no Stellar repo — the npm package is the product artifact |

**RECOMMENDED: Live · high.** Deciding evidence: https://horizon.stellar.org/transactions/5797fe8a7bd572efbcf19ca80f1ff402aa59c5426adbe2acdd3757a5806cbcaf — Zebec's own Stellar mainnet payroll contract (the address its SDK ships as `mainnet`) invoked 2026-09-05. Stellar is live for Zebec specifically: mainnet listed in the docs, an SDK published 2026-08-17 carrying the mainnet address, and on-chain use yesterday; the SuperApp shipped store builds 2026-08-27/28. Row fix: attach `CBGU…SZIW` under `onchain.contracts`.

### inference — Inference (Security) · SCF R39 $149,730

Today: Live / human-verified / 2026-09-05 / https://inferara.com/ (high tier, applied).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://inferara.com/ | 200 · "Inferara" · 2,989 chars · products list: Inference (language), Soroban Security ("Visit Site"), **"05 Commercial · Coming Soon · Inference Studio · Join Waitlist"** — the coming-soon/waitlist wording belongs to Inference Studio, not the language |
| product site (raw) | https://inference-lang.org/ | 200 · 37 chars — SPA shell |
| product site (browser, 6 s) | https://inference-lang.org/ | renders "**v0.0.5 is available**", `curl -fsSL https://inference-lang.org/install.sh \| sh`, "Get VS Code Extension", full language example |
| installer | https://inference-lang.org/install.sh | 200 · 6,878 B |
| book | https://inference-lang.org/book/ | 200 · "Warning: The Inference programming language is currently under development … the first stable release is not out yet" |
| release | https://api.github.com/repos/Inferara/inference/releases/tags/v0.0.5 (page: https://github.com/Inferara/inference/releases/tag/v0.0.5) | published **2026-07-27** · assets infc/infs for linux-x64, macos-apple-silicon, windows-x64 (+ sha256); v0.0.4 2026-07-06, v0.0.3 2026-06-08 |
| VS Code Marketplace | POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery (`inference-lang.inference`) | "Inference" · lastUpdated **2026-07-27** · versions 0.0.5 (2026-07-27), 0.0.4 (2026-02-18) |
| own repo | https://api.github.com/repos/Inferara/inference | pushed **2026-09-05** · 25 stars · commits 2026-09-04 ("fix: reject an obligation over a contested merged-root alias") |
| row's linked repo | https://api.github.com/repos/Inferara/inference-language-spec | pushed 2026-08-11 (the spec, not the compiler) |
| Stellar surface | https://stellarsecurityportal.com/ (sorobansecurity.com redirects here) | raw 23 chars (SPA); `/env.js` → `API_URL`; https://stellarsecurityportal.com/api/v1/reports → 200 · 60 audit reports · newest dated 2026-05-01 (lastActionAt 2026-06-18); repo Inferara/soroban-security-portal pushed 2026-08-26 |

**RECOMMENDED: Live · medium (the 09-05 stamp stands, re-based on product evidence).** Deciding evidence: https://github.com/Inferara/inference/releases/tag/v0.0.5 — a compiler release with binaries, 2026-07-27 (41 days), matched by the marketplace extension the same day and a repo push yesterday. What is live: the Inference language toolchain (compiler, VS Code extension, book, installer) and the Stellar Security Portal (API serving 60 reports). What is not a product yet: Inference Studio (waitlist). Downgrade presented, not asserted: the book's own "under development … first stable release is not out yet" (v0.0.x) reads as Development if the owner holds a pre-1.0 line. Row fix: `links.github` → `Inferara/inference`.

### token-tails — Token Tails (Gaming, NFT) · SCF R26/R30 $144,000

Today: Live / human-verified / 2026-09-05 / https://tokentails.com/ (high tier, applied).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://tokentails.com/ | 200 · "Token Tails \| A family of feline care apps" · 5,976 chars · "4.9 · 10K+ cat parents", "50K+ Portraits", "800+ Strays Saved" (claims) · "Coming Soon" on **CatFood** and **CatMeds**; CatWatch / CatHealth / CatFind link to sub-sites |
| sub-site | https://catwatch.tokentails.com/ | 200 · "Live shelter rescues … shipped to App Store and Google Play" · "542K Cat parents" (claim) |
| web game (raw) | https://tokentails.com/game | 200 · 26 chars — SPA shell |
| web game (browser, 8 s) | https://tokentails.com/game | "WELCOME TO TOKEN TAILS · SIGN IN WITH Google / Apple / Password" — a sign-in gate |
| App Store | https://itunes.apple.com/lookup?id=6745582489&country=us | "Token Tails" · Token Tails, MB · v23 · `currentVersionReleaseDate` **2026-03-06** (184 d) · first 2025-05-22 · notes "Paw match game mode, Security improvements" |
| App Store search | https://itunes.apple.com/search?term=catwatch&entity=software&country=us | no Token Tails "CatWatch" app (the only CatWatch is Route 413 Media, 2022) — the sub-site's store claim is unverified |
| Google Play | https://play.google.com/store/apps/details?id=com.tokentails.app&hl=en | "Token Tails" · "Updated on Mar 6, 2026" · 1K+ downloads |
| API | https://api.tokentails.com/user/leaderboard (browser UA; python-urllib gets 403) | **200 · 50 users with `tails` balances** (top 3,339,501); unchanged between 02:08 and 02:10 UTC; `/shelter` 401 (auth-gated), `/cat/nft/` and `/cat/list` 500 without params |
| own repo | https://api.github.com/repos/zbagdzevicius/tokentails | pushed **2026-07-24** (44 d) · `client/.env.app`: `NEXT_PUBLIC_BE_URL=https://api.tokentails.com` · `contracts/stellar/soroban-nft/k8s-pubnet.yaml` (Public Global Stellar Network) |
| on-chain | https://api.stellar.expert/explorer/public/contract/CBHOJOPZ5BCWQ63RLMTCG73I3MM6E2N5UNZ2AE3ZVYY4MMFFAGUI6QVF (from the soroban-nft README) | created 2025-01-12 · 4,403 storage entries · 0 events (mint records without events; undated); `CDY5…7NJ6`, `CBK4…MRS4` 0 events; `CAJR…TGFM` not on the ledger |
| $TAILS | https://api.stellar.expert/explorer/public/asset?search=TAILS | no asset — "$TAILS earned" figures are off-chain points |

**RECOMMENDED: Live · low.** Deciding evidence: https://api.tokentails.com/user/leaderboard — the game's own backend serving its leaderboard (observed 2026-09-06; the data carries no timestamps). Which app is on Stellar: the **Token Tails game** (App Store id6745582489 / Play `com.tokentails.app`) — its repo carries the Soroban NFT contract deployed to pubnet and the client points at this API; the "family of five feline care apps" are sub-sites, two marked Coming Soon and CatWatch's store claim not found. Why low: both store builds are 184 days old (outside the 90-day window, litemint-class), the web app is a sign-in gate, and the API state is undated. Development is the alternative if the owner holds the 90-day release line; the deciding URL supports either reading.

### splito — Splito (Payments) · SCF R40 $50,000

Today: Live / human-verified / 2026-09-05 / https://www.splito.io/ (high tier, applied).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://www.splito.io/ | 200 · "Splito — Request Money, Get Paid in Any Asset" · 2,375 chars · "USDC or XLM on Stellar … payer connects a Solana or Stellar wallet"; single CTA https://app.splito.io/ |
| app (raw) | https://app.splito.io/ | 200 · 38 chars — SPA shell (Next.js) → could-not-check by fetch |
| app (browser, 8 s) | https://app.splito.io/ | renders the request builder: "**No account needed — fill this in and you get a link to send**", amount in USD with a live crypto quote at pay time, "Lock the rate", settle into **USDC (Stellar · stable) / XLM (Stellar · native)**, "STELLAR ADDRESS TO RECEIVE AT", "Create request link", link expiry 7/14/30 d; group requests need sign-in |
| app bundle | `/_next/static/chunks/*` (3.1 MB) | API base `https://server.splito.io/api`; public routes `/pay`, `/invite`, `/sign`; both Stellar passphrases (public + test) and Aptos devnet keyless |
| backend | https://server.splito.io/api/requests · https://server.splito.io/api/users/accepted-tokens | **401 `{"error":"Missing session"}`** — deployed, session-enforced; `/api` and `/api/pay/test` 404 "Cannot GET" (Express) |
| payer page | https://app.splito.io/pay/test | 200 · 20 KB shell (needs a real request id) |
| own repo | https://api.github.com/repos/Splitoio/web-app | pushed **2026-08-28** · homepage app.splito.io · "Dashboard for splito" (also Splitoio/website 2026-08-10) |
| on-chain | none in row | — |

**RECOMMENDED: Live · medium.** Deciding evidence: https://app.splito.io/ — the product's own app renders a usable, no-account request builder settling in USDC/XLM on Stellar (observed 2026-09-06), with a live session-enforcing backend and a 9-day-old repo. Not done on purpose: submitting the form (it would create a request on their backend), so no request link was minted — that is the gap between medium and high. What would make it high: the owner creates one request and opens its `/pay/<id>` page.

### spydra — Spydra (RWA, AI) · SCF R31 $132,000

Today: Live / human-verified / 2026-09-05 / https://www.spydra.app/ (high tier, applied; note cites "repo spydra-tech/presidio" — a fork of Microsoft's Presidio, not the product).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://www.spydra.app/ | 200 · "Asset Tokenization Platform \| Spydra" · 39,080 chars · "Announcement: We've just launched Hyperledger Fabric 2.5!" (undated) · CTA → console |
| console | https://console.spydra.app/ | 302 → https://login.spydra.app/authorize (Auth0) — a login page; https://console.spydra.app/api/health → 200 `{"status":200,"message":"OK"}` (service alive) |
| docs | https://docs.spydra.app/ · https://docs.spydra.app/llms.txt (28 KB index) · https://docs.spydra.app/products-overview/public-chain | 200 · **zero occurrences of "Stellar" or "Soroban"**; the public-chain product documents "Tokenise on TestNet → Polygon Amoy"; billing/pricing pages present |
| blog | https://www.spydra.app/blog | posts 2026-09-03, 2026-08-28, 2026-08-24 (content, not product state) |
| Stellar announcement | https://www.spydra.app/blog/spydra-lands-140k-from-stellar-community-fund-to-revolutionize-regulated-tokenization-on-stellar-blockchain | "Published on March 11, 2025" — the SCF award; no later Stellar deliverable found on the site or docs |
| SCF | https://communityfund.stellar.org/project/spydra-low-code-rwa-tokenization-engine-k2y | "Spydra-RWA Tokenization on Stellar · SCF #31 · $132.0K · Build · Awarded" (row data, not product state) |
| sibling product | https://www.openrwa.io/ | 200 · "OpenRWA … © 2026 Spydra" · "500+ Assets Tokenized · $2B+ Trading Volume · 50+ Live Marketplaces" (claims); no Stellar |
| linked repo | https://api.github.com/repos/spydra-tech/erc3643 | **404** |
| org | https://api.github.com/users/spydra-tech/repos?sort=pushed | presidio fork 2026-08-25, inspect_evals fork 2026-06-30, policy-agent 2026-06-02, Hyperledger Fabric tooling 2026-04-14 (fabric-debugger 18 stars) — no Stellar repo |
| status page | https://status.spydra.app/ | DNS failure — could-not-check |

**RECOMMENDED: cannot-tell.** The company is plainly operating (docs with billing, an alive console API, blog posts this week), but nothing observable is the product's own state: the console is a login, the docs describe the product without a metric, and no Stellar surface exists in docs, repos or the site 18 months after the award. The current human-verified stamp rests on a marketing page plus a Microsoft fork — evidence the rule now rejects — so the recommendation is to **withdraw the stamp to site-liveness with status unchanged** (the untangled/vanna pattern), not to change the status. What would decide it is in the table at the end.

### the-give-hub — The Give Hub (AI, Payments) · SCF R33 $45,000

Today: Live / human-verified / 2026-09-05 / https://thegivehub.com/en/index.html (high tier, applied; note cites thegivehub/www — the marketing-site repo).

| instrument | URL | result (2026-09-06) |
|---|---|---|
| website | https://thegivehub.com/ → /en/index.html | 200 · "The Give Hub - Blockchain Charity Simplified" · 15,063 chars · five featured campaigns link to `app.thegivehub.com/campaign.html?id=65ee1a1b…` |
| app | https://app.thegivehub.com/ | 200 · 298 chars: nav + "**Unable to Load Content** — There was a problem loading the requested page. Retry" |
| app: browse | https://app.thegivehub.com/browse.html | 200 · "Loading campaigns... You've reached the end of available campaigns." · `/lib/APIConfig.js` sets `BASE_URL = <origin>/api.php` |
| app API: campaigns | https://app.thegivehub.com/api.php/campaigns | **200 `[]`** |
| app API: active | https://app.thegivehub.com/api.php/campaigns?status=active | 200 `[]` |
| app API: featured id | https://app.thegivehub.com/api.php/campaigns/65ee1a1b2f3a4b5c6d7e8f9a | 200 `[]` (the site's featured "Clean Water Pipeline") |
| app API: donations | https://app.thegivehub.com/api.php/donations | 200 `[]` |
| documented API | https://thegivehub.com/en/api.html → `https://api.thegivehub.com` and `https://sandbox-api.thegivehub.com` | both **DNS failure** — could-not-check |
| own app repo | https://api.github.com/repos/thegivehub/app | pushed **2026-06-03** (95 d — just outside the window); `www` 2026-07-27 is the marketing site; `smartcontracts` (Soroban) 2025-10-25; `api` 2024-11-15 |
| on-chain | none in row; the API schema has `stellar_account` per campaign but no campaign exists to read one from | — |

**RECOMMENDED: Development · high.** Deciding evidence: https://app.thegivehub.com/api.php/campaigns — the product's own API answers with an empty list for campaigns, active campaigns, the featured campaign and donations (observed 2026-09-06). Empty metrics veto Live. Not Inactive: no parked, retired or removed page, the app and API answer, and the app repo was pushed in June. Receipt (marker confirmed in text): `pnpm exec tsx scripts/data/capture-receipt.ts the-give-hub https://app.thegivehub.com/api.php/campaigns "[]"` → `improvements/receipts/the-give-hub-2026-09-06.json`. Row fix: `links.github` → `thegivehub/app`.

## STATUS_FIX entries (rows recommended to change or stamp)

`from` = the live status today; `basis` human-verified only on the owner's approval. `spydra` is a stamp withdrawal, not a status change.

```json
{
  "normal": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-02",
    "sourceUrl": "https://horizon.stellar.org/transactions/46e4f3075bea41c472302556831e6317dec8661fa69109ff96035a9b0fe809e3",
    "note": "Deep verify 2026-09-06: Normal's own USDC savings vault nUSDC (DeFindex-Vault-NormalUSDC) CAWM7NKSYG2ITJW2MYYJWJ5ULGCJLDB6MXZIWPL3VPRG5TDVLJ66IMWR invoked by users — withdraw 2026-09-02 11:39 UTC, 10,050 USDC withdraw 2026-09-01, 130,345 USDC deposit 2026-08-26 (stellar.expert contract activity); interface repo normalfinance/normal-v1-interface pushed 2026-09-02. Site savings page is a wallet sign-in gate; $24M TVL claim unverified (high)."
  },
  "vanna-finance": {
    "from": "Live", "to": "Development", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://docs.vanna.finance/developers/deployed-contracts.md",
    "note": "Deep verify 2026-09-06: docs state 'All contracts are deployed on Stellar Testnet. Mainnet addresses will be published at launch.'; Launch App → test.stellar.vanna.finance (testnet AMM API); app.vanna.finance has no DNS; linked repo protocol_v1_soroban 404; org backend Vercel 402 disabled (high)."
  },
  "zebec": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-05",
    "sourceUrl": "https://horizon.stellar.org/transactions/5797fe8a7bd572efbcf19ca80f1ff402aa59c5426adbe2acdd3757a5806cbcaf",
    "note": "Deep verify 2026-09-06: Stellar mainnet payroll contract CBGU4YF7RZR2JRYQ6YXYJCROX47FJ3GFRWQSJJEEF5NAWU2OO3NUSZIW (the `mainnet` address in @zebec-network/stellar-payroll-sdk 3.2.4, published 2026-08-17) invoked 2026-09-05 08:53 UTC, 1,725 events since 2026-06-25; docs list Stellar mainnet; SuperApp iOS v0.08.26 released 2026-08-28, Play updated 2026-08-27 (high)."
  },
  "inference": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-07-27",
    "sourceUrl": "https://github.com/Inferara/inference/releases/tag/v0.0.5",
    "note": "Deep verify 2026-09-06: compiler release v0.0.5 with binaries 2026-07-27, VS Code extension 0.0.5 same day, inference-lang.org renders 'v0.0.5 is available' + install.sh; own repo Inferara/inference pushed 2026-09-05. 'Coming soon / waitlist' is Inference Studio, a separate product. Book calls the language pre-stable — Development if the owner holds a pre-1.0 line (medium)."
  },
  "token-tails": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://api.tokentails.com/user/leaderboard",
    "note": "Deep verify 2026-09-06: the game's API serves its 50-user leaderboard (undated); App Store id6745582489 v23 released 2026-03-06 and Play com.tokentails.app updated 2026-03-06 (184 d); web game is a sign-in gate; repo pushed 2026-07-24; Soroban NFT contract on pubnet undated; $TAILS is not an on-chain asset. LOW confidence — Development if the 90-day release line is held."
  },
  "splito": {
    "from": "Live", "to": "Live", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://app.splito.io/",
    "note": "Deep verify 2026-09-06: app renders a no-account request builder settling in USDC/XLM on Stellar ('No account needed — fill this in and you get a link to send'); backend server.splito.io/api answers 401 Missing session (deployed, session-enforced); repo Splitoio/web-app pushed 2026-08-28. Form not submitted, so no request link minted (medium)."
  },
  "spydra": {
    "from": "Live", "to": "Live", "basis": "site-liveness", "asOf": "2026-09-06",
    "note": "Deep verify 2026-09-06: human-verified stamp WITHDRAWN — the 09-05 stamp cited a Microsoft Presidio fork as the repo; console is an Auth0 login (api/health OK); docs have no Stellar/Soroban page (public chain = Polygon Amoy testnet); linked repo erc3643 404; SCF Stellar award 2025-03-11 with no visible deliverable. Status unchanged; cannot tell from the web."
  },
  "the-give-hub": {
    "from": "Live", "to": "Development", "basis": "human-verified", "asOf": "2026-09-06",
    "sourceUrl": "https://app.thegivehub.com/api.php/campaigns",
    "note": "Deep verify 2026-09-06: the app's own API returns [] for campaigns, active campaigns, the featured campaign id and donations; app shell 'Unable to Load Content'; documented api.thegivehub.com has no DNS; app repo thegivehub/app pushed 2026-06-03 (the packet's www repo is the marketing site). Empty metrics veto Live; no parked/retired page (high)."
  }
}
```

## cannot-tell

| slug | what was checked | what would decide it |
|---|---|---|
| spydra | site, console (Auth0 login; api/health OK), docs index (no Stellar/Soroban), blog (2026-09-03), SCF page, OpenRWA sibling site, org repos (Fabric tooling + forks), linked repo (404), status page (DNS) | **Live:** a console sign-in (free trial) showing a working network / token store, or a public token-store page with issued assets; **Live on Stellar specifically:** a Stellar contract or testnet deliverable from the SCF #31 build, or a docs page naming Stellar; **Development:** a dated changelog / release note ≤90 d with the product still gated; **Inactive:** a parked/for-sale page or a wind-down statement (none seen) |

## Not examined

- X / Twitter, Discord, Telegram for all eight rows (never evidence under the rule).
- Splito: the request form was not submitted and no `/pay/<id>` page was opened (would create data on their backend).
- Spydra: no console account was created; the Auth0 login was not attempted.
- Zebec: the SuperApp's `/stellar` route sits behind an email verification code; not entered.
- Normal: the Notion page `normalfinance.notion.site/mainnet-v1` (client-rendered) was not read; the vault's true TVL was not computed (DeFindex's API needs a key; the dapp's "$100,000" figures were recorded, not relied on).
- Token Tails: no store build was installed; CatWatch/CatHealth/CatFind were not searched under other publisher names.
- Vanna: the footer's Base / Arbitrum / Optimism claim — no EVM app was searched for.
- Give Hub: no account was registered, so authenticated API routes were not read.
- Inference Studio (waitlist) — not a product; not probed.

## Mistakes made or found

1. **RPC `getEvents` by contractId is not an activity check.** For Normal's vault it returned 0 events over the full 7-day retention window while stellar.expert's contract activity shows user deposits/withdrawals on 2026-09-01 and 09-02 (Horizon confirms both transactions). A DeFindex vault emits no events of its own — the events come from the token and strategy contracts it calls. "No events" ≠ "no invocations"; read invocation history (stellar.expert Contract Activity, or Horizon for a known tx) before calling a contract idle. The zebec check was fine only because that contract does emit its own events.
2. **The Browser pane's default tab is shared with the sibling agent.** Mid-batch my stellar.expert navigation was replaced by a Mystic Finance page (the other agent's row); the DeFindex read in that batch happened to survive (address matched). Re-ran everything browser-side in a dedicated tab (`tabs_create` → `tab-2`) and passed `tabId` on every action. Same hazard for the scratchpad directory: my helper script was overwritten by another session's file mid-run; moved to a subdirectory with unique names.
3. **A 403 that is a UA block, not a gate:** `api.tokentails.com/user/leaderboard` returns 403 to python-urllib and 200 to a browser UA. Treat 403s as could-not-check and retry with a browser UA before recording them.
4. The 09-05 high-tier notes for spydra (Presidio fork) and the-give-hub (`www` marketing repo) cited repos that are not the product's own — the class of substitution the corrections block already withdrew for eight other rows; both are recommended for correction above.
