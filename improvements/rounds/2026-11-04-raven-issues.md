# Raven's open issues (2026-11-04)

Stellar Raven filed 19 open issues on this repo: #972 (2026-08-19) and
#1900 to #1917 (2026-11-02, from its HackMeridian evaluation). This round
re-probed each one on live 1.9.116, fixed the ones that reproduce in lanes
by write set, and audits each fix on another model family (Grok) for the
bug class as well as the instance.

## Probes (live 1.9.116, 2026-11-04)

17 of 19 reproduce. #972 no longer does: all four Fluxity repos link to the
Fluxity project. #1906 reproduces with `q=`; with `repo=`, a documented
parameter, explain answers 400 `no_query`, which lane R4 checks too.
Probe script: `session scratch: raven-issues/probes.py` (copied to the round
evidence folder with the outcome).

## Done means (the merge bar; owner, 2026-11-05: "i dont want to push out slop and slop ops")

A lane's PR merges only when all of these hold:
1. Failing-first tests: each new test fails on main and fails again when
   its fix is reverted.
2. The cross-vendor audit's re-check returns GATE push with no high or
   medium finding open; lows are fixed or written down with a reason.
3. `pnpm raven:gate` (re-ported replica) answers ACCEPT for any spec change,
   with 0 questions moving from hit to miss.
4. No regression on the three frozen benchmarks (v2 parity,
   priorities, embarrassment sweep): against the PR preview when a Vercel
   automation bypass token exists, else right after deploy with the revert
   ready.
5. The issue's own read-only reproduction flips live before the issue is
   closed; data fixes flip only after the owner's reviewed dry run and
   execute.
6. Every sentence a caller reads (API text, spec, changelog, pages) says
   no more than the code and data back.

## Lanes

Each lane works in its own worktree off origin/main f3b19008. Author: Claude
Opus 5.5. Audit: Grok 4.7 high in a clone with no remote, with a re-check of
every fix.

| Lane | Issues | Write set | Spec |
| --- | --- | --- | --- |
| R1 analyze-freshness | #1912, #1914 | analyze route and dimensions, funding snapshot writer | 1.9.117 |
| R2 builders-full-set | #1915 | builders route | 1.9.118 |
| R3 partners-truth | #1908, #1909 | partners match and detail routes, partner page | 1.9.119 |
| R4 repo-canonical | #1901, #1906 | repo search ranking, canonical map, explain | 1.9.120 |
| R5 stablecoin-issuer | #1900 | stablecoins route and writer | 1.9.121 |
| R6 curated-events-rfps | #1902, #1907, #1916, #1917 | curated hackathons, ideas | 1.9.122 |
| R7 directory-corrections | #1904, #1905, #1910, #1911, #1913 | curation maps, TVL writer, search filter | 1.9.123 |
| R8 scf-rounds | #1903 | SCF reader, intake list | none |

Versions are reassigned in merge order.

