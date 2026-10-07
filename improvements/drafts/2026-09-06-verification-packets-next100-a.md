# Verification packets — next-100 batch A, 34 weak-basis rows (2026-09-06)

Recommended verdicts: **Live 8 · Development 2 · Inactive 3 · cannot-tell 21** (34 rows).
Confidence on the 13 verdict rows: **high 4 · medium 9 · low 0**; the 21 cannot-tell rows carry no verdict and keep their current basis.
**Every verdict here is a recommendation; the owner's approval of a MOVE is what makes it human-verified.**

Rule applied: the product-state rule from `2026-09-05-verification-packets-top100.md` (corrections block) and `2026-09-05-verification-packets-medium-regraded.md` ("How to read a verdict"), with the instrument list that worked in `2026-09-06-deep-verify-a.md`. Live needs the product's own state (store release ≤90 d via the iTunes lookup / Play "Updated on", live page metrics, a working app, chain activity, an answering RPC, or a docs page that documents the Stellar product); banners, titles and CTAs are chrome; empty or zero metrics veto Live; a raw fetch of a client-rendered shell is could-not-check until rendered in a browser; the second signal must be this row's own repo; Inactive needs a parked / for-sale / retired / removed page or repo with a receipt; timeouts, 403s and DNS failures are could-not-check; a testnet/beta label is presented, not asserted.

Every URL below was fetched 2026-09-06 03:20–05:05 UTC (evening of 2026-09-05 Pacific). `asOf` is the evidence's own date (a store's `currentVersionReleaseDate` / "Updated on", a repo's `pushed_at`); where the page observed today is itself the evidence, `asOf` is 2026-09-06 and the row says so. Client-rendered pages were read in a Browser-pane tab this session owned (`tab-5`); nothing was read from the shared tab. GitHub dates are `pushed_at` from the REST API via `gh api`. SCF cells are row data (our enrich-scf lane) plus the SCF project page where opened; no verdict rests on them. X / Telegram / Discord were not used for any row (login shells). Nothing here touched the database.

Rows: the 34 in `packets-next100-a.json` (prominence desc, then slug): vesseo, decaf, xcapit, zet, zkcross, accelar, airswift, almanax, amero, anchainai, artizen, assetdesk, autowhale, axal, bes-metaverse, bevor, bidali, bigger, bingtellar, bitgifty, bitwage, blade, blaze, bondhive, bp-ventures, cartwey, chainlink-oracles-relayer, chainpatrol, chats, clickpesa-debt-fund, clixpesa, clob, coala-pay, cobo. All 34 read `Live` today; 30 on `site-liveness`, 4 on `source-inherited` (airswift, assetdesk, bigger, clickpesa-debt-fund).

---

## Live — 8 rows (recommend stamping `human-verified`, status unchanged)

### vesseo — Live / site-liveness → **Live** (high)

Row: `Live / site-liveness / asOf 2026-07-20 / https://vesseoapp.com/`; availability iOS `id1514223107` (checked 2026-08-13); no repo; prominence 78.

| instrument | result |
|---|---|
| https://itunes.apple.com/lookup?id=1514223107&country=us (and `country=ar`) | "Vesseo: Your Global Wallet" v113.0, `currentVersionReleaseDate` **2026-09-02T16:58:35Z**, seller SUNSHIP, INC., bundle `io.sunship.app`; description: "save in USDC … Send and receive USDC instantly" |
| https://play.google.com/store/apps/details?id=io.sunship.app | "Vesseo: Your Global Wallet" · **Updated on Sep 1, 2026** · 1M+ downloads |
| https://vesseoapp.com/ (curl) | 200 → `/geolocalization` · 1,045 chars · "We're expanding globally! You will be able to download the app…" (marketing) |
| GitHub | none in row |

**Deciding evidence:** https://itunes.apple.com/lookup?id=1514223107&country=us — the product's own store release dated 2026-09-02 (4 days); Play agrees (2026-09-01).
**Confidence: high** — two store releases inside a week, both the product's own. Stellar is not named on either listing (the wallet is USDC-on-Stellar by the row's own description; the store text says "USDC"). Row `availability` should add the Play id `io.sunship.app`.

### axal — Live / site-liveness → **Live** (high)

Row: `Live / site-liveness / asOf 2026-09-01 / https://axal.com/`; row repo `getaxal/verified-signer`; SCF #35 $60,800.

| instrument | result |
|---|---|
| https://itunes.apple.com/lookup?id=6752484843&country=us | "Axal: High Yield Savings" v3.28, `currentVersionReleaseDate` **2026-09-03T13:33:20Z**, seller Lockbox Technologies Inc. |
| https://play.google.com/store/apps/details?id=com.axal.android | "Axal: High Yield Savings" · **Updated on Sep 2, 2026** · 1K+; listing text "fully-backed stablecoins (USDC by Circle)" |
| https://api.github.com/repos/getaxal/verified-signer | `pushed_at` **2026-08-31T19:04:31Z**, not archived, not a fork (own repo, 6 d) |
| https://axal.com/ (curl) | 200 · 6,724 chars · store buttons (both ids above are in the page markup) |
| https://app.axal.com/ | 404 Vercel `DEPLOYMENT_NOT_FOUND` (no web app; the product is the mobile app) |
| https://docs.axal.com/ · `/strategy-stack` | 200 docs (1,513 chars index); strategy page is client-rendered (92 chars via curl); no Stellar mention found via curl |
| GitHub org getaxal | `axal-docs` (fork) 2026-09-04, `verified-signer` 2026-08-31 |

