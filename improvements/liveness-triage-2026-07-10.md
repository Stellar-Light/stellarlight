# Liveness triage — 2026-07-10 (per-project research pass over the 82 candidates)

Each of the 82 shortlist rows individually researched (web search + direct probes; conservative bar: DEAD requires positive evidence, GitHub-org pushes block DEAD verdicts unless shown unrelated). Verdicts: **38 confirmed dead · 13 alive with a stale URL on our record · 31 judgment calls.** REPORT ONLY — flips ship as owner-approved STATUS_FIX rows; link fixes as curated link rows.

Bonus finding: `chainsatlas` and `chainatlas` are the same project recorded twice — a dupe pair the name-normalization sweep missed (different spellings).

## Confirmed dead (38) — proposed Live → Inactive

| project | SCF | evidence |
|---|---|---|
| aerochain | ✓ | Parent company site wingleet.com is live (© 2026) but pivoted to aircraft redelivery/compliance intelligence with zero mention of Aerochain, blockchain, or Stellar; aerochain.wingleet.com no longer resolves — product dropped. |
| brl | ✓ | nTokens' own live site announces the BRL-on-Stellar anchor service was discontinued during 2024 ('Serviço de Real Virtual … será descontinuado ao longo de 2024') with fiat withdrawals not guaranteed from Jan 2026 (ntokens.com). |
| scam-flagging-system | ✓ | Recorded website (a Google Sheet) returns 404 and searches for 'Stellar Scam Flagging System' surface nothing beyond the SCF listing at https://communityfund.stellar.org/projects/scam-flagging-system — no footprint or relaunch found anywhere. |
| stellarstrides | ✓ | stellarstrides.xyz has no DNS record; only footprint is the SCF #22 recap on medium.com/stellar-community — no site, socials, or repos anywhere newer. |
| arcturus |  | The GPT backend domain arcturus-gpt.com is unresolvable and github.com/Soneso/Arcturus was last pushed 2024-03; the ChatGPT plugin platform it targeted was discontinued and Soneso's otherwise-active org shows no Arcturus successor. |
| b4b |  | Primary brand domain parked for sale ('b4b.world for sale | Spaceship.com'), b4b.app serves invalid TLS only, newest footprint is 2022-23 hackathon submissions. |
| benkiko |  | benkiko.xyz has no DNS record, GitHub org benkikodao has zero public repos, newest footprint is 2021 press + passive SCF/LinkedIn listings. |
| blip |  | Owner deliberately archived all four repos in the blipmonitor GitHub org (last push 2024-12, all archived=true) and blip.watch is unregistered; no relaunch found. |
| borderdollar |  | borderdollar.co 404, borderdollar.com parked lander, founder's GitHub pushes only unrelated personal repos, Tracxn profile reports the company no longer active. |
| canfy |  | canfy.net NXDOMAIN with no Wayback snapshot, no GitHub org, zero product mentions via search — entire footprint gone. |
| chaincred |  | Recorded landing page prince29chouhan.github.io/chaincred_landing 404s, author has no chaincred repo left, and search found no footprint at all — hackathon-grade project. |
| cosmiclink |  | cosmic.link is NXDOMAIN, sibling cosmic.plus redirects to an expired-domain sale listing, and the cosmic-plus GitHub org's last real push was 2023-09. |
| cosmicvote |  | cosmic.vote NXDOMAIN (last Wayback Nov 2023), parent cosmic.plus expired → domain-sale redirect, GitHub untouched since 2023-09 — footprint abandoned ~3 years. |
| cryptocannoneer |  | blockshangerous.com unregistered (last indexed blog post 2021-04), GitHub org last push 2022-11; no newer footprint found. |
| ea-kazi |  | biotlabs.africa NXDOMAIN (last archived 2024-08), org stale since 2023-03, eakazi.com broken TLS, .io/.org NXDOMAIN; last sign of life is a ~2023/24 pivot post to ICP with no working product since. |
| equilibre |  | equilibre.io unresolvable, cosmic-plus GitHub org idle since 2023-09, parent domain cosmic.plus now serves a domain-sales/parking page — entire footprint abandoned. |
| forge |  | forgerpc.com is unresolvable, no GitHub org, and no footprint found via searches for 'Forge forgerpc Stellar Horizon Soroban RPC node deployment' — no mention of the product or a relaunch anywhere. |
| gecko-fuzz |  | Recorded website github.com/jjjutla/geckofuzz returns 404 — repo deleted (absent from the author's repo list) — and searches for 'geckofuzz' find no relaunch or other footprint. |
| lumenaut |  | The pool's sole function was eliminated when Stellar removed protocol inflation (Protocol 12, Oct 2019 — coinmetrics: 'the end of inflation also means the end of the Lumenaut inflation pool'); lumenaut.net and pool.lumenaut.net no longer resolve. |
| lumens-for-charity |  | lumensforcharity.tech unregistered; only footprint is SCF Round 3 material from January 2020 (galactictalk.org); no activity since. |
| mimoto |  | Only recorded footprint github.com/nkoorty/mimoto returns 404 and is absent from the owner's repo list; search found no footprint anywhere else. |
| mxlet |  | xlet.io no longer resolves and the wallet repo github.com/MattPearce/xlet last pushed 2020-06; the author's 2026 GitHub activity is entirely unrelated projects. |
| opensolar |  | openx.solar NXDOMAIN, YaleOpenLab repos untouched since Jan 2023, Yale OpenLab's own page frames the effort as concluded/absorbed into Open Earth Foundation — the Stellar crowdfunding platform no longer operates. |
| pactta |  | pactta.com fully unregistered (no NS/A records) and searches found no footprint newer than the 2023 Techstars class announcement. |
| paygo-crypto |  | paygocrypto.io unregistered (no NS/A records); no current footprint found via searches — only unrelated or archival results. |
| quidroo |  | quidroo.com unresolvable; only stale directory entries (communityfund.stellar.org/projects/quidroo, F6S, Crunchbase); no product activity since ~2021 DFS Lab/Stellar cohort coverage. |
| rigel |  | rigel.link has no DNS record; only footprint is the ~2019 SCF #5 listing/forum thread; recent 'Rigel' hits are an unrelated affiliate tool. |
| skeeper |  | skeeper.xyz has no DNS records; only footprint is the SCF-23 recap and a stale search-index entry — no GitHub org or newer activity anywhere. |
| snnac |  | snnac.me unregistered, BlockShangerous GitHub org last push 2022-11, only 2022-era SCF#11 material found; no relaunch. |
| soroban-assistant |  | Heroku app gone (404), no GitHub org, no footprint via search — hackathon-grade project with zero remaining presence. |
| sorobanide |  | sorobanide.com unresolvable and the only traced repo (omeganetwork-tech/sorobanide) also deleted (GitHub API 404); no other footprint via search. |
| sorobuilder |  | sorobuilder.com returns 404, no footprint via search, author's related repo github.com/luisao8/Soroban-code-AIssistant untouched since 2024-06 (his 2026 pushes are unrelated AI projects). |
| sorosorcerer |  | sorosorcerer.com NXDOMAIN, org has no sorosorcerer repo (recent pushes unrelated), only dated footprint is a 2023 SDF community-tooling blog mention; no relaunch. |
| sorscan |  | sorscan.org/.com/.io all unresolvable, no GitHub presence, nothing newer than the SCF #20 (2023) listing at communityfund.stellar.org/project/sorscan-svd. |
| stellar-update |  | Domain taken over by an unrelated party — stellarupdate.com now serves a Chinese admin system ('智立方管理系统', verified via curl) — and no trace of the Stellar blog operating elsewhere. |
| typiqo |  | typiqo.it has no DNS record, typiqo.com redirects to a domain-for-sale listing (brandbucket), newest footprint is 2021 press. |
| vitreous |  | vitreous.co unregistered (no NS/A records); only footprint is a years-old SCF profile piece on stellar.org/blog with nothing newer anywhere. |
| whalestack |  | whalestack.com has 303-redirected to btcpayserver.org since at least 2025-09 (Wayback CDX), site now refuses connections, coinqvest.com broken TLS, the WordPress coinqvest plugin delisted, GitHub stale since 2024-01 — wound down pointing users to BTCPay. |

## Alive — stale URL on our record (13) — proposed link fixes, status stays Live

| project | current URL | evidence |
|---|---|---|
| afriex | https://www.afriex.com/ | Afriex operates today at afriex.com (200; afriexapp.com www even redirects there) with active App Store/Google Play listings; only the recorded afriexapp.com apex DNS is broken. |
| arst | https://www.arst.finance/en | ARST Argentine-peso stablecoin has a live dedicated site (arst.finance/en, 'ARST — The Argentine Peso Stablecoin', deployed on Stellar among other chains); recorded latamex.com/en returns 404 and no longer mentions ARST. |
| bravepay | https://www.bravepay.net/ | Product site live at https://www.bravepay.net/ (wallet/POS/payments content), help.bravepay.net 200; only the recorded apex bravepay.net DNS record is broken. |
| brz | https://www.transfero.com/ | BRZ stablecoin actively offered by issuer Transfero, live at transfero.com featuring BRZ; recorded brztoken.io returns 404. |
| depay | https://depay.us/ | Old domain depayapp.com serves the rebranded live site depay.us (200, 'infraestructura de pagos cross-border', same org per hreflang); old domain's TLS cert simply misconfigured. |
| fastbuka | https://choppaddi.com/ | Rebranded to Choppaddi and live at choppaddi.com (200, food-delivery content still referencing FastBuka), while fastbuka.com returns 503. |
| lumenshade | https://communityfund.stellar.org/project/lumenshade-privacy-pools-hnp | Recorded 'website' was a now-broken Google Slides link; freshly awarded SCF #37 build ($135k, Build phase) per communityfund.stellar.org, named among active ecosystem privacy projects in SDF's privacy-strategy blog. |
| meria-defi | https://www.meria.com/ | Meria operates today: live staking platform at meria.com/en/staking + stake.meria.com, Feb 2026 Taurus partnership announcement; recorded defi.meria.com subdomain retired. |
| securrency | https://www.dtcc.com/digital-assets | Securrency was acquired by DTCC (closed Dec 2023) and rebranded DTCC Digital Assets, active with 2026 announcements (dtcc.com/news/2026/may/04 tokenization service); securrency.com resolves but TLS/site is dead. |
| sfx | https://www.sfxchange.co/ | Live: sfxchange.co 302s to www.sfxchange.co returning 200 titled 'SFx Money App'; only the recorded /en deep link 404s. |
| stellar-metamask | https://snaps.metamask.io/snap/npm/stellar-snap/ | The Stellar MetaMask snap is listed and installable on the official Snaps directory (snaps.metamask.io/snap/npm/stellar-snap; bogus-slug control 404s), npm stellar-snap v1.0.9 published 2025-07; metastellar.io NXDOMAIN. |
| stellarbeat | https://radar.withobsrvr.com/ | Continues as OBSRVR Radar: radar.withobsrvr.com live ('Stellar Network Explorer | OBSRVR Radar'), github.com/withObsrvr/stellarbeat pushed 2026-07-09; stellarbeat.io NXDOMAIN, old org archived. |
| xycloans | https://main.xycloans.app/ | xycLoans WebApp live at https://main.xycloans.app/ with docs.xycloans.app live and the xycloo GitHub org pushing as recently as 2026-07; only the recorded apex is dead. |

## Judgment calls (31) — conflicting evidence, owner decides

| project | SCF | the conflict |
|---|---|---|
| bebop | ✓ | bebop.cash NXDOMAIN but archived live as recently as 2025-10-17; founder's GitHub active only on unrelated repos; Play Store 'bebop' is an unrelated French app; no shutdown announcement for this SDF-backed ($150K) app. |
| chainsatlas | ✓ | Conflicting: third-party reports show 2025 activity (COTI partnership Apr 2025, AtlasIDE quest Jul 2025), but chainsatlas.com + /announcements return 404 today and GitHub stale since 2024-05. |
| dapp-world | ✓ | Conflicting: dapp-world.com unreachable today (NXDOMAIN, lame-delegated nameservers) yet whois shows the domain registered until 2027 and current profiles index the company as operating in 2026 (tracxn.com). |
| derisk | ✓ | Parent carmine.finance is live and still links DeRisk, but carmine.finance/derisk/ and derisk.carmine.finance 404 and code is ~2.6y stale — company advertises it, no working product URL. |
| digicus | ✓ | Conflicting: the maintainer foundation's live site https://spaced-out-thoughts-dev-foundation.github.io/ still features Digicus and the repo moved to spaced-out-thoughts-dev-foundation/digicus, but digicus.dev 404s, last push 2025-01, newest dated content Oct 2024 whitepaper. |
| fluxity | ✓ | docs.fluxity.finance live (200) and fluxity-interface pushed 2026-02, but fluxity.finance 523 (origin down) and app times out; the team's 2026 activity is on a different product (wagent). |
| haciendo-stellar | ✓ | haciendostellar.com NXDOMAIN (last Wayback 2025-03), but the SCF#25-winning community still has social footprint (Instagram/Discord/YouTube) of unverified recency. |
| loam | ✓ | loam.build NXDOMAIN, last crate publish 2025-01, last push 2025-06, yet maintainer Aha Labs is active shipping scaffold-stellar in official Stellar docs — no explicit Loam deprecation/succession notice. |
| onboarding-club | ✓ | Conflicting: onboarding.club (and www/residency subdomains) no longer resolve via public DNS, but Wayback shows the site live on 2025-08-06 and 2025 residency/X pages are still indexed — recently active vs now-dark domain. |
| soroban-optimistic-oracle | ✓ | Conflicting: repo exists renamed at github.com/stackman27/SOO but last push 2025-04 (~15mo stale), recorded URL 404s, no other product footprint — neither operating nor positively gone. |
| stellars-finance | ✓ | Conflicting: stellars.finance returns 503 repeatedly today, but the project won a recent SCF #40 award and its GitHub repo was pushed 2026-01-18. |
| stride | ✓ | stride.social 404s, but the developer's app (com.stridesocial.stride) is live on both stores today — App Store id6496679550 now 'Stride: AI Weight Loss Tracker' — indicating a pivot away from the tokenized move-to-earn product. JUDGMENT: the app lives but pivoted AWAY from Stellar (move-to-earn → AI weight-loss) — arguably Inactive-for-Stellar. |
| transfuse | ✓ | Conflicting: transfuse.network unregistered (no NS records), but GitHub shows non-archived development as recently as 2026-01-10 on transfuse-swap-ui (github.com/TransfuseLabs); no live product URL found. |
| trustedplastic | ✓ | Nothing demonstrably live — recyclable.credit DNS-dead and trustedplastic.com also unresolvable (never archived) — but no shutdown notice or dated abandonment evidence beyond the SCF record. |
| wirecash | ✓ | Conflicting: Google indexes live-looking product pages (wirecash.com/personal/usdc/, developer.wirecash.com) but the apex and developer domains are unresolvable today; www 301s to the dead apex — possible outage or recent death. |
| art-club |  | artclubcard.com 404s and the repo (grmarkkes/artcc) is stale since 2024-06, but a Swedish Arts Grants Committee project page still exists (konstnarsnamnden.se Kulturbryggan profile); no shutdown notice. |
| aurapay |  | Conflicting: entire web presence down (somosaurapay.com NXDOMAIN, www → dead CloudFront, app unreachable) but company/social profiles with unverified recency still exist and no shutdown announcement found. |
| basement |  | Conflicting: basement.dev root 404s and github.com/basementdev idle since 2023-11, yet docs.basement.dev still serves 200 and no shutdown announcement found. |
| bitt |  | Conflicting: bitt.com down (Cloudflare 522 origin failure repeatedly today), but no shutdown announcement and company profiles list Bitt operating ~105 employees as of 2024 (CB Insights). |
| chainatlas |  | Conflicting: chainsatlas.com returns a Wix ConnectYourDomain error and platform.chainsatlas.com NXDOMAIN, yet indexed announcements show activity as recent as April 2025 (COTI partnership) and company profiles remain listed. |
| eurs |  | stasis.net and eurs.stasis.net serving 503 for days (also archived as 503), EURS failed MiCA with issuance suspended since 2024, yet the token still lists at $1.21 / $7.1M mcap with ~$32 daily volume on CoinGecko — issuer down vs token nominally alive. |
| keizai |  | Whole keizai.dev zone NXDOMAIN and repos stale since 2025-04, but site archived live 2025-09 and no shutdown notice — likely dead but dark under a year. |
| qolaq |  | Conflicting: qolaq.org 404s on all routes and GitHub idle since 2022-09, but whitepaper.qolaq.org responds (307) and passive profiles (Circle partners, Messari) still list it — no shutdown notice. |
| sorobix |  | Conflicting: IDE frontend still live at sorobix.vercel.app (200), but sorobix.xyz has no DNS and all repos idle since 2023-11 — backend operation unverified. |
| sorobuild |  | Conflicting: recorded adapptable.dev on Hostinger parking NS and sorobuild.io no longer resolves, yet npm package @sorobuild/stellar-sdk last modified 2025-09-05. |
| sorostarter |  | sorostarter.com NXDOMAIN (last archived 2025-03) and GitHub stale since 2025-04, but only stale index/SCF-recap pages surface — likely dead but dark only ~15 months. |
| spatium |  | Conflicting: spatium.net globally unresolvable today, yet Google indexes current-looking product pages ('Spatium | Scaling Bitcoin on L1') and LinkedIn presence exists — no shutdown notice found. |
| stex |  | Conflicting: stex.xycloo.com has no DNS record and the repo is ~4 years stale, but the founder's current projects page still lists sTeX under 'Production-ready projects' (tdep.xycloo.com/projects) and the xycloo org pushed July 2026. |
| teachmedefi |  | teachmedefi.de NXDOMAIN and Podbean removed, yet the TEACHMEDEFI podcast published through 2025-12 on Spotify — recently active brand vs lapsed domain. |
| techfiesta |  | Conflicting: EkoLance hosts a live techFiesta product page at https://www.ekolance.io/techfiesta, but its 'Start Hacking' CTA points to techfiesta.dev which no longer resolves (Wayback last live 2024-11) and the GitHub org idle since 2024-03. |
| transfermole |  | Conflicting: AIPAY token launched Sept 2025 with the official site indexed at transfermole.com (bitget academy piece), yet transfermole.com/www/docs all have no DNS records today. |

## Notable individual calls

- **brl**: the issuer (nTokens) announces the discontinuation on its own site — strongest possible dead evidence for an SCF-adjacent stablecoin record.
- **lumenaut**: its sole function (inflation pool) was eliminated by Protocol 12 in 2019 — should have been Inactive for years.
- **whalestack** (ex-Coinqvest): wound down, redirecting users to BTCPay Server since ~Sep 2025.
- **securrency**: acquired by DTCC (Dec 2023), now DTCC Digital Assets — candidate for a REBRANDS row rather than a plain link fix.
- **stellarbeat**: lives on as OBSRVR Radar (radar.withobsrvr.com, repo pushed 2026-07-09) — link fix + maybe rename.
- **stride**: the app is alive but pivoted off Stellar entirely (now an AI weight-loss tracker) — judgment: Inactive-for-Stellar?
- **eurs**: MiCA-failed, issuance suspended since 2024, issuer site 503 for days, token trades ~$32/day — leaning Inactive but a live token record is a judgment call.