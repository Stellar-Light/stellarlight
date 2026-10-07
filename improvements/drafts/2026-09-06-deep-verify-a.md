# Deep verify A — 9 undecided rows (2026-09-06)

Rule applied: the product-state rule from `2026-09-05-verification-packets-top100.md` (corrections block) and `…-medium-regraded.md` ("How to read a verdict"). Every URL below was fetched 2026-09-06 01:50–02:15 UTC (evening of 2026-09-05 Pacific); "observed today" means that fetch. `asOf` is the evidence's own date, never the observation day, except where the page observed today is the evidence and it says so. Client-rendered pages were read in a real browser tab this session owned (`tab-1`); the shared pane tab (`seed`) was navigated by another session mid-batch twice, so every browser read below was re-taken in `tab-1` and only those are cited.

Verdicts: **Live 3 (untangled, hot-wallet, getblock) · Development 2 (mystic, fairblock) · Inactive 1 (wagelink) · cannot-tell 3 (plutope, kotani-pay, tala)**. Nothing here touched the database.

---

## untangled — Live / site-liveness → **Live** (high)

Row: `Live / site-liveness / asOf 2026-09-05 / https://untangled.finance/`; contract `CBLC4N…4DMA` "USDyc Vault" (events 1747, delta 0); row repo `untangledfinance/soroban-vault-contract`.

| instrument | result |
|---|---|
| https://untangled.finance/ (curl) | 200 · "Untangled Finance" · 17 chars — JS shell; bundle links `https://stellar.untangled.finance/` and `app.untangled.finance/rwa-registry` |
| https://app.untangled.finance/ (curl) | 200 · "Untangled Prime" · 15 chars — JS shell |
| https://stellar.untangled.finance/ (browser, tab-1, 8 s) | **Vault table renders 4 rows: "Untangled USDyc II (USDyc) · Credio · USDC · TVL 151.5K · APY 10.76% · 242 days", "Alpine x Gami AGUSD · 2.4 · 68.27%", "Indentura DENT1 · 2.0K", "Alpine x Gami AGXLM · XLM 5.9"** (read via DOM after render; curl reads the same page as an empty skeleton) |
| click USDyc II → https://stellar.untangled.finance/vault/stellar/CDDDLSQAR6EVIBFU6KMHA6WLIZJ5PDPXKJCEADD6YJ3HJ3S775XHVEE4 | vault route carries the mainnet contract id |
| https://api.stellar.expert/explorer/public/contract/CDDDLSQAR6EVIBFU6KMHA6WLIZJ5PDPXKJCEADD6YJ3HJ3S775XHVEE4 | mainnet · created 2026-01-09 · events 59 · storage 13 |
| Soroban RPC `getLedgerEntries` (contract instance) | `lastModifiedLedgerSeq 64009776` = Horizon `closed_at` **2026-08-18T10:55:12Z** (state changed 19 days ago); `liveUntil 64910379` |
| Soroban RPC `getEvents` last ~7 days (ledgers 64173100→64294033) | 0 events for USDyc II; 0 for the row's USDyc I `CBLC4N…` and for the 8 `C…` ids in the JS bundle (those 8 are **testnet** contracts, created 2025-12-18 — stellar.expert testnet) |
| https://api.stellar.expert/explorer/public/contract/CBLC4NWJPBHWPXDL4TTXDZJLVZ2JFWMVZHQNI4MLZRNKYGIKGX6K4DMA | created 2025-05-26 · events 1747 · instance last modified ledger 61286584 (~March 2026) |
| https://docs.untangled.finance/docs/Intro/Addresses/ | Stellar section lists only USDyc = `CBLC4N…4DMA` (docs lag the app's USDyc II) |
| https://docs.untangled.finance/docs/Intro/deposit-and-withdraw/ | "On Untangled Stellar App … On Stellar we support Freighter wallet"; USDyc withdrawal epoch 24 h |
| GitHub org untangledfinance | `oz-policy-builder` pushed 2026-09-01 (Soroban tx policy tool), `untangled-docs` 2026-08-31, `untangled-web` 2026-08-27; row repo `soroban-vault-contract` pushed 2026-01-28 (not archived) |

