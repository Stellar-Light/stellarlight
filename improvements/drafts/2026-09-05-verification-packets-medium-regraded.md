# Verification packets — medium tier re-graded under the product-state rule (2026-09-05)

Rule applied (QUALITY.md, lessons 13–14, 2026-09-05 evening): a Live verdict is the product's own state — a working app, non-empty metrics, or recent commits in **this row's own repo** plus a substantive page (>300 rendered chars); banners, titles, "Launch App" buttons and marketing claims are chrome; empty or zero metrics veto Live; a login shell is not a working app; Inactive needs a parked / retired / removed page or an explicit wind-down statement (quoted); a live-200 page never stands as observed dead; X/Twitter is never evidence.
Re-graded verdicts (32 rows): **Live 10 · Development 2 · Inactive 5 · cannot tell from the web 15**.
Changed vs the original medium grades: **20 of 32** — 14 of the 23 medium Live verdicts did not survive (2 became Development on the product's own "waitlist" / "Beta · Testnet" wording, 12 became cannot-tell), findtruman flipped Inactive → Live, bebop and block-time-financial dropped Inactive → cannot-tell (their pages render; the packet's curl read them as empty shells), every-finance and muwp moved Development → Inactive on parked / disabled pages; 12 stand (didstellar, polaris-lend, transfermole, and 9 Live).
Every page, app, repo and stellar.expert record below was fetched 2026-09-05 (21:30–22:20 UTC); `asOf` is that date. JS-rendered pages were read in a real browser after a 4–10 s wait — the original packet read several of them with curl and recorded "0 chars rendered" for pages that do render (block-time-financial, findtruman, ichi, every-finance's for-sale lander, jetprotocol's parked lander).
Nothing here touched the database. `fxdao` is listed for completeness but gets no entry: the owner already stamped it Inactive / human-verified on 2026-09-05 (`STATUS_FIX` in `scripts/data/curation-maps.ts`), and the rule agrees (app shows 0 vaults / 0 debt in all three currencies).

## Live — 10 rows

