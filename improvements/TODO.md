# TODO: the one queue

Every known gap in this repo's own work. A **Now** item carries four parts:
what is wrong, how it was found (a probe anyone can re-run, or a named
source), its state, and what done means. A **Next** item carries what is
wrong and how it was found; it gains a state and a done line when it moves
to Now. New items go here, not in chat, PR threads or private notes. When an
item is done, record it in the Outcome of the round ledger that closed it,
and delete it here. `docs/QUALITY-FINDINGS-QUEUE.md` is the historical queue
this replaces.

A probe is a request plus an assertion that is true now and flips when the
item is fixed. API base URL: https://www.stellarlight.xyz.

## Now

1. **Raven holds our spec at 1.9.61.**
   Probe: `gh api repos/stellar-experimental/stellar-raven/contents/inventory/stellar-light.json`
   decodes to a snapshot whose spec version is 1.9.61 (fetched 2026-10-02);
   Raven's drift issue #223 is open. Its routing gate scored our
   1.9.78 at 220 / 295 / 325 correct at top 1 / 3 / 5 and 111 operation hits,
   against floors of 219 / 298 / 326 and 112 (stellar-raven
   `.agents/rounds/2026-10-15-truth-maintenance.md`, the table at line 46);
   our wording pulled in questions labelled for Lumenloop and Docs. Nothing we changed since 1.9.61
   reaches Raven's agents.
   State: the replica (`pnpm raven:gate`, merged in #1843) reproduces
   Raven's accepted totals exactly; on it 1.9.83 held (five hit-to-miss
   flips). Production's spec passes it: 1.9.84 at about 19:00 UTC on
   2026-10-21, 1.9.87 from 19:23 UTC that day, and 1.9.90 at 18:44 UTC on
   2026-10-22, each at 220/298/326/112 with no
   hit-to-miss flip. Waiting on Raven's re-sync.
   Done when: the replica reproduces Raven's baseline exactly, our current
   spec passes every gate in it, and Raven's accepted snapshot moves past
   1.9.61.