**Deciding evidence:** https://stellar.untangled.finance/ — vault table with non-zero TVL (USDyc II $151.5K at 10.76%), observed today (2026-09-06); corroborated by the vault contract's own state change on 2026-08-18 (Horizon ledger 64009776).
**Confidence: high** — app metrics + on-chain modification inside 90 days + own Soroban repos pushed this week. Weak spot: no *events* in the 7-day RPC window (a vault with a 24 h epoch can be quiet for a week); the row's attached contract is the retired-looking USDyc I, so attach `CDDDLSQAR6EVIBFU6KMHA6WLIZJ5PDPXKJCEADD6YJ3HJ3S775XHVEE4` (USDyc II) and point the website at the Stellar app.

## hot-wallet — Live / site-liveness → **Live** (medium)

Row: `Live / site-liveness / asOf 2026-09-05 / https://hot-labs.org/`; availability rows for iOS `id6740916148` and Chrome extension (checked 2026-08-13); no repo in row (org hot-dao).

| instrument | result |
|---|---|
| https://chromewebstore.google.com/detail/hot-wallet/mpeengabcnhhjjgleiodimegnkpcenbk | **"Version 1.0.142 · Updated July 9, 2026"** · 90,000 users · listing text: "Stellar: HOT supports transfers and asset management with built-in swaps, gas-free delegated transactions, and a 0% fee USDC bridge for MPC users" |
| https://itunes.apple.com/lookup?id=6740916148&country=us | "HOT — Crypto Wallet" v1.0.3, `currentVersionReleaseDate` **2026-01-15** (HERE Wallet, Inc); release notes name "Soroswap integration" |
| https://play.google.com/store/apps/details?id=app.herewallet.hot | "Updated on Jun 15, 2025" · 500K+ downloads · a user review dated June 27, 2026 describes a USDC-on-Stellar send |
| https://hot-labs.org/wallet/ | chain list "TON, Solana, TRON, NEAR, Stellar and EVM"; roadmap "Stellar Bridge 100%" (chrome, not evidence) |
| https://docs.hot-labs.org/ | 403 Cloudflare error 1014 — could-not-check |
| GitHub hot-dao | `omni-sdk` (description names Stellar) pushed 2026-04-30; `hot-validation-sdk` 2026-06-14; `pitchtalk-hachathon` 2026-07-06 (hackathon, not the product) |