| slug | current status / basis | page (status · title · body chars · metrics / markers) | app link result | own repo (name · last push · archived) | on-chain | re-graded | deciding URL — what on it decides | note |
|---|---|---|---|---|---|---|---|---|
| kale | Live / site-liveness | 200 · "Kale On Stellar" · 17,191 chars · lore + farm docs, no metrics on the landing | kalefarm.xyz renders the farm (Block · Timer · Plant · Work · Harvest, tractor contract CBGS…KKY3, login / create account) | kalepail/KALE-sc · 2026-03-06 · no | none in row; KALE asset (stellar.expert): 532,475 payments on 2026-09-05 alone, 11,272 trustlines; contract CDL74…IGWA 315M sub-invocations | **Live** | https://api.stellar.expert/explorer/public/asset/KALE-GBDVX4VELCDSQ54KQJYTNHXAHFLBCA77ZY2USQBM4CSHTTV7DME7KALE/stats-history — 2026-09-05 row: payments 532,475 | On-chain state decides, not the page. Row's `onchain` block is empty; worth attaching the asset + contract. |
| ichi | Live / site-liveness | 200 · "ICHI \| Grow any token with low-slippage, on-chain liquidity" · ~900 chars rendered (curl: 0 — JS) · TOTAL VALUE LOCKED $18.21m · 45 AMMs · 26 networks · 897 vaults | app.ichi.org loads the vault app (11 chains, "Vaults Loading…", Connect Wallet) | none in row (org ichifarm: multi-rewards 2026-02-07 **archived** fork) | none in row; DefiLlama /protocol/ichi TVL $7.75M dated 2026-09-05 | **Live** | https://ichi.org/ — "TOTAL VALUE LOCKED $18.21m" | Live product, but no Stellar surface visible on the page (EVM chains only); the SCF award is under "solo-labs". Relevance, not liveness, is the open question. |
| alterscope | Live / site-liveness | 200 · "Alterscope — See on-chain markets clearly" · 6,808 chars · "Live on Ethereum and Stellar" (chrome) · illustrative $402m / $58m figures marked "Decorative" | app.alterscope.org renders: overview tiles are "--" (sign-in gated, "Sign in required to load overview data"), but the market-wide Signals feed carries live events timestamped "2m ago" (APY moves on Hyperevm / Ethereum) and a news feed 2h–8h old | none in row (org Solity-Network: alteron-subnet fork 2025-01-26) | none in row | **Live** | https://app.alterscope.org/ — Signals feed "SYS 2m ago" ×5, "+45 more market events" | Live rests on the feed, not the dashes or the banner. No Stellar-specific data was visible without sign-in. |
| one-click | Live / site-liveness | 200 (308 → www) · "One Click Labs" · 305 chars — a studio page ("Contact Us"), thin | stellar.oneclick.fi renders "Stellar DeFi Opportunities — Showing 1 to 10 of 276 entries" with pool / protocol / TVL / APY (XLM/SHX aqua $8,297,766.60; USDC/USDx aqua $7,534,932.92) after ~10 s | none in row (org One-Click-Crypto: eliza-starter fork 2025-02-08) | none in row | **Live** | https://stellar.oneclick.fi/ — "Showing 1 to 10 of 276 entries", live TVL per pool | The row's website is the 305-char studio page; the product is the Stellar app. Suggest a website fix to stellar.oneclick.fi. |
| chipper | Live / site-liveness | 200 · "Move Your Money Freely" · 6,443 chars · "5 million people" (claim) · App Store / Google Play links | App Store listing loads (25,908 chars) — Chipper Cash v1.158.0, released 2026-08-28 (iTunes lookup) | none in row (org ChipperCash: roast-my-pr fork 2024-03-29) | none in row | **Live** | https://apps.apple.com/us/app/chipper-cash/id1353631552 — version 1.158.0, currentVersionReleaseDate 2026-08-28 | A shipping consumer app updated 8 days ago is product state. Stellar usage not visible on the page. |
| boss-revolution | Live / site-liveness | 200 · "Send Money Online - Transfer Money Overseas \| BOSS Money" · 15,255 chars · live promo, ratings "4.9 · 79K reviews" | App Store listing loads — "BOSS Money Transfer. Send Fast" v26.8.1 released 2026-08-18 (IDT Global Processing Services) | none in row (org IDTdesign: icons 2024-08-20) | none in row | **Live** | https://apps.apple.com/us/app/boss-money-transfer-send-fast/id1169518032 — Version 26.8.1, released 2026-08-18 | Row website points at bossmoney.com (BOSS Money), the remittance product; the row name says BOSS Revolution (the calling app, also updated 2026-09-03). |
| fonbnk | Live / site-liveness | 200 · "Fonbnk — Stablecoin payments for global commerce" · 4,022 chars · "19 Markets · 14 Networks · <30s Settlement" | pay.fonbnk.com renders the working widget: "Buy USDT / Sell USDT / Bank transfer / You Pay NGN / You Receive USDT / Fee / Next: Specify your wallet"; dashboard.fonbnk.com is the merchant login | none in row (org fonbnk: pretium-balance-calculation 2026-04-15) | none in row | **Live** | https://pay.fonbnk.com/ — buy/sell USDT widget with NGN rail loads | Widget, not a shell: the flow is usable before login. Stellar not named on the page (USDC/USDT across 15 networks). |
| findtruman | Live / site-liveness | 200 · "Home - FindTruman" · ~1,000 chars rendered (curl: 0 — JS) · static claims "Users 100,000+ · Creators 500+ · Hosted Events 10+" · "Launch App" | Launch App → iris.findtruman.io/ai/ renders "FindTruman - AI-Powered App Creation Without Coding" with a Discover feed of ~50 items carrying view counts (233.6k, 158.8k, 11.2k …), Leaderboard, Create, "Login to view more" | TrumanStellar/Story-Creation · 2024-07-12 · no | none in row | **Live** | https://iris.findtruman.io/ai/ — Discover feed with per-item counts (233.6k …), Leaderboard, Create | Original medium verdict was Inactive on "empty 200 shell" — the page renders; the app shows content state. The product has pivoted to AI app-creation; the Stellar repo is idle 14 months, so Live here says "the company's product is up", not "Stellar integration is active". |
| litemint | Live / site-liveness | 200 · "Litemint — Forging Legacies Beyond the Game" · 2,412 chars · tournament promo "$1,000 prize pool" (chrome) | cyberbrawl.io renders an empty canvas; Google Play listing for Cyber Brawl shows "Updated on May 17, 2026" | litemint/litemint · 2026-01-25 · no | none in row | **Live** | https://play.google.com/store/apps/details?id=com.litemint.cyberbrawl — "Updated on May 17, 2026" | Weakest Live in this tier: the game build is 111 days old (outside the packet's 90-day window) and the wallet repo push is 7 months old. Downgrade to cannot-tell if the owner wants the 90-day line held strictly. |
| tellus-cooperative | Live / site-liveness | 200 · "Tellus Cooperative \| Aprende, Conecta y Emprende en Web3 desde LATAM" · 9,160 chars rendered · newsletter + course banner ("NUEVO: Curso Introducción a Blockchain") | telluscoop.com/stellar redirects to the blog root; latest post "Hackers usan IA para explotar DeFi" datePublished 2026-07-21 | none in row (org Tellus-Cooperative: FreshRSS fork 2026-01-10, Stellar-Bounties 2025-10-08) | none in row | **Live** | https://blog.telluscoop.com/p/hackers-usan-ia-para-explotar-defi — `datePublished` 2026-07-21 | The blog is the product (education co-op); a post 46 days old is the product's own state. |