**Deciding evidence:** https://itunes.apple.com/lookup?id=6752484843&country=us — store release 2026-09-03 (3 days); own repo pushed 2026-08-31.
**Confidence: high** — store release + own-repo push inside a week. Stellar is not visible on the store listing or the docs read via curl (the row's own description says "expanding into Stellar"); the verdict is about product life, not Stellar depth. Row `availability` should add both store ids.

### cobo — Live / site-liveness → **Live** (high)

Row: `Live / site-liveness / asOf 2026-08-27 / https://cobo.com/`; availability web (Cobo Portal) + iOS `id6450997458` Cobo Guard (checked 2026-07-15); no repo; SCF #35 $150,000.

| instrument | result |
|---|---|
| https://manuals.cobo.com/en/portal/supported-tokens-and-chains (via `https://manuals.cobo.com/llms-full.txt`, line 5008) | the product manual's chain table carries **"Stellar \| 1"** (confirmations); `…/portal/transfers/fee-model` lists "* Stellar"; `…/portal/transfers/introduction` names XLM among memo-required chains; `…/portal/exchange-wallets/supported-exchanges` lists XLM — observed today |
| https://itunes.apple.com/lookup?id=6450997458&country=us | "Cobo Guard" v2.1.8, `currentVersionReleaseDate` **2026-07-08T01:56:22Z** (60 d), seller Cobo Global Limited |
| https://www.cobo.com/ (curl) | 200 · 8,275 chars · product site (Cobo Portal, Agentic Wallet), Sign In / Register |
| https://manuals.cobo.com/en/portal/introduction | 200 · 8,036 chars product manual |
| https://www.cobo.com/developers/llms.txt | 222-line developer index (no Stellar in page titles; the chain table lives in the manuals) |
| GitHub org CoboGlobal | `product-manual` 2026-09-05, `developer-site` 2026-09-03, `cobo-waas2-*-sdk` 2026-09-02 (org repos; row lists none) |

**Deciding evidence:** https://manuals.cobo.com/en/portal/supported-tokens-and-chains — the product's own manual listing Stellar as a supported chain, observed today (2026-09-06); corroborated by the Cobo Guard store release 2026-07-08 (inside 90 d).
**Confidence: high** — a Stellar-specific docs page plus an in-window store release; the org's SDK pushes this week are a third signal but not the row's repo.

### clixpesa — Live / site-liveness → **Live** (medium)

Row: `Live / site-liveness / asOf 2026-08-17 / https://clixpesa.com/`; no repo (org clixpesa); SCF #26 $35,050.

| instrument | result |
|---|---|
| https://play.google.com/store/apps/details?id=com.clixpesa.app | "Clixpesa" · **Updated on Jun 23, 2026** (75 d) · 100+ downloads (id from the row's own page markup) |
| https://itunes.apple.com/search?term=clixpesa&country=ke&entity=software | no iOS app |
| https://clixpesa.com/ (curl) | 200 · 2,690 chars marketing; Stellar not named on the page or the Play listing |
| https://app.clixpesa.com/ | NXDOMAIN (could-not-check; no web app) |
| GitHub org clixpesa | `analytics-proxy` 2026-06-21, `mint-contracts` 2026-04-07 (org repos, not row repos) |

**Deciding evidence:** https://play.google.com/store/apps/details?id=com.clixpesa.app — Play "Updated on Jun 23, 2026", the product's own release inside 90 d.
**Confidence: medium** — one in-window signal; no second product surface and Stellar is not visible on either the page or the listing. Row `availability` should add the Play id.

### cartwey — Live / site-liveness → **Live** (medium) — product pivot, owner should read the note

Row: `Live / site-liveness / asOf 2026-08-17 / https://cartwey.com/`; row repo `Cartwey001/cartwey-app`; SCF #38 $60,000 (self-checkout for retailers).

| instrument | result |
|---|---|
| https://play.google.com/store/apps/details?id=com.cartwey (id from the site's JS bundle `/assets/index-DGfTtOaE.js`) | "Cartwey" · **Updated on Aug 28, 2026** (9 d) · 500+; listing: "Cartwey delivers fresh groceries from your favourite local stores… built for Nigerian households" |
| https://itunes.apple.com/lookup — via `search?term=cartwey&country=us` | "cartwey" `id6747424781` v5.0.1, released **2026-05-26** (103 d), seller Cartwey Innovations Limited; description: grocery delivery app |
| https://cartwey.com/ (browser, tab-5, 7 s; curl = 26-char shell) | full page: "Order groceries from trusted stores around you with real-time tracking… 15k+ products · 7k+ customers · 6+ store locations" (static claims), store buttons |
| https://app.cartwey.com/ (browser) | "Cartwey - Merchant Dashboard · Login to your account" — login shell |
| https://api.github.com/repos/Cartwey001/cartwey-app | 404 (removed); org newest `Cartwey001/Cartwey-Org` 2025-03-03 |

**Deciding evidence:** https://play.google.com/store/apps/details?id=com.cartwey — the product's own store release 2026-08-28.
**Confidence: medium** — one in-window store release; the shipped product is a grocery-delivery app, not the Stellar self-checkout the row (and SCF #38) describe, Stellar is not visible anywhere, and the row's repo is gone. Live says "this company's product ships"; the owner may prefer a relevance/description review over a stamp.

### artizen — Live / site-liveness → **Live** (medium)

Row: `Live / site-liveness / asOf 2026-08-17 / https://artizen.fund/`; no repo (org artizen-fund).

| instrument | result |
|---|---|
| https://artizen.fund/ (browser, tab-5, 8 s; curl = 7-char shell) | renders the funding platform: **"Season 7 · $28,160,854 endowment · Fund drive #15 … Ends on Thursday, September 10th … TOTAL RAISED $1,155,561 · GOAL 2M"**, per-project rank/sales/match/raised (#1 $58,531 …), live countdown (4 days 13 hours) |
| https://app.artizen.fund/ | NXDOMAIN (the website is the app) |
| https://itunes.apple.com/search?term=artizen&country=us | no Artizen Fund app (results are unrelated sellers) |
| GitHub org artizen-fund | newest `seasons-contractsV2` / `seasons-contracts` 2024-06-18 (EVM) |
| page bundle hosts | tatum / thirdweb EVM RPC endpoints; no Stellar host |

**Deciding evidence:** https://artizen.fund/ — live drive metrics with a dated end (2026-09-10) and non-zero raised totals, observed today (2026-09-06).
**Confidence: medium** — one signal (live metrics today); repos idle 2+ years; no Stellar surface visible (the platform's chain plumbing is EVM). Live says the platform runs; Stellar relevance is the open question.

### blaze — Live / site-liveness → **Live** (medium)

Row: `Live / site-liveness / asOf 2026-09-01 / https://blaze.money/`; no repo (org blaze-xyz); SCF #18/#24 $180,000.

| instrument | result |
|---|---|
| https://docs.blaze.money/overview.md | product docs: **"Stablecoins \| USDC on Stellar, Ethereum, and Polygon"** and "Crypto (USDC on Stellar, Ethereum, Polygon)" — observed today |
| https://status.blaze.money/ | "All services are online — Last updated on Sep 6, 2026 at 4:18am UTC"; Website 99.990% uptime with daily rows back to Jun 08, 2026 |
| https://itunes.apple.com/search?term=blaze+money&country=us | "Blaze - Global payments" `id6450962383` v2.0, released **2026-01-26** (223 d), seller Blaze Payments, Inc |
| https://blaze.money/ (curl) | 200 · 6,199 chars marketing |
| https://app.blaze.money/ | NXDOMAIN; Play package not found under four guesses (could-not-check) |
| GitHub org blaze-xyz | `blaze-grok-plugin` 2026-08-28, `cli` 2026-06-24 (org repos, not row repos) |

**Deciding evidence:** https://docs.blaze.money/overview.md — the product's own docs naming USDC on Stellar, observed today (2026-09-06); status page live today.
**Confidence: medium** — docs + status page are today's product state; the only dated release (iOS) is outside 90 d and no row repo exists.

### chainpatrol — Live / site-liveness → **Live** (medium)

Row: `Live / site-liveness / asOf 2026-08-17 / https://chainpatrol.com/`; no repo (org chainpatrol); SCF #40 $100,000.

| instrument | result |
|---|---|
| https://chainpatrol.com/docs/external-api/overview | 200 · 9,751 chars · "ChainPatrol External API for scam URL and address blocking" (API reference, CLI, SDK) — observed today |
| https://chainpatrol.com/blog | post dates in markup **2026-09-05, 2026-09-04, 2026-08-21** |
| https://app.chainpatrol.io/ | 200 → `/auth/signin` (dashboard behind sign-in) |
| https://chainpatrol.com/ (curl) | 200 · 52,296 chars; Stellar appears only as an SDF testimonial ("supportive force in strengthening Stellar's security posture") |
| https://docs.chainpatrol.com/ | NXDOMAIN (docs live under chainpatrol.com/docs) |
| GitHub org chainpatrol | `docs` 2026-09-03, `discord-bot` 2026-07-05 (org repos; row lists none) |

**Deciding evidence:** https://chainpatrol.com/docs/external-api/overview — the product's own API docs observed today (2026-09-06), with a blog post dated 2026-09-05.
**Confidence: medium** — product docs + dated company posts; the dashboard is a sign-in shell and nothing shows a Stellar-specific surface beyond the testimonial and the SCF #40 award.

## Development — 2 rows

### bevor — Live / site-liveness → **Development** (medium)

Row: `Live / site-liveness / asOf 2026-08-27 / https://bevor.io/`; no repo (org Bevor-Protocol); SCF #40 $102,000.

| instrument | result |
|---|---|
| https://www.bevor.io/ (curl) | 200 · 3,626 chars · **"Early access coming soon"** · "Book a demo" (no sign-up, no app) |
| https://docs.bevor.io/ | 200 · nav shows **"Dashboard (Coming Soon)"**; `llms.txt` (129 lines) has no Stellar / Soroban page |
| https://app.bevor.io/ | redirects to www.bevor.io (no app host) |
| GitHub org Bevor-Protocol | `Bevor-Skills` 2026-09-03, `bevorai-docs` 2026-08-26, `Bevor-Action` 2026-04-29 (active org; row lists no repo) |

**Deciding evidence:** https://www.bevor.io/ — the product's own "Early access coming soon", observed today (2026-09-06).
**Confidence: medium** — the product states its own pre-launch stage and the team is pushing weekly; nothing parked or retired. The row says Rust/Soroban support; the docs do not mention Soroban yet.

### chainlink-oracles-relayer — Live / site-liveness → **Development** (medium) — owner may prefer Inactive; nothing parked

Row: `Live / site-liveness / asOf 2026-08-17 / https://docs.relink.services/`; no repo (org RelinkServices).

| instrument | result |
|---|---|
| https://docs.relink.services/supported-networks/stellar-soroban.md | the product's own Stellar page: **"Relink Products on Soroban — coming soon"**; describes Soroban as "a preview release … deploy them to a special test network dubbed Futurenet" (2023-era text) |
| https://docs.relink.services/ | 200 · 1,539 chars · GitBook; `llms.txt` lists "Stellar Soroban" and "Soroban / Rust" pages |
| https://relink.services/ | NXDOMAIN (could-not-check; the row's website is the docs host, which answers) |
| https://api.github.com/repos/RelinkServices/relink-contracts-rust-soroban | `pushed_at` 2024-02-05 (homepage docs.relink.services); org newest push is that repo (2.6 years idle) |

**Deciding evidence:** https://docs.relink.services/supported-networks/stellar-soroban.md — "coming soon" on the product's own Soroban page, observed today (2026-09-06; content undated).
**Confidence: medium** — the product's own words say not launched; no parked / retired / removed page or repo exists, so Inactive is not supportable under the rule. The 2.6-year idle org and Futurenet-era text are why the owner may still choose Inactive; if so the same URL is the source.

## Inactive — 3 rows (receipts captured, markers FOUND)

### bes-metaverse — Live / site-liveness → **Inactive** (high)

Row: `Live / site-liveness / asOf 2026-08-27 / https://azores.group/`; no repo (org BESMetaverse); no SCF award.

| instrument | result |
|---|---|
| https://azores.group/ (row website, curl) | 200 · "Travel Packages, Tours, Rentals & Real Estate \| Azores Group" — a travel company; no BES / metaverse / Stellar mention (wrong link in the row) |
| https://besmetaverse.com/ (and www) | 200 → **https://www.hugedomains.com/domain_profile.cfm?d=besmetaverse.com — "BesMetaverse.com is for sale \| HugeDomains · Buy now: $595"** |
| http://archive.org/wayback/available?url=besmetaverse.com&timestamp=20230601 | snapshot 2023-06-03 of https://www.besmetaverse.com/ (and 2024-01-15) — the domain was the product's site |
| https://api.github.com/users/BESMetaverse/repos | 2 repos: `metaverse` pushed 2023-05-25 ("virtual land ownership"), `besmetaverse-indexer` 2023-04-19; org `updated_at` 2023-04-08 |

**Deciding evidence:** https://besmetaverse.com/ → HugeDomains for-sale page, observed today (2026-09-06).
**Confidence: high** — a for-sale page on the product's own former domain (Wayback-confirmed) plus an org idle since 2023-05. Data fix: the row's website should not point at azores.group.

Receipt (`improvements/receipts/bes-metaverse-2026-09-06.json`, both markers FOUND, `where: text`, final URL hugedomains.com):

```sh
pnpm exec tsx scripts/data/capture-receipt.ts bes-metaverse https://besmetaverse.com/ "is for sale" "This domain is for sale"
```

### bigger — Live / source-inherited → **Inactive** (medium) — alternative: Development on the org's 2026-03 push

Row: `Live / source-inherited / asOf 2026-08-19 / lumenloop yaml`; website https://biggertech.co/; no repo (org bigger-tech); SCF #23/#28 $150,000 (Bigger Startup Camp).

| instrument | result |
|---|---|
| https://biggertech.co/ (https, and www) | transport failure (TLS not answering; DNS resolves 217.70.184.38) — could-not-check |
| http://biggertech.co/ | 200 · 312 chars · Gandi registrar placeholder: **"This domain name has been registered with Gandi.net … biggertech.co is unavailable"** (no site content) |
| https://bigger.tech/ | NXDOMAIN |
| https://api.github.com/users/bigger-tech | org `blog` = https://www.biggertech.co/ (the same dead domain), bio "Enterprise-grade engineering for startups", 21 repos; newest `stellar-faucet` pushed **2026-03-30** (160 d), `template-stellar-smart-contract` 2025-06-02 |

**Deciding evidence:** http://biggertech.co/ — registrar placeholder on the company's own domain (the org's own `blog` field points there), observed today (2026-09-06).
**Confidence: medium** — a parked-class page on the product's domain, but the org still pushed 5 months ago and no wind-down statement exists; if the owner reads the org's Stellar repos as the product, Development on `bigger-tech/stellar-faucet` (2026-03-30) is the alternative.

Receipt (`improvements/receipts/bigger-2026-09-06.json`, both markers FOUND, `where: text`):

```sh
pnpm exec tsx scripts/data/capture-receipt.ts bigger http://biggertech.co/ "has been registered with Gandi.net" "biggertech.co is unavailable"
```

### zkcross — Live / site-liveness → **Inactive** (medium) — the Stellar product (zkCrossDEX) is past tense in its own docs; the company lives on as SurfLiquid

Row: `Live / site-liveness / asOf 2026-08-17 / https://zkcross.network/`; row repo `dev-zkcross/sorobancontract_stellar_zkcrossdex`; SCF #25/#30 $250,000 (zkCrossDEX).

| instrument | result |
|---|---|
| https://zkcross-network-1.gitbook.io/learn.zkcross.network/ecosystem-validation/production-validation.md | **"zkCrossDEX served as the main proving ground for this phase. It was not just a product surface."** — past tense; page frames the DEX as the validation phase behind SurfLiquid |
| https://zkcross-network-1.gitbook.io/learn.zkcross.network/ecosystem-validation/ecosystem-deployments-and-grants.md | "On Stellar, zkCross **delivered** cross-chain liquidity routing … fiat on-ramp integration through Stellar Anchors" (past tense) |
| https://docs.zkcross.network/llms.txt | 24 pages, all SurfLiquid / infrastructure; no Stellar or DEX product page |
| https://zkcross.network/ (curl) | 200 · 6,295 chars · "Launch SurfLiquid"; static claims "$107M+ volume · 194K+ txs · 26,290 wallets" with "Verify on Dune"; Stellar named only as a grant source and a 2024 Medium post |
| https://www.surfliquid.com/ | 200 · 65-char shell (the new product) |
| app.zkcross.network · dex.zkcross.network · stellar.zkcross.network · zkcrossdex.com | all NXDOMAIN (could-not-check; no DEX host exists) |
| https://api.github.com/repos/dev-zkcross/sorobancontract_stellar_zkcrossdex | **404 (removed)**; user Dev-zkCross newest `demo-sdk-surfliquid` 2026-08-25, `zkCrossDEX_on_Arbitrum` 2025-05-02; org zkCross-Network newest `.github` 2026-01-19 |
| https://api.llama.fi/protocol/zkcross-network | no protocol (empty) |

**Deciding evidence:** https://zkcross-network-1.gitbook.io/learn.zkcross.network/ecosystem-validation/production-validation.md — the product's own docs describing zkCrossDEX as a completed phase, observed today (2026-09-06); the row's repo is removed and no DEX host resolves.
**Confidence: medium** — the marker is past-tense framing plus a removed repo, not an explicit "retired" sentence, and the company itself is active (SurfLiquid pushes 2026-08-25). If the owner wants an explicit retirement statement, hold at cannot-tell; if the owner reads the row as the company rather than the DEX, the same evidence supports Live for SurfLiquid — a different product.

Receipt (`improvements/receipts/zkcross-2026-09-06.json`, marker FOUND, `where: text`):

```sh
pnpm exec tsx scripts/data/capture-receipt.ts zkcross "https://zkcross-network-1.gitbook.io/learn.zkcross.network/ecosystem-validation/production-validation.md" "zkCrossDEX served as the main proving ground for this phase"
```

---

## STATUS_FIX entries (13 rows: 8 stamps, 5 moves)

Same shape as the 2026-09-05 packets; `from` is the live status read from `/api/projects` today (all 13 are `Live`). Paste approved entries into `STATUS_FIX` in `scripts/data/curation-maps.ts`, dry-run `curate-projects.yml`, then execute and read back. Nothing below has been applied.

```json
{
 "vesseo": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-02",
  "sourceUrl": "https://itunes.apple.com/lookup?id=1514223107&country=us",
  "note": "Packet 2026-09-06 (high): App Store 'Vesseo: Your Global Wallet' v113.0 released 2026-09-02 (Sunship, Inc); Play io.sunship.app updated 2026-09-01, 1M+ downloads. Store text names USDC, not Stellar. Add Play id to availability."
 },
 "axal": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-03",
  "sourceUrl": "https://itunes.apple.com/lookup?id=6752484843&country=us",
  "note": "Packet 2026-09-06 (high): App Store 'Axal: High Yield Savings' v3.28 released 2026-09-03; Play com.axal.android updated 2026-09-02; own repo getaxal/verified-signer pushed 2026-08-31. Stellar not visible on the listing (USDC by Circle). Add both store ids to availability."
 },
 "cobo": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "https://manuals.cobo.com/en/portal/supported-tokens-and-chains",
  "note": "Packet 2026-09-06 (high): Cobo Portal manual lists Stellar in the supported-chains table (and XLM in transfers/fee-model pages), observed 2026-09-06; Cobo Guard iOS v2.1.8 released 2026-07-08; CoboGlobal SDK repos pushed 2026-09-02 (org repos)."
 },
 "clixpesa": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-06-23",
  "sourceUrl": "https://play.google.com/store/apps/details?id=com.clixpesa.app",
  "note": "Packet 2026-09-06 (medium): Play 'Clixpesa' updated 2026-06-23 (75 d), 100+ downloads; no iOS app; app.clixpesa.com NXDOMAIN; Stellar not named on the site or listing; org clixpesa/mint-contracts pushed 2026-04-07 (org repo). Add Play id to availability."
 },
 "cartwey": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-08-28",
  "sourceUrl": "https://play.google.com/store/apps/details?id=com.cartwey",
  "note": "Packet 2026-09-06 (medium): Play 'Cartwey' updated 2026-08-28 (500+); iOS id6747424781 v5.0.1 released 2026-05-26. The shipped product is a Nigerian grocery-delivery app, not the SCF #38 Stellar self-checkout; cartwey.com renders that pivot; app.cartwey.com is a merchant login shell; row repo Cartwey001/cartwey-app is 404. Stellar not visible — description/relevance review suggested."
 },
 "artizen": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "https://artizen.fund/",
  "note": "Packet 2026-09-06 (medium): artizen.fund renders Season 7 fund drive #15 with live metrics (TOTAL RAISED $1,155,561, endowment $28,160,854, ends 2026-09-10) in a browser; curl sees a 7-char shell. Org repos idle since 2024-06-18; chain plumbing in the bundle is EVM; no Stellar surface visible."
 },
 "blaze": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "https://docs.blaze.money/overview.md",
  "note": "Packet 2026-09-06 (medium): product docs list 'USDC on Stellar, Ethereum, and Polygon' (observed 2026-09-06); status.blaze.money 'All services are online' 2026-09-06; iOS 'Blaze - Global payments' v2.0 released 2026-01-26 (outside 90 d); app.blaze.money NXDOMAIN; org blaze-xyz pushes 2026-08-28 (org repos)."
 },
 "chainpatrol": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "https://chainpatrol.com/docs/external-api/overview",
  "note": "Packet 2026-09-06 (medium): product API docs (9,751 chars) observed 2026-09-06; blog posts dated 2026-09-05/04; dashboard app.chainpatrol.io behind sign-in; org chainpatrol/docs pushed 2026-09-03 (org repo). Stellar appears only as an SDF testimonial plus SCF #40."
 },
 "bevor": {
  "from": "Live",
  "to": "Development",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "https://www.bevor.io/",
  "note": "Packet 2026-09-06 (medium): bevor.io states 'Early access coming soon' and docs.bevor.io shows 'Dashboard (Coming Soon)' (observed 2026-09-06); app.bevor.io redirects to the landing; org Bevor-Protocol pushes 2026-09-03/08-26; docs have no Soroban page yet. SCF #40 $102,000."
 },
 "chainlink-oracles-relayer": {
  "from": "Live",
  "to": "Development",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "https://docs.relink.services/supported-networks/stellar-soroban.md",
  "note": "Packet 2026-09-06 (medium): the product's own Soroban page says 'Relink Products on Soroban: coming soon' with Futurenet-era text (observed 2026-09-06); relink.services NXDOMAIN; RelinkServices/relink-contracts-rust-soroban last pushed 2024-02-05 (org idle 2.6 y). No parked/retired marker, so not Inactive under the rule; owner may still choose Inactive on the idle org."
 },
 "bes-metaverse": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "https://besmetaverse.com/",
  "note": "Packet 2026-09-06 (high): besmetaverse.com resolves to HugeDomains 'BesMetaverse.com is for sale ($595)'; Wayback holds the product site at that domain (2023-06-03, 2024-01-15); org BESMetaverse newest push 2023-05-25. Row website azores.group is an unrelated travel company — fix the link. Receipt improvements/receipts/bes-metaverse-2026-09-06.json."
 },
 "bigger": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "http://biggertech.co/",
  "note": "Packet 2026-09-06 (medium): biggertech.co serves the Gandi registrar placeholder 'This domain name has been registered with Gandi.net … biggertech.co is unavailable' over http (https does not answer); bigger.tech NXDOMAIN; the org's own blog field points at the dead domain; newest org push bigger-tech/stellar-faucet 2026-03-30. Alternative: Development on that repo. Receipt improvements/receipts/bigger-2026-09-06.json."
 },
 "zkcross": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "https://zkcross-network-1.gitbook.io/learn.zkcross.network/ecosystem-validation/production-validation.md",
  "note": "Packet 2026-09-06 (medium): own docs describe zkCrossDEX in the past tense ('served as the main proving ground for this phase'; Stellar work 'delivered'); no DEX host resolves (app./dex./stellar. NXDOMAIN); row repo dev-zkcross/sorobancontract_stellar_zkcrossdex 404; company pivoted to SurfLiquid (pushes 2026-08-25). Alternative: cannot-tell if an explicit retirement sentence is required. Receipt improvements/receipts/zkcross-2026-09-06.json."
 }
}
```

---

## cannot-tell — 21 rows (no verdict; row keeps its current basis)

Every instrument tried is listed with its result; all fetched 2026-09-06. "shell" = client-rendered page that curl reads as under 100 chars; "NXDOMAIN" = no A/CNAME record; both are could-not-check, never evidence.

| slug | status today | instruments tried → result | what would decide it |
|---|---|---|---|
| decaf | Live / site-liveness | https://itunes.apple.com/lookup?id=1616564038&country=us → "Decaf Wallet" v5.4.0 released **2026-05-28** (101 d) · https://play.google.com/store/apps/details?id=so.decaf.wallet → Updated on **Jun 2, 2026** (96 d), 10K+ · https://www.decaf.so/en → 200, 2,461 chars marketing (Stellar named) · https://app.decaf.so/ → 404 · docs.decaf.so → NXDOMAIN · org decafteam newest 2024-07-02 | a store update on either store inside 90 d, or the owner accepting ~100 d (→ Live/medium, source = the iTunes lookup); same class as plutope in deep-verify-a |
| xcapit | Live / site-liveness | https://www.xcapit.com/en → 200, 7,527 chars: a software-services site (XNinja, Bonum, UNICEF case study); no Stellar / Smart Pay page (`/en/stellar`, `/en/wallet` → 404) · iTunes search xcapit (ar) → 0 apps · https://api.github.com/repos/xcapit/shelter → pushed 2025-09-19 (row repo, 352 d) · org newest `openzktool` 2026-02-03 · SCF page (browser) → "DPG Offline Smart Wallet On Stellar" SCF #32 $147.0K Build, Awarded; no stage or product URL shown | a Smart Pay product page, app or repo with a date (→ Live/Development), or the SCF tranche state; nothing is parked |
| zet | Live / site-liveness | https://ambergroup.io/ → 200, 4,628 chars corporate (asset management, advisory); no Stellar / ZET / RWA-protocol mention · `/stellar` → 404 · https://zet.finance/ → 11-char shell (relationship to Amber unknown) · org ambergroup-io → forks only (`cc-connect` fork 2026-05-13) | any Amber page or repo naming the Stellar RWA protocol (→ Live/Development) or dropping it (→ Inactive); otherwise a relevance question, not a status one |
| accelar | Live / site-liveness | https://www.accelar.io/ → 200, 2,348 chars; "Our Apps": Haven / Dogly / Sister Glow Up (consumer apps) with App Store ids 6503436498, 6738810897, 6740043929 → iTunes lookup **resultCount 0** in us (br rate-limited then "no results") · https://app.accelar.io/ → sign-in shell · org Accelar-labs newest 2026-02-17 (`accelar-plataform-frontend`) · Stellar appears only as a partner logo host | a store listing that resolves, or the platform app showing state without sign-in; the org's last push is 201 d |
| airswift | Live / source-inherited | https://pelagotech.com/ → transport failure (apex; DNS resolves) · https://www.pelagotech.com/ → 200, 1,715 chars corporate; `/supplychain.html` → 953 chars marketing "© 2024", no Stellar/Soroban · https://airswift.io/ → redirects to https://www.neodapptech.com/ ("NeoDapp's Portfolio" — domain repurposed) · https://api.github.com/repos/Airswiftio/SCF → pushed 2025-02-27 (row repo; README is a Soroban contracts setup) · org newest `pelagopay-woocommerce-plugin` 2026-02-03 | a Pelago page or repo that names the Soroban SCF platform with a date (→ Live/Development); the repurposed airswift.io is not the row's website |
| almanax | Live / site-liveness | https://almanax.ai/ (browser, tab-5) → product page: "Over 100M lines of code scanned", "Ecosystem-specialized models (EVM, Solana, Stellar, Aptos…)" (claims, undated) · https://app.almanax.ai/ → 7-char shell (Vite app) · https://docs.almanax.ai/ → 200, 851 chars, undated · https://api.github.com/repos/almanax-ai/w3sa → 404 (row repo removed) · org newest `almanax-security-plugin` 2026-03-27 (163 d) · github.com/apps/almanax → 404 | a dated product surface: a GitHub App listing, a changelog date, or an org push inside 90 d; the marketing claims are chrome |
| amero | Live / site-liveness | iTunes search (mx) → "Amero" id6651824433 v3.3 released **2026-01-07** (242 d), seller Amero Exchange Limited · https://play.google.com/store/apps/details?id=com.amero.wallet → Updated on **Jan 6, 2026**, 5K+ · https://app.amero.exchange/ (browser, 8 s) → renders **empty** body · https://www.amero.exchange/ → 118-char shell · org amerogithub → 0 public repos | a store update inside 90 d, or the web app rendering state; both stores agree the last build is 8 months old |
| anchainai | Live / site-liveness | https://www.anchain.ai/ → 200, 12,910 chars (AML / investigations company site) · `/catalog`, `/stellar` → 404 · catalog.anchain.ai → NXDOMAIN · https://api.github.com/repos/AnChainAI/anchain-stellar-contracts → pushed 2024-06-26 · org newest `anchain-data-mcp` 2026-02-18 | the Stellar contract catalog (the row's product) at any URL, or its repo pushed; the company is alive but the row's product has no surface |
| assetdesk | Live / source-inherited | https://assetdesk.xyz/ (and www, app.) → DNS resolves 195.189.60.223 but no HTTP answer on 80/443 (could-not-check) · row github "orgs/AssetDesk" is malformed; org AssetDesk newest `front` 2024-10-23, `Smart-Contracts` 2024-02-16 | the site answering (either with an app or a parked page); a WHOIS/registrar page would decide Inactive — none observed |
| autowhale | Live / site-liveness | https://renesis.fi/ → 200, 13,285 chars marketing ("Launch App" → https://onboard.renesis.fi/ = account sign-up form, 487 chars) · https://docs.renesis.fi/ → 200; `llms.txt` links "Renesis Stellar DEX Vaults" → https://dex.renesis.fi/ (browser, 10 s) → Stellar DEX landing with "Connect Wallet", no vault list, no metrics · app.renesis.fi → NXDOMAIN · org autowhale → forks only (`AutowhaleNet/ccxt` 2025-07-24) | vault metrics on dex.renesis.fi, a mainnet vault contract with events, or an own-repo push; the row name (Autowhale) and website (Renesis) should be reconciled |
| bidali | Live / site-liveness | iTunes search (ca/us) → "Bidali - Pay & Earn Cash Back" id1525288133 v1.5.16 released **2025-11-20** · https://play.google.com/store/apps/details?id=com.bidali.mobile → Updated on **Sep 12, 2025** · https://giftcards.bidali.com/dapp (browser, 8 s) → renders only nav ("All Gift Cards · Terms · Privacy · Powered by"), no catalog · https://api.bidali.com/ → 200 HTML landing · https://www.bidali.com/ → 200, 5,150 chars · org bidalihq → forks only (stellar-hd-wallet fork 2022-09-16) | a store update inside 90 d or the gift-card catalog rendering products; both stores are ~10–12 months old |
| bingtellar | Live / site-liveness | https://bingtellar.com/ → 200, 7,128 chars marketing; no store links · app.bingtellar.com → NXDOMAIN · iTunes search (ng/us) → no app; Play `com.bingtellar.*` → 404 · blog.bingtellar.com → Medium (Cloudflare block, could-not-check) · https://api.github.com/repos/bingtellar/bingtellar-serverside → 404 (row repo removed) · org newest `blink-build` 2026-08-25 (a different product: "Blink" yield-bearing payouts + Radar Copilot) | a Bingtellar app or dashboard with state; if the owner reads Blink as the same product, Development on `bingtellar/blink-build` (2026-08-25). SCF #42 (recent) $142,815 total |
| bitgifty | Live / site-liveness | https://app.bitgifty.com/ and https://minipay.bitgifty.com/ → 426-char sign-in shell showing "Available Balance … Transaction History 0 0 · Buy Giftcards Soon · Gamehub Soon" · https://giftcards.bitgifty.com/ → 14-char shell · https://bitgifty.com/ → 200, 4,436 chars · https://api.github.com/repos/damzylance/bigiftyxsoroban → pushed 2024-10-26 (row repo); its Vercel homepage → 404 DEPLOYMENT_NOT_FOUND · user newest `bitgifty` 2025-04-03 | a gift-card catalog or checkout visible before login, or a store app; the Soroban dapp deployment is gone but the main app is a login shell, not a death |
| bitwage | Live / site-liveness | https://bitwage.com/ → 200, 5,714 chars company site; Stellar only as an SDF testimonial · https://app.bitwage.com/ → 7-char login shell · https://support.bitwage.com/hc/en-us/search?query=stellar → 0 articles · https://bitwage.com/en-us/blog → 200 (undated titles, "guide for 2026") · iTunes search bitwage (us) → no Bitwage app · org Bitwage → newest 2023-01-11 | a help-center or product page documenting Stellar USDC payouts (→ Live), or a dated release; the company is plainly operating but nothing shows the Stellar product |
| blade | Live / site-liveness | https://bladelabs.io/ → 200, 2,203 chars: pivoted to "An AI staff that really does your work" (waitlist / Get started) · https://docs.bladelabs.io/ → Blade SDKs for **Hedera** (no Stellar in the docs) · tokenization.bladelabs.io → NXDOMAIN · org Blade-Labs newest `react-native-blade-sdk` 2026-04-09, `tokenization-wizard` 2025-10-02 (an analysis tool, not the Stellar bridge) | any Blade page or repo naming the Stellar/Soroban tokenization product (SCF #25) with a date, or a statement that it was dropped |
| bondhive | Live / site-liveness | https://bondhive.xyz/ → 200, 1,701 chars: now "BondHive Ltd. — Web3 development and strategic advisory firm" (services page; the fixed-deposit product is not mentioned) · app.bondhive.xyz, docs.bondhive.xyz → NXDOMAIN · https://api.stellar.expert/explorer/public/contract/CB5LRBLBP5ATWIADFWKBBEAHET5VHPBHNI645CYEWAGZ3FJFCUZ77JJC → created 2024-10-13, 15 events total; all 8 row contracts (Dec-24 / Mar-25 vaults) carry eventsDelta 0 · https://api.github.com/repos/Bond-Hive/soroban_contracts → pushed 2024-10-25 (row repo); org `interface` 2025-06-16 · SCF page (browser) → SCF #27 $40K + #29 $100K awarded, Q1'24 liquidity award | the product is gone from its own site and the vaults are dormant, but nothing is parked or says retired; a wind-down line on bondhive.xyz or a removed app page would make it Inactive (owner may judge the services pivot as that statement) |
| bp-ventures | Live / site-liveness | https://www.bpventures.us/ → 200, 18,541 chars consulting/services site · https://lightecho.io/ → 358 chars (labelled "TESTNET") · mainnet oracle https://api.stellar.expert/explorer/public/contract/CDOR3QD27WAAF4TK4MO33TGQXR6RPNANNVLOY277W2XVV6ZVJ6X6X42T → created 2024-03-05, **events 0**, invocations null · org newest `kyc-beacon` 2026-06-16, `django-polaris-bpv` (fork) 2026-05-15; row repo string "django-polaris-bpv  https:" is malformed | a BPV product with state (anchor, oracle feed with events, or a dated release); a services company row may be a relevance question |
| chats | Live / site-liveness | https://chats.cash/ → 200, 4,097 chars marketing; "Get Started" → calendly booking · https://app.chats.cash/ and https://beneficiary.chats.cash/ → HTTP 400 JSON `{"error":"Invalid path"}` (a backend answers; no UI) · https://api.github.com/repos/ConvexityTeam/chats-ngo → pushed 2023-12-08 (row repo); second row repo string "chatspy; https:" malformed · org newest `infra-sdk-typescript` 2026-09-02 (other products) · iTunes search → no CHATS app | a CHATS dashboard or beneficiary app with state, or an own-repo push; the API host answering is not product state |
| clickpesa-debt-fund | Live / source-inherited | no website in row · https://clickpesadebtfund.com/ (org blog field) → transport failure · https://mainnet.blend.capital/ (browser; V1 and V2 tabs) → V2: Fixed, YieldBlox, Etherfuse (frozen), Solv; V1: Fixed XLM-USDC, ReflectorFusion (frozen), YieldBlox (frozen) — **no ClickPesa pool listed** · https://clickpesa-debt-fund.github.io/cdf-pool-ui/ → 404 · https://api.github.com/repos/ClickPesa-Debt-Fund/cdf-pool-ui → pushed 2024-11-08 (row repo) · parent ClickPesa org active 2026-09-05 (unrelated repos) | the CDF pool's contract id (row `onchain` is empty) so stellar.expert can date its last event, or the fund's own site answering; nothing parked, nothing alive |
| clob | Live / site-liveness | https://ideasoft.io/ → 200, 11,985 chars (a software agency site; no CLOB page, `/clob` → 404) · dclob.io → NXDOMAIN · org dclob → 0 public repos | any dCLOB surface at all; the row has no product artifact to check in either direction |
| coala-pay | Live / site-liveness | https://app.coalapay.org/ → `/login` sign-in shell (203 chars) · https://www.coalapay.org/ → 200, 8,126 chars marketing; `/newsroom` items dated Jul 1, 2026 (Circle blog), May 1, 2026 (ISO 27001) — company news, not product state · https://api.github.com/repos/pellartech/coala-pay-weather-oracle → pushed 2025-07-21 (vendor repo, row repo) · no store app found (iTunes rate-limited on retry; Play guesses 404) | product state behind the login (a dashboard, corridor metrics) or a docs page; the Jul 2026 interview is the strongest company signal but is not the product's own state |

---

## Not examined / limits

- X, Telegram, Discord, Medium (blog.bingtellar.com is Medium-hosted and Cloudflare-blocked the fetch) — no row rests on a social signal.
- iTunes rate limit hit mid-batch; retried: cartwey (found), accelar/br and bitgifty/ng ("no results"); not retried: coala-pay, xcapit/us, zkcross/us, almanax/us (all had no expected app).
- SCF project pages were opened in the browser only for bondhive and xcapit (the page shows awards, not a stage or product URL); airswift, bingtellar, bitgifty, blade, cartwey, zkcross SCF pages not opened.
- assetdesk and clickpesadebtfund.com never answered (TCP); zet.finance was not rendered; the Bidali gift-card catalog may be region-gated (rendered empty from this location).
- No RPC or Soroban `getEvents` probes were needed: no row in this batch carries a contract except bondhive (dormant per row data and stellar.expert) and bp-ventures' oracle (0 events).
- Data fixes surfaced, not applied: bes-metaverse website (azores.group is a travel company); assetdesk and clob `github` = "orgs/…"; bp-ventures and chats repo strings contain "https:"; cartwey's shipped product is grocery delivery; autowhale's website is Renesis; store ids for vesseo (Play), axal, clixpesa, cartwey, amero, bidali, decaf belong in `availability`.