**Deciding evidence:** https://chromewebstore.google.com/detail/hot-wallet/mpeengabcnhhjjgleiodimegnkpcenbk — the product's own store release dated 2026-07-09 (59 days), whose listing names Stellar support.
**Confidence: medium** — one in-window store release; the iOS build (234 d) and the Stellar-named own repo (129 d) are both outside the window; no Stellar-specific on-chain signal (the wallet's fee-sponsor account is not public). Row `availability` should add the Play id `app.herewallet.hot`.

## getblock — Live / site-liveness → **Live** (medium)

Row: `Live / site-liveness / asOf 2026-08-27 / https://getblock.io/nodes/xlm`; no repo, no handle.

| instrument | result |
|---|---|
| https://getblock.io/nodes/xlm/ | 200 · "Stellar RPC Node – Fast API Access" · 9,549 chars · product page (marketing) |
| https://getblock.io/nodes/ | catalog row **"Stellar · Shared · Dedicated · Regions FRA, NY, SG · JSON-RPC · Mainnet"** |
| https://docs.getblock.io/api-reference/stellar-xlm | 200 · "Stellar (XLM) \| GetBlock Docs" · 10,164 chars · per-method reference (`getHealth`, `getLatestLedger`, `getLedgers`, `getLedgerEntries`, `getEvents`, `getTransaction(s)`, `getFeeStats`, …) with the endpoint template `https://shared.eu-central-1.getblock.io/<ACCESS-TOKEN>/` |
| https://developers.stellar.org/docs/data/apis/rpc/providers | SDF's provider table lists **GetBlock** (three ✅ columns) — third-party listing, observed today |
| https://status.getblock.io/ | "All services are online — Last updated on Sep 6, 2026 at 1:53am UTC"; **no Stellar/XLM component** (company-wide) |
| https://getblock.io/pricing/ | no Stellar mention (plans are chain-agnostic) |
| endpoint probe | not possible without an access token (creating one means creating an account — not done) |

**Deciding evidence:** https://docs.getblock.io/api-reference/stellar-xlm — the provider's own live API reference for Stellar, observed today (2026-09-06).
**Confidence: medium** — the product's own catalog + method docs say the endpoint is sold today, and SDF lists it, but no call was made; hold at cannot-tell if the owner wants an answered `getHealth`. A keyed probe by the owner would make this high.

## mystic — Live / source-inherited → **Development** (medium-high)

Row: `Live / source-inherited / asOf 2026-08-19 / lumenloop yaml`; `scf.awarded: false`; GitHub link is the org.

| instrument | result |
|---|---|
| https://mysticfinance.xyz/ | 403 · "Suspected Phishing \| Cloudflare" interstitial — could-not-check for the landing (third-party flag, still up) |
| https://app.mysticfinance.xyz/ (browser, tab-1, 10 s) | "List of all Morpho vaults on **Flare**": Core USDT0 $22.03M deposits 17.71% · Core FXRP $3.72M · Core wFLR $732.28k — the company's product is live, on Flare (EVM) |
| https://docs.mysticfinance.xyz/ | Morpho REST/GraphQL + Swap API docs; **no Stellar/Soroban mention** |
| https://partners.circle.com/partner/mystic-finance | Circle directory: "Blockchains Supported: Arbitrum, Ethereum" |
| https://github.com/mystic-finance/Stellar-RFQ | created 2026-06-10, pushed 2026-09-01 ("update milestone docs"); README "Octarine Settlement — duration-priced RFQ for Soroban"; **`docs/MILESTONE_1.md` = "SCF Build — Tranche Completion Form … Project Stage: Pre-Launch #1 — MVP … Done on testnet: 20+ Order fills"**; `deployments/testnet.json` `deployedAt 2026-08-27T13:09:00Z` (rfq `CDB75DJB…JYQM`) |
| https://api.stellar.expert/explorer/testnet/contract/CDB75DJB7KK6V2CJPGT44CJRZYPP7BPXFHZTOPIYSGO2KGQC576UJYQM | **testnet** · created 2026-08-27 · events 40 · storage 42 |
| org repos | Stellar-RFQ is the only Stellar repo; the rest are Flare/Morpho/Octarine (EVM) |

**Deciding evidence:** https://github.com/mystic-finance/Stellar-RFQ/blob/main/docs/MILESTONE_1.md — the product's own SCF tranche form, "Pre-Launch #1 — MVP", testnet only, dated by its commit 2026-09-01.
**Confidence: medium-high** — the Stellar product states its own stage and the testnet contract confirms it; the low tier's Live rested on the Flare app, which is a different product surface (the row's description is the Stellar RWA lending market). Data fix: the row says no SCF award, but the repo carries an SCF Build tranche form and the SCF #29 recap names Mystic — `enrich-scf` missed it (the `/backend/projects` 500-cap; Mystic is not in that page).

## fairblock — Live / site-liveness → **Development** (medium)

Row: `Live / site-liveness / asOf 2026-09-05 / https://www.fairblock.network/`; SCF #40 Build $150,000 (`confidential-transfers-and-balances-hdt`, asOf 2026-09-01); GitHub link is the org.

| instrument | result |
|---|---|
| https://www.fairblock.network/ (curl) | 200 · 40 chars — JS shell |
| https://fairblock.network/ (browser, tab-1, 6 s) | full marketing page (~2,900 chars): "The Turnkey Confidentiality Layer", showcase tiles with illustrative "$1,284.50 / $45,000 / $128,750"; **no Stellar mention, no metrics, no app** |
| https://communityfund.stellar.org/project/confidential-transfers-and-balances-hdt (browser, tab-1) | SCF #40 · $150.0K Build · Awarded · submission "Private & Compliant Payments On Stellar" · description: "Confidential stablecoins (**our primary focus on Stellar**) … we encrypt transfer amounts and balances" |
| https://github.com/Fairblock/stabletrust-sdk | pushed 2026-09-03; README: `@fairblock/stabletrust` — **ethers.js SDK, "Available Confidential Contract Addresses (Testnet)" on EVM testnets** (Base Sepolia 84532, Stable testnet 2201, Arc 5042002, Tempo); no Stellar/Soroban mention (34,715-char README grepped) |
| https://docs.fairblock.network/ + `/llms.txt` | no Stellar/Soroban mention; sitemap 404 |
| GitHub search `org:Fairblock stellar OR soroban` | 0 repos; code search 0 hits |
| org repos | fairyring / fairyringclient / ShareGenerationClient pushed 2026-08-31 (their own chain), `fairblock-stabletrust` landing 2026-08-25 |