## Development — 2 rows

| slug | current status / basis | page (status · title · body chars · metrics / markers) | app link result | own repo (name · last push · archived) | on-chain | re-graded | deciding URL — what on it decides | note |
|---|---|---|---|---|---|---|---|---|
| neovestor | Live / site-liveness | 200 · "Neovestor — Tokenized real-world assets, from $10" · 3,472 chars · **"Join waitlist" · "2026 Early access · regulated RWA platform"** · "Yield 0.0 % est." on the hero card, other yields "est." | app.neovestor.com = "Neovestor Pro" Privy sign-in shell ("An embedded wallet is minted on first sign-in"), nothing behind it without sign-in | none in row (org neovestor-tech: Aptos-Code-Collision 2024-09-29) | none in row | **Development** | https://neovestor.com/ — "Join waitlist · 2026 Early access" and "Yield 0.0 % est." | Original: Pre-Release. Same reading under the four-verdict rule: a product in waitlist with an empty app is in development, not live. SCF R28 $50,000. |
| stellar-passport | Live / site-liveness | 200 · "Stellar Passport — Proof you showed up. Proof you shipped." · 4,102 chars · "coming soon" marker · event cards link to demo.stellarpassport.xyz | demo.stellarpassport.xyz title **"Stellar Passport — Explore the Stellar Ecosystem (Beta · Testnet)"**; event page "Weekly Brazilian Ambassador Meeting" shows a live countdown to Tuesday September 8, challenges (+50 pts), passkey sign-in; app.stellarpassport.xyz 404 | none in row (org Tellus-Cooperative: FreshRSS fork 2026-01-10) | none in row | **Development** | https://demo.stellarpassport.xyz/ — title "(Beta · Testnet)" | Real usage (scheduled events, points, passkey wallets) but the product labels itself beta on testnet; that is its own state. SCF R40 $150,000. If the owner reads a public testnet beta with live events as Live, the same URL supports it. |

## Inactive — 5 rows