2. **Served fields the spec still does not declare.**
   Probe: `/api/stablecoins` rows serve `paymentsCount24h` while the 1.9.90
   spec never mentions it (2026-10-22). Found with one live request per GET
   operation on 2026-10-22: getQualityReport (14 fields); getSkill
   `skill.argumentHint`, `rawUrl`, `registry`, `userInvocable`; searchProjects and searchRepos
   `codeVerified.ciPresent` and `codeVerified.testsPresent`; getHackathons
   `meta.counts.curated` and `meta.counts.dorahacks`; getChanges
   `meta.generatedAt`; getPartners `meta.counts.filteredOut`; listAudits
   `meta.counts.matched`; listSkills `meta.counts.bySource`; getStablecoins
   `stablecoins[].paymentsCount24h`.
   State: the four operations named on 2026-10-20 are declared (#1850), and
   `scripts/contract/served-shape.ts` lists any undeclared field, null or
   enum value in a body. compareHackathons' deltas are declared by the
   winners-only coverage round.
   Done when: every operation's served fields and nulls are declared and a
   test walks each operation's body with served-shape.

3. **Five confirmed build-to-project links are missing.**
   Probe: `/api/hackathons/review?link=https://github.com/hoops-finance/cometswap`
   says no project lists the repo, while searchProjects lists
   `Hoops-Finance/cometswap` among the hoops project's repos.
   Found: the previous-attempts lane (2026-10-20), confirming each by reading
   both descriptions. The causes differ, so no one rule fixes them: the link
   rule reads a project's own `github.repos` and its `links.github`, never
   its indexed repos (Comet x Hoops; letter case is not the cause, both sides
   are lowercased in `src/lib/hackathon-build-links.ts`); the repo moved
   (YieldBack.Cash, clevercon); the build has no repo and a different demo
   host (PayZoll); only the name matches (Juntta). Broad rules measured badly
   in that lane: name-only links were right 3 of 15 times, indexed-repo
   links about 1 of 5.
   State: 2026-10-23, branch `lane/lk-winner-scf-links` (not merged): two
   measured rules link a winner by name plus a page signal, in place of a
   curated basis for two of the five: YieldBack.Cash (its SCF page links
   the submission, `scf-page-and-name`) and PayZoll (its page lists the
   project's X account, `submission-links-and-name`), each on the sync
   lane's next run; clevercon links on that run through 1.9.95's
   `moved-repo`. Still unlinked: Comet x Hoops (its name is not the
   project's name, though its page lists the project's X account) and
   Juntta (not a winner; the page rules read winners only).
   `improvements/audits/2026-10-23-winner-scf-links/`.
   Done when: the five verified links are recorded as a curated link basis
   the link lane reads (a spec enum entry for the basis), the lane re-ran
   (dry run, then execute), and the five links are live.

4. **Events with announced winners show 0 winners.**
   Probe: `/api/hackathons/build-on-stellar-philippines-2026` has
   `stats.winners == 0`, while bitpinas.com (2026-06-08) names five winners
   with their places.
   Found (2026-10-22; every source fetched again by the orchestrator): of 13
   past events served with 0 winners, 4 have winners on readable pages:
   hackmeridian-2025 (six, waiting on the curated-builds execute);
   build-on-stellar-philippines-2026 (AbotPera champion, PinkRaft and Axial
   runners-up, Sobre and TyFi best use of Stellar); alebrije2026 (Mañana
   Seguro, Seyf and Gibbor named as winning projects, no places; BAF
   newsletter, 2026-05-04); apac-stellar-hackathon-2026 (Olio, first in the
   Payment and Consumer Application track; risein.com, 2026-09-01; the other
   two tracks not found). The other 9 show none announced on any readable
   page, and each DoraHacks-sourced one reports `winner_announced: false`.
   The earlier note that stellar-pulso-hackathon's page says winners were
   announced was a planned timeline row.
   State: not started. alebrije2026's submissions are stored from DoraHacks,
   so its winners need an override on the stored rows, not new curated rows.
   Done when: the confirmed winners are served (curated rows or an override,
   then the curated-builds lane run), a partial event says it is partial,
   and the 9 say winners were not announced upstream instead of a bare 0.

5. **Secret scanning covers new commits only.**
   Probe: `gh api repos/Stellar-Light/stellarlight --jq
   .security_and_analysis.secret_scanning_push_protection.status` answers
   `disabled`, and `grep -l -i gitleaks .githooks/*` prints nothing (the
   one hook there, `pre-push`, scans nothing for secrets).
   State: `.github/workflows/secret-scan.yml` (merged in #1844) runs
   gitleaks 8.30.1, its checksum pinned in the workflow, on every PR range
   and every push to main; from its own PR on, it ran 13 times on
   2026-10-21 and passed every time (#1843 merged before the workflow
   reached main). A local full-history scan on 2026-10-21 (gitleaks
   reported 2,474 commits scanned) found 10 findings, none a credential; `.gitleaksignore` records each
   with its reason. GitHub's own secret scanning and push protection are
   owner settings.
   Done when: a secret is stopped before it is public, by GitHub push
   protection or a hook in `.githooks/` that runs gitleaks on staged
   changes (either flips the probe); CI scans only after the push, when
   the commit is already public.

6. **Repos deleted on GitHub are still served.**
   Found: the gone-repos probe (`improvements/audits/gone-repos-latest.json`,
   `tally`, the same counts on 2026-10-20 and 2026-10-22) counts 56 newly
   gone repos still served and 2 that came back. The ledger calls a high
   finding stale once it has been open more than 30 days (`STALE_DAYS` in
   `src/lib/improvement-ledger.ts`); the oldest open gone-repos finding was
   first seen 2026-09-27T10:59Z, so the first turns stale at
   2026-10-27T10:59Z. A 2026-11-12 sweep of the 2,542 repos linked to the
   1,020 listed projects (public API plus one GitHub read each) found 82 that
   GitHub answers 404 for, on 47 projects, 55 of them in a row's top five
   `repos` on 37 projects; 56 of the 82 sat at `scanned`, outside the probe's
   pool, and the per-project join did not drop the 24 already at `gone`.
   State: lane r1112-dq2-repos stops listing `gone` rows as a project's repos
   on searchProjects, getLeaderboard (moved to `goneRepos`) and the project
   page; every aggregate still counts them. It also adds to the probe's pool every
   project-linked row enrich-repos has not refreshed for 8 days (pool 774,
   holding 79 of the 82). The execute would mark the newly gone rows `gone`
   and set the ones that came back to `error` for a rescan, reading every row
   back; it has not run.
   Done when: the execute ran (dry run read first) and its read-back
   passed.
   Open beside it: enrich-repos only ever sets a row's projectSlug, so a row
   whose repo was renamed (16, 6 with a twin row under the new name), moved
   to another project's org (theahaco/attest-contract, now
   stellar-registry/actions, still cited by the-aha-company) or dropped from
   a project's links stays linked; nothing unlinks it.

7. **"Recent mainnet upgrade" leads with an upgrade not yet on mainnet.**
   Probe: in `/api/research?q=recent mainnet upgrade&limit=5`, no row
   names Protocol 26 to 29 or Zipper. Rows 1 and 2 are "Introducing Bell,
   Protocol 30 on Stellar" and the Bell upgrade guide (published
   2026-10-20; the mainnet vote is 2026-11-23); with `limit=8` the
   Zipper (Protocol 27) guide is sixth. The golden case `recent-mainnet-upgrade` fails on 1.9.87
   (2026-10-21): the one research failure among 37 graded (2 more were
   N/A).
   State: cause measured 2026-10-22. "recent" fires recency intent, which
   sorts by 0.6 x confidence + 0.4 x dated freshness (half-life 120 days):
   the Bell rows (confidence 0.53, relevance 0.37 and 0.36, 2 days old)
   score 0.713 and the Zipper guide (confidence 0.82, relevance 0.85, 140
   days old) 0.670. No field on a row says whether an upgrade is announced
   or live; the vote dates sit only in the posts' prose. A multiplicative
   blend would lift the undated "Software Versions" page back to the top,
   so a fix needs an A/B on the golden set and the recency questions.
   Done when: the latest upgrade live on mainnet is in the top 5 for that
   question, an announced upgrade is labelled with its vote date or ranked
   below it, and the golden case accepts Protocol 30 once its mainnet vote
   passes.

8. **vetIdea lists prior-art builds that share only words, admitted by the
   meaning score.**
   Probe: `/api/vet-idea?q=tokenized real estate with fractional ownership`
   lists QR Mint (`dorahacks-buidl-14609`, similarity 0.727, no matched
   word) in `priorArt.builds`; `q=savings circle (ROSCA, tanda) with
   automatic payouts` lists Stellar Automations Studio
   (`dorahacks-buidl-36339`, 0.733, no matched word). Both are graded 0
   (words only) in the draft labels. Found by the 2026-10-22 battery on
   1.9.90 (i01, i04, i11) and measured on 1.9.91 over all 40 labeled ideas
   (`improvements/audits/2026-10-22-prior-art-precision/`): of 17 wrong
   builds listed for the 27 working ideas, 12 pass on the meaning score
   alone, 4 on the meaning score with two words, 1 on all three conditions,
   none on words alone.
   State: not fixed. No filter-only rule met the ship criteria. Weighing the
   word path by rarity removes 4 of 16 wrong builds on the 13 held-out ideas
   but none on working and drops a same-idea build on the short-idea set;
   a higher meaning floor for meaning-only builds drops same-idea builds on
   working at every floor tried (a same-idea build scores 0.701, and one
   ties a wrong build at 0.733), on the short and test sets at 0.735, and on
   the holdout from 0.745. i01's Delibera uses every word of the idea and
   scores 0.788, so a floor above that also drops same-idea builds on other
   ideas. Labels are drafts.
   2026-10-23 (rerank round, `improvements/audits/2026-10-23-rerank/`, on
   branch `lane/s-rerank`, not merged): reranking the hybrid top 50 with a
   cross-encoder and listing the top five it scores at least 0.45 removes
   Delibera (i01), QR Mint (i04) and Stellar Automations Studio (i11) from
   vetIdea's five. It also loses AgentPay (i01) and BLOCKI (i04), both
   graded 2, and it loses builds graded 2 on every set but the holdout,
   against larger gains: working 16 lost and 20 gained, short 12 and 32,
   tests 13 and 17, fresh 6 and 6, holdout 0 and 3. So the done-when below
   is not met and the item stays open. Next: the prior-art judge (built,
   blocked on API credit), then owner review of the draft labels.
   Done when: a rule, measured as in that directory on a fresh held-out
   slice, lists fewer builds graded 0 with no build graded 2 lost on any
   labeled set, and QR Mint and Stellar Automations Studio are no longer
   listed for those two ideas.

9. **vetIdea and hackathonBrief list builds admitted on two matched words
    that have no meaning score (not close in meaning, or not embedded yet).**
    Probe: `/api/vet-idea?q=marketplace for renting out tools and equipment
    with deposits held in escrow contracts` lists LumenSure
    (`dorahacks-buidl-46284`, matched words "out" and "contracts") and
    ContractForge (`dorahacks-buidl-36190`) in `priorArt.builds` with no
    `similarity`, though search by meaning ran (`buildsMode` hybrid); both
    are graded 0 by two blind labelers (rechecked live on 1.9.91,
    2026-10-22).
    Found by part 1's lead (4 of 5 wrong builds admitted on two words alone
    had no meaning score) and measured on 1.9.91 over 30 fresh ideas
    written before any result was read
    (`improvements/audits/2026-10-22-words-need-meaning/`).
    State: not fixed. Requiring a meaning score for the two-word path (G1)
    removed 13 builds on the fresh set, 7 graded 0 and 6 graded 1, none
    graded 2, and on part 1's 40 ideas 4 graded 0 and 3 graded 1, none
    graded 2. On short ideas, where meaning scores are sparse (7 builds
    scored for "recurring subscription payments"), it drops a real match:
    Decrow Finance, graded 2, matches two words and has no meaning score.
    Also requiring it for the one-word path (G2) drops 39 builds graded 2 on
    the 36 short ideas. Only these two rules were measured. Labels are
    drafts.
    Done when: a rule, fixed before a fresh labeled set is read, lists
    fewer builds graded 0 on it with no build graded 2 removed there or
    lost on any earlier labeled set (the short ideas included), measured as
    in that directory.

10. **Events whose stored rows are their winners only serve the winners as
    their whole field.**
    Probe: `/api/hackathons/compare?slugs=hackmeridian-2025,hackmeridian-2026`
    serves hackmeridian-2025 `submissionCount` 6, its `winnerCount`, and no
    `coverage` (live 1.9.99, 2026-10-23 15:38Z); `/api/hackathons/hackmeridian-2025`
    serves `stats.totalSubmissions` 6 and tracks of 3 and 3, where its
    record says 110+ submissions.
    Found by the benchmark check "2025 submission count is null or >= 100"
    (null on 1.9.94, 6 after the curated import stored the winners of three
    events off DoraHacks).
    The same class, found in the round: compare serves
    apac-stellar-hackathon-2026 `prizePerWinnerUSD` 60,000 (its pool over
    the 1 winner it publishes); `/api/hackathons/analyze?facet=placement`
    counts 80 winners of 1,383, 12 of them curated winners whose field is
    not stored; `/api/hackathons/hackmeridian-2026` serves `tracks: []` and
    `prizeTiers: []` beside two categories and two tracks its record states.
    State: all three fixed on branch `lane/v-winners-only-coverage` (spec
    1.9.101), not pushed. Replay and sweep:
    `improvements/audits/2026-10-23-winners-only-coverage/`.
    Done when: merged and deployed, and live, re-checked by someone other
    than the author: the probe serves `submissionCount` null with
    `coverage: "winners-only"`; APAC `prizePerWinnerUSD` null with a note;
    `facet=placement` 68 winners of 1,371 with the left-out line;
    hackmeridian-2026 its four declared tracks and `prizeTiers` null.