**Deciding evidence:** https://communityfund.stellar.org/project/confidential-transfers-and-balances-hdt — the product's own SCF submission (Build award, primary focus on Stellar) observed today (2026-09-06); the only shipped artifact (stabletrust-sdk, 2026-09-03) is EVM-testnet-only.
**Confidence: medium** — a just-funded Build with an active team and no Stellar surface is Development by the product's own words; it is not Live on Stellar by any instrument, and not Inactive (nothing parked or retired).

## wagelink — Live / site-liveness → **Inactive** (medium)

Row: `Live / site-liveness / asOf 2026-09-05 / https://wagelink.io/`; GitHub link = Zebec org; SCF R24 $50,000.

| instrument | result |
|---|---|
| https://wagelink.io/ (curl) | 200 · 8 chars — React SPA (`/static/js/main.c119acbb.js`) |
| https://wagelink.io/ (browser, tab-1, 6 s) | full marketing page: EWA + "WageLink Visa PayCard"; setup step 1 **"Download the WageLink App from the Apple App Store"**; "©2026 Payroll Growth Partners LLC"; no sign-up, no employer portal, no metrics |
| bundle `main.c119acbb.js` | the only external link is **https://apps.apple.com/us/app/wagelink/id6461461372**; no API host, no Android link |
| https://apps.apple.com/us/app/wagelink/id6461461372 | **404** (empty page) |
| https://itunes.apple.com/lookup?id=6461461372 — `country=` us, in, gb, ca, au, ng, ph, sg, ae, mx | **`"resultCount":0`** in all ten storefronts; `search?term=wagelink` in us/in/gb returns no WageLink app |
| https://app.wagelink.io/ | transport failure (no host) |
| https://zebec.io/ · https://docs.zebec.io/ | no "WageLink" mention on either |
| GitHub search `wagelink` / org Zebec-protocol | no WageLink repo; org newest = `canton-dev-fund` 2026-09-02 (unrelated), `zebec-canton-payroll` 2026-05-15 |

**Deciding evidence:** https://itunes.apple.com/lookup?id=6461461372&country=us — the App Store record for the app the product's own page tells users to download is gone (`resultCount 0`; the listing URL 404s), observed today (2026-09-06).
**Confidence: medium** — the product's only distribution channel is removed, which is a removed-page death signal, and no other surface (API, Android, employer portal, repo) exists; the marketing page staying up is why this is not high. Overturned by a re-listed app or any working sign-up.

Receipt (marker confirmed in the fetched body, `where: text`, file `improvements/receipts/wagelink-2026-09-06.json`):

```sh
pnpm exec tsx scripts/data/capture-receipt.ts wagelink "https://itunes.apple.com/lookup?id=6461461372&country=us" '"resultCount":0'
```

## plutope — Live / site-liveness → **cannot-tell** (would be Live at a 96-day window)

Row: `Live / site-liveness / asOf 2026-09-01 / https://plutope.com/`; row repo `plutopein/plutope-merchant-stellar` (404, org has 0 public repos).

| instrument | result |
|---|---|
| https://itunes.apple.com/lookup?id=6466782831&country=in | "PlutoPe: Crypto Wallet" v1.0.35, `currentVersionReleaseDate` **2026-06-02** (96 days); bundle `com.plutope.app`; not on the US storefront |
| https://play.google.com/store/apps/details?id=com.app.plutope (id from plutope.com markup) | "Plutope Wallet" · **"Updated on Jun 2, 2026"** · 10K+ downloads · 4.6★ (31) |
| https://plutope.com/ · /developers | 5,730 / 3,575 chars marketing; developers page advertises `https://api.plutope.com/v1/payouts` and "Read the docs" |
| api.plutope.com · docs.plutope.com | **NXDOMAIN** — the advertised API host does not resolve (could-not-check for the API; a bad sign for the developer product, not for the wallet) |
| iTunes `search?term=plutope` (in) | only the one app; no merchant app |

Both stores agree the last build shipped 2026-06-02 — 6 days past the 90-day line, with no newer signal anywhere. **What would decide:** a store update (either store) or the owner accepting 96 days; then Live/medium with the App Store lookup as the source.

## kotani-pay — Live / site-liveness → **cannot-tell**

Row: `Live / site-liveness / asOf 2026-08-17 / https://kotanipay.com/`; SCF #11 $100,000; no repo.