| slug | current status / basis | page (status · title · body chars · metrics / markers) | app link result | own repo (name · last push · archived) | on-chain | re-graded | deciding URL — what on it decides | note |
|---|---|---|---|---|---|---|---|---|
| polaris-lend | Live / site-liveness | 200 · no title · JS redirect to /lander, which renders the GoDaddy parking lander: **"jetprotocol.io is parked free, courtesy of GoDaddy.com." · "Get This Domain"** · curl sees 0 chars; the HTML bootstraps `window._trfd.push({ap:"parking"})` and `parking-lander/static/js/main.*.js` | none | jet-lab/polaris · 404 (removed) | none in row | **Inactive** | https://jetprotocol.io/lander — parked-domain lander ("parked free, courtesy of GoDaddy.com") | Same verdict as the packet, different basis: the packet cited the 404 repo; the parked page is the marker. Receipt caveat: the marker is client-rendered — `capture-receipt.ts` strips `<script>` and reports `parking=absent` (tested). Capture via browser text or extend the script to keep script-tag text. |
| every-finance | Live / site-liveness | 200 · no title · JS redirect to /lander → 302 https://forsale.godaddy.com/forsale/every.finance?…utm_medium=parkedpages → **"The domain name every.finance is for sale!"** (761 chars) | none (SCF page lists www.every.finance as the site) | Frihat-dev/every_finance · 2024-08-29 · no | none in row | **Inactive** | https://every.finance/lander — redirects to GoDaddy for-sale page: "every.finance is for sale" | Original: Development on EveryFinance/smart-contracts-Stellar (2026-07-13) — an org repo, not the row's, so not a signal under lesson 3. The org (the row's linked GitHub) also pushed onchain-manager-dapp 2026-05-15 (homepage "Elyx Onchain Manager"). The domain lapsed; owner may prefer Development plus a repo fix if the org work is the same product. SCF R30 $140,000. |
| muwp | Live / source-inherited | **451 · "Deployment Unavailable" · "This deployment is unavailable"** (x-vercel-error DEPLOYMENT_DISABLED, 69 chars) | muwp.xyz (homepage on the org repo) 402 · "Deployment Paused" · "This deployment is temporarily paused" | muwpay-uniswapper/muwp-stellar · 404 (removed) | none in row | **Inactive** | https://muwpay.com/ — Vercel DEPLOYMENT_DISABLED ("This deployment is unavailable") | Original: Development on Muwpay-uniswapper/MUWP (2026-08-18) — org repo, not the row's. Both product domains are disabled/paused and the listed repo is gone. SCF R26/35 $133,950. If the owner reads the 18-day-old org push as the same product, Development is the alternative. |
| didstellar | Live / site-liveness | 200 · "Revolution Through Digital Technology — Mavennet" · 5,379 chars · corporate consulting site, no DID:STELLAR mention | none | mavennet/stellar-did · **404 (removed)** | none in row | **Inactive** | https://api.github.com/repos/mavennet/stellar-did — "Not Found" (the product's only page, removed) | Same as the packet. The website is the vendor's live corporate page, not the product's; the product's sole artifact was removed. Weakest Inactive class here — a removed repo, not a wind-down statement. |
| transfermole | Live / source-inherited | no website in row (transfermole.com: transport failure, could-not-check) | none | ivandzen/transfermole · **404 (removed)**; the user's live repos are unrelated (ubuntu-wayland-stt 2026-08-07) | none in row | **Inactive** | https://api.github.com/repos/ivandzen/transfermole — "Not Found" | Same as the packet; same weakest class as didstellar. |

## Cannot tell from the web — 15 rows (no verdict; row keeps its current basis)