A read-only research lane measures HackProof (the HackMeridian 2026 dataset
behind contributor PR #1918) for a builds import.

## Log

- 2026-11-04: probes run; eight worktrees created with `pnpm install
  --frozen-lockfile --offline`; Raven cloned at fec1c79 for the routing
  gate; Grok answered a test call (balance restored); lanes launched.
- R2 e003f720 (#1915): the roster read capped at 300 under a -createdAt
  tiebreak, so the oldest profiles fell off; the route counted the capped
  array. Base 3 of 3 tests fail, fixed 3 of 3 pass. Its sweep found two live
  siblings of the class: repos/search with no q (total 200 of 13,810) and
  /api/status usage.byEndpoint (sums to exactly 10,000 of 25,806). The first
  went to R4 (owner of repo-search.ts), the second back to R2 with the
  route's own code-evidence read (limit 300 can serve a false []).
- A message meant for R4 reached R3 first; it was retracted before R3 acted.
- R8 2f4e4316 (#1903, Refs): Raven's recommendation to rebuild rounds from
  buildAwardRounds was declined on evidence: that list holds rounds entered
  and lost (Liqvid #30 and #44 read "Not Awarded"). Causes: a prefix matcher
  that stopped at the first rejected name, a pipeline-status pin, and a
  no-resurrect guard that read one card type. The SCF lane last executed
  2026-10-03 (dispatch only). New check scripts/eval/scf-round-counts.ts.
- R3 e210b039 (#1908, #1909): account failures now answer the documented
  503; one partner serializer; "verified" needs a recorded read. Its
  raven:gate run exited 2: the replica no longer parses Raven fec1c79.
- R1 6c658d05 (#1912, #1914): stale TVL rows are flagged and counted apart;
  a failed projects read answers 503 instead of storing an empty snapshot
  (13 empty snapshots stored since 07-14). Sentora froze because DefiLlama
  renamed its listing. Extension sent: the same failed-read class in
  analyze toolchain, leaderboard, clusters, and partial project-status
  snapshots.
- R9 launched: re-port the gate replica to Raven fec1c79 and name changed
  ported files on exit 2.
- The Grok review script is not executable; the first two audit runs failed
  at once and were re-run through zsh.
- Found in passing (R1): src/app/api/hackathons/builds/__tests__/route.test.ts:346
  fails on main since 982f5920; CI's vitest does not run that folder.

- R6 5cb5821f (#1902, #1907, #1916, #1917): rubric, Q4 roster with a drift
  check (scripts/check-rfp-roster.ts), publishedBrief links, Istanbul event.
  Coordinator spot checks, read live 2026-11-04: hackmeridian.com/build
  weights 20/20/15/15/10/10/10 with the track-dependent first criterion; the
  RFP Track page says "New Q4 RFPs are coming soon" and names no brief; the
  Rise In page says September 19 to 20, $15,000, "Presented by Stellar"
  (its raw start 2026-09-18T21:00Z is midnight on the 19th in Istanbul, so
  the issue's 09-18 is a UTC reading).

- Owner decisions (2026-11-04): HackProof accepted as a source; import the
  97 records whose repo names the event (plus nest); show the six
  placements as secondhand; split #1918; a review comment on #1918 is
  drafted for approval (session scratch: r1104/pr1918-comment.md).
- HackProof research (read-only): 98 of 179 repos name HackMeridian; 25 of
  25 sampled contracts exist and were created in the window; stack names 36
  of 36; #1918 would badge 10 projects by shared org, 2 wrongly; no
  readable page names a winner. Report: session scratch: hackproof/research/REPORT.md.
  Lane H2 launched to build the import.
- R5 fc7456f3 (#1900): issuerOfRecord from the issuer account's
  home_domain toml (counted only when the toml lists the account), an
  assetType filter, verifyClaim issued reads the issuer of record. The
  replica stand-in at its own pin b1dc866 accepted 1.9.121.
- R1 cc693e0f: the failed-read class fixed on leaderboard, clusters and
  analyze toolchain; partial project-status snapshots refused.
- R2 965e8181, 9fe6c263: codeEvidence null on a failed or skipped read;
  usage.byEndpoint counted by a DB-side aggregate.
- Grok audits, round 1: R3 do not push (2 high: a date-only toml read
  counts as read on the API but not on the page; searchProjects' anchor join
  still serves curated seps as profiled; 7 more); R8 do not push (1 high:
  the prefix matcher takes the first hit with no uniqueness, so Nest beats
  Nest Protocol; curated removals not sticky; a test that passes with its
  fix reverted); R6 do not push (2 high: the roster check passes on a page
  it did not parse and is never run; the Istanbul detail contradicts its
  record). Every finding went back to its lane; the same reviewer
  re-checks.

- R7 debbb04e (#1904, #1905, #1910, #1911, #1913) and R4 d122b693,
  d1ea2d54, 8c8b07a5 (#1901, #1906, the no-q window): both reported; Grok
  audits running. R4 froze its query set before any code change and
  measured, then rejected, a global first-party or repoScore ranking (it
  moved 14 and 17 expected repos down). Coordinator check, live: stabble.org
  now serves "Best Crypto Casinos Canada 2026: Tested & Ranked | Stabble";
  www.hanawallet.io answers 200; hana.money is unreachable from this host,
  so its redirect is left to the CI dry run.
- Grok audits, round 1, continued: R2 do not push (private builder profiles
  listed and counted: the filter excludes a "hidden" value the field does
  not have; the /builders page shows a failed read as 0 repos and 0
  commits; 9 more, mostly silent caps, so one shared read-all helper and an
  allowlist guard test for literal find limits were asked for); R1 do not
  push (pages show invented TVL figures on a failed read: 1,688,000,000 and
  625,861,896 hardcoded; analyze serves zero events on a failed DoraHacks
  read, cached 600 s; future or unparseable TVL dates read as fresh; 7
  more); R5 do not push (verifyClaim's issuer match is containment, so
  "Ltd" or "Cambridge" would confirm an issuer; a dropped toml listing keeps
  the old issuer with a fresh date; the scheduled refresh would write the
  new identity fields with no reviewed dry run, so the write ships behind
  an off-by-default switch; 7 more). Every finding went back to its lane.

- R9 bf012474: the gate replica re-ported to Raven fec1c79; its self-check
  passes and an exit 2 now names the changed Raven files; live 1.9.116
  ACCEPT with 0 moved. Grok audit running.
- #1918: the owner-approved review comment was posted
  (issuecomment-6644107068).
- Owner, 2026-11-04: queue a prevention round to start after this round's
  PRs merge (plan under "Next round" below).

## Next round (owner-queued 2026-11-04): prevention

Inventory first (2026-11-04): 126 workflows and about 20 guard artifacts
exist. The ones that should have caught this round's classes either check
shape or fill rather than meaning, cover a narrow hand-picked set, or stopped
publishing: the four nightly detectors (api-drift, field-population,
record-completeness, verify-claims) report 0 failures while 17 issues
reproduce; scripts/check-sum-invariants.ts runs weekly and on PRs but holds
17 invariants (hackathon, RWA and toolchain counts only) and its workflow
never commits the artifact (dated 2026-09-07); endpoint-agreement checks 6
entities for resolution facts only; check-links lists only proved-broken
URLs (404, 410, DNS, refused), so a domain that redirects to another
business or now serves a casino page reads as healthy; answer-dating,
artifact-agreement, consumption and curated-canonical artifacts are 7 to 9
weeks old. So the round extends what exists and builds new only where
nothing does.

Compared with Raven's own instruments (read 2026-11-04 at fec1c79): its
headline guard is an answer-accuracy battery of goldens graded against
primary sources; every golden carries `truth.asOf` and `truth.reverifyBy`,
and `eval:qa:lint --stale` fails once a date is past due; source sentinels
re-read each golden's own primary source and test one anchor (present,
absent, or a count, with a guard pattern so an empty page never passes),
and a drift queues re-verification; a consistency register holds
cross-case contradictions and numeric invariants; a lifecycle registry and
an independent review close every reopened case. Ours check our API
against itself or our own curation (the truth battery's slices D to F use
curation as the answer), so the defects Raven filed, each a comparison
with a primary source (the SCF site's round counts, the RFP page, an
issuer's stellar.toml, a domain's redirect), are invisible to them by
construction. The round adds that layer first:
0. A facts register: every curated fact (curated events, ideas, curation
   map corrections, the stablecoin and RWA registries, partner
   capabilities) carries source, asOf and reverifyBy; a CI lint fails when
   reverifyBy is past due. Source sentinels per fact (R6's
   check-rfp-roster and R8's scf-round-counts are the first two) re-read
   the source and queue a re-verification on drift.

Then:
1. Widen check-sum-invariants into the live invariant sweep: paging adds up
   to `total`, filtered rows appear unfiltered, parts sum to totals (usage
   byEndpoint and last7d, TVL fresh and stale), dates within their stated
   cadence; commit its artifact.
2. Widen endpoint-agreement to list versus detail equality for every entity
   type (the partners seps case), and null versus `[]` with no read stamp.
3. Extend check-links with moved-business detection (cross-domain redirect,
   title or fingerprint change against the stored one), and give its
   findings a consumer (the TODO queue or the repair lane).
4. New, nothing exists: fault injection over every API route (each read
   throws in turn, a documented 503 required).
5. New: a fail-before check in CI and CI running every test folder.
6. New: a guard of the guards: every *-latest artifact must be younger than
   its lane's cadence, or it reds.
7. New: a daily read of Raven's findings folder for this repo into the queue;
   today's issue probes kept nightly.
8. Promote the private batteries (v2 parity, priorities, the
   embarrassment sweep) to scheduled runs with frozen goldens and reverifyBy
   dates, kept out of the public repo; results reach the ledger.
9. Make the cross-vendor review a check, not a habit: a PR cannot merge
   without a recorded review verdict for its head commit (today every one
   of the round's eight lanes passed its own tests and failed its Grok
   audit).
10. Static guards in the check-no-dashes allowlist pattern (provenance
   wording, substring identity, hardcoded fallback figures, empty catches),
   next to the literal-limit guard lane R2 adds this round.
11. New scheduled writers ship switched off until a reviewed dry run, and a
   data-age check covers dispatch-only lanes.

- Benchmark, frozen v2 parity (e8414b70), live 1.9.116, 11-04
  22:52Z: 49 of 55 fully served (working 29/34, held out 20/21), the same
  six misses as 10-31 and no verdict change. Real gaps: L2-04 (build search
  64 RWA builds, analyze 65), L5-02 (no upcoming events), L5-03 (no judging
  criteria for Stellar Hacks: ZK), L7-02 (review without a category
  denominator). L5-01 is a manual check; L10-05 is a grader false positive
  (its must-not-include regex matched resolve's own disclaimer; resolve
  finds Lumenswap). Run: session scratch: bench-v2-1104.
- L5-02, L5-03 and L7-02 went to R6; L2-04 to a new lane R10
  (count-consistency), which also adds a cross-operation count test.
- Owner, 2026-11-05: Stellar-presented university challenges belong in the
  curated feed (Waterloo goes in, verified from the organizer page).
- R4 and R7 Grok audits: do not push (R4: search substitutes a renamed
  repo even when the old name has a row; R7: a testnet-only AMM counted as
  an independent Live venue; the curation cron would write with no dry run;
  stabble.org's casino page passes as a product). R9 audit: do not push
  (the leak check misses a concrete id followed by "/"; the policy parsers
  are regex over source that can return a short list; check-raven-drift
  hardcodes four exclusions from 2026-07-21, so it reports Raven's
  deliberate exclusions as drift). All went back to their lanes.
- Queued R11 (after R9's fixes land, and only once the four newer
  operations are clean on their own benchmark lanes): measure with the
  replica whether changes that make our spec more accurate on their own
  merits (winnersOnly typed as the boolean it is, generic routing words
  trimmed) remove the seven poor-fit captures that keep Raven from
  exposing them. Changes that make the contract less precise to pass
  Raven's scorer (dropping the category enum while the server validates
  it) are out. An evidence note to Raven only with the owner's go.

- Round-1 fix reports: R3 (10 findings, 4 commits), R7 (11, bce4a85d), R9
  (6, 3 commits; findings 1 and 3 kept at parity because Raven's own
  emitted-text guard and clause splitter at fec1c79 behave the same), R5
  (10, 2 commits; the issuer-of-record write ships behind
  vars.STABLECOIN_ISSUER_OF_RECORD_WRITE), R4 (6 of 7, finding 7 needs a
  measured re-scan), R8 (8, 5 commits; finding 8 needs nullable
  scfAwarded, a contract change), R1 (9, 3 commits; the hardcoded TVL
  fallbacks are gone), R6 (9 plus the three benchmark items; Waterloo
  added), R2 (11, 5 commits plus a fixed-limit guard test with a
  75-entry allowlist; the Builders collection's read access was open to
  anyone and is now admin-only for private profiles). R10 482c7eb7: the
  RWA 64 versus 65 was one submission entered in two ideathons; analyze
  now counts distinct submissions (six category totals and indexedBuilds
  move). H2 (five commits, spec 1.9.125): 97 rows, 6 secondhand
  placements, 328 of 332 contracts kept after our own check, coverage
  `partial`, the daily sync derives fields for curated rows.
- 2026-11-05: Grok's balance ran out again (HTTP 402) and the four round-2
  re-checks (R3, R5, R7, R9) died mid-run with no verdict. Owner: use
  Fable for re-checks. Eleven Fable reviews launched in no-remote clones
  (session scratch: r1104/reviews/<lane>): nine re-checks against the round-1
  findings and first audits of R10 and H2. Grok's round-1 reports and the
  briefs are saved at ~/.config/stellarlight/rounds/2026-11-04/.

- Fable reviews, first results (all do not push): R3 (round-1 8 of 9
  fixed; new: the toml enrichment writes a recorded "declares none" on
  shapes its parser cannot read, wiping correct values; 408 and 409 read as
  "off"), R5 (all 10 fixed; new HIGH: one issuer host that stalls mid-body
  crashes the whole stablecoin refresh, even with the write switch off; a
  200 that is not a toml clears a name; accented names split), R9 (4 of 6
  fixed, 2 kept at Raven parity with the reviewer's agreement; new: the
  drift guard's could-not-check never reaches its artifact, and the ledger
  has read no Raven drift since 2026-08-28 because it reads a file name the
  workflow no longer writes), R10 (first audit: a multi-entry submission
  counts as both winner and not placed; the q path is a third mismatch
  between search and analyze), R1 (9 of 10 fixed; new HIGH: removing the
  fake TVL figures crashes the project page's TVL card on null, and with
  no error boundary the page blanks; the admin scorer still writes the
  hardcoded figures into relevance scores). All went back to their
  authors; the same Fable reviewer re-checks each.

- Fable reviews, complete: R7 GATE push (11 of 11 round-1 fixed; three
  mediums closed before the PR per the merge bar: the nightly sweep would
  name the wrong repair for Blend's unread parent, stabble keeps citing
  the casino page as status evidence, the type filter has the same
  shadow-total bug). Do not push, back with authors: H2 (two "Nomad
  Vault" rows dedupe to one, so 96 are served of 97; builder profiles call
  HackProof rows DoraHacks submissions; the event-name rule ignores the
  year; nothing guards the 2 MB cache limit for the builds index), R8 (the
  "rounds unread" count can never be nonzero; generic names like Lend can
  still join by prefix; item 8 now to be queued in TODO), R2 (all 11
  fixed; /builders/<login> renders another person's profile by substring;
  the guard misses shorthand collection properties, so sitemap's six
  5,000-row caps went unseen; the home page trends on the newest 300 of
  905), R4 (all 6 fixed; the exact-name rule let a copy named soroban-rpc
  outrank stellar/stellar-rpc: coordinator's decision, an exact owner/name
  wins, a bare name that fires a canonical entry defers to it), R6 (all 9
  fixed; Waterloo's cover host is not in the image allowlist; ideaton2026
  would serve one track's requirements as the event's).

## Outcome

(open: lanes wrapped up as PRs on 2026-11-05 at the owner's request, ten as drafts pending a final re-check; R7 ready after its re-check passed.)