11. **A Live row whose DefiLlama protocol is dead reads as plainly Live.**
    Probe: `/api/projects/search?q=allbridge` serves Allbridge `status:
    Live`, `statusConfidence` 0.9 high and no `statusCaveat`, while
    `https://api.llama.fi/protocols` marks `allbridge-core` deprecated with
    `deadFrom` 2026-08-31; `/api/verify?type=live&subject=allbridge` answers
    supported, 0.9 high (live 1.9.101, 2026-10-23).
    Found by the owner's read of the row; measured in
    `improvements/rounds/2026-10-23-dead-protocol-guard.md`.
    State: merged as #1876 (spec 1.9.105); the enrich-tvl and curate-projects
    runs are next. The guard needs the enrich-tvl lane to store
    `llamaListing`; the Allbridge description and routes need a curate-projects
    execute; the dispatch steps are in the ledger.
    Done when: merged and deployed; the enrich-tvl and curate-projects lanes
    ran (dry run read first); live, re-checked by someone other than the
    author: every DefiLlama-linked row serves `statusChecks`, Allbridge serves
    the reworded description, `llamaSlugs` [allbridge-next], `tvlUSD` null,
    `routes` null, derived `supportedNetworks` and a clear listing check, and
    no other row carries a `statusCaveat` unless DefiLlama dates its protocol
    dead or retired it with nothing locked and no live successor.

12. **The toolchain deprecated count reads as a soroban-sdk count.**
    Probe: `curl -s 'https://www.stellarlight.xyz/api/analyze?dimension=toolchain' | jq '.toolchain | {deprecatedTotal, soroban: .bySorobanSdkStatus.deprecated, js: .byJsSdkStatus.deprecated, rowsWithReason: ([.deprecatedRepos[] | select(.deprecatedBy)] | length)}'`
    serves `soroban` and `js` as null and `rowsWithReason` 0 on 2026-11-12 (spec
    1.9.136): `deprecatedTotal` 1,284 of 5,865 is Rust OR JS, but only 404
    repos pin a deprecated soroban-sdk; 881 pin one that is not deprecated
    (824 supported, 25 current, 32 unreadable) and are deprecated only
    through their JavaScript Stellar dependency, as are 36 of the 50 sample
    rows. An external
    README cites the 1,285 as repos "on a deprecated soroban-sdk", and its
    tool builds its deprecated-version list from the sample's
    `sorobanSdkVersion`, which today includes 29.0.0, 27.0.2 and 26. The SDK
    table was also stale (2026-08-11, stopping at major 27) and the "CB6"
    check its comment promised never existed. Found from the owner's probe
    and a full-corpus read of `/api/repos` (rounds/2026-11-12-toolchain-truth.md).
    State: branch `lane/toolchain-truth` (spec 1.9.140, renumbered at
    merge) serves the per-line counts, a `deprecatedBy` reason per row with
    soroban-sdk-line rows first in the sample, and `deprecationRule`, refreshes the table to
    soroban-sdk 29 and Protocol 29, and adds a nightly table check; waiting
    for the owner's go on the PR.
    Done when: the probe serves `soroban` 404, `js` about 1,041 and
    `rowsWithReason` equal to the row count on the live API, checked by
    someone other than the author.

## Next

Found by the third-party host lane on 2026-11-12 (branch
lane/r1112-dq1-host). Toml links that hold one way, found and not changed;
each probe is a read-only request.

- The enrich-onchain toml auto-join (scripts/data/enrich-onchain-projects.ts)
  keys an Anchor or Stablecoin row's asset to the first live currency its
  website's stellar.toml declares, without reading the issuer's home_domain,
  and basis-from-onchain awards onchain-activity off that asset's activity.
  backfill-deployment's tomlChain checks both ways and now skips third-party
  hosts. No served row rests on such a join today: of the 27 rows with an
  onchain asset, every one whose issuer's home_domain names another domain
  is human-verified or curated (`curl
  https://horizon.stellar.org/accounts/<issuer>`, 2026-11-12). The lane
  writes nothing while api.stellar.expert answers 402. Done when the join
  calls tomlChain and the fix that unblinds the lane carries it.
