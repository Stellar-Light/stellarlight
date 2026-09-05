# Verification packets — low tier re-graded under the product-state rule (2026-09-05)

Rule applied (QUALITY.md, lessons 13–14, 2026-09-05 evening): a Live verdict is the product's own state — a working app, non-empty metrics, or recent commits in **this row's own repo** plus a substantive page (>300 rendered chars); banners, titles, "Launch App" buttons and marketing claims are chrome; empty or zero metrics veto Live; a login shell is not a working app; Inactive needs a parked / retired / removed page or an explicit wind-down statement (quoted); a live-200 page never stands as observed dead; X/Twitter is never evidence.
Re-graded verdicts (30 rows): **Live 16 · Development 1 · Inactive 0 · cannot tell from the web 13**.
Changed vs the original low grades: **14 of 30** — 10 of the 25 low Live verdicts did not survive (all became cannot-tell: marketing-only pages, login / connect-wallet shells, removed row repos, one app rendering empty tables), mystic flipped Development → Live on its app's vault metrics, transfuse dropped Development → cannot-tell (the org repo is 8 months idle, not "in progress"), onboarding-club and ortege dropped Inactive → cannot-tell (an empty org and transport failures are not parked pages); 16 stand (15 Live and stallion's Development, every one on new evidence — the original low tier had no product-state signal for any of them).
Where the low tier found product state it was almost never on the row's website: 4 rows rest on a public RPC / status surface answering for Stellar today (lightsail-network-quasar, ankr, alchemy, quicknode), 6 on a consumer app release inside 30 days (afriex, wave, wirex-pay, felix-pago, lemon; plutope at 95 days), 1 on validator history archives current to the live ledger (public-node), 3 on an app rendering non-empty data (walletconnect, redswan, mystic). Three Live rows are the **weakest class** and are flagged in their notes so the owner can hold them back as a group: `getblock` (company-wide status page, no Stellar component), `kotani-pay` (API health check only), `plutope` (app release 95 days old, row repo removed).
Every page, app, repo, App Store listing and RPC endpoint below was fetched 2026-09-05 (22:50–23:45 UTC); `asOf` is that date. JS-rendered pages were read in a real browser after a 6–8 s wait — the original packet read several with curl and recorded 14–180 rendered characters for pages that do render (cactus-link, dolphinze, ankr's chainlist). Public RPC endpoints were called with `getHealth`; App Store dates come from the iTunes lookup / search API and the listing page was fetched as well.
Nothing here touched the database. Rows whose GitHub link is an org rather than a repo (mystic, ortege, paychant, transfuse, onboarding-club, public-node, zettablock) are graded on what the org's repos say only when the page decides nothing, and every such repo is named as "not a row repo" — the medium tier's discipline.

## Live — 16 rows

| slug | current status / basis | page (status · title · body chars · metrics / markers) | app link result | own repo (name · last push · archived) | on-chain | re-graded | deciding URL — what on it decides | note |
|---|---|---|---|---|---|---|---|---|
| lightsail-network-quasar | Live / site-liveness | 200 · "Quasar - Stellar RPC & Data Services by Lightsail Network" · 1,052 chars · terminal-style page listing rpc / archive-rpc / galexie endpoints | rpc.lightsail.network `getHealth` → **`"status":"healthy"`, latestLedger 64,291,981** (closed 2026-09-05 ~23:00 UTC); horizon.lightsail.network answers 525 | none in row (page links github.com/lightsail-network) | none in row | **Live** | https://rpc.lightsail.network/ — getHealth "healthy", latestLedger 64291981 | The chain-serving endpoint decides, not the page. Worth attaching the org repo. |
| ankr | Live / site-liveness | 200 (2 redirects → www.ankr.com/rpc/stellar/) · "Free Blockchain RPC Endpoints for 75+ Networks: Ankr Chainlist" · 168 chars in curl (JS chainlist) | rpc.ankr.com/stellar_soroban `getHealth` → **healthy, latestLedger 64,291,981**; /stellar_horizon → "No nodes available" (-32055); /stellar → key-gated | none in row | none in row | **Live** | https://rpc.ankr.com/stellar_soroban — getHealth "healthy", latestLedger 64291981 | The Soroban RPC serves mainnet without a key. The Horizon route said "No nodes available" at fetch time — a re-check item, not a veto. SCF R42 $60,000. |
| alchemy | Live / site-liveness | 200 (→ www) · "Alchemy \| Blockchain infrastructure for developers" · 10,610 chars · no Stellar mention on the home page; docs "Stellar API Quickstart" renders 3,770 chars | stellar-mainnet.g.alchemy.com/v2/docs-demo `getHealth` (sent with `Origin: https://www.alchemy.com`) → **healthy, latestLedger 64,292,013**; status.alchemy.com "Stellar — Operational"; changelog **Aug 6 2026 "Stellar Mainnet: stellar-rpc 27.1.1-198"** | none in row | none in row | **Live** | https://stellar-mainnet.g.alchemy.com/v2/docs-demo — getHealth "healthy", latestLedger 64292013 | Without the docs origin the same call returns "Unspecified origin not on whitelist" (the docs key is origin-bound), so the receipt needs the header. |
| quicknode | Live / site-liveness | 200 (→ www) · "Stellar RPC \| Quicknode Docs" · 3,853 chars · docs for Mainnet + Testnet endpoints (Horizon REST + RPC) | status.quicknode.com lists **"Stellar — Operational: Mainnet REST API, Mainnet JSON-RPC API"** and a resolved incident "Aug 21 · Stellar Mainnet JSON-RPC Degraded Performance"; /chains/xlm renders "Loading content…"; /changelog 404 | none in row | none in row | **Live** | https://status.quicknode.com/ — "Stellar … Operational" with a dated (Aug 21) Stellar incident | No public endpoint to hit (keyed); the status page is the product's own operational state for Stellar, not marketing. |
| walletconnect | Live / site-liveness | 200 · "WalletConnect: The Connectivity Layer for the Financial Internet" · 2,126 chars · **"Daily Network Volume $1,184,573,698"** rendered in a `dynamicTicker_value` span | Log in → dashboard (not needed) | none in row | none in row | **Live** | https://walletconnect.network/ — "Daily Network Volume $1,184,573,698" | Same value on two fetches 40 min apart (a daily figure). A non-empty network metric, not a claim; Stellar is not named on the page. |
| public-node | Live / site-liveness | 200 · "Home \| Blockchain Nodes Funded by Community - Public Node" · 6,752 chars · newest dated content 2024-10-01, newest blog post 2023-06-04 | `.well-known/stellar.toml` lists validators Boötes / Hercules / Lyra; **bootes-, hercules- and lyra-history.publicnode.org `stellar-history.json` all report currentLedger 64,292,031** — the live ledger at fetch | none in row (org publicnode: 0 public repos) | validators GCVJ4Z…H7I2, GBLJNN…4FCT, GCIXVK…IR2Z (from the toml, not the row) | **Live** | https://bootes-history.publicnode.org/.well-known/stellar-history.json — currentLedger 64292031 | The nodes are the product and their archives are current to the ledger; the website's content is two years old. Worth attaching the three validators to the row. SCF R3/13 $150,000. |
| afriex | Live / site-liveness | 200 · "Afriex: International Money Transfer \| Send Money to Africa" · 9,171 chars · marketing | App Store "Afriex - Money transfer" **v11.111.54 released 2026-09-02** (Afriex Inc; iTunes lookup id1492022568) | none in row | none in row | **Live** | https://apps.apple.com/us/app/afriex-money-transfer/id1492022568 — v11.111.54, 2026-09-02 | A shipping consumer app updated 3 days ago. Stellar not visible on the page. |
| wave | Live / site-liveness | 200 (2 redirects → www.wave.com/en/) · "Wave" · 808 chars · links App Store id1523884528 and Play com.wave.personal | App Store "Wave - Mobile Money" **v26.8.26 released 2026-08-26** (the id the site links); "Wave Business" v26.8.26 2026-08-27 | none in row | none in row | **Live** | https://apps.apple.com/us/app/wave-mobile-money/id1523884528 — v26.8.26, 2026-08-26 | Thin site, but it links the exact app and the app shipped 10 days ago. |
| wirex-pay | Live / site-liveness | 200 (→ www) · "Wirex \| Crypto Wallet, Cards & Payments for All" · 5,592 chars · marketing | App Store **"Wirex One" v8.0 released 2026-08-10**; "Wirex: All-In-One Trading App" v4.11.75 2026-01-23 | none in row | none in row | **Live** | https://apps.apple.com/us/app/wirex-one/id6762381032 — v8.0, 2026-08-10 | The app is Wirex's consumer product; the SCF R35 $150,000 award is for Wirex Pay (the chain), which is not visible on the page. |
| felix-pago | Live / site-liveness | 200 (→ www) · "Envía Dinero a Latinoamérica por WhatsApp \| Félix" · 20,593 chars · send-money calculator ("$ ----" until an amount is typed) | App Store **"Félix Pago - Envíos de dinero" v1.1 released 2026-08-24** (Felix Technologies Inc.); WhatsApp entry +1 669 333 3549 | none in row | none in row | **Live** | https://apps.apple.com/us/app/f%C3%A9lix-pago-env%C3%ADos-de-dinero/id6756128226 — v1.1, 2026-08-24 | The calculator's dashes are unfilled inputs, not empty metrics; the 12-day-old app release is the state. |
| lemon | Live / site-liveness | 200 · "Lemon" · 7,714 chars · static claims "+4M USUARIOS VALIDADOS · +2M TARJETAS VISA" (chrome) | App Store (Argentina) **"Lemon - Billetera virtual" v3.0.15 released 2026-09-01** (Lemon Cash Inc; not listed in the US store) | none in row | none in row | **Live** | https://apps.apple.com/ar/app/lemon-billetera-virtual/id1499421511 — v3.0.15, 2026-09-01 | Claims ignored; the 4-day-old release decides. |
| redswan | Live / site-liveness | **500** · "RedSwan Digital Real Estate - Tokenized Commercial Real Estate" · 7,305 chars rendered on the 500 · landing offerings tagged "Coming Soon" | app.redswan.io renders **"Properties \| RedSwan" — 8+ offerings with TARGET IRR / CASH YIELD / MIN INVEST** (LDV at Maidstone 8.0% / 5.7% / $25,000; The Carmen Hotel 8.4% / 8.0% / $100,000; The Capri Hotel 17.0% / 10.7% / $25,000 …), Express Interest; /login 404 | none in row | none in row | **Live** | https://app.redswan.io/ — marketplace lists offerings with yields and minimums | The row's site answers HTTP 500 with a full body — point the row at the app. Two offerings show "EQUITY MULTIPLE 0x" (the coming-soon ones); the rest carry numbers. Stellar not visible. |
| mystic | Live / source-inherited | **403 · "Suspected Phishing \| Cloudflare"** on mysticfinance.xyz (interstitial, 367 chars — could-not-check for the landing) | app.mysticfinance.xyz renders the app ("mysticfinance.xyz is our only URL, beware of phishing links"): Vaults — **Core USDT0 17.69% · Total Deposits $22.02M · Liquidity $1.47M; Core FXRP $3.72M; Core wFLR $728.65k** (Morpho vaults on Flare); Markets / Dashboard / Multiply / Swap | none in row (org mystic-finance, 54 repos: Stellar-RFQ 2026-09-01 — README "Octarine Settlement — duration-priced RFQ for Soroban"; morpho-blue-squid 2026-08-25 — not row repos) | none in row | **Live** | https://app.mysticfinance.xyz/ — vault metrics $22.02M / $3.72M / $728.65k | Original: Development on the org repo. The company's product is live on Flare (EVM); the Stellar side is a 4-day-old contract repo with no app surface — Live says "the product is up", not "the Stellar integration is live" (ichi / findtruman class). The Cloudflare phishing flag on the root domain is a third-party report, not a product statement. Suggest attaching mystic-finance/Stellar-RFQ as the row repo. |
| getblock | Live / site-liveness | 200 (→ /nodes/xlm/) · "Stellar RPC Node – Fast API Access \| GetBlock.io" · 9,549 chars · Stellar product page, keyed endpoints | status.getblock.io: **"All services are online — Last updated on Sep 5, 2026 at 11:05pm UTC"**; no Stellar / XLM component on the page | none in row | none in row | **Live** (weakest class) | https://status.getblock.io/ — "All services are online", dated today | Company-wide operational state, not Stellar-specific, and no public endpoint to hit. Hold at cannot-tell if the owner wants a Stellar-specific signal. |
| kotani-pay | Live / site-liveness | 200 · no `<title>` · 3,015 chars · B2B ramp ("Stellar" among 15 chains) | api.kotanipay.com/health and sandbox-api.kotanipay.com/health → **`"status":"ok"`**; documentation.kotanipay.com renders (3,991 chars, Sandbox + Live Dashboard links); every data endpoint answers 401/404 without a key | none in row | none in row | **Live** (weakest class) | https://api.kotanipay.com/health — `"success":true … "status":"ok"` | A heartbeat, not a usable flow or a metric. Hold at cannot-tell if the owner wants more than an API health check. SCF R11 $100,000. |
| plutope | Live / site-liveness | 200 · "Plutope — Compliant payments, settlement, cards & wallets" · 5,730 chars · "Download for iOS / Android", "Compliance Portal" | App Store (India) **"PlutoPe: Crypto Wallet" v1.0.35 released 2026-06-02** (95 days); guessed Play ids 404 | plutopein/plutope-merchant-stellar · **404 (removed)** (org PlutopeIn: 0 public repos) | none in row | **Live** (weakest class) | https://apps.apple.com/in/app/plutope-crypto-wallet/id6466782831 — v1.0.35, 2026-06-02 | 95 days is outside the 90-day window (litemint precedent) and the row repo is gone. Downgrade to cannot-tell if the window is held strictly. |

## Development — 1 row

| slug | current status / basis | page (status · title · body chars · metrics / markers) | app link result | own repo (name · last push · archived) | on-chain | re-graded | deciding URL — what on it decides | note |
|---|---|---|---|---|---|---|---|---|
| stallion | Live / source-inherited | 200 · no title · **137 chars: "This domain is for sale · Re-visit the page to contact the owner"** on earnstallions.xyz (parked) | stallion-frontend-tau.vercel.app (homepage of the org's frontend repo) renders **"Home \| Stallion — Powering the Global Talent Pipeline on Stellar"**, 10,729 chars: Find Work / Hire Talent, Login / Sign Up, static claims "30+ Full-time SWEs Hired · 100+ Happy Customers", illustrative bounty cards ("Sarah → Solana Fdn"); **/bounties 404** | stallionsassemble/stallion-contract · 2026-05-16 · no; org also stallion-frontend 2026-08-02 and stallion-backend 2026-07-15 (same product, not row repos) | none in row | **Development** | https://stallion-frontend-tau.vercel.app/ — a deployed shell with no bounty listings, over repos pushed 34–112 days ago | Original: Development on the contract repo alone (the packet saw an empty 200 shell; today the domain is for sale). The product's own domain lapsed but the product continues at a Vercel URL with three repos active this summer — not a wind-down. Inactive is the alternative if the owner reads the parked domain as the product's statement; either way the row's website needs fixing. SCF R39 $50,000. |

## Inactive — 0 rows

No low-tier row met the Inactive bar today. The two original Inactive verdicts (onboarding-club, ortege) rested on an empty GitHub org and on transport failures — neither is a parked / retired / removed page or a wind-down statement — and stallion's for-sale domain is answered by the product's own deployment elsewhere (above). Both original Inactive rows are re-graded cannot-tell below.

## Cannot tell from the web — 13 rows (no verdict; row keeps its current basis)

| slug | current status / basis | page (status · title · body chars · metrics / markers) | app link result | own repo (name · last push · archived) | on-chain | re-graded | deciding URL — what on it decides | note |
|---|---|---|---|---|---|---|---|---|
| onboarding-club | Live / source-inherited | no website in row; the SCF page names onboarding.club → **"Could not resolve host"** (NXDOMAIN — could-not-check) | none | none in row (org onboardingclub: **0 public repos**, created 2023-09) | none in row | cannot tell | https://api.github.com/orgs/onboardingclub — public_repos 0 (empty, not a death marker) | Original: Inactive on the empty org. An empty org plus a domain that doesn't resolve is silence, not a parked or retired page. SCF R21/26 $121,000. |
| ortege | Live / source-inherited | ortege.ai: TLS handshake fails ("tlsv1 alert internal error"); www.ortege.ai (Webflow proxy) fails TLS; app.ortege.ai times out — all could-not-check | none | none in row (org Ortege-xyz: studio = **fork of apache/superset**, 2024-12-20; helm-charts 2024-12-02) | none in row | cannot tell | https://api.github.com/repos/Ortege-xyz/studio — fork of apache/superset, pushed_at 2024-12-20 | Original: Inactive on "site unreachable + idle repo". Transport failures cannot support Inactive, and the packet's repo is a Superset fork, not the product's. `ortege-ai` (Inactive / no basis) and `ctx-ortege` (Live / source-inherited) are duplicate rows of the same product — a dedup candidate. |
| transfuse | Live / source-inherited | no website in row | none | none in row (org TransfuseLabs: transfuse-swap-ui **2026-01-10**, the only non-fork of 18 repos; 238 days idle) | none in row | cannot tell | https://api.github.com/repos/TransfuseLabs/transfuse-swap-ui — pushed_at 2026-01-10, not archived | Original: Development on this repo. Named for the product but not a row repo and 8 months idle — not "in progress"; nothing parked. Suggest a repo fix before any verdict. SCF R20 $30,000. |
| scorechain | Live / site-liveness | 200 (→ www) · "Crypto AML Compliance & Blockchain Analytics Platform \| Scorechain" · 9,850 chars · marketing; **no "Stellar" anywhere in the page or its HTML** | Login → gated platform | none in row | none in row | cannot tell | https://www.scorechain.com/ — marketing only, no product surface, no Stellar mention | SCF R36 $85,000 for "Scorechain Stellar Compliance"; the public site shows neither state nor Stellar. |
| infstones | Live / site-liveness | 200 · "InfStones - The Ultimate Blockchain Infrastructure Services Platform" · 2,195 chars · Stellar appears only as a logo (`trustedBy/protocol/stellar.svg`) | status.infstones.com: transport failure (could-not-check) | row repo entry is malformed (`gitlab.com/infstones-com` — not a repo); github.com/InfStones-com org: 0 public repos | none in row | cannot tell | https://infstones.com/ — marketing page, Stellar as a logo only | SCF R26/29 $150,000. Fix the repo entry. |
| zettablock | Live / site-liveness | 200 · "ZettaBlock - A unified platform for open and trustfree AI development." · 13,520 chars · pivoted to AI data; **no Stellar mention**; banner "Data Share Is Now Available On Snowflake Marketplace" (chrome) | app.zettablock.com renders a public Data Catalog (tables / chains supported — descriptive, no query results or metrics) | none in row (org ZettaBlock: 0 public repos) | none in row | cannot tell | https://app.zettablock.com/ — data-catalog text, no product state | The company is alive as an AI-data vendor; nothing shows the product's state or a Stellar surface. |
| cactus-link | Live / site-liveness | 200 (→ www) · "Cactus Custody: Qualified Custody Services for Institutions" · 14 chars in curl, renders a full custody page in a browser (Nuxt): "Discover our new Self-Custody MPC solution!", Hong Kong TCSP licence | "Get in touch" only; no client surface | none in row | none in row | cannot tell | https://www.mycactus.com/ — rendered marketing page, no product state | The packet's "14 chars" was a curl artefact; the page renders but says nothing about state. |
| exaion | Live / site-liveness | 200 · "Exaion Node-as-a-Service \| Exaion Crypto" · 6,758 chars · Stellar listed among 13 protocols (chrome) | "Book a Meeting" only | none in row | none in row | cannot tell | https://crypto.exaion.com/products/node — protocol list, no product surface | B2B node service (EDF group) with nothing public to check. |
| cede | Live / source-inherited | cede.store → cedehub.io/index.html **403 "Just a moment…"** (Cloudflare challenge, 16 chars — could-not-check) | none | cedelabs/sdk-examples · **404 (removed)**; org newest sdk-api 2025-10-01, cede.store 2024-06-02 (not row repos) | none in row | cannot tell | https://api.github.com/repos/cedelabs/sdk-examples — "Not Found" | Original Live rested on the org's sdk-api (a substitute). Site unchecked, row repo gone, nothing parked. |
| coinsender | Live / site-liveness | 200 · "Home \| CoinSender" · 3,925 chars · "Coming soon, we'll bring you new network capabilities"; Stellar in the supported-network list | dapp.coinsender.io renders "Coinsender \| Send Coins": Coins / NFTs / **Trade — Coming soon** / Subscription, "Please connect your wallet!", "Total amount with fee: 0 · 0 rows selected"; app.coinsender.io: transport failure | megadev-ou/cs-payments · **404 (removed)**; org Megadev-OU newest SendByEmail 2024-02-13 | none in row | cannot tell | https://dapp.coinsender.io/ — connect-wallet shell, zero totals, "Trade Coming soon" | A wallet gate is a login shell by another name; the row repo is gone and the org is 19 months idle. Not parked. |
| dolphinze | Live / site-liveness | 200 · "Dolphinze — Global Contractor Payments in Fiat or Crypto" · 180 chars in curl, ~600 rendered (React SPA): "Who are you? I pay contractors / I get paid as a contractor / I'm building a platform" | app.dolphinze.com → "You need to enable JavaScript to run this app." signup shell (the bundle links app.dolphinze.com/signup); api.dolphinze.com 404 | row repo is a GitLab path written as github.com/gitlab.com/… → gitlab.com/dolphinze/disbursements: last activity **2025-08-11**, public, not archived | none in row | cannot tell | https://gitlab.com/api/v4/projects/dolphinze%2Fdisbursements — last_activity_at 2025-08-11 | Thin landing, signup shell, repo 13 months idle; nothing parked. Fix the repo link. SCF R39 $129,800. |
| paychant | Live / source-inherited | 200 · "Fiat On and Off Ramp Solution for Stablecoins in Africa \| Paychant" · 5,999 chars · marketing | developer.paychant.com docs render (2,445 chars) — **"Last updated 1 year ago"**, newest date 2025-06-23; api.paychant.com and widget.paychant.com 404; docs.paychant.com transport failure | none in row (github link is the user `paychant`: paychant/stellar 2023-06-08, action.k8s 2022 — not row repos) | none in row | cannot tell | https://developer.paychant.com/ — docs "Last updated 1 year ago", no live surface | SCF R16/21 $150,000. The widget host the docs describe answers 404. |
| smart-deploy | Live / site-liveness | 200 (→ www) · "SmartDeploy \|\| Ready. Set. SmartDeploy!" · 79 chars (Next.js shell; nothing renders beyond the title) | launch.smartdeploy.dev (the repo's homepage) renders the description plus Docs / Setup links; the **PUBLISHED CONTRACTS / DEPLOYED CONTRACTS tables render empty** (curl sees the headers only) | tenk-dao/smart-deploy → renamed TENK-DAO/smartdeploy · 2024-07-19 · no (smartdeploy-frontend 2024-04-10) | none in row | cannot tell | https://launch.smartdeploy.dev/ — empty contract tables | Lesson 2: empty app metrics veto Live; the repo is 13 months idle; nothing parked. SCF R14/16/21 $194,800. |

## Applying the approved rows

Same path as the high and medium tiers: paste approved entries into `STATUS_FIX` in `scripts/data/curation-maps.ts`, run `.github/workflows/curate-projects.yml` dry-run, then `execute`, then read every slug back from `/api/projects`. Execute is the owner's call; nothing here ran. `from` is the live status read from `/api/projects` on 2026-09-05 for every entry (all 30 read `Live`). Cannot-tell rows are omitted — they keep their current basis. The three weakest-class Live rows (getblock, kotani-pay, plutope) are included so the owner can strike them as a group rather than hunt for them.

Receipts: none to run — this tier has no Inactive row. Two Live entries need a receipt caveat instead: `alchemy` decides on a JSON-RPC call that answers only with `Origin: https://www.alchemy.com` (`capture-receipt.ts` sends a GET without it and will record the origin error — capture the `getHealth` response by hand), and `lightsail-network-quasar` / `ankr` decide on POST `getHealth` bodies the GET-only script cannot reproduce.

```json
{
 "lightsail-network-quasar": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://rpc.lightsail.network/",
  "note": "Re-graded 2026-09-05 under the product-state rule: rpc.lightsail.network getHealth answers status healthy, latestLedger 64291981 (closed 2026-09-05); quasar.lightsail.network 1,052 chars listing the endpoints. No row repo."
 },
 "ankr": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://rpc.ankr.com/stellar_soroban",
  "note": "Re-graded 2026-09-05 under the product-state rule: rpc.ankr.com/stellar_soroban getHealth answers status healthy, latestLedger 64291981 without a key; /stellar_horizon said 'No nodes available' at fetch time. Chainlist page is JS (168 chars in curl). No row repo."
 },
 "alchemy": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://stellar-mainnet.g.alchemy.com/v2/docs-demo",
  "note": "Re-graded 2026-09-05 under the product-state rule: stellar-mainnet.g.alchemy.com/v2/docs-demo getHealth (with Origin https://www.alchemy.com) answers healthy, latestLedger 64292013; status.alchemy.com lists Stellar Operational; changelog 2026-08-06 'Stellar Mainnet: stellar-rpc 27.1.1-198'. No row repo."
 },
 "quicknode": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://status.quicknode.com/",
  "note": "Re-graded 2026-09-05 under the product-state rule: status.quicknode.com lists 'Stellar — Operational' for Mainnet REST API and Mainnet JSON-RPC API with a resolved Aug 21 Stellar Mainnet JSON-RPC incident; docs page 3,853 chars. No public endpoint (keyed). No row repo."
 },
 "walletconnect": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://walletconnect.network/",
  "note": "Re-graded 2026-09-05 under the product-state rule: the page renders 'Daily Network Volume $1,184,573,698' in a dynamic ticker (same daily figure on two fetches 40 min apart); 2,126 chars. Stellar not named on the page. No row repo."
 },
 "public-node": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://bootes-history.publicnode.org/.well-known/stellar-history.json",
  "note": "Re-graded 2026-09-05 under the product-state rule: the three validators in publicnode.org's stellar.toml (Boötes, Hercules, Lyra) publish history archives at currentLedger 64292031, the live ledger at fetch; the website's newest content is 2024-10-01. Org publicnode has 0 public repos."
 },
 "afriex": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://apps.apple.com/us/app/afriex-money-transfer/id1492022568",
  "note": "Re-graded 2026-09-05 under the product-state rule: App Store lists Afriex - Money transfer v11.111.54 released 2026-09-02 (iTunes lookup); site 9,171 chars. No row repo; Stellar not visible on the page."
 },
 "wave": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://apps.apple.com/us/app/wave-mobile-money/id1523884528",
  "note": "Re-graded 2026-09-05 under the product-state rule: App Store lists Wave - Mobile Money v26.8.26 released 2026-08-26 — the app id wave.com links; site 808 chars. No row repo."
 },
 "wirex-pay": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://apps.apple.com/us/app/wirex-one/id6762381032",
  "note": "Re-graded 2026-09-05 under the product-state rule: App Store lists Wirex One v8.0 released 2026-08-10 (Wirex: All-In-One Trading App v4.11.75 2026-01-23); site 5,592 chars. Wirex Pay (the SCF R35 chain) not visible on the page. No row repo."
 },
 "felix-pago": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://apps.apple.com/us/app/f%C3%A9lix-pago-env%C3%ADos-de-dinero/id6756128226",
  "note": "Re-graded 2026-09-05 under the product-state rule: App Store lists Félix Pago - Envíos de dinero v1.1 released 2026-08-24 (Felix Technologies Inc.); site 20,593 chars with the send-money calculator. No row repo."
 },
 "lemon": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://apps.apple.com/ar/app/lemon-billetera-virtual/id1499421511",
  "note": "Re-graded 2026-09-05 under the product-state rule: Argentina App Store lists Lemon - Billetera virtual v3.0.15 released 2026-09-01 (Lemon Cash Inc); site 7,714 chars, its '+4M usuarios' claims ignored as chrome. No row repo."
 },
 "redswan": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://app.redswan.io/",
  "note": "Re-graded 2026-09-05 under the product-state rule: app.redswan.io renders the Properties marketplace with 8+ offerings carrying target IRR / cash yield / minimum invest (LDV at Maidstone 8.0% / 5.7% / $25,000 …); redswan.io itself answers HTTP 500 with a full 7,305-char body — consider pointing the row at the app. No row repo."
 },
 "mystic": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://app.mysticfinance.xyz/",
  "note": "Re-graded 2026-09-05 under the product-state rule: app.mysticfinance.xyz renders vault metrics (Core USDT0 $22.02M deposits at 17.69%, Core FXRP $3.72M, Core wFLR $728.65k — Morpho vaults on Flare); the root domain shows a Cloudflare 'Suspected Phishing' interstitial (third-party flag). Stellar side: org repo mystic-finance/Stellar-RFQ pushed 2026-09-01 (Octarine settlement for Soroban) — not a row repo, no Stellar app surface. Original verdict was Development."
 },
 "getblock": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://status.getblock.io/",
  "note": "Re-graded 2026-09-05 under the product-state rule (weakest class): status.getblock.io reports 'All services are online — Last updated on Sep 5, 2026 at 11:05pm UTC' with no Stellar component listed; the Stellar node page is 9,549 chars of keyed-endpoint marketing. No public endpoint. No row repo."
 },
 "kotani-pay": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://api.kotanipay.com/health",
  "note": "Re-graded 2026-09-05 under the product-state rule (weakest class): api.kotanipay.com/health and sandbox-api.kotanipay.com/health answer status ok; documentation.kotanipay.com renders 3,991 chars; every data endpoint is key-gated. A heartbeat, not a flow or a metric. No row repo."
 },
 "plutope": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://apps.apple.com/in/app/plutope-crypto-wallet/id6466782831",
  "note": "Re-graded 2026-09-05 under the product-state rule (weakest class): India App Store lists PlutoPe: Crypto Wallet v1.0.35 released 2026-06-02 — 95 days, outside the 90-day window; site 5,730 chars; row repo plutopein/plutope-merchant-stellar is removed (404) and org PlutopeIn has 0 public repos."
 },
 "stallion": {
  "from": "Live",
  "to": "Development",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://stallion-frontend-tau.vercel.app/",
  "note": "Re-graded 2026-09-05 under the product-state rule: earnstallions.xyz is parked ('This domain is for sale', 137 chars) but the product's frontend deploys at stallion-frontend-tau.vercel.app ('Home | Stallion', 10,729 chars, no bounty listings, /bounties 404) and own repo stallionsassemble/stallion-contract pushed 2026-05-16 with org repos stallion-frontend 2026-08-02 and stallion-backend 2026-07-15. Website needs a fix; Inactive is the alternative if the parked domain is read as the product's statement."
 }
}
```
