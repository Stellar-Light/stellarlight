# Verification packets — top 100 weak-basis rows (2026-09-05)

Recommended verdicts: **Inactive 12 · Pre-Release 1 · Development 5 · Live 82** (100 rows).
Confidence: **high 38 · medium 32 · low 30**.
Population: 984 served rows (status ≠ Draft, no canonicalSlug), 601 on a weak basis (statusBasis ∉ {human-verified, onchain-activity, product-integration, repo-activity}); these are the top 100 by `prominence` desc, then `relevanceScore` desc, then slug — only 28 weak rows have prominence > 0, so without the second key rows 29–100 would have been alphabetical, not prominent.
Every website, GitHub repo/org and stellar.expert page cited here was fetched on 2026-09-05; `statusAsOf` is that fetch date and nothing older is dated as if fetched today.
**Every verdict here is a recommendation; the owner's approval of a row is what makes it human-verified.**

> **Applied 2026-09-05 17:10 UTC (high-confidence tier, 38 rows):** owner said "apply the high confidence packets"; entries live in `STATUS_FIX` (#1345), curate-projects executed (run 33979942527), all 38 read back. Medium (32) and low (30) tiers remain recommendations.

## How to read a verdict

- **Confidence** — `high` = two independent live signals inside 90 days (a 200 page today serving substantive product content **and** a repo pushed ≤90d), or a parked / retired / removed-site page. `medium` = one signal, with a dated corroborator outside the window. `low` = only a marketing page answered, or nothing did.
- **Death rules applied literally.** A live-200 page never stands as "observed dead" — the four Inactive/high rows rest on what the page or its host *says* (winding down, closing its doors, "Site Not Found", "ConnectYourDomain Error"), not on inference from silence. Timeouts, 403s and DNS failures are **could-not-check** and cannot support Inactive on their own: `mystic` (Cloudflare 403), `cede` (Cloudflare 403) and `ortege` (transport failure) are marked as such in their notes.
- **X / blog is could-not-check for all 100 rows.** `x.com/<handle>` answers 200 to a browser UA but serves a login shell: the profile bio, follower and post *counts* render, no post *dates* do. No row's verdict rests on a social signal. Where a row's website *is* a blog (`tellus-cooperative` → blog.telluscoop.com) the website column covers it.
- **SCF cells are row data**, from our own enrich-scf lane, not a page fetched today — so no verdict rests on them. They are shown because an award is the strongest reason to pause before retiring a row.
- **On-chain**: 3 of the 100 rows carry a contract (`allbridge`, `rozo`, `untangled`); stellar.expert returns a creation date for each but no recent-activity counter, so none of the three counts as an in-window signal.

## Applying the approved rows

Nothing in this file touched the database. Approve rows, then:

1. **Evidence + status (all 100 rows).** Paste the approved entries of the JSON block below into `STATUS_FIX` in `scripts/data/curation-maps.ts` (drop the `receipt` key — it is a command, not a field) and run `.github/workflows/curate-projects.yml` dry-run first, then `execute`. That map is the only path that writes `statusBasis` / `statusAsOf` / `statusSourceUrl`; it is from-guarded, `from === to` rows move nothing but the evidence, and being in the map stops the nightly lumenloop sync writing the seed label back. This is the same path the 2026-09-02 packet batch used.
2. **Status-only alternative (19 rows whose status actually moves).** `.github/workflows/apply-status-batch.yml` → `scripts/apply-status-batch.ts` consumes an in-file `OPS` array of `[slug, newStatus, reason]` tuples and has no field for basis / asOf / sourceUrl, so it applies the label but **not** the evidence. Every tuple below is the `slug` / `to` / `note` of the JSON entry, unchanged:

```ts
const OPS: [string, string, string][] = [
	["didstellar", "Inactive", "verification packet 2026-09-05 (medium) — Repo deleted; linked site is Mavennet corporate"],
	["orbitcdp", "Live", "verification packet 2026-09-05 (high) — CDP protocol page: 'Live on Stellar', Launch App"],
	["transfermole", "Inactive", "verification packet 2026-09-05 (medium) — Repo deleted; row has no website"],
	["basement", "Inactive", "verification packet 2026-09-05 (high) — Framer 'Site Not Found' — no site configured"],
	["bebop", "Inactive", "verification packet 2026-09-05 (medium) — No website; sole repo idle since Nov 2024"],
	["block-time-financial", "Inactive", "verification packet 2026-09-05 (medium) — Empty 200 shell; repo idle since Oct 2023"],
	["chainsatlas", "Inactive", "verification packet 2026-09-05 (high) — Wix 'ConnectYourDomain Error' — site removed"],
	["code4rena", "Inactive", "verification packet 2026-09-05 (high) — Audit contest platform, page announces closing"],
	["every-finance", "Development", "verification packet 2026-09-05 (medium) — Empty 200 shell; Stellar contracts repo active"],
	["findtruman", "Inactive", "verification packet 2026-09-05 (medium) — Empty 200 shell; Stellar org idle since Jul 2024"],
	["muwp", "Development", "verification packet 2026-09-05 (medium) — Vercel 'Deployment Unavailable'; org repo active"],
	["mystic", "Development", "verification packet 2026-09-05 (low) — Cloudflare flags site as suspected phishing"],
	["neovestor", "Pre-Release", "verification packet 2026-09-05 (medium) — RWA platform, waitlist only, yields show 0.0%"],
	["onboarding-club", "Inactive", "verification packet 2026-09-05 (low) — No website; GitHub org has 0 public repos"],
	["ortege", "Inactive", "verification packet 2026-09-05 (low) — Site unreachable; repo idle since Dec 2024"],
	["polaris-lend", "Inactive", "verification packet 2026-09-05 (medium) — Repo deleted; site is Jet Protocol shell"],
	["soundness", "Inactive", "verification packet 2026-09-05 (high) — Post-quantum project notice: winding down, services offline"],
	["stallion", "Development", "verification packet 2026-09-05 (low) — Empty 200 shell; contract repo last touched May"],
	["transfuse", "Development", "verification packet 2026-09-05 (low) — No website in row; swap UI repo idle since January"],
];
```

3. **Receipts (the 12 Inactive rows).** Run the `receipt` command on each approved Inactive row before the write, so "verified on 2026-09-05" stays re-checkable:

```sh
pnpm exec tsx scripts/data/capture-receipt.ts didstellar https://api.github.com/repos/mavennet/stellar-did "Not Found"
pnpm exec tsx scripts/data/capture-receipt.ts transfermole https://api.github.com/repos/ivandzen/transfermole "Not Found"
pnpm exec tsx scripts/data/capture-receipt.ts basement https://basement.dev/ "Site Not Found" "no site configured"
pnpm exec tsx scripts/data/capture-receipt.ts bebop https://api.github.com/repos/christopherkarani/escrowcotract "\"pushed_at\":\"2024-11"
pnpm exec tsx scripts/data/capture-receipt.ts block-time-financial https://api.github.com/repos/blocktimefinancial/option "\"pushed_at\":\"2023-10"
pnpm exec tsx scripts/data/capture-receipt.ts chainsatlas https://chainsatlas.com/ "ConnectYourDomain Error"
pnpm exec tsx scripts/data/capture-receipt.ts code4rena https://code4rena.com/ "winding down" "closing its doors"
pnpm exec tsx scripts/data/capture-receipt.ts findtruman https://api.github.com/repos/TrumanStellar/Story-Creation "\"pushed_at\":\"2024-07"
pnpm exec tsx scripts/data/capture-receipt.ts onboarding-club https://api.github.com/users/onboardingclub/repos []
pnpm exec tsx scripts/data/capture-receipt.ts ortege https://api.github.com/repos/Ortege-xyz/studio "\"pushed_at\":\"2024-12"
pnpm exec tsx scripts/data/capture-receipt.ts polaris-lend https://api.github.com/repos/jet-lab/polaris "Not Found"
pnpm exec tsx scripts/data/capture-receipt.ts soundness https://soundness.xyz/ "winding down" "no longer being developed" "services are now offline"
```

## Packets

## Inactive — 12 rows

| slug | name | prom | now (status / basis) | website — fetched 2026-09-05 | GitHub | X / blog | on-chain | SCF | → verdict | conf | evidence (fetched 2026-09-05) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [basement](https://stellarlight.xyz/project/basement) | Basement | 0 | Live / source-inherited | 404 · Site Not Found \| Framer · 83 chars rendered | basementdev/ex_openai 2023-11-22 | could-not-check (login shell) | none in row | no award in row | **Inactive** | high | https://basement.dev/ |
| [chainsatlas](https://stellarlight.xyz/project/chainsatlas) | ChainsAtlas | 0 | Live / source-inherited | 404 · ConnectYourDomain Error \| Wix.com · 33 chars rendered | ChainsAtlas/chainsatlas-go-vscode 2024-05-16 | could-not-check (login shell) | none in row | R20 $49,240 ([page](https://communityfund.stellar.org/project/chainsatlas-qp8)) | **Inactive** | high | https://chainsatlas.com/ |
| [code4rena](https://stellarlight.xyz/project/code4rena) | Code4rena | 0 | Live / site-liveness | 200 · Code4rena \| Keeping high severity bugs out of | code-423n4/code423n4.com 2026-07-16 | could-not-check (login shell) | none in row | no award in row | **Inactive** | high | https://code4rena.com/ |
| [soundness](https://stellarlight.xyz/project/soundness) | Soundness | 0 | Live / site-liveness | 200 · Soundness — Winding Down | SoundnessLabs/stellar-pq 2026-08-27 | could-not-check (login shell) | none in row | no award in row | **Inactive** | high | https://soundness.xyz/ |
| [didstellar](https://stellarlight.xyz/project/didstellar) | DID:STELLAR | 80 | Live / site-liveness | 200 · Revolution Through Digital Technology — Mavennet | repo 404; org newest Mavennet/tech-challenge 2026-07-10 | could-not-check (login shell) | none in row | no award in row | **Inactive** | medium | https://github.com/mavennet/stellar-did |
| [bebop](https://stellarlight.xyz/project/bebop) | Bebop | 0 | Live / source-inherited | no website in row | christopherkarani/escrowcotract 2024-11-14 | could-not-check (login shell) | none in row | R28/31 $148,970 ([page](https://communityfund.stellar.org/project/bebop-flo)) | **Inactive** | medium | https://github.com/christopherkarani/escrowcotract |
| [block-time-financial](https://stellarlight.xyz/project/block-time-financial) | Block Time Financial | 0 | Live / site-liveness | 200 · empty shell — no title, description or text | blocktimefinancial/option 2023-10-06 | could-not-check (login shell) | none in row | no award in row | **Inactive** | medium | https://github.com/blocktimefinancial/option |
| [findtruman](https://stellarlight.xyz/project/findtruman) | FindTruman | 0 | Live / site-liveness | 200 · AI-powered platform to create games from text. No · 0 chars rendered | TrumanStellar/Story-Creation 2024-07-12 | could-not-check (login shell) | none in row | R26 $21,998 ([page](https://communityfund.stellar.org/project/findtruman-adq)) | **Inactive** | medium | https://github.com/TrumanStellar/Story-Creation |
| [polaris-lend](https://stellarlight.xyz/project/polaris-lend) | Polaris Lend | 0 | Live / site-liveness | 200 · empty shell — no title, description or text | repo 404; org newest jet-lab/solana-program-library 2024-08-14 | could-not-check (login shell) | none in row | no award in row | **Inactive** | medium | https://github.com/jet-lab/polaris |
| [transfermole](https://stellarlight.xyz/project/transfermole) | TransferMole | 0 | Live / source-inherited | no website in row | repo 404; org newest ivandzen/ubuntu-wayland-stt 2026-08-07 | could-not-check (login shell) | none in row | no award in row | **Inactive** | medium | https://github.com/ivandzen/transfermole |
| [onboarding-club](https://stellarlight.xyz/project/onboarding-club) | OnBoarding Club | 0 | Live / source-inherited | no website in row | org has 0 public repos | could-not-check (login shell) | none in row | R21/26 $121,000 ([page](https://communityfund.stellar.org/project/onboarding-club-k3k)) | **Inactive** | low | https://github.com/onboardingclub |
| [ortege](https://stellarlight.xyz/project/ortege) | Ortege | 0 | Live / source-inherited | could-not-check (transport failure — DNS/connection) | Ortege-xyz/studio 2024-12-20 | could-not-check (login shell) | none in row | no award in row | **Inactive** | low | https://github.com/Ortege-xyz/studio |

**Owner notes**

- **basement** — Host-level removed-site page (404) + org basementdev newest push 2023-11-22 (~34mo). Two independent negatives.
- **chainsatlas** — 404 Wix host page + org chainsatlas newest push 2024-05-16 (~16mo). SCF R20 $49,240 predates both.
- **code4rena** — Live 200 page states "Code4rena is winding down… closing its doors"; repo still gets wind-down commits (2026-07-16). Shutdown announced ON the page — not inferred from liveness.
- **soundness** — Page: "no longer being developed or maintained, and all services are now offline". Repos stay public (stellar-pq pushed 2026-08-27) — public code is not a live service.
- **didstellar** — GitHub 404 for the only product artifact. mavennet.com is a live 200 corporate page that never names DID:STELLAR — a live parent-company page is not evidence the product lives. Mavennet org itself is active (2026-07-10).
- **bebop** — Row has no website. Only artifact is a personal escrow contract, last push 2024-11-14 (~22mo). SCF R28+R31 $148,970 — worth an owner look before retiring.
- **block-time-financial** — blocktimefinancial.com returns 200 with 0 rendered characters (JS shell, no title) — not a death observation on its own. Repo last push 2023-10-06 (~35mo).
- **findtruman** — findtruman.io serves a 200 shell with 0 rendered characters (og:description only). TrumanStellar org last push 2024-07-12 (~26mo). SCF R26 $21,998.
- **polaris-lend** — jet-lab/polaris 404; website field points at jetprotocol.io, a different product, which serves a 200 SPA shell with 0 rendered characters. jet-lab org newest push 2024-08-14. Owner: the website link itself looks wrong.
- **transfermole** — No website in the row; the named repo is 404. Owner ivandzen is active but only on unrelated personal repos (ubuntu-wayland-stt, 2026-08-07).
- **onboarding-club** — Nothing to check: row has no website, and the org page (fetched today) lists no public repos. No dated signal exists in either direction. SCF R21+R26 $121,000 — needs an owner who knows the team.
- **ortege** — ortege.ai did not answer at all (transport failure after retry) — could-not-check, NOT an observed death. Only dated signal anywhere is a repo push 2024-12-20 (~20mo). Owner should open ortege.ai in a browser before this is applied.

## Pre-Release — 1 rows

| slug | name | prom | now (status / basis) | website — fetched 2026-09-05 | GitHub | X / blog | on-chain | SCF | → verdict | conf | evidence (fetched 2026-09-05) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [neovestor](https://stellarlight.xyz/project/neovestor) | Neovestor | 0 | Live / site-liveness | 200 · Neovestor — Tokenized real-world assets, from $10 | neovestor-tech/Aptos-Code-Collision 2024-09-29 | could-not-check (login shell) | none in row | R28 $50,000 ([page](https://communityfund.stellar.org/project/neovestor-an-rwa-launchpad-qai)) | **Pre-Release** | medium | https://neovestor.com/ |

**Owner notes**

- **neovestor** — Page state is pre-launch, not a badge: "Join waitlist", "2026 Early access · regulated RWA platform", every yield tile renders 0.0%. Only repo in the org is an unrelated Aptos hackathon entry (2024-09-29).

## Development — 5 rows

| slug | name | prom | now (status / basis) | website — fetched 2026-09-05 | GitHub | X / blog | on-chain | SCF | → verdict | conf | evidence (fetched 2026-09-05) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [every-finance](https://stellarlight.xyz/project/every-finance) | Every Finance | 0 | Live / site-liveness | 200 · empty shell — no title, description or text | EveryFinance/smart-contracts-Stellar 2026-07-13 | could-not-check (login shell) | none in row | R30 $140,000 ([page](https://communityfund.stellar.org/project/everyfinance-ejt)) | **Development** | medium | https://github.com/EveryFinance/smart-contracts-Stellar |
| [muwp](https://stellarlight.xyz/project/muwp) | MUWP | 0 | Live / source-inherited | 451 · Deployment Unavailable · 92 chars rendered | repo 404; org newest Muwpay-uniswapper/MUWP 2026-08-18 | could-not-check (login shell) | none in row | R26/35 $133,950 | **Development** | medium | https://github.com/Muwpay-uniswapper/MUWP |
| [mystic](https://stellarlight.xyz/project/mystic) | Mystic | 0 | Live / source-inherited | 403 · Suspected Phishing \| Cloudflare | mystic-finance/Stellar-RFQ 2026-09-01 | could-not-check (login shell) | none in row | no award in row | **Development** | low | https://github.com/mystic-finance/Stellar-RFQ |
| [stallion](https://stellarlight.xyz/project/stallion) | stallion | 0 | Live / source-inherited | 200 · empty shell — no title, description or text | stallionsassemble/stallion-contract 2026-05-16 | could-not-check (login shell) | none in row | R39 $50,000 ([page](https://communityfund.stellar.org/project/stallion-42m)) | **Development** | low | https://github.com/stallionsassemble/stallion-contract |
| [transfuse](https://stellarlight.xyz/project/transfuse) | Transfuse | 0 | Live / source-inherited | no website in row | TransfuseLabs/transfuse-swap-ui 2026-01-10 | could-not-check (login shell) | none in row | R20 $30,000 ([page](https://communityfund.stellar.org/project/transfuse-multichain-asset-bridge-iyi)) | **Development** | low | https://github.com/TransfuseLabs/transfuse-swap-ui |

**Owner notes**

- **every-finance** — every.finance serves a 200 shell with 0 rendered characters, so Live cannot be confirmed off the site. Repo pushed 2026-07-13 (54d). SCF R30 $140,000.
- **muwp** — muwpay.com returns Vercel 451 "Deployment Unavailable" (the site is gone) and the linked repo is 404 — but the org is alive, newest push 2026-08-18. Building, not serving.
- **mystic** — ⚠ mysticfinance.xyz returns a Cloudflare 403 "Suspected Phishing" interstitial — could-not-check for liveness, but the flag itself is a reason to review the outbound link before serving it. Repo mystic-finance/Stellar-RFQ pushed 2026-09-01.
- **stallion** — earnstallions.xyz serves a 200 shell with 0 rendered characters. Repo pushed 2026-05-16 (112d) — just outside the 90-day window, so no live signal inside it. SCF R39 $50,000.
- **transfuse** — Row has no website at all. Only dated signal is a repo push 2026-01-10 (~8mo) — too old for a live signal, too recent to call dead. SCF R20 $30,000.

## Live — 82 rows

| slug | name | prom | now (status / basis) | website — fetched 2026-09-05 | GitHub | X / blog | on-chain | SCF | → verdict | conf | evidence (fetched 2026-09-05) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [allbridge](https://stellarlight.xyz/project/allbridge) | Allbridge | 88 | Live / site-liveness | 200 · Cross Chain Bridge Crypto - Transfer Coins Between | allbridge-io/allbridge-core-js-sdk 2026-09-04 | could-not-check (login shell) | contract CBQ6GW… created 2024-04-16 ([expert](https://stellar.expert/explorer/public/contract/CBQ6GW7QCFFE252QEVENUNG45KYHHBRO4IZIWFJOXEFANHPQUXX5NFWV)) | R20/23 $150,000 ([page](https://communityfund.stellar.org/project/allbridge-core-3lc)) | **Live** | high | https://allbridge.io/ |
| [dia](https://stellarlight.xyz/project/dia) | DIA | 84 | Live / operator-announcement | 200 · DIA \| Price Any Asset. Verify Every Feed. | diadata-org/decentral-data-feeder 2026-09-04 | could-not-check (login shell) | none in row | R20 $38,000 ([page](https://communityfund.stellar.org/project/dia-oracles-fqo)) | **Live** | high | https://www.diadata.org/ |
| [orbitcdp](https://stellarlight.xyz/project/orbitcdp) | OrbitCDP | 70 | Inactive / site-liveness | 200 · Orbit CDP — Collateralized Debt Protocol on Stellar | zenith-protocols/relayer-plugin-zenex 2026-08-27 | could-not-check (login shell) | none in row | R21/25/29 $280,000 ([page](https://communityfund.stellar.org/project/orbitcdp-pst)) | **Live** | high | https://orbitcdp.finance/ |
| [spacewalk](https://stellarlight.xyz/project/spacewalk) | Spacewalk | 70 | Live / site-liveness | 200 · Spacewalk | pendulum-chain/vortex 2026-09-02 | could-not-check (login shell) | none in row | no award in row | **Live** | high | https://www.pendulumchain.org/spacewalk |
| [katagames](https://stellarlight.xyz/project/katagames) | Kata.Games | 68 | Live / site-liveness | 200 · Kata.Games - Revolutionary Gaming Platform | pyved-solution/pyved-engine 2026-06-08 | could-not-check (login shell) | none in row | no award in row | **Live** | high | https://kata.games/ |
| [hot-wallet](https://stellarlight.xyz/project/hot-wallet) | HOT Wallet | 60 | Live / site-liveness | 200 · HOT Protocol \| HOT Labs \| Chain abstraction | hot-dao/pitchtalk-hachathon 2026-07-06 | no handle in row | none in row | no award in row | **Live** | high | https://hot-labs.org/ |
| [abroad](https://stellarlight.xyz/project/abroad) | Abroad | 0 | Live / site-liveness | 200 · Abroad \| Real time payments infrastructure for Wallets | abroad-finance/abroad 2026-08-13 | could-not-check (login shell) | none in row | R32/35 $149,820 ([page](https://communityfund.stellar.org/project/abroad-lxb)) | **Live** | high | https://abroad.finance/ |
| [alternun](https://stellarlight.xyz/project/alternun) | ALTERNUN | 0 | Live / site-liveness | 200 · Alternun \| ReDeFining the future | alternun-development/alternun 2026-09-04 | could-not-check (login shell) | none in row | R27 $32,000 ([page](https://communityfund.stellar.org/project/alternun-16y)) | **Live** | high | https://alternun.io/ |
| [blindpay](https://stellarlight.xyz/project/blindpay) | BlindPay | 0 | Live / site-liveness | 200 · BlindPay \| Stablecoin API for global payments | blindpaylabs/skills 2026-09-04 | could-not-check (login shell) | none in row | R33 $40,000 ([page](https://communityfund.stellar.org/project/blindpay-6ao)) | **Live** | high | https://blindpay.com/ |
| [boundless](https://stellarlight.xyz/project/boundless) | Boundless | 0 | Live / site-liveness | 200 · Boundless — The inference partner for AI-native startups | boundless-xyz/steel 2026-08-31 | could-not-check (login shell) | none in row | R40 $110,000 ([page](https://communityfund.stellar.org/project/boundless-xqk)) | **Live** | high | https://boundless.network/ |
| [fairblock](https://stellarlight.xyz/project/fairblock) | Fairblock | 0 | Live / site-liveness | 200 · Fairblock - Enterprise Privacy Solutions · 40 chars rendered | Fairblock/stabletrust-sdk 2026-09-03 | could-not-check (login shell) | none in row | R40 $150,000 ([page](https://communityfund.stellar.org/project/confidential-transfers-and-balances-hdt)) | **Live** | high | https://www.fairblock.network/ |
| [flutterwave](https://stellarlight.xyz/project/flutterwave) | Flutterwave | 0 | Live / site-liveness | 200 · Endless possibilities for every business - Flutterwave | Flutterwave/Woocommerce-v2 2026-09-03 | could-not-check (login shell) | none in row | no award in row | **Live** | high | https://flutterwave.com/us/ |
| [giveth](https://stellarlight.xyz/project/giveth) | Giveth | 0 | Live / site-liveness | 200 · Giveth: Future of Giving with Zero-Fee Crypto Donation | Giveth/impact-graph 2026-09-04 | could-not-check (login shell) | none in row | R28 $50,000 ([page](https://communityfund.stellar.org/project/giveth-g5q)) | **Live** | high | https://giveth.io/ |
| [inference](https://stellarlight.xyz/project/inference) | Inference | 0 | Live / site-liveness | 200 · Inferara | Inferara/inference 2026-09-04 | could-not-check (login shell) | none in row | R39 $149,730 ([page](https://communityfund.stellar.org/project/inference-xfj)) | **Live** | high | https://inferara.com/ |
| [keystone](https://stellarlight.xyz/project/keystone) | Keystone | 0 | Live / site-liveness | 200 · Keystone Wallet \| Secure Open Source Crypto Solution | KeystoneHQ/k-cms 2026-08-28 | could-not-check (login shell) | none in row | no award in row | **Live** | high | https://keyst.one/ |
| [normal](https://stellarlight.xyz/project/normal) | Normal | 0 | Live / site-liveness | 200 · Home \| Normal | repo 404; org newest normalfinance/normal-v1-interface 2026-09-02 | could-not-check (login shell) | none in row | R31/35 $200,000 ([page](https://communityfund.stellar.org/project/normal-tu3)) | **Live** | high | https://www.normalfinance.io/ |
| [onekey](https://stellarlight.xyz/project/onekey) | OneKey | 0 | Live / site-liveness | 200 · OneKey: Hardware Wallet & Crypto DeFi Wallet \| | OneKeyHQ/hardware-js-sdk 2026-09-05 | could-not-check (login shell) | none in row | R39 $150,000 ([page](https://communityfund.stellar.org/project/onekey-tyb)) | **Live** | high | https://onekey.so/ |
| [ottersec](https://stellarlight.xyz/project/ottersec) | OtterSec | 0 | Live / site-liveness | 200 · OtterSec | otter-sec/anchor 2026-09-05 | could-not-check (login shell) | none in row | R18 $137,500 ([page](https://communityfund.stellar.org/project/ottersec-ecv)) | **Live** | high | https://osec.io/ |
| [rango](https://stellarlight.xyz/project/rango) | Rango | 0 | Live / site-liveness | 200 · Rango Exchange \| Swap Anything Anywhere | rango-exchange/rango-client 2026-09-05 | could-not-check (login shell) | none in row | R31 $60,000 ([page](https://communityfund.stellar.org/project/rango-svg)) | **Live** | high | https://rango.exchange/ |
| [rarible](https://stellarlight.xyz/project/rarible) | Rarible | 0 | Live / site-liveness | 200 · Rarible – fastest multichain NFT Marketplace with Rewards | rarible/protocol-contracts 2026-08-27 | could-not-check (login shell) | none in row | no award in row | **Live** | high | https://rarible.com/all |
| [ripio](https://stellarlight.xyz/project/ripio) | Ripio | 0 | Live / site-liveness | 200 · Liderando cripto en LATAM desde 2013 \| Crypto | ripio/agents-toolkit 2026-08-24 | could-not-check (login shell) | none in row | no award in row | **Live** | high | https://www.ripio.com/es |
| [rozo](https://stellarlight.xyz/project/rozo) | Rozo | 0 | Live / site-liveness | 200 · ROZO - Visa Layer for Stablecoins. Spend crypto, | RozoAI/intent-pay 2026-09-05 | could-not-check (login shell) | contract CAC5SK… created 2026-01-18 ([expert](https://stellar.expert/explorer/public/contract/CAC5SKP5FJT2ZZ7YLV4UCOM6Z5SQCCVPZWHLLLVQNQG2RWWOOSP3IYRL)) | R38/44 $248,000 ([page](https://communityfund.stellar.org/project/rozo-one-tap-to-pay-vqy)) | **Live** | high | https://rozo.ai/ |
| [runtime-verification](https://stellarlight.xyz/project/runtime-verification) | Runtime Verification | 0 | Live / site-liveness | 200 · Runtime Verification - Software Assurance for the AI | runtimeverification/stellar-debugger 2026-09-04 | could-not-check (login shell) | none in row | no award in row | **Live** | high | https://runtimeverification.com/ |
| [skyhitz](https://stellarlight.xyz/project/skyhitz) | Skyhitz | 0 | Live / site-liveness | 200 · Skyhitz - Gravity. Mainnet | skyhitz/hitz-gravity 2026-09-05 | could-not-check (login shell) | none in row | R9/10/30 $255,000 ([page](https://communityfund.stellar.org/project/skyhitz-a9r)) | **Live** | high | https://skyhitz.io/ |
| [splito](https://stellarlight.xyz/project/splito) | Splito | 0 | Live / site-liveness | 200 · Splito — Request Money, Get Paid in Any | Splitoio/web-app 2026-08-28 | could-not-check (login shell) | none in row | R40 $50,000 ([page](https://communityfund.stellar.org/project/splito-aoj)) | **Live** | high | https://www.splito.io/ |
| [spydra](https://stellarlight.xyz/project/spydra) | Spydra | 0 | Live / site-liveness | 200 · Asset Tokenization Platform \| Spydra | spydra-tech/presidio 2026-08-25 | could-not-check (login shell) | none in row | R31 $132,000 ([page](https://communityfund.stellar.org/project/spydra-low-code-rwa-tokenization-engine-k2y)) | **Live** | high | https://www.spydra.app/ |
| [tala](https://stellarlight.xyz/project/tala) | Tala | 0 | Live / site-liveness | 200 · Tala \| Digital Financial Services, Credit, Savings and | inventure/docker-play-seeder 2026-08-21 | could-not-check (login shell) | none in row | no award in row | **Live** | high | https://tala.co/ |
| [the-give-hub](https://stellarlight.xyz/project/the-give-hub) | The Give Hub | 0 | Live / site-liveness | 200 · The Give Hub - Blockchain Charity Simplified | thegivehub/www 2026-07-27 | could-not-check (login shell) | none in row | R33 $45,000 ([page](https://communityfund.stellar.org/project/the-give-hub-uy0)) | **Live** | high | https://thegivehub.com/en/index.html |
| [token-tails](https://stellarlight.xyz/project/token-tails) | Token Tails | 0 | Live / site-liveness | 200 · Token Tails \| A family of feline care | zbagdzevicius/tokentails 2026-07-24 | could-not-check (login shell) | none in row | R26/30 $144,000 ([page](https://communityfund.stellar.org/project/token-tails-gov)) | **Live** | high | https://tokentails.com/ |
| [untangled](https://stellarlight.xyz/project/untangled) | Untangled | 0 | Live / site-liveness | 200 · Untangled Finance · 17 chars rendered | untangledfinance/oz-policy-builder 2026-09-01 | could-not-check (login shell) | contract CBLC4N… created 2025-05-26 ([expert](https://stellar.expert/explorer/public/contract/CBLC4NWJPBHWPXDL4TTXDZJLVZ2JFWMVZHQNI4MLZRNKYGIKGX6K4DMA)) | R31 $200,000 ([page](https://communityfund.stellar.org/project/untangled-qcs)) | **Live** | high | https://untangled.finance/ |
| [usher](https://stellarlight.xyz/project/usher) | Usher | 0 | Live / site-liveness | 200 · Usher Labs - Trace, Prove, and Mobilise Capital | usherlabs/cex-broker 2026-09-05 | could-not-check (login shell) | none in row | no award in row | **Live** | high | https://www.usher.so/ |
| [vanna-finance](https://stellarlight.xyz/project/vanna-finance) | Vanna Finance | 0 | Live / site-liveness | 200 · Vanna — Composable Undercollateralized Credit for DeFi | repo 404; org newest vannafinance/mercury-stellar-backend 2026-09-02 | could-not-check (login shell) | none in row | no award in row | **Live** | high | https://vanna.finance/ |
| [wagelink](https://stellarlight.xyz/project/wagelink) | Wagelink | 0 | Live / site-liveness | 200 · WageLink · 8 chars rendered | Zebec-protocol/canton-dev-fund 2026-09-02 | could-not-check (login shell) | none in row | R24 $50,000 | **Live** | high | https://wagelink.io/ |
| [zebec](https://stellarlight.xyz/project/zebec) | Zebec | 0 | Live / site-liveness | 200 · Zebec Network \| Real‑Time Crypto Payroll & Payments | Zebec-protocol/canton-dev-fund 2026-09-02 | could-not-check (login shell) | none in row | no award in row | **Live** | high | https://zebec.io/ |
| [kale](https://stellarlight.xyz/project/kale) | Kale | 90 | Live / site-liveness | 200 · Kale On Stellar | kalepail/KALE-sc 2026-03-06 | could-not-check (login shell) | none in row | no award in row | **Live** | medium | https://kaleonstellar.com/ |
| [yellow-card](https://stellarlight.xyz/project/yellow-card) | Yellow Card | 80 | Live / site-liveness | 200 · Stablecoin Payments Infrastructure - Yellow Card | yellowcardfinancial/backend-test 2026-04-23 | could-not-check (login shell) | none in row | no award in row | **Live** | medium | https://yellowcard.io/ |
| [fonbnk](https://stellarlight.xyz/project/fonbnk) | Fonbnk | 76 | Live / site-liveness | 200 · Fonbnk — Stablecoin payments for global commerce | fonbnk/pretium-balance-calculation 2026-04-15 | could-not-check (login shell) | none in row | no award in row | **Live** | medium | https://fonbnk.com/ |
| [solar-wallet](https://stellarlight.xyz/project/solar-wallet) | Solar Wallet | 70 | Live / site-liveness | 200 · Simple and Secure Stellar Wallet \| Solar Wallet | satoshipay/js-stellar-sdk 2023-05-09 | no handle in row | none in row | no award in row | **Live** | medium | https://solarwallet.io/ |
| [chipper](https://stellarlight.xyz/project/chipper) | Chipper | 68 | Live / site-liveness | 200 · Move Your Money Freely | ChipperCash/roast-my-pr 2024-03-29 | could-not-check (login shell) | none in row | no award in row | **Live** | medium | https://www.chippercash.com/ |
| [open-gamefi-sdk](https://stellarlight.xyz/project/open-gamefi-sdk) | Open GameFi SDK | 60 | Live / site-liveness | 200 · GitHub - yanis7774/Stellar-GameFi-integration: Stellar GameFi integration to Colyseus.js, | yanis7774/Stellar-GameFi-integration 2025-03-21 | no handle in row | none in row | no award in row | **Live** | medium | https://github.com/yanis7774/stellar-gamefi-integration/tree/main |
| [stellar-passport](https://stellarlight.xyz/project/stellar-passport) | Stellar Passport | 55 | Live / site-liveness | 200 · Stellar Passport — Proof you showed up. Proof | Tellus-Cooperative/FreshRSS 2026-01-10 | could-not-check (login shell) | none in row | R40 $150,000 ([page](https://communityfund.stellar.org/project/stellar-passport-bgn)) | **Live** | medium | https://stellarpassport.xyz/ |
| [vaquita](https://stellarlight.xyz/project/vaquita) | Vaquita | 4 | Live / site-liveness | 200 · Vaquita Saving money, but make it fun | vaquita-fi/vaquita-lemon 2026-03-11 | could-not-check (login shell) | none in row | R42 $64,900 ([page](https://communityfund.stellar.org/project/vaquita-gamified-savings-pqq)) | **Live** | medium | https://www.vaquita.fi/ |
| [alterscope](https://stellarlight.xyz/project/alterscope) | Alterscope | 0 | Live / site-liveness | 200 · Alterscope — See on-chain markets clearly | Solity-Network/alteron-subnet 2025-01-26 | could-not-check (login shell) | none in row | R24/26 $137,600 ([page](https://communityfund.stellar.org/project/alterscope-soa)) | **Live** | medium | https://alterscope.org/ |
| [blockedenxyz](https://stellarlight.xyz/project/blockedenxyz) | BlockEden.xyz | 0 | Live / site-liveness | 200 · BlockEden.xyz \| Web3 Infrastructure & Crypto Payments for | BlockEdenHQ/web-blockeden-home 2025-03-25 **ARCHIVED** | could-not-check (login shell) | none in row | no award in row | **Live** | medium | https://blockeden.xyz/ |
| [boss-revolution](https://stellarlight.xyz/project/boss-revolution) | Boss Revolution | 0 | Live / site-liveness | 200 · Send Money Online - Transfer Money Overseas \| | IDTdesign/icons 2024-08-20 | could-not-check (login shell) | none in row | no award in row | **Live** | medium | https://www.bossmoney.com/en-us/ |
| [centiiv](https://stellarlight.xyz/project/centiiv) | Centiiv | 0 | Live / site-liveness | 200 · Centiiv — Global Payment Infrastructure | repo 404; org newest Centiiv/convoy 2025-10-29 | could-not-check (login shell) | none in row | R36 $51,300 ([page](https://communityfund.stellar.org/project/centiiv-j1z)) | **Live** | medium | https://www.centiiv.io/ |
| [fxdao](https://stellarlight.xyz/project/fxdao) | FxDAO | 0 | Live / site-liveness | 200 · Hello from FxDAO \| FxDAO | FxDAO/FxDAO-SDK-JS 2025-09-03 | could-not-check (login shell) | none in row | R13 $224,800 ([page](https://communityfund.stellar.org/project/fxdao-xov)) | **Live** | medium | https://fxdao.io/ |
| [ichi](https://stellarlight.xyz/project/ichi) | Ichi | 0 | Live / site-liveness | 200 · ICHI \| Grow any token with low-slippage, on-chain | ichifarm/multi-rewards 2026-02-07 **ARCHIVED** | could-not-check (login shell) | none in row | R26 $50,000 ([page](https://communityfund.stellar.org/project/solo-labs-iy1)) | **Live** | medium | https://ichi.org/ |
| [legacy-suite](https://stellarlight.xyz/project/legacy-suite) | Legacy Suite | 0 | Live / site-liveness | 200 · Digital Estate Planning Platform \| Organize Your Assets, | Avento-Labs/legacy-suite-contracts 2024-10-31 | could-not-check (login shell) | none in row | no award in row | **Live** | medium | https://www.legacysuite.com/ |
| [litemint](https://stellarlight.xyz/project/litemint) | Litemint | 0 | Live / site-liveness | 200 · Litemint — Forging Legacies Beyond the Game | litemint/litemint 2026-01-25 | could-not-check (login shell) | none in row | R3/7/19 $376,835 ([page](https://communityfund.stellar.org/project/litemint-omg)) | **Live** | medium | https://litemint.com/ |
| [lumenswap](https://stellarlight.xyz/project/lumenswap) | Lumenswap | 0 | Live / site-liveness | 200 · Lumenswap \| Decentralized Exchange on Stellar | lumenswap/swap-contract 2024-06-02 | could-not-check (login shell) | none in row | R6 $6,787 ([page](https://communityfund.stellar.org/project/lumenswap-qk7)) | **Live** | medium | https://lumenswap.io/ |
| [mobula-labs](https://stellarlight.xyz/project/mobula-labs) | Mobula Labs | 0 | Live / site-liveness | 200 · Mobula \| Data and execution for the best | MobulaFi/MTT 2026-05-24 | could-not-check (login shell) | none in row | R34 $122,000 ([page](https://communityfund.stellar.org/project/mobula-labs-ji9)) | **Live** | medium | https://mobula.io/ |
| [one-click](https://stellarlight.xyz/project/one-click) | One Click | 0 | Live / site-liveness | 200 · One Click Labs | One-Click-Crypto/eliza-starter 2025-02-08 | could-not-check (login shell) | none in row | no award in row | **Live** | medium | https://www.oneclick.fi/ |
| [remittease](https://stellarlight.xyz/project/remittease) | RemittEase | 0 | Live / site-liveness | 200 · RemittEase – Fast & Modern Cross-Border Remittances | Web3WizardZ/remi-p 2025-12-08 | could-not-check (login shell) | none in row | R36 $54,050 ([page](https://communityfund.stellar.org/project/remittease-tvj)) | **Live** | medium | https://remittease.xyz/ |
| [siborg](https://stellarlight.xyz/project/siborg) | SiBorg | 0 | Live / site-liveness | 200 · SiBorg Labs - Consumer Crypto Innovation | siborg-ads/stellar-client 2025-05-13 | could-not-check (login shell) | none in row | R31 $95,900 ([page](https://communityfund.stellar.org/project/siborg-dx1)) | **Live** | medium | https://www.siborg.io/ |
| [tellus-cooperative](https://stellarlight.xyz/project/tellus-cooperative) | Tellus Cooperative | 0 | Live / site-liveness | 200 · Tellus Cooperative \| Aprende, Conecta y Emprende en | Tellus-Cooperative/FreshRSS 2026-01-10 | could-not-check (login shell) | none in row | R8/13 $114,733 ([page](https://communityfund.stellar.org/project/tellus-cooperative-kiq)) | **Live** | medium | https://blog.telluscoop.com/ |
| [wombat](https://stellarlight.xyz/project/wombat) | Wombat | 0 | Live / site-liveness | 200 · Wombat Exchange is a cross-chain token swap built · 204 chars rendered | wombat-exchange/dimension-adapters 2026-03-13 | could-not-check (login shell) | none in row | R18 $150,005 ([page](https://communityfund.stellar.org/project/wombat-exchange-cli)) | **Live** | medium | https://www.wombat.exchange/swap |
| [quicknode](https://stellarlight.xyz/project/quicknode) | QuickNode | 84 | Live / site-liveness | 200 · Stellar RPC \| Quicknode Docs | no GitHub link in row | no handle in row | none in row | no award in row | **Live** | low | https://www.quicknode.com/docs/stellar |
| [alchemy](https://stellarlight.xyz/project/alchemy) | Alchemy | 80 | Live / site-liveness | 200 · Alchemy \| Blockchain infrastructure for developers | no GitHub link in row | could-not-check (login shell) | none in row | no award in row | **Live** | low | https://www.alchemy.com/ |
| [scorechain](https://stellarlight.xyz/project/scorechain) | Scorechain | 78 | Live / site-liveness | 200 · Crypto AML Compliance & Blockchain Analytics Platform \| | no GitHub link in row | could-not-check (login shell) | none in row | R36 $85,000 ([page](https://communityfund.stellar.org/project/ssc-scorechain-stellar-compliance-vr7)) | **Live** | low | https://www.scorechain.com/ |
| [felix-pago](https://stellarlight.xyz/project/felix-pago) | Felix Pago | 70 | Live / site-liveness | 200 · Envía Dinero a Latinoamérica por WhatsApp \| Félix | no GitHub link in row | could-not-check (login shell) | none in row | no award in row | **Live** | low | https://www.felixpago.com/ |
| [infstones](https://stellarlight.xyz/project/infstones) | InfStones | 70 | Live / site-liveness | 200 · InfStones - The Ultimate Blockchain Infrastructure Services Platform | org has 0 public repos | could-not-check (login shell) | none in row | R26/29 $150,000 ([page](https://communityfund.stellar.org/project/infstones-a0l)) | **Live** | low | https://infstones.com/ |
| [lightsail-network-quasar](https://stellarlight.xyz/project/lightsail-network-quasar) | Lightsail Network (Quasar) | 70 | Live / site-liveness | 200 · Quasar - Stellar RPC & Data Services by | no GitHub link in row | no handle in row | none in row | no award in row | **Live** | low | https://quasar.lightsail.network/ |
| [redswan](https://stellarlight.xyz/project/redswan) | RedSwan | 70 | Live / site-liveness | 500 · RedSwan Digital Real Estate - Tokenized Commercial Real | no GitHub link in row | could-not-check (login shell) | none in row | no award in row | **Live** | low | https://redswan.io/ |
| [zettablock](https://stellarlight.xyz/project/zettablock) | ZettaBlock | 68 | Live / site-liveness | 200 · ZettaBlock - A unified platform for open and | org has 0 public repos | could-not-check (login shell) | none in row | no award in row | **Live** | low | https://zettablock.com/ |
| [walletconnect](https://stellarlight.xyz/project/walletconnect) | WalletConnect | 58 | Live / site-liveness | 200 · WalletConnect: The Connectivity Layer for the Financial Internet | no GitHub link in row | no handle in row | none in row | no award in row | **Live** | low | https://walletconnect.network/ |
| [ankr](https://stellarlight.xyz/project/ankr) | Ankr | 55 | Live / site-liveness | 200 · Free Blockchain RPC Endpoints for 75+ Networks: Ankr · 168 chars rendered | no GitHub link in row | no handle in row | none in row | R42 $60,000 | **Live** | low | https://www.ankr.com/rpc/stellar/ |
| [cactus-link](https://stellarlight.xyz/project/cactus-link) | Cactus Link | 55 | Live / site-liveness | 200 · Cactus Custody · 14 chars rendered | no GitHub link in row | no handle in row | none in row | no award in row | **Live** | low | https://www.mycactus.com/ |
| [exaion](https://stellarlight.xyz/project/exaion) | Exaion | 55 | Live / site-liveness | 200 · Exaion Node-as-a-Service \| Exaion Crypto | no GitHub link in row | no handle in row | none in row | no award in row | **Live** | low | https://crypto.exaion.com/products/node |
| [getblock](https://stellarlight.xyz/project/getblock) | GetBlock | 38 | Live / site-liveness | 200 · Stellar RPC Node – Fast API Access \| | no GitHub link in row | no handle in row | none in row | no award in row | **Live** | low | https://getblock.io/nodes/xlm/ |
| [afriex](https://stellarlight.xyz/project/afriex) | Afriex | 0 | Live / site-liveness | 200 · Afriex: International Money Transfer \| Send Money to | no GitHub link in row | could-not-check (login shell) | none in row | no award in row | **Live** | low | https://afriex.com/ |
| [cede](https://stellarlight.xyz/project/cede) | Cede | 0 | Live / source-inherited | 403 · Just a moment... · 16 chars rendered | repo 404; org newest cedelabs/sdk-api 2025-10-01 | could-not-check (login shell) | none in row | no award in row | **Live** | low | https://github.com/cedelabs/sdk-api |
| [coinsender](https://stellarlight.xyz/project/coinsender) | CoinSender | 0 | Live / site-liveness | 200 · Home \| CoinSender | repo 404; org newest Megadev-OU/SendByEmail 2024-02-13 | could-not-check (login shell) | none in row | no award in row | **Live** | low | https://coinsender.io/ |
| [dolphinze](https://stellarlight.xyz/project/dolphinze) | dolphinze | 0 | Live / site-liveness | 200 · Dolphinze — Global Contractor Payments in Fiat or · 180 chars rendered | repo 404; org 404 | could-not-check (login shell) | none in row | R39 $129,800 ([page](https://communityfund.stellar.org/project/dolphinze-yjr)) | **Live** | low | https://dolphinze.com/ |
| [kotani-pay](https://stellarlight.xyz/project/kotani-pay) | Kotani Pay | 0 | Live / site-liveness | 200 · | no GitHub link in row | could-not-check (login shell) | none in row | R11 $100,000 ([page](https://communityfund.stellar.org/project/kotani-pay-jy7)) | **Live** | low | https://kotanipay.com/ |
| [lemon](https://stellarlight.xyz/project/lemon) | Lemon | 0 | Live / site-liveness | 200 · Lemon | no GitHub link in row | could-not-check (login shell) | none in row | no award in row | **Live** | low | https://lemon.me/ |
| [paychant](https://stellarlight.xyz/project/paychant) | Paychant | 0 | Live / source-inherited | 200 · Fiat On and Off Ramp Solution for Stablecoins | paychant/stellar 2023-06-08 | could-not-check (login shell) | none in row | R16/21 $150,000 ([page](https://communityfund.stellar.org/project/paychant-bpq)) | **Live** | low | https://paychant.com/ |
| [plutope](https://stellarlight.xyz/project/plutope) | Plutope | 0 | Live / site-liveness | 200 · Plutope — Compliant payments, settlement, cards & wallets | repo 404; org 0 public repos | could-not-check (login shell) | none in row | no award in row | **Live** | low | https://plutope.com/ |
| [public-node](https://stellarlight.xyz/project/public-node) | Public Node | 0 | Live / site-liveness | 200 · Home \| Blockchain Nodes Funded by Community - | org has 0 public repos | could-not-check (login shell) | none in row | R3/13 $150,000 ([page](https://communityfund.stellar.org/project/public-node-wsz)) | **Live** | low | https://publicnode.org/ |
| [smart-deploy](https://stellarlight.xyz/project/smart-deploy) | Smart Deploy | 0 | Live / site-liveness | 200 · SmartDeploy \|\| Ready. Set. SmartDeploy! · 79 chars rendered | TENK-DAO/smartdeploy 2024-07-19 | could-not-check (login shell) | none in row | R14/16/21 $194,800 ([page](https://communityfund.stellar.org/project/smart-deploy-yoj)) | **Live** | low | https://www.smartdeploy.dev/ |
| [wave](https://stellarlight.xyz/project/wave) | Wave | 0 | Live / site-liveness | 200 · Wave | no GitHub link in row | could-not-check (login shell) | none in row | no award in row | **Live** | low | https://www.wave.com/en/ |
| [wirex-pay](https://stellarlight.xyz/project/wirex-pay) | Wirex | 0 | Live / site-liveness | 200 · Wirex \| Crypto Wallet, Cards & Payments for | no GitHub link in row | could-not-check (login shell) | none in row | R35 $150,000 ([page](https://communityfund.stellar.org/project/wirex-pay-h22)) | **Live** | low | https://www.wirexapp.com/ |

**Owner notes**

- **orbitcdp** — ⚠ This row is currently Inactive, and the evidence points the other way: site 200 says "Live on Stellar" with a working Launch App, and the zenith-protocols org pushed 2026-08-27. On-chain stats on the page render as "—" though, so confirm the protocol actually has open positions before flipping it back.
- **solar-wallet** — Site 200 naming the product; repo last push 2023-05-09 (~40mo). A wallet can ship as a finished binary, so staleness alone is not death — but nothing dates the product inside 90 days.
- **chipper** — Site 200; repo last push 2024-03-29 (~29mo). Large consumer fintech — code staleness is expected, the app store is the real signal (not machine-checked here).
- **blockedenxyz** — Site 200 naming the product; the linked repo is ARCHIVED (blockeden.xyz repo, last push 2025-03-25), so the code signal is explicitly retired. Marketing page is the only live signal.
- **boss-revolution** — Site 200 naming the product; repo last push 2024-08-20 (~25mo). Consumer remittance brand.
- **ichi** — Site 200 naming the product; linked repo is ARCHIVED (last push 2026-02-07). No live code signal.
- **litemint** — Site 200 running an active tournament ("$1,000 prize pool", © 2026); repo last push 2026-01-25 (223d) — outside 90d, so the page is the only in-window signal.
- **lumenswap** — Site 200 naming the product and serving a stellar.toml (deployment basis operator-toml, mainnet). Repo last push 2024-06-02 (~27mo) — no code signal inside 90d.
- **redswan** — Site returns HTTP 500 while still rendering the full marketing page (7.3k chars) — worth an owner look. No GitHub link, no on-chain block, so the marketing page is the only thing that answered.
- **cede** — cede.store 301s to cedehub.io and returns a Cloudflare 403 challenge — could-not-check, not a death. Linked repo cedelabs/sdk-examples is 404; org newest push 2025-10-01 (~11mo). Nothing confirms or refutes Live.
- **plutope** — Site 200 naming the product; linked repo 404 and the org plutopein has 0 public repos. Marketing page is the only signal.
- **smart-deploy** — Site 200 but only 79 rendered characters — a title card, not a product. Repo TENK-DAO/smartdeploy last push 2024-07-19 (~25mo). SCF R14/16/21 $194,800. Strong candidate for Inactive, but nothing observed says dead.

## Machine block

Shape = `STATUS_FIX` in `scripts/data/curation-maps.ts`, one entry per slug, 100 entries, no duplicates. `asOf` is the fetch date of `sourceUrl`. `receipt` appears on Inactive rows only and is a command to run, not a field to paste.

```json
{
 "kale": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://kaleonstellar.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Kale On Stellar\"; repo kalepail/KALE-sc pushed 2026-03-06 (medium confidence)."
 },
 "allbridge": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://allbridge.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Cross Chain Bridge Crypto - Transfer Coins Between\"; repo allbridge-io/allbridge-core-js-sdk pushed 2026-09-04 (high confidence)."
 },
 "dia": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.diadata.org/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"DIA | Price Any Asset. Verify Every Feed.\"; repo diadata-org/decentral-data-feeder pushed 2026-09-04 (high confidence)."
 },
 "quicknode": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.quicknode.com/docs/stellar",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Stellar RPC | Quicknode Docs\"; no GitHub link in row (low confidence)."
 },
 "yellow-card": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://yellowcard.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Stablecoin Payments Infrastructure - Yellow Card\"; repo yellowcardfinancial/backend-test pushed 2026-04-23 (medium confidence)."
 },
 "didstellar": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/mavennet/stellar-did",
  "note": "Verification packet 2026-09-05, owner-approved: Repo deleted; linked site is Mavennet corporate (medium confidence).",
  "receipt": "pnpm exec tsx scripts/data/capture-receipt.ts didstellar https://api.github.com/repos/mavennet/stellar-did \"Not Found\""
 },
 "alchemy": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.alchemy.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Alchemy | Blockchain infrastructure for developers\"; no GitHub link in row (low confidence)."
 },
 "scorechain": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.scorechain.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Crypto AML Compliance & Blockchain Analytics Platform |\"; no GitHub link in row (low confidence)."
 },
 "fonbnk": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://fonbnk.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Fonbnk — Stablecoin payments for global commerce\"; repo fonbnk/pretium-balance-calculation pushed 2026-04-15 (medium confidence)."
 },
 "felix-pago": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.felixpago.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Envía Dinero a Latinoamérica por WhatsApp | Félix\"; no GitHub link in row (low confidence)."
 },
 "infstones": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://infstones.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"InfStones - The Ultimate Blockchain Infrastructure Services Platform\"; org has 0 public repos (low confidence)."
 },
 "spacewalk": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.pendulumchain.org/spacewalk",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Spacewalk\"; repo pendulum-chain/vortex pushed 2026-09-02 (high confidence)."
 },
 "orbitcdp": {
  "from": "Inactive",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://orbitcdp.finance/",
  "note": "Verification packet 2026-09-05, owner-approved: CDP protocol page: \"Live on Stellar\", Launch App (high confidence)."
 },
 "lightsail-network-quasar": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://quasar.lightsail.network/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Quasar - Stellar RPC & Data Services by\"; no GitHub link in row (low confidence)."
 },
 "redswan": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://redswan.io/",
  "note": "Verification packet 2026-09-05, owner-approved: Tokenized commercial real-estate marketplace, page renders on 500 (low confidence)."
 },
 "solar-wallet": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://solarwallet.io/",
  "note": "Verification packet 2026-09-05, owner-approved: Free open-source multi-signature Stellar desktop/mobile wallet (medium confidence)."
 },
 "katagames": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://kata.games/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Kata.Games - Revolutionary Gaming Platform\"; repo pyved-solution/pyved-engine pushed 2026-06-08 (high confidence)."
 },
 "chipper": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.chippercash.com/",
  "note": "Verification packet 2026-09-05, owner-approved: Pan-African money app: move money freely (medium confidence)."
 },
 "zettablock": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://zettablock.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"ZettaBlock - A unified platform for open and\"; org has 0 public repos (low confidence)."
 },
 "open-gamefi-sdk": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/yanis7774/stellar-gamefi-integration/tree/main",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"GitHub - yanis7774/Stellar-GameFi-integration: Stellar GameFi integration to Colyseus.js,\"; repo yanis7774/Stellar-GameFi-integration pushed 2025-03-21 (medium confidence)."
 },
 "hot-wallet": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://hot-labs.org/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"HOT Protocol | HOT Labs | Chain abstraction\"; repo hot-dao/pitchtalk-hachathon pushed 2026-07-06 (high confidence)."
 },
 "walletconnect": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://walletconnect.network/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"WalletConnect: The Connectivity Layer for the Financial Internet\"; no GitHub link in row (low confidence)."
 },
 "stellar-passport": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://stellarpassport.xyz/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Stellar Passport — Proof you showed up. Proof\"; repo Tellus-Cooperative/FreshRSS pushed 2026-01-10 (medium confidence)."
 },
 "ankr": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.ankr.com/rpc/stellar/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Free Blockchain RPC Endpoints for 75+ Networks: Ankr\"; no GitHub link in row (low confidence)."
 },
 "cactus-link": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.mycactus.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Cactus Custody\"; no GitHub link in row (low confidence)."
 },
 "exaion": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://crypto.exaion.com/products/node",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Exaion Node-as-a-Service | Exaion Crypto\"; no GitHub link in row (low confidence)."
 },
 "getblock": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://getblock.io/nodes/xlm/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Stellar RPC Node – Fast API Access |\"; no GitHub link in row (low confidence)."
 },
 "vaquita": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.vaquita.fi/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Vaquita Saving money, but make it fun\"; repo vaquita-fi/vaquita-lemon pushed 2026-03-11 (medium confidence)."
 },
 "lumenswap": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://lumenswap.io/",
  "note": "Verification packet 2026-09-05, owner-approved: Stellar DEX front-end for swapping network assets (medium confidence)."
 },
 "fxdao": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://fxdao.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Hello from FxDAO | FxDAO\"; repo FxDAO/FxDAO-SDK-JS pushed 2025-09-03 (medium confidence)."
 },
 "flutterwave": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://flutterwave.com/us/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Endless possibilities for every business - Flutterwave\"; repo Flutterwave/Woocommerce-v2 pushed 2026-09-03 (high confidence)."
 },
 "wave": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.wave.com/en/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Wave\"; no GitHub link in row (low confidence)."
 },
 "onekey": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://onekey.so/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"OneKey: Hardware Wallet & Crypto DeFi Wallet |\"; repo OneKeyHQ/hardware-js-sdk pushed 2026-09-05 (high confidence)."
 },
 "zebec": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://zebec.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Zebec Network | Real‑Time Crypto Payroll & Payments\"; repo Zebec-protocol/canton-dev-fund pushed 2026-09-02 (high confidence)."
 },
 "boss-revolution": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.bossmoney.com/en-us/",
  "note": "Verification packet 2026-09-05, owner-approved: International money transfer app, first three transfers free (medium confidence)."
 },
 "ripio": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.ripio.com/es",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Liderando cripto en LATAM desde 2013 | Crypto\"; repo ripio/agents-toolkit pushed 2026-08-24 (high confidence)."
 },
 "tala": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://tala.co/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Tala | Digital Financial Services, Credit, Savings and\"; repo inventure/docker-play-seeder pushed 2026-08-21 (high confidence)."
 },
 "transfermole": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/ivandzen/transfermole",
  "note": "Verification packet 2026-09-05, owner-approved: Repo deleted; row has no website (medium confidence).",
  "receipt": "pnpm exec tsx scripts/data/capture-receipt.ts transfermole https://api.github.com/repos/ivandzen/transfermole \"Not Found\""
 },
 "afriex": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://afriex.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Afriex: International Money Transfer | Send Money to\"; no GitHub link in row (low confidence)."
 },
 "lemon": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://lemon.me/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Lemon\"; no GitHub link in row (low confidence)."
 },
 "rozo": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://rozo.ai/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"ROZO - Visa Layer for Stablecoins. Spend crypto,\"; repo RozoAI/intent-pay pushed 2026-09-05 (high confidence)."
 },
 "wirex-pay": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.wirexapp.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Wirex | Crypto Wallet, Cards & Payments for\"; no GitHub link in row (low confidence)."
 },
 "normal": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.normalfinance.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Home | Normal\"; linked repo 404, org newest push 2026-09-02 (high confidence)."
 },
 "litemint": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://litemint.com/",
  "note": "Verification packet 2026-09-05, owner-approved: Game studio and Stellar NFT marketplace, live tournament (medium confidence)."
 },
 "kotani-pay": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://kotanipay.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"\"; no GitHub link in row (low confidence)."
 },
 "abroad": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://abroad.finance/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Abroad | Real time payments infrastructure for Wallets\"; repo abroad-finance/abroad pushed 2026-08-13 (high confidence)."
 },
 "alternun": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://alternun.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Alternun | ReDeFining the future\"; repo alternun-development/alternun pushed 2026-09-04 (high confidence)."
 },
 "alterscope": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://alterscope.org/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Alterscope — See on-chain markets clearly\"; repo Solity-Network/alteron-subnet pushed 2025-01-26 (medium confidence)."
 },
 "basement": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://basement.dev/",
  "note": "Verification packet 2026-09-05, owner-approved: Framer \"Site Not Found\" — no site configured (high confidence).",
  "receipt": "pnpm exec tsx scripts/data/capture-receipt.ts basement https://basement.dev/ \"Site Not Found\" \"no site configured\""
 },
 "bebop": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/christopherkarani/escrowcotract",
  "note": "Verification packet 2026-09-05, owner-approved: No website; sole repo idle since Nov 2024 (medium confidence).",
  "receipt": "pnpm exec tsx scripts/data/capture-receipt.ts bebop https://api.github.com/repos/christopherkarani/escrowcotract \"\\\"pushed_at\\\":\\\"2024-11\""
 },
 "blindpay": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://blindpay.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"BlindPay | Stablecoin API for global payments\"; repo blindpaylabs/skills pushed 2026-09-04 (high confidence)."
 },
 "block-time-financial": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/blocktimefinancial/option",
  "note": "Verification packet 2026-09-05, owner-approved: Empty 200 shell; repo idle since Oct 2023 (medium confidence).",
  "receipt": "pnpm exec tsx scripts/data/capture-receipt.ts block-time-financial https://api.github.com/repos/blocktimefinancial/option \"\\\"pushed_at\\\":\\\"2023-10\""
 },
 "blockedenxyz": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://blockeden.xyz/",
  "note": "Verification packet 2026-09-05, owner-approved: Web3 RPC/API infra plus merchant crypto payments (medium confidence)."
 },
 "boundless": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://boundless.network/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Boundless — The inference partner for AI-native startups\"; repo boundless-xyz/steel pushed 2026-08-31 (high confidence)."
 },
 "cede": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/cedelabs/sdk-api",
  "note": "Verification packet 2026-09-05, owner-approved: Cloudflare challenge; org repos idle since Oct 2025 (low confidence)."
 },
 "centiiv": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.centiiv.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Centiiv — Global Payment Infrastructure\"; linked repo 404, org newest push 2025-10-29 (medium confidence)."
 },
 "chainsatlas": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://chainsatlas.com/",
  "note": "Verification packet 2026-09-05, owner-approved: Wix \"ConnectYourDomain Error\" — site removed (high confidence).",
  "receipt": "pnpm exec tsx scripts/data/capture-receipt.ts chainsatlas https://chainsatlas.com/ \"ConnectYourDomain Error\""
 },
 "code4rena": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://code4rena.com/",
  "note": "Verification packet 2026-09-05, owner-approved: Audit contest platform, page announces closing (high confidence).",
  "receipt": "pnpm exec tsx scripts/data/capture-receipt.ts code4rena https://code4rena.com/ \"winding down\" \"closing its doors\""
 },
 "coinsender": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://coinsender.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Home | CoinSender\"; linked repo 404, org newest push 2024-02-13 (low confidence)."
 },
 "dolphinze": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://dolphinze.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Dolphinze — Global Contractor Payments in Fiat or\"; linked repo 404 (low confidence)."
 },
 "every-finance": {
  "from": "Live",
  "to": "Development",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/EveryFinance/smart-contracts-Stellar",
  "note": "Verification packet 2026-09-05, owner-approved: Empty 200 shell; Stellar contracts repo active (medium confidence)."
 },
 "fairblock": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.fairblock.network/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Fairblock - Enterprise Privacy Solutions\"; repo Fairblock/stabletrust-sdk pushed 2026-09-03 (high confidence)."
 },
 "findtruman": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/TrumanStellar/Story-Creation",
  "note": "Verification packet 2026-09-05, owner-approved: Empty 200 shell; Stellar org idle since Jul 2024 (medium confidence).",
  "receipt": "pnpm exec tsx scripts/data/capture-receipt.ts findtruman https://api.github.com/repos/TrumanStellar/Story-Creation \"\\\"pushed_at\\\":\\\"2024-07\""
 },
 "giveth": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://giveth.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Giveth: Future of Giving with Zero-Fee Crypto Donation\"; repo Giveth/impact-graph pushed 2026-09-04 (high confidence)."
 },
 "ichi": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://ichi.org/",
  "note": "Verification packet 2026-09-05, owner-approved: Liquidity protocol: grow any token on-chain (medium confidence)."
 },
 "inference": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://inferara.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Inferara\"; repo Inferara/inference pushed 2026-09-04 (high confidence)."
 },
 "keystone": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://keyst.one/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Keystone Wallet | Secure Open Source Crypto Solution\"; repo KeystoneHQ/k-cms pushed 2026-08-28 (high confidence)."
 },
 "legacy-suite": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.legacysuite.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Digital Estate Planning Platform | Organize Your Assets,\"; repo Avento-Labs/legacy-suite-contracts pushed 2024-10-31 (medium confidence)."
 },
 "mobula-labs": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://mobula.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Mobula | Data and execution for the best\"; repo MobulaFi/MTT pushed 2026-05-24 (medium confidence)."
 },
 "muwp": {
  "from": "Live",
  "to": "Development",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/Muwpay-uniswapper/MUWP",
  "note": "Verification packet 2026-09-05, owner-approved: Vercel \"Deployment Unavailable\"; org repo active (medium confidence)."
 },
 "mystic": {
  "from": "Live",
  "to": "Development",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/mystic-finance/Stellar-RFQ",
  "note": "Verification packet 2026-09-05, owner-approved: Cloudflare flags site as suspected phishing (low confidence)."
 },
 "neovestor": {
  "from": "Live",
  "to": "Pre-Release",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://neovestor.com/",
  "note": "Verification packet 2026-09-05, owner-approved: RWA platform, waitlist only, yields show 0.0% (medium confidence)."
 },
 "onboarding-club": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/onboardingclub",
  "note": "Verification packet 2026-09-05, owner-approved: No website; GitHub org has 0 public repos (low confidence).",
  "receipt": "pnpm exec tsx scripts/data/capture-receipt.ts onboarding-club https://api.github.com/users/onboardingclub/repos []"
 },
 "one-click": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.oneclick.fi/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"One Click Labs\"; repo One-Click-Crypto/eliza-starter pushed 2025-02-08 (medium confidence)."
 },
 "ortege": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/Ortege-xyz/studio",
  "note": "Verification packet 2026-09-05, owner-approved: Site unreachable; repo idle since Dec 2024 (low confidence).",
  "receipt": "pnpm exec tsx scripts/data/capture-receipt.ts ortege https://api.github.com/repos/Ortege-xyz/studio \"\\\"pushed_at\\\":\\\"2024-12\""
 },
 "ottersec": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://osec.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"OtterSec\"; repo otter-sec/anchor pushed 2026-09-05 (high confidence)."
 },
 "paychant": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://paychant.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Fiat On and Off Ramp Solution for Stablecoins\"; repo paychant/stellar pushed 2023-06-08 (low confidence)."
 },
 "plutope": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://plutope.com/",
  "note": "Verification packet 2026-09-05, owner-approved: Compliant payments, settlement, cards and wallets (low confidence)."
 },
 "polaris-lend": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/jet-lab/polaris",
  "note": "Verification packet 2026-09-05, owner-approved: Repo deleted; site is Jet Protocol shell (medium confidence).",
  "receipt": "pnpm exec tsx scripts/data/capture-receipt.ts polaris-lend https://api.github.com/repos/jet-lab/polaris \"Not Found\""
 },
 "public-node": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://publicnode.org/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Home | Blockchain Nodes Funded by Community -\"; org has 0 public repos (low confidence)."
 },
 "rango": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://rango.exchange/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Rango Exchange | Swap Anything Anywhere\"; repo rango-exchange/rango-client pushed 2026-09-05 (high confidence)."
 },
 "rarible": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://rarible.com/all",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Rarible – fastest multichain NFT Marketplace with Rewards\"; repo rarible/protocol-contracts pushed 2026-08-27 (high confidence)."
 },
 "remittease": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://remittease.xyz/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"RemittEase – Fast & Modern Cross-Border Remittances\"; repo Web3WizardZ/remi-p pushed 2025-12-08 (medium confidence)."
 },
 "runtime-verification": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://runtimeverification.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Runtime Verification - Software Assurance for the AI\"; repo runtimeverification/stellar-debugger pushed 2026-09-04 (high confidence)."
 },
 "siborg": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.siborg.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"SiBorg Labs - Consumer Crypto Innovation\"; repo siborg-ads/stellar-client pushed 2025-05-13 (medium confidence)."
 },
 "skyhitz": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://skyhitz.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Skyhitz - Gravity. Mainnet\"; repo skyhitz/hitz-gravity pushed 2026-09-05 (high confidence)."
 },
 "smart-deploy": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.smartdeploy.dev/",
  "note": "Verification packet 2026-09-05, owner-approved: Near-empty landing page: \"Ready. Set. SmartDeploy!\" (low confidence)."
 },
 "soundness": {
  "from": "Live",
  "to": "Inactive",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://soundness.xyz/",
  "note": "Verification packet 2026-09-05, owner-approved: Post-quantum project notice: winding down, services offline (high confidence).",
  "receipt": "pnpm exec tsx scripts/data/capture-receipt.ts soundness https://soundness.xyz/ \"winding down\" \"no longer being developed\" \"services are now offline\""
 },
 "splito": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.splito.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Splito — Request Money, Get Paid in Any\"; repo Splitoio/web-app pushed 2026-08-28 (high confidence)."
 },
 "spydra": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.spydra.app/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Asset Tokenization Platform | Spydra\"; repo spydra-tech/presidio pushed 2026-08-25 (high confidence)."
 },
 "stallion": {
  "from": "Live",
  "to": "Development",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/stallionsassemble/stallion-contract",
  "note": "Verification packet 2026-09-05, owner-approved: Empty 200 shell; contract repo last touched May (low confidence)."
 },
 "tellus-cooperative": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://blog.telluscoop.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Tellus Cooperative | Aprende, Conecta y Emprende en\"; repo Tellus-Cooperative/FreshRSS pushed 2026-01-10 (medium confidence)."
 },
 "the-give-hub": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://thegivehub.com/en/index.html",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"The Give Hub - Blockchain Charity Simplified\"; repo thegivehub/www pushed 2026-07-27 (high confidence)."
 },
 "token-tails": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://tokentails.com/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Token Tails | A family of feline care\"; repo zbagdzevicius/tokentails pushed 2026-07-24 (high confidence)."
 },
 "transfuse": {
  "from": "Live",
  "to": "Development",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://github.com/TransfuseLabs/transfuse-swap-ui",
  "note": "Verification packet 2026-09-05, owner-approved: No website in row; swap UI repo idle since January (low confidence)."
 },
 "untangled": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://untangled.finance/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Untangled Finance\"; repo untangledfinance/oz-policy-builder pushed 2026-09-01 (high confidence)."
 },
 "usher": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.usher.so/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Usher Labs - Trace, Prove, and Mobilise Capital\"; repo usherlabs/cex-broker pushed 2026-09-05 (high confidence)."
 },
 "vanna-finance": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://vanna.finance/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Vanna — Composable Undercollateralized Credit for DeFi\"; linked repo 404, org newest push 2026-09-02 (high confidence)."
 },
 "wagelink": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://wagelink.io/",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"WageLink\"; repo Zebec-protocol/canton-dev-fund pushed 2026-09-02 (high confidence)."
 },
 "wombat": {
  "from": "Live",
  "to": "Live",
  "basis": "human-verified",
  "asOf": "2026-09-05",
  "sourceUrl": "https://www.wombat.exchange/swap",
  "note": "Verification packet 2026-09-05, owner-approved: site 200 \"Wombat Exchange is a cross-chain token swap built\"; repo wombat-exchange/dimension-adapters pushed 2026-03-13 (medium confidence)."
 }
}
```

## Not examined

501 of the 601 weak-basis served rows were not examined — everything below rank 100 on `prominence` desc → `relevanceScore` desc → slug. They carry no verdict and no evidence here; a later pass takes them at `--offset 100`.

<details><summary>501 slugs not examined</summary>

xcapit, zet, zkcross, accelar, airswift, almanax, amero, anchainai, artizen, assetdesk, autowhale, axal, bes-metaverse, bevor, bidali, bigger, bingtellar, bitgifty, bitwage, blade, blaze, bondhive, bp-ventures, cartwey, chainlink-oracles-relayer, chainpatrol, chats, clickpesa-debt-fund, clixpesa, clob, coala-pay, cobo, codelnpay, coindisco, coinspect, comunitaria, copperx, crossmint, cryptoconexin, cyvers, dobprotocol, elsa, emigro, equitx, extractor, fastbuka, gladius, globachain, goldsky, grantpicks, hito-wallet, horizon-as-a-service, hot-protocol, humantech, interlinked, interstellar, irl, jetpad, js-capacitor-passkey-kit, k3-labs, komunitin, kura, lantern, legasi, liqvidxyz, loto-punto, mercuryo, metafyed, minah, mojoflower, mozart-pay, myaza, okashi, orally, palremit, payrit, paystreme, payzoll, pretium, qolaq, quarkslab, quasar, rahat, rampmedaddy, rehoboth, ripe, rosen, rubic, scout, skopa, sollpay, soroban-governor, sorobanmath, splyce-finance, stellar-defi-dune-dashboards, swiftex, taskio, tauvlo, tokenops, trace, unstoppable-wallet, utoken, veridise, verseprop, volta-circuit, wagent, wirecash, womenbiz, yativo, agtrail, balanced-network, cables, cantina, certora, chartui, city-states, coca, dapp-world, haciendo-stellar, hiyield, hurupay, lul, meru, nobak, qstn, rendbit, rise-in, sentit, sfx, sorostarter, spatium, stables, stellar-global, stellar-metamask, stellar-tools, stellargpt, stride, thexbank, web3-antivirus, 0xauth, ai-transparency-token, aida, airtm, alfred, alula, apicharge, arculus, arkafund, arrel, art-club, assemblyscript-soroban-sdk, autify, autoaction, baf, ben-wallet, bitwave, blocknify, borderless, bravepay, cedar, changera, chef, chimpdao, chronospay, cinko, command-robotics, constellation, cross-platform-soroban-rpc-sdk, cryptix, defarm, derisk, diameter-pay, digicus, dollarize, domipago, eara, easya, encode-club, flux, freelii, genie-ai, grip, houdiniswap, hypernative, icanproveit, involt, joona-pay, js-worker-sdk, keizai, kmac-state-machine-template, kyc-token, lenme, loam, logistech, lumenscan, meria-defi, mica, moonlight, nauta-land, noticias-trading, oinc, omnilumen, outbounder, planet-pay, quilltip, ramm, reyts, sanctum, satellite, saw, scopex, seevcash, sendin, shiga, simple-signer, smilepay, solarkraft, soroban-academy, soroban-copilot, soroban-elk, soroban-explorer, soroban-polygon-interop, soroban-pre-order-contract, soroban-react, sorodrop, sorosan, sorosplits, sstream, stablecorp, stellar-c-sdk, stellar-nest, stellar-qt-sdk, stellar-rust-sdk, stellar-tip, stellarbeat, stellarmint, stellarpay, stellarprodev, switchly, syklo, tago-cash, tansu, tap4change, teachmedefi, teken, tinyamm, tipper, token-terminal, tracee, tribal, triiyo, trustful, tucambio, tumbl, uils, unalivio, venerez, wadzzo, walletban, xlmeme, yieldbackcash, blox, elroy, puenta, xlmsh, bitt, block-by-block, bousol, clear, crypto-link, ctx, ebioro, fijicoin, freedom-pay-wallet, frost-implementation, fx-swap, galactictalk, getpaid, halborn, indentura, kasi-money, kript, loop-finance, owny, paid, paysapp, securx, sorobuild, starloom, stellarfolio, stellarscamreport, storehouse-gold, stroopyai, synced, tip-me, trak, trilobyte, trustedplastic, trustswap, uniblock, web3dev, astrocore, ledgerstax, the-starship-soroban, 5x-crypto, arst, boss-pay, brz, cash-abroad, clickspesa, coins-ph, dune, eurx, gbpx, hi-fifo, honey-coin, idunu, kes, kunst21, luminary-s-archive, peer, posted-app, qcad, roberto-sanz, rwf, soroban-pulse, steexp, stellar-carbon, stellar-dashboard, stellar-pulse, tzs, usdx, wallet-guru, xusd, deb, relax, timed-transactions-api, wally, sendit, acta, akuna, amber, amulets, archax, arf, automated-finance, axis, azza, backyard, ballast-re, bando, basilic, bexo, bim-exchange, blink, bloccpay, blockaid, blockroll, bluechip, boundless-bounties, bridge, cashlink, chainless, cheesecake-labs, coinme, conomy, crebit, credible, crediolabs-ai, cryptomate, cushion, cypher, d-fct, dashx, dcent, dd, digibank, digitpay-finance, drips, dtcc, elementpay, energypay-tesouro-yield, escala, etesia, eurau, fewticket, fiatsend, figo, figure, for-yield, forestio, fundable, gameduk, handlpay, hatom-protocol, helix, huma, ibis, inferera, investar, ios-mac-stellar-sdk, janus, jumpa, k2-lend, kutana, latch, lend, linq, loop, lucent, lulpay, lusty, merkl, merkle-science, mesh, mgusd, mpcvault, muney, mydatacoin, neftwerk, nemorixpay, neon-wallet, net-sdk, novatti, octarine, offer-hub, openxswitch, openzeppelin-stellar-privacy-wallet, orion, pagcrypto, pagfinance, para, pathpulse-ai, payala, paycashless, paywit, piggy-wallet, pipeline, prism, privy, proofbridge, providencia-onchain, pyth, pyusd, quietbook, rails, rain, raven, rehive, remi, renesis, roberto-sanz-criptomonedas, safu-protocol, sava, scaffold-stellar, securitize, securrency, sendana, sentora, sextant-agent, sikadesk, simbolik, simplytokenized, smart-treasury, soroban-decompiler, soroban-optimistic-oracle, soroban-payout-token-suite, sorted, spectra-finance, squid-router, stabble, stbl, stellar-command-insights, stellar-memory, stellar-oracle-shield, stellar-security-portal, stellar-token-launchpad, stellarpay-x402, stellarx-ph, talwex, team-finance, teji, terwa, tezoro, the-signal, tokenpad, troqpay, truway-yield, turbolong, upesa, usdm1, vank, verso, wellspring, wowmax, x402, xccy, xoxno, yolat, zarf, zilt

</details>