| instrument | result |
|---|---|
| https://api.kotanipay.com/health | `{"success":true,…"status":"ok"}` — heartbeat only |
| https://kotanipay.com/ | 3,015 chars; "More than 15 Supported Chains … Stellar …" (marketing) |
| https://docs.kotanipay.com/ → `https://kotani-pay.readme.io/llms.txt` (72 reference pages grepped) | crypto-deposit "Supported Chains & Tokens": **ETHEREUM, POLYGON, BASE, ARBITRUM, OPTIMISM, AVALANCHE, CELO — no Stellar**; no `chain` enum exposed; no other Stellar mention |
| https://kotanipay.com/.well-known/stellar.toml · api. · app. | 404 / 404 / no host — no Stellar anchor |
| https://kotanipay.com/blog | 404 |
| https://communityfund.stellar.org/project/kotani-pay-jy7 | SCF #11 $100.0K Legacy award (2022-era) |
| https://www.trysignalbase.com/news/acquisitions/kotani-pay-acquired-by-tetherio-acquisition | third-party: "Tether.io acquires Kotani Pay", published October 28, 2025; kotanipay.com/about does not mention it |

The company's API answers, but nothing shows a Stellar product: the API docs' chain list omits Stellar and there is no anchor. **What would decide:** a Kotani API chain enum/endpoint that accepts `STELLAR`, or a Stellar settlement account/asset the docs name; absent that, the row is a company with a Stellar claim, and the owner may prefer Live (company alive) or a relevance review over a status flip.

## tala — Live / site-liveness → **cannot-tell** (partnership announcement, no Stellar product found)

Row: `Live / site-liveness / asOf 2026-09-05 / https://tala.co/`; GitHub link = org `inventure`.

| instrument | result |
|---|---|
| https://stellar.org/blog/ecosystem/tala-visa-partner-on-solution-for-underbanked-supported-by-circle-and-stellar | the announcement; page carries `2021-05-05` |
| https://tala.co/tala-partners-with-visa-circle-stellar/ | Tala's own press post of the same announcement (May 2021) |
| https://tala.co/ | 3,797 chars; one line "Our new crypto-enabled digital wallet saves customers money…" (undated marketing); no Stellar/USDC mention |
| https://tala.co/blog/ | no crypto / Stellar / USDC posts |
| GitHub org inventure | `stellar-go` fork pushed 2023-07-24; newest repos (`docker-play-seeder` 2026-08-21) are unrelated infra |
| iTunes search (ke, ph, us) | no Tala app under Tala/Inventure on iOS storefronts searched; Play package unknown (guess 404) — company liveness not established here, not needed for the verdict |

Nothing after May 2021 shows a Tala product on Stellar, and nothing says it was retired either (no wind-down, no removed page) — so neither Live nor Inactive is supportable on the Stellar row. **What would decide:** any Tala page or app text naming a USDC/Stellar wallet feature (→ Live) or a statement that the crypto wallet was discontinued (→ Inactive). Recommendation to the owner: treat this as a partnership-only row (relevance/delist question), not a status question.

---

## STATUS_FIX entries (rows recommended for a change or a stamp)

Same shape as the 2026-09-05 packets; `from` is the live status read from `/api/projects` today. Paste approved entries into `STATUS_FIX` in `scripts/data/curation-maps.ts`, dry-run `curate-projects.yml`, then execute and read back.

