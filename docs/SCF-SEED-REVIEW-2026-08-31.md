# SCF absent — 47 seed candidates for human review

Generated 2026-08-31 from a fresh scf-absence-diff run (49 -> 47 after the
alias + token-equality matcher fixes). Every row below returns only
semantic-mode neighbours on the live API. Per the curation rule these are
REVIEW candidates — nothing here is created automatically.

Review key: create a directory row IF the project is real and Stellar-built;
skip with a note if it is a duplicate under another name (check aliases
first), wound down (needs a dated status, not absence), or not actually
Stellar.

**Reviewed 2026-08-31** (all 47 SCF pages fetched — every one returned 200,
including the seven `dashboard/submissions` rows, via
`communityfund.stellar.org/project/<slug>`; dupe-probed against
`stellarlight.xyz/api/projects/search`; site/repo liveness checked for
create candidates).

## Summary: create 19 · duplicate 23 · wound-down 2 · unclear 3

Headline: **23/47 (49%) are already served under another name** — almost all
of them findable by *website-domain equality* between the SCF page's website
field and our row's website. The absence-diff matcher compares names only;
adding a domain-match pass would have caught these.

### create (19)

| # | SCF slug | rounds | verdict | canonical name | evidence (key URL) | alive? |
|---|---|---|---|---|---|---|
| 1 | `loop-cashback-everywhere-with-stellar-zom` | 40 | create | Loop | Cashback/discounted gift-card payments app, $139.6k — https://loopfinance.io/ | yes — site 200 |
| 6 | `crediolabsai-ut9` | 44 | create | CredioLabs.AI | OZ Accounts Policy Builder (MCP server + Claude skill), **by Untangled** (existing row `untangled`) but a distinct product — https://crediolabs.ai/ | yes — site 200 |
| 7 | `policywright-j8x` | 44,42 | create | Policywright | AI least-privilege policy synthesizer for OZ smart accounts — https://github.com/kunaldrall29/policywright | yes — repo pushed 2026-08-15 |
| 8 | `vrf-soroban-8yl` | 44 | create | VRF-Soroban | ECVRF+Drand randomness for Soroban (by NibrasD); demo https://soroban-vrf-frontend.onrender.com/ returns 503 (free-tier sleep), no public repo found | early-stage — award is recent (#44); weak signals |
| 16 | `komet-formal-verification-o0s` | 30,28 | create | Komet | Runtime Verification's formal-verification tool for Soroban — https://github.com/runtimeverification/komet (NOT our `comet`, the Balancer AMM) | yes — repo pushed 2026-08-20; komet.runtimeverification.com DNS-dead |
| 21 | `social-podcast-ini` | 24,22 | create | Roberto Sanz Criptomonedas | Spanish YT/podcast education, 26.5k subs — https://www.youtube.com/@RobertoSanzCriptomonedas (borderline: content channel, not a product — human call) | yes — channel up |
| 23 | `janus-m2t` | 45 | create | Janus | Freight-forwarder B2B payments (Hamburg), $110.4k — https://janus.solutions/ (search hit `xccy` is a false neighbour) | yes — site 200 |
| 24 | `kutana-9ti` | 45,44,43,39,38 | create | Kutana | "StashPay" cross-border GHS payments, 5 awarded rounds $97k — https://www.kutanapay.com/ (NOT `kotani-pay`/kotanipay.com — near-name collision, different company) | yes — site 200 |
| 25 | `sorted-jqh` | 45,44 | create | Sorted | Fintech/digital-asset app, $150k — https://sorted.io (no relation to "Sorted Wallet"; no such row exists) | yes — site 200 |
| 26 | `sendana-axa` | 45,44,40 | create | Sendana | Stablecoin banking for Global-South freelancers — http://www.usesendana.com | yes — site 200 |
| 27 | `account-demolisher-bfe` | 29,44,41 | create | Account Demolisher | Reclaims stranded XLM reserves from stale accounts (by bytemaster333) — https://github.com/bytemaster333/account-demolisher | yes — repo pushed 2026-08-25 |
| 28 | `etesia-rgj` | 44 | create | Etesia | Risk-parity crypto portfolios (all-weather style) — https://www.etesiar.com/ | yes — site 200 |
| 29 | `nouns-builder-protocol-ae7` | 44 | create | Nouns Builder Protocol | Builder DAO porting the on-chain DAO/auction protocol to Stellar — https://nouns.build | yes — site 200 |
| 30 | `yolat-bl5` | 44 | create | Yolat | African remittance rails (ex-Venture Garden Group team) — https://www.yolat.com | yes — site 200 |
| 37 | `crebit-rate-locks-ril` | 44,45 | create | Crebit | Rate-lock financial protocol — https://crebitpay.com | yes — site 200 |
| 38 | `regulated-brl-settlement-for-fx-and-institutional-payments-on-stellar-2vu` | 42 | create | PagCrypto (BRLP) | Regulated BRL settlement token on Stellar — https://pagcrypto.finance/ (redirects to https://pag.finance — apparent rebrand; distinct from our `paygo-crypto` = paygocrypto.io and `brl` = ntokens) | yes — site 200 |
| 35 | `liquid-by-upesa-dvq` | 42,41 | create | Upesa (Liquid) | Anchor-based cross-border liquidity/payouts for African SMEs — https://upesa.app/ | yes — site 200 |
| 46 | `enerdao-r84` | ? | create | EnerDAO | Tokenized renewable-energy project debt on Soroban — https://www.enerdao.org/ | shaky — site 200, but repo (EnerDAO/MVP_SMART_CONTRACT) silent since 2024-06 |
| 40 | `fxdao-xov` | 13 | create | FxDAO | Well-known Soroban stablecoin protocol — https://fxdao.io (site 200; github.com/FxDAO last push 2025-09 SDK). Genuinely absent from the directory — surprising | yes-ish — site up, repos ~12mo quiet |

