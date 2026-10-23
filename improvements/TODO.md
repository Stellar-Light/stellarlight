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
   State: not started.
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
   2026-10-27T10:59Z.
   State: the execute would mark the 56 `gone` (out of search and builder
   results; a lookup by name still answers, marked gone) and set the 2 back
   to `error` for a rescan, reading every row back; it has not run.
   Done when: the execute ran (dry run read first) and its read-back
   passed.

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
    State: fixed on branch `lane/dq1-dead-protocol-guard` (spec 1.9.108,
    placeholder), not pushed. The guard needs the enrich-tvl lane to store
    `llamaListing`; the Allbridge description and routes need a curate-projects
    execute; the dispatch steps are in the ledger.
    Done when: merged and deployed; the enrich-tvl and curate-projects lanes
    ran (dry run read first); live, re-checked by someone other than the
    author: every DefiLlama-linked row serves `statusChecks`, Allbridge serves
    the Allbridge Next description, `llamaSlugs` [allbridge-next], `tvlUSD`
    null, `routes` null and a clear listing check, and no other row carries a
    `statusCaveat` unless its DefiLlama protocol is deprecated or dead.

## Next

Found by the 2026-10-20 round's consumer-style QA round and contract audit
unless noted.

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
- Curated event pages say "live submission feed unavailable".
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

Found 2026-10-23 by the dead-protocol guard round
(`improvements/rounds/2026-10-23-dead-protocol-guard.md`):

- Two DefiLlama slugs in `scripts/enrich-tvl.ts` LLAMA_MAP no longer
  resolve, so their TVL freezes and the listing check reads could-not-check:
  `soroswap` (now `soroswap-amm`, Stellar slice $1,177,991 on 2026-10-23;
  stored tvlAsOf 2026-10-19) and `sentora` (now `sentora-curator`, which no
  longer lists Stellar; stored $10,393,904 at tvlAsOf 2026-08-10).
- Three LLAMA_MAP keys match no public directory row, so those rows carry
  no DefiLlama link and the status checks never see them:
  `phoenix-protocol` (the row is `phoenix`, Live; DefiLlama
  `phoenix-defi-hub` $47,473 on Stellar), `normal-stellar-amm` (the row is
  `normal`, Live, human-verified 2026-09-02; DefiLlama `normal` TVL $0, and
  normalfinance.io's own stellar.toml marks all ten of its currencies
  `status = "dead"`, read 2026-10-23) and `whalehub` (no row).
- Estrela is served Live (basis repo-activity) with Allbridge Core's bridge
  routes copied in curate-projects, but its SCF page (#22 and #35) describes
  Allbridge's Soroban stablecoin AMM (allbridge-io/dex-soroban-contracts, last
  commit 2025-07-24), not the bridge. The round clears the copied routes; its
  supportedNetworks (EVM, Solana, Tron, Sui) and its status are unreviewed.
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


## Owner decisions (safe default in brackets)

- Run the gone-repos execute before 2026-10-27 10:59 UTC [run].
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