```json
{
 "untangled": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "https://stellar.untangled.finance/",
  "note": "Deep verify 2026-09-06: Stellar app renders 4 vaults with TVL (USDyc II $151.5K at 10.76%, AGUSD, DENT1, AGXLM); USDyc II vault CDDDLSQAR6EVIBFU6KMHA6WLIZJ5PDPXKJCEADD6YJ3HJ3S775XHVEE4 (mainnet, created 2026-01-09) instance last modified 2026-08-18; own Soroban repos pushed 2026-09-01. Row contract CBLC4N… is the older USDyc I (0 events in 7 days) — attach USDyc II."
 },
 "hot-wallet": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-07-09",
  "sourceUrl": "https://chromewebstore.google.com/detail/hot-wallet/mpeengabcnhhjjgleiodimegnkpcenbk",
  "note": "Deep verify 2026-09-06: Chrome Web Store HOT Wallet v1.0.142 updated 2026-07-09, listing names Stellar transfers/swaps/gas-free txs; iOS v1.0.3 2026-01-15 (Soroswap notes); Play updated 2025-06-15; hot-dao/omni-sdk (Stellar) pushed 2026-04-30. Medium: one in-window release."
 },
 "getblock": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "https://docs.getblock.io/api-reference/stellar-xlm",
  "note": "Deep verify 2026-09-06: GetBlock's own Stellar (XLM) API reference (getHealth/getLatestLedger/getEvents… with endpoint template) and nodes catalog (Stellar Mainnet, shared+dedicated) observed today; SDF RPC providers page lists GetBlock; status page company-wide with no Stellar component. Medium: no keyed call made."
 },
 "mystic": {
  "from": "Live",
  "to": "Development",
  "basis": "human-verified",
  "asOf": "2026-09-01",
  "sourceUrl": "https://github.com/mystic-finance/Stellar-RFQ/blob/main/docs/MILESTONE_1.md",
  "note": "Deep verify 2026-09-06: Stellar product is a testnet MVP — the repo's SCF Build tranche form says 'Pre-Launch #1 — MVP', 'Done on testnet: 20+ Order fills'; deployments/testnet.json deployedAt 2026-08-27, testnet contract CDB75DJB… has 40 events; docs/Circle directory show no Stellar. The company's live vaults ($22.03M) are Morpho on Flare, a different product. Row scf says no award but the repo is an SCF Build tranche — enrich-scf gap."
 },
 "fairblock": {
  "from": "Live",
  "to": "Development",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "https://communityfund.stellar.org/project/confidential-transfers-and-balances-hdt",
  "note": "Deep verify 2026-09-06: SCF #40 Build $150K 'Private & Compliant Payments On Stellar' (own submission: confidential stablecoins, primary focus on Stellar) observed today; only shipped artifact Fairblock/stabletrust-sdk (pushed 2026-09-03) is an ethers.js SDK with EVM testnet addresses; docs and org have no Stellar/Soroban code; landing page renders marketing only, no app or metrics."
 },
 "wagelink": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-06",
  "sourceUrl": "https://itunes.apple.com/lookup?id=6461461372&country=us",
  "note": "Deep verify 2026-09-06: wagelink.io's own bundle links App Store id 6461461372 and the page's setup step 1 is 'Download the WageLink App from the Apple App Store'; that listing 404s and the iTunes lookup returns resultCount 0 in 10 storefronts; no Android app, no API host, no app subdomain, no WageLink repo; Zebec site/docs do not mention it. Receipt improvements/receipts/wagelink-2026-09-06.json. Medium: marketing page still 200."
 }
}
```

## cannot-tell rows

| slug | status today | what was found | what would decide it |
|---|---|---|---|
| plutope | Live / site-liveness | App Store v1.0.35 and Play both last released 2026-06-02 (96 d); api.plutope.com / docs.plutope.com NXDOMAIN; row repo 404 | a store update inside 90 d, or the owner accepting 96 d (→ Live, source = iTunes lookup id6466782831 country=in) |
| kotani-pay | Live / site-liveness | API health ok; site claims Stellar; API docs' chain list omits Stellar; no stellar.toml; third-party says acquired by Tether 2025-10-28 | a Kotani API chain value `STELLAR` or a documented Stellar settlement account (→ Live); a Kotani/Tether statement that the product was folded (→ Inactive) |
| tala | Live / site-liveness | 2021-05-05 partnership announcement only; no Stellar/USDC feature on tala.co, blog or app text; inventure/stellar-go fork idle since 2023-07-24 | any Tala surface naming the USDC/Stellar wallet (→ Live) or saying it was dropped (→ Inactive); otherwise a relevance/delist call, not a status one |

## Not examined / limits

- No X/Twitter, Telegram or Discord for any row (login shells).
- GetBlock: no endpoint call (needs an account token); PlutoPe: no app install; HOT: Telegram mini-app not opened; docs.hot-labs.org 403.
- Untangled: the vault's 24 h withdrawal epoch means a 7-day event window can legitimately be empty; a 30-day Horizon-side scan of the vault's admin account was not done.
- Kotani: the `chain` request enum is not in the public markdown; only the human-readable "Supported Chains" list was checked.
- Mystic mainnet: no mainnet Stellar contract was found (deployments/ has testnet.json only); a mainnet.json appearing would move the row to Live.
- SCF `/backend/projects` returns only 500 rows; Mystic and Fairblock are not in that page, so their award data came from the SCF project page (Fairblock) and the repo's tranche form (Mystic).