### duplicate (23) — add SCF title as alias + scfAwarded/round backfill on the named row; no new rows

| # | SCF slug | rounds | verdict | canonical (existing row) | evidence (key URL) | alive? |
|---|---|---|---|---|---|---|
| 3 | `a-real-estate-tokenization-platform-ss1` | 33,32,31 | duplicate | `verseprop` (Verseprop) | SCF website = https://www.verseprop.com = row website; row scfAwarded=False → backfill | row Live |
| 5 | `ctxcom-evm` | 19 | duplicate | `ctx` (CTX) | SCF website = https://ctx.com = row website; scfAwarded already True → alias + round backfill | row Live |
| 12 | `prices-api-rfp-ctx-1vo` | 41 | duplicate | `ctx` (CTX) | SCF website = https://rates.ctx.com/ (same company; second submission) | row Live |
| 10 | `soroban-disassembler-working-title-ply` | 41 | duplicate | `inferera` (Inferera) | SCF website = https://inferara.com/ = row website (note: our slug is spelled infer**e**ra, brand is Infer**a**ra); scfAwarded=False → backfill | row Live |
| 14 | `advanced-debugging-for-soroban-contracts-5sr` | 41 | duplicate | `simbolik` (Simbolik) | SCF website = https://www.simbolik.dev/ = row website; scfAwarded=False → backfill | row Live |
| 15 | `confidential-transfers-and-balances-hdt` | 40 | duplicate | `fairblock` (Fairblock) | SCF website = https://www.fairblock.network/ = row website; row desc is this exact project; backfill | row Live |
| 33 | `seasonal-workers-payroll-lru` | 43,37 | duplicate | `tucambio` (TuCambio) | SCF website = https://www.tucambio.app/ = row website; gh tucambioapp | row Live |
| 41 | `post-quantum-secure-wallets-for-stellar-97o` | ? | duplicate | `soundness` (Soundness) | SCF website = https://soundness.xyz/ = row website; row desc = same project; backfill | row Live |
| 18 | `stellar-women-bootcamp-r5v` | 29 | duplicate | `womenbiz` (Womenbiz) | SCF website = https://hiwomenbiz.com/women-in-web-3-bootcamp = row website; backfill | row Live |
| 32 | `choppaddi-vmf` | 44,38,35 | duplicate | `fastbuka` (Fastbuka) | Row's own website is already https://choppaddi.com/ and desc says "Choppaddi (FKA FastBuka)" — row should likely be RENAMED Choppaddi with FastBuka as alias | row Live |
| 45 | `flow-sbr` | ? | duplicate | `obsrvr` (Obsrvr) | SCF website = https://www.withobsrvr.com = row website; "Flow" = OBSRVR's pipeline product → alias | row Live |
| 11 | `octopos-g6i` | 41 | duplicate | `untangled` (Untangled) | SCF website = https://stellar.untangled.finance; SCF desc = Untangled's vault infra ("first institutional vault infrastructure provider") → alias | row Live |
| 4 | `anticipatory-aid-on-soroban-f7j` | 31,22 | duplicate | `coala-pay` (Coala Pay) | SCF website = https://coalapay.org = row website; scfAwarded=False → backfill | row Live |
| 47 | `zkfetch-zktls-powered-oracle-solution-mfy` | ? | duplicate | `reclaim` (Reclaim) | SCF website = https://www.reclaimprotocol.org = row website; row desc already names zkFetch SDK; backfill | row Live |
| 44 | `meta-contracts-in-stellar-p4c` | ? | duplicate | `stellar-router-sdk` (Stellar Router SDK) | SCF website = https://jsr.io/@creit-tech/stellar-router-sdk = row website exactly; backfill | row (Creit Tech product) |
| 31 | `embedded-collective-investment-via-soroban-syi` | 44,43,42 | duplicate | `escala` (Escala) | SCF website = https://escalahq.com = row website; scfAwarded=False → backfill | row Development |
| 34 | `institutional-liquidity-infrastructure-for-stellar-k5c` | 42 | duplicate | `lobster` (Lobster) | SCF website = http://www.lobster-protocol.com/ = row website → alias | row **Inactive** |
| 43 | `institutional-treasury-xlm-wyu` | ? | duplicate | `arrel` (Arrel) | SCF website = https://arreltech.com/platform = row website; backfill | row Live |
| 42 | `bpv-stellarmesh-anchor-afq` | ? | duplicate | `bp-ventures` (BP Ventures) | SCF website = https://www.bpventures.us/ = row website; BPV = BP Ventures; backfill + alias "StellarMesh Anchor" | row Live |
| 13 | `rfp-soroban-wasm-specialized-reverse-engineering-tool-mxh` | 41 | duplicate | `soroban-decompiler` (Soroban Decompiler) | SCF website = https://github.com/salaheldinsoliman; row website = github.com/salaheldinsoliman/soroban-decompiler (same author/tool); backfill | row Development |
| 22 | `stellar-surge-1gh` | 24 | duplicate | `dfs-labs` (DFS Labs) | SCF website = https://www.dfslab.net = row website; row desc literally describes Stellar Surge; scfAwarded=False → backfill | row Live |
| 39 | `solo-labs-iy1` | 26 | duplicate | `ichi` (Ichi) | SCF website = https://ichi.org = row website; SCF desc: "through the ICHI Automated Liquidity Manager"; gh ichifarm; backfill | row Live |
| 36 | `smart-account-onboarding-8yr` | 41 | duplicate | `the-aha-company` (The Aha Company) | SCF website = https://theaha.co/ = row website; team gh = chadoh/willemneal/fazzatti (Aha); backfill (row scfAwarded=False) | row Live |