| slug | current status / basis | page (status · title · body chars · metrics / markers) | app link result | own repo (name · last push · archived) | on-chain | re-graded | deciding URL — what on it decides | note |
|---|---|---|---|---|---|---|---|---|
| bebop | Live / source-inherited | no website in row | none | christopherkarani/escrowcotract · 2024-11-14 · no | none in row | cannot tell | https://api.github.com/repos/christopherkarani/escrowcotract — pushed_at 2024-11-14 (idle, not a death marker) | Original: Inactive on the idle repo — an idle repo is not a parked/retired page. Same author has BebopEscrow (2025-08-18) and bebop-vapor (2025-05-27): not row repos, but they say the project outlived the listed one; suggest a repo fix before any verdict. bebop.cash (a guess, not row data) is listed for sale on expireddomains.com. SCF R28/31 $148,970. |
| block-time-financial | Live / site-liveness | 200 · no `<title>` · ~2,500+ chars rendered (curl: 0 — JS) · B2B "Digital Core Platform", latest insight dated 8/6/2025, no metrics | none | blocktimefinancial/option · 2023-10-06 · no | none in row | cannot tell | https://blocktimefinancial.com/ — substantive rendered page, no product state, no wind-down | Original: Inactive on "empty 200 shell" — the page renders. A live-200 page never stands as observed dead; nothing shows product life either (repo idle 3 years). |
| yellow-card | Live / site-liveness | 200 · "Stablecoin Payments Infrastructure - Yellow Card" · 4,484 chars · "$10b" claim · "Speak to an expert" (B2B) | none (no app / dashboard link; the App Store "Yellow Card" v1.0.1 2020 is a different seller, Paul Barnes) | none in row (org yellowcardfinancial: backend-test 2026-04-23) | none in row | cannot tell | https://yellowcard.io/ — marketing only, no product surface | The packet's second signal was an org repo named backend-test. A well-known company, but nothing on the web shows the product's own state. |
| solar-wallet | Live / site-liveness | 200 · "Simple and Secure Stellar Wallet \| Solar Wallet" · 1,220 chars · "beta", download links | App Store "Solar Stellar Wallet" v0.28.2 released 2022-03-04; GitHub latest release v0.28.1 2022-02-24 | none in row (org satoshipay: js-stellar-sdk fork 2023-05-09; satoshipay/solar itself pushed 2023-03-04) | none in row | cannot tell | https://itunes.apple.com/lookup?id=1458490218 — currentVersionReleaseDate 2022-03-04 | Packet's second signal was a fork of js-stellar-sdk. The wallet still installs but nothing has shipped in 4.5 years; not parked, not shown alive. |
| open-gamefi-sdk | Live / site-liveness | 200 · GitHub repo page (the row's website is the repo) · 3,413 chars | none | yanis7774/Stellar-GameFi-integration · 2025-03-21 · no | none in row | cannot tell | https://api.github.com/repos/yanis7774/stellar-gamefi-integration — pushed_at 2025-03-21, not archived | An SDK's state is its repo: 17 months idle, not archived. Neither live nor retired. |
| vaquita | Live / site-liveness | 200 · "Vaquita Saving money, but make it fun" · 2,520 chars · "+12%" illustration, no numbers | app.vaquita.fi: 3-screen onboarding ("your gamified savings app on Stellar") then /login — "Sign up to start saving securely"; a login shell | none in row (user vaquita-fi: vaquita-lemon 2026-03-11, vaquita-base 2025-11-13 — not row repos) | none in row | cannot tell | https://app.vaquita.fi/login?redirect=%2F — sign-in gate, no product state visible | Deployed app, but a login shell is not a working-app signal. SCF R42 $64,900. A repo fix (vaquita-fi/*) would give the row a second signal. |
| blockedenxyz | Live / site-liveness | 200 · "BlockEden.xyz \| Web3 Infrastructure & Crypto Payments for Merchants" · 2,637 chars · "$50m" / "99.9%" claims · Stellar Soroban indexer listed | /dash → /auth/login ("Sign in to your BlockEden.xyz account") | none in row (org BlockEdenHQ: web-blockeden-home 2025-03-25 **archived**) | none in row | cannot tell | https://blockeden.xyz/auth/login?next=%2Fdash — login shell | API marketplace behind login; the only org repo is archived. |
| centiiv | Live / site-liveness | 200 · "Centiiv — Global Payment Infrastructure" · 5,559 chars · static claims "200+ businesses · 50K+ payments · 2M+ API calls" | /get-started is an onboarding questionnaire ("Let's get to know each other"); app./dashboard. hosts do not resolve | centiiv/protocol-node · **404** (org Centiiv: convoy fork 2025-10-29) | none in row | cannot tell | https://www.centiiv.io/get-started — questionnaire, no product state | Claims are chrome; own repo gone; nothing parked. SCF R36 $51,300. |
| legacy-suite | Live / site-liveness | 200 · "Digital Estate Planning Platform \| …" · 4,387 chars · banner "Legacy Suite 2.0 Is Now Live" (chrome) | app.legacysuite.com → /login ("Estate Planning Dashboard"), login shell | Avento-Labs/legacy-suite-contracts · 2024-10-31 · no | none in row | cannot tell | https://app.legacysuite.com/login — login shell | Exactly the banner class lesson 1 excludes. |
| lumenswap | Live / site-liveness | 200 · "Lumenswap \| Decentralized Exchange on Stellar" · 1,440 chars · XLM $0.186 price ticker renders | select-app lists OBM / Reward / Lottery / AMM / NFT; **obm.lumenswap.io/market → "Internal Server Error", amm.lumenswap.io/swap → 500, lottery.lumenswap.io → 500** | none in row (org lumenswap: swap-contract 2024-06-02) | none in row | cannot tell | https://obm.lumenswap.io/market — 500 Internal Server Error on the trading app | Every product surface errors; only the landing (and a price feed) works. A 500 is not a parked/retired statement, so no Inactive — but a persisting 500 across a re-check window should be. SCF R6 $6,787. |
| mobula-labs | Live / site-liveness | 200 · "Mobula \| Data and execution for the best onchain apps" · **295 chars rendered** (Framer; below the 300 floor) | API answers `429 "You need to create an API key on admin.mobula.io"` on every public endpoint tried; docs.mobula.io linked | none in row (org MobulaFi: MTT / mobula_sdk 2026-05-24 — not row repos) | none in row | cannot tell | https://api.mobula.io/api/1/metadata?asset=stellar — 429 key gate, no data | The API is up but gated; the page is thin. Org pushes are recent but not the row's repo. SCF R34 $122,000. |
| remittease | Live / site-liveness | 200 · "RemittEase – Fast & Modern Cross-Border Remittances" · 5,241 chars · static calculator ("1 USD ≈ 18.5 ZAR", "0.5% fees") | pay.remittease.xyz → "Get started · Secure sign-in • Wallet created automatically" (176 chars), sign-in shell | Web3WizardZ/remi-p · 2025-12-08 · no | none in row | cannot tell | https://pay.remittease.xyz/ — sign-in shell | Repo 9 months idle; app gated. SCF R36 $54,050. |
| siborg | Live / site-liveness | 200 (308 → www) · "SiBorg Labs - Consumer Crypto Innovation" · 2,443 chars · studio page | dsponsor-app.siborg.io "Siborg on Stellar" renders one offer — "Watcher · ACTIVE · 1 XLM · Start 11/7/2025 · End 11/29/2025" — plus static "3+ publishers · $10k+ · 150+ transactions" | siborg-ads/stellar-client · 2025-05-13 (single push at creation) · no | none in row | cannot tell | https://dsponsor-app.siborg.io/ — only listed offer ended 2025-11-29 | The app loads, but its only product data is 9 months stale and the row repo has one commit. SCF R31 $95,900. |
| wombat | Live / site-liveness | 200 (308 → www → /swap) · "Cross-Chain Token Swap \| Wombat Exchange" · ~1,500 chars rendered · **IMPACT -- · MIN. RECEIVED -- · CUMULATIVE -- · 24H VOL -- · TOTAL TVL --** (same after accepting the region notice) · Stellar listed among 26 networks | the website is the swap app; metrics stay dashes without a wallet | none in row (org wombat-exchange: dimension-adapters fork 2026-03-13) | none in row; DefiLlama /protocol/wombat-exchange TVL $1.56M dated 2026-09-05 (BNB Chain 85%) | cannot tell | https://www.wombat.exchange/swap — "24H VOL -- · TOTAL TVL --" | Lesson 2 veto: empty page metrics. DefiLlama shows the protocol alive on BNB Chain today; if the owner accepts a third-party TVL tracker as product state, Live — but no Stellar TVL is reported there. SCF R18 $150,005. |
| fxdao | **Inactive / human-verified (owner, 2026-09-05)** | 200 · "Hello from FxDAO" · 819 chars · "Note: The protocol is still on development" | app.fxdao.io renders the protocol table: **USDx / EURx / GBPx — 0 debt issued · 0 XLMs collateral · 0 vaults · 0% health** | none in row (org FxDAO: FxDAO-SDK-JS 2025-09-03, FxDAO-SC 2025-06-16) | none in row | no new verdict — owner's Inactive stands | https://app.fxdao.io/ — every protocol metric is 0 | The packet's Live did not survive (lesson 2: zero metrics). Already in `STATUS_FIX` as Inactive with sourceUrl github.com/FxDAO/fxdao-sc; adding a second key would collide, so no entry. SCF R13 $224,800. |

## Applying the approved rows

Same path as the high tier: paste approved entries into `STATUS_FIX` in `scripts/data/curation-maps.ts`, run `.github/workflows/curate-projects.yml` dry-run, then `execute`, then read every slug back from `/api/projects`. Execute is the owner's call; nothing here ran. `from` is the live status read from `/api/projects` on 2026-09-05 for every entry. Cannot-tell rows are omitted — they keep their current basis.

Receipts (run before the write for the five Inactive rows; each was dry-tested in a worktree and the files discarded):

```sh
pnpm exec tsx scripts/data/capture-receipt.ts every-finance https://every.finance/lander "is for sale"
pnpm exec tsx scripts/data/capture-receipt.ts muwp https://muwpay.com/ "DEPLOYMENT_DISABLED"
pnpm exec tsx scripts/data/capture-receipt.ts didstellar https://api.github.com/repos/mavennet/stellar-did "Not Found"
pnpm exec tsx scripts/data/capture-receipt.ts transfermole https://api.github.com/repos/ivandzen/transfermole "Not Found"
pnpm exec tsx scripts/data/capture-receipt.ts polaris-lend https://jetprotocol.io/lander "parking"
```

`polaris-lend` is the one that will print `parking=absent` (tested): GoDaddy's lander renders "parked free, courtesy of GoDaddy.com" client-side and the only server-side markers (`_trfd.push({ap:"parking"})`, `parking-lander/static/js/main.*.js`) sit inside `<script>` tags the script strips. Either capture the browser-rendered text by hand or give the script a raw-HTML marker mode before citing it.

```json
{
 "kale": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://api.stellar.expert/explorer/public/asset/KALE-GBDVX4VELCDSQ54KQJYTNHXAHFLBCA77ZY2USQBM4CSHTTV7DME7KALE/stats-history",
  "note": "Re-graded 2026-09-05 under the product-state rule: KALE asset shows 532,475 payments on 2026-09-05 (stellar.expert stats-history), kalefarm.xyz renders the farm app, own repo kalepail/KALE-sc pushed 2026-03-06."
 },
 "ichi": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://ichi.org/",
  "note": "Re-graded 2026-09-05 under the product-state rule: page renders TOTAL VALUE LOCKED $18.21m, 897 vaults, 45 AMMs; DefiLlama reports $7.75M TVL dated 2026-09-05; app.ichi.org loads the vault app. No Stellar surface visible; no row repo."
 },
 "alterscope": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://app.alterscope.org/",
  "note": "Re-graded 2026-09-05 under the product-state rule: app.alterscope.org serves a live market-signals feed timestamped '2m ago' (overview tiles are sign-in gated dashes, not counted); landing 6,808 chars. No row repo."
 },
 "one-click": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://stellar.oneclick.fi/",
  "note": "Re-graded 2026-09-05 under the product-state rule: stellar.oneclick.fi lists 276 Stellar DeFi pools with live TVL/APY (XLM/SHX aqua $8,297,766.60); the row's website www.oneclick.fi is a 305-char studio page — consider pointing the row at the app."
 },
 "chipper": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://apps.apple.com/us/app/chipper-cash/id1353631552",
  "note": "Re-graded 2026-09-05 under the product-state rule: App Store lists Chipper Cash v1.158.0 released 2026-08-28 (iTunes lookup); site 6,443 chars. No row repo; Stellar usage not visible on the page."
 },
 "boss-revolution": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://apps.apple.com/us/app/boss-money-transfer-send-fast/id1169518032",
  "note": "Re-graded 2026-09-05 under the product-state rule: App Store lists BOSS Money Transfer v26.8.1 released 2026-08-18 (IDT); bossmoney.com 15,255 chars with live promo. No row repo."
 },
 "fonbnk": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://pay.fonbnk.com/",
  "note": "Re-graded 2026-09-05 under the product-state rule: pay.fonbnk.com renders the working Buy/Sell USDT widget (NGN bank transfer, fee, next step) before any login; dashboard.fonbnk.com is the merchant login; site 4,022 chars. No row repo."
 },
 "findtruman": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://iris.findtruman.io/ai/",
  "note": "Re-graded 2026-09-05 under the product-state rule: Launch App opens iris.findtruman.io/ai/ with a Discover feed of ~50 items carrying view counts (233.6k, 158.8k, 11.2k), Leaderboard and Create; landing renders (packet's 'empty shell' was a curl artefact). Own repo TrumanStellar/Story-Creation idle since 2024-07-12 — product pivoted to AI app-creation."
 },
 "litemint": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://play.google.com/store/apps/details?id=com.litemint.cyberbrawl",
  "note": "Re-graded 2026-09-05 under the product-state rule: Google Play lists Cyber Brawl 'Updated on May 17, 2026' (111 days — outside the 90-day window; weakest Live in the tier); own repo litemint/litemint pushed 2026-01-25; site 2,412 chars."
 },
 "tellus-cooperative": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://blog.telluscoop.com/p/hackers-usan-ia-para-explotar-defi",
  "note": "Re-graded 2026-09-05 under the product-state rule: the blog is the product; latest post datePublished 2026-07-21, front page 9,160 chars with newsletter and course banner. No row repo."
 },
 "neovestor": {
  "from": "Live",
  "to": "Development",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://neovestor.com/",
  "note": "Re-graded 2026-09-05 under the product-state rule: page says 'Join waitlist · 2026 Early access' with 'Yield 0.0 % est.'; app.neovestor.com is a Privy sign-in shell. Waitlist product, nothing live."
 },
 "stellar-passport": {
  "from": "Live",
  "to": "Development",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://demo.stellarpassport.xyz/",
  "note": "Re-graded 2026-09-05 under the product-state rule: the app titles itself 'Stellar Passport — Explore the Stellar Ecosystem (Beta · Testnet)'; events with live countdowns (Sep 8) and passkey sign-in are real usage, but the product's own state is testnet beta. No row repo; SCF R40."
 },
 "polaris-lend": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://jetprotocol.io/lander",
  "note": "Re-graded 2026-09-05 under the product-state rule: jetprotocol.io redirects to a GoDaddy parking lander rendering 'jetprotocol.io is parked free, courtesy of GoDaddy.com'; own repo jet-lab/polaris 404. Parked page marker is client-rendered — see receipt caveat."
 },
 "every-finance": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://every.finance/lander",
  "note": "Re-graded 2026-09-05 under the product-state rule: every.finance redirects to forsale.godaddy.com ('The domain name every.finance is for sale!'); own repo Frihat-dev/every_finance idle since 2024-08-29. Org repos EveryFinance/smart-contracts-Stellar (2026-07-13) and onchain-manager-dapp (2026-05-15) are not row repos — owner may prefer Development plus a repo fix."
 },
 "muwp": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://muwpay.com/",
  "note": "Re-graded 2026-09-05 under the product-state rule: muwpay.com answers 451 DEPLOYMENT_DISABLED ('This deployment is unavailable') and muwp.xyz 402 'Deployment Paused'; own repo muwpay-uniswapper/muwp-stellar 404. Org repo Muwpay-uniswapper/MUWP pushed 2026-08-18 is not a row repo — owner may prefer Development."
 },
 "didstellar": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://api.github.com/repos/mavennet/stellar-did",
  "note": "Re-graded 2026-09-05 under the product-state rule: the product's only page, repo mavennet/stellar-did, is removed (GitHub 'Not Found'); the row website mavennet.com is the vendor's corporate site with no DID:STELLAR mention."
 },
 "transfermole": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://api.github.com/repos/ivandzen/transfermole",
  "note": "Re-graded 2026-09-05 under the product-state rule: no website in row; the only artefact, repo ivandzen/transfermole, is removed (GitHub 'Not Found'); the user's live repos are unrelated."
 }
}
```