- Six rows served before this lane carry `statusBasis` unverified with a
  `statusSourceUrl`, though the spec defines unverified as having no citable
  source (`/api/projects?where[statusBasis][equals]=unverified`, 2026-11-12):
  caatinga (Draft, docs-caatinga.netlify.app), cryptix (tokenlaunchpad.eu),
  mydatacoin (Development, the org's GitHub repo list), posted-app
  (posted.app), sorosan (sorosan-dapp.vercel.app) and stellar-pulse (a
  Wayback capture). mydatacoin's and stellar-pulse's are curated on purpose
  as the newest thing observed. Done when the spec and these six agree: the
  definition allows an observation record, or the sources are retracted.
  The 35 rows this lane moves to unverified have their sources retracted.
- Registry-filled deployments that stop under the two-way rule
  (deploymentFromRegistry, 2026-11-12): rivool-finance (entity-toml; its
  issuer names lobstr.co), centrifuge and liqvidxyz (contract-metadata; the
  deployer accounts set no home_domain), matrixdock (its deployer names
  www.matrixdock.com, whose toml answered a Cloudflare challenge from here,
  could-not-check) and stablecorp (stablecorp.ca's toml answers 404) read
  unknown, and centrifuge, matrixdock and stablecorp lose
  `supportedNetworks`. matrixdock should be re-read from the Actions runner;
  each can also return through a DEPLOYMENT_VERIFIED entry that cites the
  issuer's own page, as Spiko's did (DEPLOYMENT_VERIFIED, its docs name its
  nine Stellar token contracts, 2026-11-12).
- The 16 Mercado Bitcoin rows (issuer GBVMRBARLKFM..., on-chain-only, no
  project) name www.mercadobitcoin.com.br, whose toml answered 403 from here
  on 2026-11-12; the nightly reconcile now names them for promotion if the
  runner reads a toml that declares them.
- velo serves onchain-activity off VELO by
  GDM4RQUQQUVSKQA7S6EM7XBZP3FCGH4Q7CL6TABQ7B2BEJ5ERARM2M5M, keyed by a
  hand-verified seed (src/data/onchain-contracts.ts) whose source is
  velo.org's toml; that issuer sets no home_domain, so the link holds one
  way. Velo's USDV issuer (GDB6ZOJ4...) names velo.org back, and its
  operator-toml deployment rests on that one.

Found by the sls-024 deployment-provenance lane on 2026-11-11 (branch
lane/r1111-deploy-provenance). Lifecycle and record items it found and did
not change; each probe is a read-only request.

- stellars-finance is Pre-Release on a parked domain: `curl -sI
  https://stellars.finance/` answers `server: Parking/1.0`, the statusSourceUrl
  bundle (`/assets/index-3HEaNhUX.js`) answers 440, and
  `/api/projects/search?q=stellars%20finance&limit=1` still serves
  Pre-Release, human-verified. Its testnet vault is still on the testnet
  ledger; whether the product lives is the open question.
- xycloans is Live on statusBasis product-integration whose statusSourceUrl
  (`main.xycloans.app/_next/static/chunks/eef1a047-8f44bfe5d78759e9.js`) holds
  both network passphrases and no contract id (0 C addresses, read
  2026-11-11); stellar-raven sls-024 notes the repo was last pushed
  2024-12-09. An SDK in a bundle shows integration, not that the product runs.
- Rows whose records cite another product: soroban-timelock-contract (a
  timelock contract template) serves statusSourceUrl
  github.com/57blocks/agentsmith-x402 and has the AgentSmith repo
  57blocks/agentsmith-contracts attributed to it; websoroban-ide (the browser
  IDE) has WebSoroban/payloop, a separate USDC subscriptions product,
  attributed to it. Their deployment claims were retracted on this branch;
  the status source and the repo attribution were not touched.
- stellar-vrf and vrf-soroban are two rows for one repo (NibrasD/Stellar-VRF)
  and one mainnet contract (CAW6KECQMHRTX2GS3JVHWBMOB5JNNOHNOCE635RQS4SWJ72YF56EUPRX),
  one Live and one Development: a duplicate with no canonical pointer
  (bug class 9).
- S0 in scripts/check-record-completeness.ts has checked nothing: it sweeps
  `/api/projects/search?limit=100` with no q or category, which answers
  no_query with 0 projects, and it reads `/api/audits` rows from a
  `projects` key the audits body does not have, so 0 audits. Run on
  2026-11-11 it printed "0 projects + 0 audits, 0 dangling references" and
  passed. Done when S0 sweeps every category, reads the audits body's own
  key, and a zero-row sweep fails as S1 and S2 do.
- `/api/verify` serves `subjectCard.supportedNetworks` from the stored list
  as it is: `[]` for a row with no curated list (an empty array asserting no
  networks) and "Stellar" for the 20 rows stored capitalised; it does not
  use deriveNetworks, which searchProjects now serves lowercase.
- The curate-projects Idempotence step re-plans only curate-projects.ts. Add
  the deployment pass: after an execute, `backfill-deployment.ts` without
  --execute must plan 0 rows.
- A Payload save-time rule on `deployment`: mainnet or testnet only with
  basis, sourceUrl and asOf. Add it once the S5 sweep is green; before
  that, validation on any update would reject other lanes' writes to rows
  that still lack a source.

Found on 2026-11-11 in the audit of the sls-115 lane (pinned knowledge-note
values checked against the code scan):

- A pinned note whose reading stays `unread` (the reader does not find the
  note's value at the note's commit, or the file keeps failing to arrive)
  serves `sourceCheck.state: unknown` and is re-picked by the pin-due pass
  once a day, at most 25 repos a wave, with no signal that it never
  resolves. The pass also skips the notTriaged filter and the routine
  error and incomplete exclusions, which is bounded but silent. Wanted: a
  guard that counts pins whose reading has been `unread` for more than N
  days (pinnedValues on the repo row, codeScannedAt as the clock) and files
  each as a finding for curation. Probe: GET
  /api/repos/explain?repo=<owner/name>&q=<the note's trigger> and read
  `sourceCheck.reason` for each pinned repo (notePinsFor in
  src/lib/repo-knowledge.ts lists them).

Found on 2026-11-07 while measuring contract evidence for hackathon builds:
stellar.expert's API went paid between 07:19Z and 19:39Z on 2026-11-06 and
answers 402 (refresh-rwa's first red run is 19:39Z).

- Six verified mainnet contract ids were erased by rescans after the 402s
  began: Consulting-Manao/tansu, Eras256/Nirium,
  Lobster-Protocol/stellar-integrations,
  reflector-network/reflector-stellar-connector, skyhitz/hitz-gravity and
  trionlabs/stellar-8004. Probe: GET /api/contracts?limit=100 then
  &offset=100 lists 129 rows (135 on 2026-11-04) and none of the six. Each
  README still cites a live mainnet WASM contract (getLedgerEntries on
  mainnet.sorobanrpc.com). The scanner fix keeps stored ids from now on,
  and the check now reads mainnet RPC, the WASM's SEP-55 source_repo and
  GitHub attestations instead of stellar.expert, so a rescan of each repo
  (`--only`, dry then execute) restores them. Measured 2026-11-07: Tansu
  and hitz-gravity read self-validated, the other four published.
- refresh-rwa records "stellar.expert returned no asset record" for a 402.
  Its numbers are kept and marked unmeasured, so only the note is wrong.
- The scan pools do not select `primaryLanguage`, so the allowlist pin in
  scripts/scan/scan-repo-code.ts reads it as empty: an allowlisted canonical
  repo whose proof reads none, or whose scan is not ok, is pinned `lang-sdk`
  on a pool wave (an `--only` run reads the whole row).
Found reading the 41 Wallet rows for sls-033 on 2026-11-11 (each row's
sources are in WALLET_AVAILABILITY and AVAILABILITY_CHECKED,
scripts/data/curation-maps.ts). Cypher's status moved to Inactive on its own
shutdown notice (STATUS_FIX); the rest are for the status lane.

- For the status lane, status Live with evidence that is not a shutdown
  statement, so not moved: freelii.app and spatium.net no longer resolve;
  x.com/bebopcash does not exist and the record has no site; Blaze, Elsa
  and Sentit now offer a different product (an AI CFO, a B2B payments API, a
  tokenized-debt waitlist). Ben Wallet is Live while its docs ship no APK
  yet and myben.xyz is a pre-launch waitlist. A dead domain, a pivot or a
  waitlist is not the operator saying the product ended or launched.
- Typed Wallet with no Stellar evidence read: OpenXSwitch (site and full
  docs), Sentit (site) and Spatium (archived home page). Haven's app names
  no Stellar network either, but its Development status may cover a
  Stellar build.
- human.tech keeps productKind smart-account-tooling, but its Stellar product
  is identity credentials (Human ID verifications recorded as tokens on
  Soroban, docs.passport.xyz), and its wallet page lists EVM, Sui and
  Solana, not Stellar. The vocabulary has no identity kind.
- Blaze's check is could-not-check: its store link is sent only through an
  email form. Retry when the operator publishes the link.

Found by Stellar Raven's HackMeridian evaluation on 2026-11-02 and filed
here as #1900 to #1905; each issue carries its read-only probes.

- #1900: a stablecoin's `company` holds the brand, not the issuer's
  stellar.toml `ORG_NAME` (AUDD, the eight C1 rows), and `assetType` cannot
  filter yield products (USDY, YLDS) out.
- #1901: repo search ranks low-score forks above the canonical repo for
  "scaffold stellar", "stellar lab" and "smart contract examples"; the
  canonical boost covers infrastructure queries only.
- #1902: the HackMeridian 2026 record has the qualitative judging criteria
  but not the weighted rubric on hackmeridian.com/build.
- #1903 (sls-111): SCF's #45 round page lists 40 awards and the directory
  serves 28 (2026-11-11, after the 2026-11-07 enrich-scf execute set Liqvid
  to [37, 45]; its #30 and #44 entries read Not Awarded). Branch
  lane/r1111-scf45-coverage seeds the twelve awardees with no row and joins
  each to its SCF page by slug. Done when, after the curate-projects
  execute and then the enrich-scf execute, `pnpm exec tsx
  scripts/eval/scf-round-counts.ts` reads `SCF #45: SCF 40 (+1 undecided),
  ours 40`.
- Intake of the earlier SCF rounds' awards: the same check, exact in every
  round since it reads SCF's own round pages, finds 34 rounds before #45
  short by 119 awards (2026-11-11, the state after the sls-111 executes).
  They are the reviewed baseline the check ratchets against,
  scripts/eval/scf-round-shortfalls.json, which names each round's 131
  uncarried award pages; close a gap, then lower or remove its entry in the
  same change. By round, short (SCF, ours; why): #44 3 (46, 43; 3 with no
  row); #40 2 (24, 22; 2 no row); #38 2 (24, 22; 2 no row); #36 1 (23, 22;
  2 no row); #35 1 (21, 20; 2 no row); #32 1 (17, 16; 3 no row); #29 6 (40,
  34; 3 no row, 4 a row carries no award); #28 6 (30, 24; 2, 4); #27 6 (36,
  30; 5, 1); #26 1 (43, 42; 1, 2); #25 3 (27, 24; 2, 1); #24 1 (27, 26; 0,
  1); #23 5 (25, 20; 3, 3); #22 3 (33, 30; 1, 4); #21 6 (26, 20; 4, 2); #20
  5 (33, 28; 3, 3); #19 2 (16, 14; 1, 1); #18 3 (15, 12; 2, 1); #17 3 (19,
  16; 0, 3); #16 4 (21, 17; 0, 4); #15 4 (12, 8; 3, 1); #14 3 (12, 9; 2,
  1); #13 3 (14, 11; 1, 2); #11 3 (20, 17; 1, 2); #10 5 (15, 10; 3, 3); #9
  3 (14, 11; 0, 3); #8 3 (7, 4; 1, 2); #7 3 (8, 5; 2, 1); #6 3 (8, 5; 1, 2);
  #5 8 (9, 1; 2, 6); #4 5 (8, 3; 2, 3); #3 4 (8, 4; 0, 4); #2 4 (8, 4; 0,
  4); #1 4 (8, 4; 1, 3). Two remedies: 60 award pages have no row at all
  (intake, as for SCF #45: SEEDS plus an SCF_SLUG_OVERRIDES join), and 71
  sit outside SCF's 531-row listing beside a row of the page's name (64
  rows, most of them Inactive, among them cosmicvote, mxlet, rigel,
  stellarpay and the-blue-marble) that carries no award because the enrich
  never reads the page: each needs an SCF_PAGES_BEYOND_CAP entry confirmed
  by a link, since a name alone is not identity (Wally, Sendit, Relax, Grip
  and Amber were left out of that map as collisions). Rounds that list more
  pages than their net shortfall hold a row that claims the round with no
  SCF page of its own: team-finance #36, muwp #35 and #26, attest #32 and
  #29, cross-platform-soroban-rpc-sdk #32, unalivio #32, peer #26 and #22,
  wagelink #24, solang #23 and #20, stbl #22, comet #18 and #13, sstream
  #16. One page, fixed-rate-fixie-dxh (#21, our polaris-lend row), has a
  double quote in its title, which readScfPage's record match does not
  read, so it needs that reader fixed before it can be joined. The baseline
  also records five swaps, rounds whose totals agree while an SCF award
  page the check finds no row carrying is offset by a row it cannot tie to
  a page. Three are a missing citation, not a wrong join: adamik (#37),
  greeppay (#34) and solang (#33) already store the right page in scf.slug
  (stellar-integration-in-adamik-api-piy, greep-pos-greep-pay-mhp,
  hyperledger-solang-dwa) but no scf.sourceUrl, so the served scfSourceUrl
  is null; a link-checked SCF_SLUG_OVERRIDES entry for each page lets
  enrich-scf stamp it. #37's other page, paysomeai-7gh, is smilepay's
  retitled record (the next item). Two are wrong joins: ankr stores IBIS's
  page, ibis-stablecoin-neobank-ramp-api-infrastructure-g4c (which
  SCF_SLUG_OVERRIDES gives the ibis row), and claims #42, while Unstoppable
  Money (unstoppable-money-eii) has no row; stellarpay stores
  arculus-x-stellar-payments-with-soroban-fpz and claims #30, while CHATS
  (convexity-humanitarian-aid-transfer-solution-chats-bd8) has no row.
  Check both rows against SCF and correct them (read 2026-11-11 through
  GET /api/projects?where[slug][equals]=<slug>). Awards on pages outside
  SCF's 531-row listing are not swap-checked: the round pages name them by
  project record id, and the check holds no map from record id to page
  slug (one built from the /project/<record id> pages would close it).
- /api/verify serves a project's stored supportedNetworks raw, so a row
  whose curated list was cleared to let the API derive its networks
  (allbridge and estrela, and the nine 2026-09-15 SCF #45 seeds once
  curate-projects executes) answers [] there, which the contract reads as
  checked and none, while search serves the derived ["stellar"] with its
  networksBasis. Probe: GET
  /api/verify?type=live&subject=allbridge answers "supportedNetworks": []
  (2026-11-11). Serve the derived list and its basis, as search does.
  Found by the review of the sls-111 lane.
- smilepay serves rounds [10, 37] from
  https://communityfund.stellar.org/project/smilepay-global-7gh, but that
  page no longer carries a project record (HTTP 200 with no record for the
  slug, read 2026-11-11) and the SCF listing no longer lists it, so
  enrich-scf can neither confirm nor update the row; the stored record
  stands, unread. SCF retitled the record: project rechQd4T6SVeIF7gH is now
  "PaySome.ai" at https://communityfund.stellar.org/project/paysomeai-7gh
  (listed, lastAwardedRound 37; its #10 and #37 submissions Awarded, #31 and
  #35 Not Awarded), and no row of ours joins that title. Confirm the page's
  site against the row's, then add an SCF_SLUG_OVERRIDES entry
  (paysomeai-7gh to smilepay) and an alias if PaySome.ai is the product's
  current name. Found by the sls-111 lane's page re-read.
- #1904: no row for Chainlink Data Feeds on Stellar or for MetaMask's
  native Stellar network.
- #1905: `venueRole` is null on 31 of 38 Live DEX rows, and project search
  ignores a `venueRole` parameter.
- HackMeridian 2026 has no stored submissions (our own check, 2026-11-04): GET
  /api/hackathons/builds?hackathon=hackmeridian-2026 warns that none are
  stored, so no build, contract or package facet covers the event. #1918
  (a contributor PR) proposes HackProof as the source.

Found by the 2026-10-20 round's consumer-style QA round and contract audit
unless noted.

- Hackathon builds: a submission's project link, repoMissing and activity
  are still read per row (src/lib/hackathon-builds.ts,
  sameFactsPerSubmission merges only types and packages), so a winner whose
  link was checked only on an unplaced row reads unknown in the winner
  groups of analyzeHackathonSubmissions (project, projectStatus and scf
  facets). Merge them in sameFactsPerSubmission. Found by the 2026-11-05
  review of lane R10; no instance in the rows saved 2026-11-04.
- Unread SCF facts are served as answers: 392 of 1006 rows served by
  GET /api/projects/search (paged across every category, 2026-11-05) carry
  scfAwarded false and scfAwardedRounds [] with no SCF read behind them (no
  scfBasis, scfAsOf or scfSourceUrl), among them the nine rows the pending
  enrich-scf execute marks awarded (Enable, Rumble Fish, Docking Zone,
  SlimePay and five more). Serving null for a row no SCF read covers needs
  both fields nullable, a contract change; until then the scfAwarded
  description says false with scfBasis null means no SCF read is recorded.
  Found by the review of the sls-111 lane (#1903).
- Code facts other than interfaces, symbols and capability tags still read
  test code. After a rescan, a repo whose only Soroban crate is a test
  fixture serves an empty contractInterface and no symbols, while
  isDeployableContract, the auth, storage and event signals,
  contractMacroCount and the cargo-sdk proof still come from that crate:
  src/lib/code-signals.ts counts them over every fetched .rs file (the
  fetch adds up to three test files), and its NON_PRODUCT_MANIFEST_DIR is
  segment-anchored and lacks e2e. Found by the independent re-check of the
  2026-11-04 repo-canonical lane (deferred there because it moves stored
  grades). Plan, measured before any execute: run
  scripts/scan/scan-repo-code.ts in dry mode over every scanned repo twice,
  with the current rules and with isTestPath (src/lib/code-symbols.ts)
  applied to the .rs signal loop, the manifest check and the fetch
  selection (scripts/scan/fetch-repo-code.ts); recompute repoScore for both
  with the grade (codeDepth and the farm flags read these signals); list
  every repo whose score, proof or deployability moves, and ship only with
  that list reviewed.

- Research authority weighting: a 75/15/10 weighting held out best in
  simulation and changes about 10% of confidence labels (the 2026-10-20
  research lane), but the question that motivated it no longer reproduces:
  on 1.9.87 (2026-10-21) the top 8 for "idea maze for stablecoin
  remittances" are all about stablecoins or remittances, with or without a
  trailing "?". Needs a question that reproduces before any change.
- The research corpus refresh fails its idempotence step on some days
  (failed on 2026-10-16 to 10-19 and on 10-22, passed on 10-20 and
  10-21): after the execute, a re-plan still wants writes. On 10-22 (run
  39767218973) lumenloop-research planned 3 updates and sdf-org 23 (21
  meta-only); every other source planned 0. The lane names three possible
  causes: a step that died mid-run, a writer that is not idempotent, or
  two writers on one row.
- vetIdea competitor rows do not carry the idea words they matched, so a
  judge cannot grade a row from the response alone (contract audit,
  2026-10-20; the follow-up left on #1841).
- Substring matching: `track=AI` matches "Main Track"; q "Star Lends" marks
  "Blend" and "starting". Since #1851 a one-word idea lists builds whose own
  text mentions the word, so loose matching reaches vetIdea too: "send
  money home" reads as "home" and lists two builds that only mention it,
  and on a one-word idea the winner bonus breaks every tie. Done when short
  terms match whole words on build search and analyze.
- compareHackathons labels curated events "dorahacks", leaves durability
  empty, and names a highest and a lowest for tied pools.
- getHackathon `stats.outcomes.built` is 0 for Agents while
  `profile.project` says 12 became directory projects.
- Winners-only search is not in placement order; its rows carry no
  `placementRank`.
- `meta.counts.indexedBuilds` is 1,344 in search and 1,371 in analyze under
  one name; the analyze `q` description says it matches like search while its
  default mode differs.
- Evidence gates count Spanish stopwords ("de", "para").
- `organizer=<name>` on getHackathons returns 0 with no warning.
- Skill text: the read-only skill tells agents to post feedback (sk-019);
  "7 SDF skills" (sk-027); Builders "in the dozens" (sk-028), in
  `public/skills/stellar-scout.md` and `public/skills/references/api-reference.md`;
  the skill omits build search params.
- The golden eval gate counts questions (its floor was set at 37; the set has
  53); eval runs record the API version; the battery's held-out rows become a
  frozen routing holdout.
- No dependency audit runs (stellar-raven keeps one rolling issue with a
  fingerprint of the findings); the Dependabot alerts API lists 405 open
  alerts on main (25 critical, 162 high, 188 medium, 30 low; 2026-10-21
  19:38 UTC); API usage logging is a voided promise
  (`src/lib/api-usage.ts`) that can be dropped after the response.
- The /quality external-findings block reads only each finding's first issue
  link, so it reports every fix as shipped.
- Handoffs for findings fixed live (sls-085, 086, 088, 094): drafts.
- `maturity.auditedProjects` is not specific to the idea.
- No link from a builder to a build: ingest team handles.
- Events carry no format, location, submission deadline or judges fields,
  while curated rows already store format tags the API drops
  (`src/data/curated-hackathons.ts`).
- Routing vocabulary for outcome and reading-intent questions, only through
  the Raven gate replica.

- The link rules' shared-platform list (`SHARED_SITES` in
  `src/lib/hackathon-build-links.ts`) misses link-in-bio hosts: the
  directory's noticias-trading website is a beacons.ai page, so any
  submission whose demo is on beacons.ai would link to it by website. None
  does in the 2026-10-23 capture; a winner's page listing a beacons.ai
  page matched it in the winner-scf-links recall view. The SCF lane's
  `THIRD_PARTY_LINK` (`scripts/eval/scf-official.ts`) already lists
  beacons.ai, bio.link, bento.me, carrd.co, about.me and lu.ma.

- Events seen in sources but absent from getHackathons: Argentina Builder
  Challenge (2026-09-12 to 09-27), Stellar Pro Hackathon and Stellar Hack
  Pera (Istanbul), Tellus Find Your Way (2026-09-01 to 10-12) (found
  2026-10-22 while checking winners).
- apac-stellar-hackathon-2026 serves endDate 2026-07-24, but its
  organizer's 2026-07-29 post puts the grand finale on 31 July (found
  2026-10-22).

Found 2026-10-22 by reading how Raven calls and reads Scout
(stellar-experimental/stellar-raven at b1dc866: `src/adapters/scout.ts`,
`src/executor/providers.ts`, `src/policy/truncate.ts`,
`scripts/build-catalog.mjs`) against our routes and live responses:

- 5xx waits never reach Raven's agents. On a 5xx it keeps `error`, `hint`,
  the status and any `valid*` lists, and drops the rest, headers included
  (a 503 marked `unavailable` gets Raven's own hint instead). Every 429 now
  states the wait in `hint` (#1849); our 503s still carry it only in
  `retryAfterSeconds` and Retry-After, or in the header alone
  (`src/app/api/community-skills/route.ts`, and `src/app/api/ask/answer/route.ts`,
  which is not in the spec).
- Most responses carry no data date. Raven reads freshness only from a
  top-level or `meta` `dataAsOf` or `asOf`, and otherwise labels the answer
  with its own fetch time. Of 14 endpoints probed live, 3 serve one
  (`/api/leaderboard`, `/api/stablecoins`, `/api/changes`).
- A partial read discards good rows. When any backend read fails we set
  `meta.partial` and add a warning that begins "backend read failed"
  (`src/lib/degraded-read.ts`); Raven drops every row on either signal and
  tells the agent to retry once and report the result inconclusive. Both
  signals have to change: raise them only when the served rows cannot be
  trusted, or report the loss per source in a form that trips neither.
- A 404 reads as "nothing found". Raven turns every 404 into a soft empty
  result with a widen-your-search hint; `error` and `hint` survive as text,
  `valid*` lists do not. Not yet audited: which routes answer 404 when they
  could not check, rather than when the thing does not exist.
- Words that appear only in parameter descriptions never reach Raven's
  search. Its catalog indexes summary, description, `x-routing` (purpose,
  use-when, examples and keywords, with `notFor` as exclusions) and schema
  property names, not parameter or field description prose.
- Long responses are cut. Raven cuts what an agent's script returns at
  24,000 characters and keeps the front; `meta` already comes first on the 9
  endpoints checked, so the cut drops rows, not metadata. The owner parked
  response-size changes on 2026-08-18; ask before changing any response
  shape. Opt-in `view=compact` on searchProjects and searchRepos (spec
  1.9.96, `improvements/rounds/2026-10-23-compact-views.md`) brings their
  default pages under the cap with defaults unchanged; the list endpoints
  over it (skills, partners, leaderboard, builders, audits, stablecoins)
  are not covered.
- Raven's calls are anonymous. It sends plain GETs with no key, no
  User-Agent, no timeout and no retries, from Cloudflare's network, so its
  users likely share one per-IP limit [inferred]. See the owner decision on
  a key below.
- The scan's test rule (`testsPresent` in `src/lib/code-signals.ts`,
  served as `codeVerified.testsPresent` and read by the repo grade) does
  not match Rust test-module files (`src/test.rs`, `tests.rs`,
  `*_tests.rs`); a Soroban repo is seen only through a test directory or
  committed `test_snapshots`. Found by the judging-review round
  (2026-10-23), whose live read counts them: Specula-Labs/specula-contracts
  keeps its tests only in `src/test.rs`. The effect on stored rows is not
  measured; a change moves stored facts and, after a regrade, grades.
- Judging-review demo links: a demo named only in the sentence wrapped
  above its link is not judged (Foryield/soroban-yield-vault reads
  could-not-check), nor is a reference-style link. The third set showed a
  previous-line window lending labels (a badge row, a docs link), so a
  wider window needs a labelled set of README demo links first
  (`improvements/rounds/2026-10-23-judging-review.md`).
- scout-mcp `locate_source` trails the API from spec 1.9.106 (found in the
  review of `lane/l3-locate-ranking`, 2026-10-23): its `repo` enum
  (`scout-mcp/src/index.ts`, "keep in sync with SOURCE_REPOS") lacks
  OpenZeppelin/stellar-contracts, so an MCP client cannot filter to it;
  its description and README row say eight repos and "Stellar's own code",
  and its q text says a named repo "lifts" where it now weighs 8 for every
  repo named in q. For the next scout-mcp release.
- api-client: the schema regenerated for 1.9.106 (locateSource `repo` enum
  with OpenZeppelin/stellar-contracts, the factors and locatorKind texts)
  reaches npm users only with the next api-client release (same review).
- locateSource lifts stellar/quickstart by 8 when q says "quickstart" as a
  docs word: `q=quickstart guide to deploy a contract` puts the quickstart
  README heading "Deploy to Digital Ocean" above the exact deploy and
  Contract symbols (same review, offline at the indexed commits). A split
  weight (3 for the bare word) fixed it but moved the frozen fresh
  battery's f15 from 25 to 102, where stellar-rpc's and stellar-core's
  constants outrank quickstart's README "Ports" heading
  (`improvements/audits/2026-10-23-locate-ranking/rules.txt`, r-lift8).
  The likely fix is a split that also handles f15's case; measure it in a
  later round.
- searchRepos rarely finds the repo a natural-language question asks for:
  on 25 builder questions written blind (round
  `2026-10-23-repos-ranking`, evidence
  `improvements/audits/2026-10-23-repos-ranking/`), 10 have an expected
  repo in the top 5 after that round's fixes. Of the 15 misses, 2 repos are
  not indexed, 3 are indexed but never enter the 600-row candidate window
  (no description, repoScore 30 to 43), and 10 are outranked by rows that
  match many common words in code symbols, by curated floats firing on a
  word in passing, or for lack of vocabulary ("command-line" for
  stellar-cli, "python" for py-stellar-base). Rarity weighting, a
  rare-anchor supplement and two synonyms moved ranks both ways and gained
  no tuning question (`prototypes.txt`). Needs a labeled set larger than 17
  tuning questions before another attempt.
- DeFindex's project row links the archived paltalabs/defindex, and its
  curated successor defindex-io/stellar-contracts is not indexed
  (2026-10-23, read-only). Data change: `GITHUB_REPOS_ADD` and
  `GITHUB_LINK_FIX` entries for `defindex` in
  `scripts/data/curation-maps.ts`, then the curate-projects and
  enrich-repos lanes (steps in the round's audit README). No check asserts
  that a curated successor is indexed.
  State (2026-10-23): both map entries added, with Freighter's links.github
  (it named stellar/freighter-mobile; the row's main repo is the
  stellar/freighter extension). Next, owner: the curate-projects lane, dry
  run then execute (its "GitHub link fixes" section shows the two
  links.github moves and its "GitHub repos add" section defindex's added
  repo), then the enrich-repos lane with
  `only=defindex-io/stellar-contracts`. Done when /api/projects serves both
  links and /api/repos/search lists defindex-io/stellar-contracts.
  Follow-up (review of the link fixes): once indexed, the successor serves
  kind fork and a grade 0.7 times the unforked one (`src/lib/repo-grade.ts`,
  the isFork check runs before every other kind), so an agent sees
  DeFindex's living contracts repo labelled a fork. A repo that is a
  curated successor (REPO_SUCCESSIONS) could skip the fork label.

Found 2026-10-24 with the production GitHub token rejected:

- `/api/projects/<slug>/github` (a slug where the route takes an id) answers 500 with an empty
  body, not a 404 naming the id it expects (review of the token fallback, 2026-10-24).
- `/api/projects/<id>/github` serves `stargazerCount: 0`, `openIssues: 0` and `totalStars: 0` beside a
  repo's `error` when GitHub could not be read (freighter, 2026-10-24): a zero is a claim, so a repo
  that could not be read should serve null counts. Probe: the route for freighter while the token is
  rejected.

Found 2026-10-23 by the prize-labels lane and its review
(`improvements/rounds/2026-10-23-prize-labels.md`):

- An award's structure is inferred, not stored. `fetchWinnerPrizeMap`
  (`src/lib/integrations/dorahacks.ts`) sees how many prizes each
  `award_list` entry holds but stores only its title (`award`) on each
  winner, so `prizeCategories` can call an award a category only from other
  winners on record under it or from a title that states more than the
  placement. A lone winner of a multi-prize award whose title names no
  amount reads as the winner's own award, and search and the builder page
  read served winners only, so a hidden sibling counts on getHackathon and
  the submission detail but not in search. Probe:
  `prizeCategories([{ award: "10K Prize Pool", hackathonPlacement: "1st Place" }])`
  is empty (a unit call; on 2026-10-23 every category event serves every
  placement, so no live row has this shape). Plan: (1) in
  `fetchWinnerPrizeMap`, give each winner `awardPrizes: a.prizes.length`;
  (2) carry it on `DoraHacksSubmission`, add it to the `hackathon-builds`
  collection (`src/collections/HackathonBuilds.ts`) and to the fields and
  row mapping of `scripts/sync-hackathon-builds.ts`; (3) run the sync lane
  dry, read the printed diff (expect the 67 winner rows with award text to
  gain the field and nothing else to move), execute it on its own, read the
  rows back through the API; (4) make `prizeCategories` call an award a
  category when a row's `awardPrizes` is above 1, keeping the co-winner and
  amount rules for rows not yet re-synced; (5) drop the hidden-winner reads
  that only feed the rule once every winner row carries the count. Done
  when every winner row with award text carries its award's prize count and
  every surface labels from it.
- `prizeUsd` is parsed from the placement only, so it is null on the 22
  served winners whose own award names the amount (zk-gaming 5,
  ideatontelluscoop 3, buildonstellarchile 14), and vetIdea and
  hackathonBrief serve those winners' placement "Winners" with no amount.
  Probe: getHackathon `stellar-hacks-zk-gaming` serves `winners[0].prizeUsd`
  null beside `award` "1st Place - $5,000" (1.9.101, 2026-10-23).

Found 2026-10-23 by the dead-protocol guard round
(`improvements/rounds/2026-10-23-dead-protocol-guard.md`):

- DefiLlama slugs in LLAMA_MAP that stopped resolving, so their TVL froze
  and the listing check read could-not-check. `soroswap` reads
  `soroswap-amm` since 2026-10-31 (served fresh on 2026-11-09). `sentora`
  (a parent page now; its Stellar vaults are `stellar-defi-hub`, $80,769,055
  on 2026-11-11, where the row served $10,393,904 from 2026-08-10) and
  `templar-protocol` (a parent page since 2026-11-04; the row's listing is
  `templar-lending`) are remapped on branch `lane/r1111-tvl-availability`
  (#1912, sls-101), not merged. LLAMA_MAP now lives in
  `src/lib/status-checks.ts`, and a mapped slug missing from DefiLlama's list
  fails the enrich-tvl run. Done when: merged, deployed and the enrich-tvl
  execute has run; live, `/api/projects/search?q=sentora` serves
  `llamaSlugs` [stellar-defi-hub] with a figure dated that run, and
  templar-protocol serves [templar-lending].
- Three LLAMA_MAP keys matched no public directory row. `phoenix` and
  `normal` were remapped to their rows (both served with a DefiLlama link on
  2026-11-11); `whalehub` still matches no row (the enrich-tvl run warns "no
  project whalehub" every week).
- Rows DefiLlama lists on Stellar that LLAMA_MAP does not link, so their
  rows (and, since #1912, their project pages) serve no TVL. Found
  2026-11-11 by measuring the project page's old name lookup over all 1,008
  public rows: by exact name `huma` ($2,726,521 on Stellar), `k2-lend`
  ($8,800) and `alula` ($263); by name prefix, likely the same products,
  `untangled` (untangled-rwa $151,510), `vaquita` (vaquita-protocol
  $30,584), `xoxno` (xoxno-lending $138,660) and `balanced-network`
  (balanced-exchange $5,584). Each needs an identity check before a map
  entry. Not candidates: `stellar-defi-hub` (its vaults are Sentora's row),
  and `binance`, `gate-io` and `cex-io` (CEX reserves, excluded by rule).
  Benji's project page shows its Horizon supply at $1.00 a share while its
  API row has no tvlUSD.
- Estrela is served Live (basis repo-activity) with Allbridge Core's bridge
  routes copied in curate-projects, but its SCF page (#22 and #35) describes
  Allbridge's Soroban stablecoin AMM (allbridge-io/dex-soroban-contracts, last
  commit 2025-07-24), not the bridge. The round clears the copied routes and
  network matrix (it now serves derived networks, basis scf-award); its
  identity (a separate product, or a duplicate to fold) and its Live status
  are unreviewed.
- The research golden case `bridge-evm-to-stellar` still expects Allbridge as
  a current EVM to Stellar route, while docs-core.allbridge.io says Stellar
  support on the relaunched Core is unavailable pending audit (read
  2026-10-23); the projects-mode case `bridge-solana-to-stellar` was updated
  in the dead-protocol guard round.
- Agent-facing text still recommends the Allbridge Core SDK for moving USDC
  from EVM chains to Stellar (`src/lib/stellar-scout-skill.ts`, the Allbridge
  SDK bullet; `src/lib/integrations/curated-skills.ts`, slug allbridge-sdk),
  while docs-core.allbridge.io says Stellar is unavailable on the relaunched
  Core pending audit (read 2026-10-23).
- `view=compact` project rows do not carry `statusCaveat`; adding it gives
  every compact row a new null key.
- The TVL rule of the status checks cannot speak until enrich-onchain has
  stored 60 days of `onchain.quietSince`; today no row has more than 7 days of
  observed silence on record.
- The status checks see only the 18 of 1,005 public rows with a DefiLlama
  link; a dead product with no link (or a stale slug, above) is not checked.
- enrich-onchain writes `projects.onchain` without reading it back (only
  `codeInUse` is verified).


Found 2026-10-23 in review of the smart wallet O2 ship
(`improvements/rounds/2026-10-23-smart-wallet-o2.md`):

- searchHackathonBuilds: a q holding smart wallet (or smart account) and one
  other word has two concepts, so the half rule admits a build holding
  either one, and meta.counts grows: q=smart wallet payments matches 290
  where it matched 71 before spec 1.9.112 (a smart wallet for agents 274
  and 107, smart wallet game 100 and 28). The first rows hold the phrase or
  a passkey. No frozen set holds this shape. Measure it (a frozen set of
  phrase-plus-one-word queries, graded blind) before any rule, for example
  requiring the smart concept when q names it.


- Stored `versionStatus` lags the 2026-11-12 SDK table: 166 of 5,865 scanned
  repos (rows on soroban-sdk 27 and 28 stored "current", one stored before
  its JS read) differ from a recompute with the new table (full-corpus read of
  `/api/repos`, rounds/2026-11-12-toolchain-truth.md). The Scout statuses
  read through the table at request time; the stored value still feeds
  repoScore (current +0.20, supported +0.12) and is what the raw Payload
  `/api/repos` rows serve. A re-scan of those rows also lowers codeDepth
  by up to 0.05 (code-depth.ts credits a current versionStatus inside its
  0.20 baseline, scaled on the contract track by the clone factor). Fix: after spec 1.9.140
  deploys, dispatch `backfill-version-status.yml` dry, read the diff,
  execute, read back, then let the regrade lane pick up the scores.
- The JS SDK classifier reads a range with no dotted major as unknown:
  `jsSdkVersionStatusOf("@stellar/stellar-sdk@^13")` is unknown while
  `@^13.0.0` is deprecated (`src/lib/soroban-versions.ts`, the range regex
  needs a dot). Found by the cross-family review of spec 1.9.140; the
  2026-11-12 corpus holds `@^13`, `@14` and `@^14` among 15 undotted
  `@stellar/stellar-sdk` ranges. Fails safe (never a false deprecated).

## Owner decisions (safe default in brackets)

- An RWA registry row below toml-bidirectional (entity-toml, on-chain-home-domain,
  contract-metadata, on-chain-only) no longer lends a deployment, but still
  feeds the project's `products`, each record serving its level. Should a
  link that does not hold both ways also stop feeding products? [keep
  products, level served].

- SDK support floors: ours admit soroban-sdk 21 and later and @stellar/stellar-sdk
  14 and later as supported; the publishers support soroban-sdk's two newest
  majors (28 and 29 on 2026-11-12, rs-soroban-sdk README since 2026-05-06)
  and JS v17 and v16 (until March 2027). Adopting their windows moves
  soroban-sdk deprecated from 404 to 5,651 of 5,865 scanned repos and JS from
  1,041 to 2,531, and repoScore's deprecated penalty (x0.75) with them [keep
  our floors; the spec, basis and skill text say supported is not a
  publisher support claim].
- Tell the external tool that cites "1,285 on a deprecated soroban-sdk"
  that the count is Rust OR JS and to filter on `deprecatedBy` [draft only].
- Replace the production `GITHUB_TOKEN` (and `NEXT_PUBLIC_GITHUB_TOKEN` if set): on 2026-10-24
  GitHub answered 401 for the token the server reads with. Live judging reads now fall back to
  GitHub's unauthenticated limit; reads through GraphQL cannot: `/api/projects/<id>/github` for
  freighter serves each repo with `error` "401 Unauthorized - Invalid or expired token" [replace].
- Run the gone-repos execute before 2026-10-27 10:59 UTC [run].
- Check which GitHub token production holds for reviewSubmission's live
  read (`GITHUB_TOKEN`, else `NEXT_PUBLIC_GITHUB_TOKEN`). If it is the scan
  PAT's identity, the read's floor (no call under 1,500 left) and cap (240
  calls an hour per instance) keep the scan's budget. If it is unset, reads
  run unauthenticated at 60 an hour per egress address and mostly answer
  could-not-check [check before HackMeridian relies on it; no change].
- Turn on GitHub secret scanning and push protection; repository settings
  only the owner can change [on].
- Add Yield as a gap vertical [no].
- Post handoffs to Raven [drafts only until approved].
- Ask Raven to send a key and User-Agent, so its traffic is not held to
  per-IP limits [draft only].
- Rewrite git history to purge the raw query texts that commits before the
  admin-auth round left in `improvements/consumers/` (the files now hold
  counts only; see `rounds/2026-10-23-admin-auth.md`) [no rewrite].
- Set `ADMIN_ROUTE_SECRET` (32 or more characters) in the production environment, for scripted
  calls to the five `/api/admin/*` routes and `/api/import/airtable` through
  the `x-admin-secret` header [unset: admin session only].
- Allbridge's status stamp: human-verified 2026-09-05 rested on a 200 page
  and an SDK repo push while Allbridge Core on Stellar held $0 (DefiLlama's
  Stellar series reads $0 from 2026-08-21). Re-stamp it on Allbridge Next
  evidence, or withdraw it [withdraw to site-liveness, status unchanged,
  until the owner re-checks Next on Stellar].
- Rotate `PAYLOAD_SECRET`: until the admin-auth round, every blog preview
  put it in a URL (request logs, browser history). It signs every session,
  so rotating logs every admin and partner out [no rotation unless a log
  holding it is known to be readable by others].
- Lusty has two rows for one product: `lusty` (served Live on
  product-integration; the curation lane moves it to Pre-Release) and
  `lusty-finance` (Development, human-verified 2026-08-29), both linking
  lusty.finance and the same repo. Evidence read 2026-11-07: the repo README
  says "Network: Stellar Testnet", and the vault the live app calls
  (CBJZGTCF2PJVHX2BNFTFZ2L2LX6DWD5JMTLHNCVYTSOD3BLVSXZRUCJZ) exists on testnet
  and not on mainnet. Merge them into one row with a canonical pointer and one
  status [keep both rows, no merge, until decided].