### wound-down (2) — seed only with a dated non-Live status

| # | SCF slug | rounds | verdict | canonical name | evidence (key URL) | alive? |
|---|---|---|---|---|---|---|
| 2 | `dockingzone-a18` | 37,35 | wound-down | docking.zone | NFT launchpad/marketplace; https://docking.zone/ DNS-dead 2026-08-31; last live Wayback snapshot 2025-11-09; no public repo found | no — site gone |
| 17 | `communidao-9pm` | 14,20,16 | wound-down | CommuniDAO | DAO tooling; https://www.communidao.cc and communidao.cc both 502, app subdomain dead; gh org `communidao` exists with 0 public repos; last award #20 (2023) | no — all surfaces broken |

### unclear (3)

| # | SCF slug | rounds | verdict | canonical name | evidence (key URL) | alive? |
|---|---|---|---|---|---|---|
| 9 | `soroban-contract-source-verification-service-bax` | 44 | unclear | (RFP award, builder unidentified) | SCF page's website field is the SCF handbook RFP link itself (https://stellar.gitbook.io/scf-handbook/...); page has no team/gh/linkedin; name probes ("source verification", "contract verification") no match. Needs manual dig to learn who won the RFP | n/a |
| 19 | `west-african-ambassadors-waa-syb` | 29 | unclear | West African Ambassadors (WAA) | Community/ambassador program; only surface is discord.gg/stellardev — nothing verifiable, no product. Recommend no row | n/a |
| 20 | `study-stellar-sdk-soroban-b3d` | 27 | unclear | Study @stellar-sdk & Soroban | One-off 6-session Spanish study group (2023); site = discord.gg/web3dev. Completed campaign, not a standing project. Recommend no row | n/a |

## Side findings (our own data, out of scope here)

- `nebulavrf` row has status **Live** with website `https://notliveyet.com/` — data-quality bug worth its own fix.
- `fastbuka` should probably be renamed Choppaddi (its own site/desc already say so).
- The absence-diff matcher should add a website-domain equality pass: it would have auto-resolved ~23 of these 47.

## Ready to execute

Nothing in this file executes anything. On explicit human approval:

- **create (19)**: seeded one-by-one (not bulk), each row built from the SCF
  page + the canonical site above, with category and status set per the
  liveness evidence; EnerDAO/VRF-Soroban/FxDAO carry their noted caveats.
- **duplicate (23)**: become alias + `scfAwarded`/round backfill edits on the
  named existing slug — no new rows. Rows currently `scfAwarded=False`
  (verseprop, inferera, simbolik, fairblock, soundness, womenbiz, coala-pay,
  reclaim, stellar-router-sdk, escala, arrel, bp-ventures, soroban-decompiler,
  dfs-labs, ichi, the-aha-company, paygo-crypto n/a) get the flag set.
- **wound-down (2)**: only created if we want historical coverage, and then
  with a dated non-Live status per the curation rule.
- **unclear (3)**: no action without further identification.

Nothing executes without explicit approval of the specific rows.
