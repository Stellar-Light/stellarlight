# 2026-10-23: a team's own repo against an event's judging criteria

## Scope

HackMeridian 2026 (Lisbon, 25 to 26 October, deadline 12:00 Monday) judges
by category, in its record's own words (served by getHackathon as
`rules.judgingCriteria`): Genesis on problem clarity, MVP quality, Stellar
integration and continued development potential; Scale on milestones
against goals set at pre-event intake, SCF eligibility, production
readiness and ecosystem impact; an async review of the demo video, pitch
deck, GitHub repo and submission answers.

A team in the last hours wants to know, for its own repo, what evidence a
judge will find for each criterion and what is missing. Today
`GET /api/hackathons/review?link=` answers only for submissions stored from
ended DoraHacks events; a new repo gets a 404 pointing at getRepoTrust,
which serves only repos in the directory scan.

Done means: each category's criteria are data in the curated record, held
by a test to its description; each criterion maps to evidence from the
repo or to `checkable: false` with the reason; it works for a repo never
stored, through a bounded, cached, read-only GitHub read that cannot drain
the scan lane's token budget; stored reviews without the new parameter are
byte identical; spec, skill text, MCP tool text and changelog say so.

## Lane

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| J2: judging review | Claude Opus 5.5, high | own worktree, branch `lane/j2-judging-review`: `src/data/curated-hackathons.ts` and its test, a live-read and a judging module in `src/lib/` with tests, the review route and its tests, spec, changelog, version, contract artifacts, `scout-mcp/src/index.ts` tool text, `improvements/audits/2026-10-23-judging-review/`, this ledger | a commit on the branch, not pushed |

## Review

Not yet reviewed. The orchestrator holds the push; an independent review
on another model is due before it.

## Method and ship criteria (fixed before any result was read)

- (a) Ten real public Stellar repos that are not stored submissions
  (checked: each answers 404 on live reviewSubmission, 1.9.101, 17:30Z),
  hackathon-style and updated in 2026, picked from two GitHub searches
  (`soroban` and `stellar hackathon`, sorted by update) for a spread of
  Rust contracts, TypeScript apps and monorepos: repo-01,
  repo-02, repo-03,
  repo-04, repo-05,
  repo-06, repo-07,
  DocForum/docforum-escrow, Foryield/soroban-yield-vault,
  Presago-Labs/presago-contracts. Spares, used only if one of the ten
  turns private or disappears: repo-08, TTL-Legacy/TTL-Legacy.
  repo-15 answered 200 (stored), so it is not one of the ten; it
  serves the stored path with `hackathon`.
- (b) Hand labels first. For each repo, before the new code runs on it,
  record from GitHub's own answers (read with the gh CLI, one call per
  fact, read by eye): the Stellar packages its package.json and Cargo.toml
  files declare, test files, CI config files, the default branch's last
  commit date and commit count, releases, a demo URL in the repo's website
  field or README, and contract ids in the README. Stored in
  `improvements/audits/2026-10-23-judging-review/labels.json` with the
  time read.
- (c) Then run the review (`link=<repo>&hackathon=hackmeridian-2026`)
  through the real route handler, with the live GitHub read and no
  database (the store mocked to hold no submission). Compare each evidence
  item with the label. A false claim is: `found` for something the label
  shows absent; a value (package, path, URL, id, tag, date, count) the
  label does not show; or `not-found` for something the label shows
  present inside the scope the finding states. A repo that changed between
  label and run is re-read and the change recorded, not counted.
  **Bar: 0 false claims across the ten.** Every criterion the repo cannot
  show (problem clarity, milestones against intake goals, ecosystem
  impact) says `checkable: false` with a reason, in every response.
  `could-not-check` is allowed, never counted as agreement, and reported.
- (d) Byte identity: one stored submission (github.com/repo-16)
  with no `hackathon` parameter answers byte for byte what live 1.9.101
  serves, the review object and generatedAt taken from the live body and
  replayed through the lane's handler.
- (e) Time budget: every live read finishes inside its 4,000 ms budget
  (deadline plus 250 ms slack), measured cold and warm on each of the ten;
  and a test with a GitHub that never answers shows the read returns at
  the deadline with every item `could-not-check`.
- (f) Token budget: a test shows the read makes no GitHub call when the
  per-instance hourly cap is spent or the token's pool is under the floor,
  and answers `could-not-check`, never `not-found`.
- Any miss of (c) to (f) stops the ship; no tuning on the ten to pass.

## Log

- 2026-10-23 17:30Z (lane J2): `git fetch origin`; `git checkout -b
  lane/j2-judging-review origin/main`; HEAD d9bd53b5 (spec 1.9.101).
  `pnpm install --frozen-lockfile --prefer-offline`: exit 0.
- 17:31Z: candidates checked on live reviewSubmission (apiVersion 1.9.101
  at start and end): 12 answer 404, repo-15 200.
- 17:34Z to 17:41Z: hand labels from GitHub's own answers (gh CLI, one
  call per fact, read by eye), written to
  `improvements/audits/2026-10-23-judging-review/labels.json` before any
  live-read code existed. repo-02 turned out to be
  an empty repository (no commits); it stays in the ten as pre-registered.
- 17:45Z: data test written first: fails 2 of 12 on the base record
  (`failing-first-data.txt`), passes with the criteria added.
- 18:00Z: route tests: 4 of 10 fail on the base route, the
  "exactly as before" test passes on both (`failing-first-route.txt`).
- 18:03Z: live SCF round state read from live scfPitch (stellarlight.xyz,
  apiVersion 1.9.101): Round 46 in Submission, deadline 2026-11-08; used as
  the mocked fetchScfRounds so the run calls only GitHub.
- 18:03:54Z to 18:04:34Z, pass 1: `run-measure.sh measure-1 measure` (the
  real GET handler, live GitHub read with the operator's token, no
  database). All 10 answered 200. Live read 527 to 1,064 ms (median 809),
  handler cold 529 to 1,075 ms, warm (cache) 0 to 4 ms. Token: 4,660 of
  5,000 left before the run.
- Pass 1 hand comparison, 90 evidence items (9 per repo) and 30
  not-checkable criteria (3 per repo, each with its reason):
  - **2 false claims, both test-file counts** (the pre-registered rule
    counts a count the label does not show):
    repo-04 served 1, the tree has 2
    (`frontend/scripts/withdraw-test.mts` follows no rule the code
    knows); Foryield/soroban-yield-vault served 24, the tree has 23
    (`scripts/generate_matrix_tests.py`, a generator, matched the
    `_tests.py` form, which is not a Python test convention).
    **Bar (c) missed: the ship stops here.**
  - Every other value agrees with the labels: packages, SDK versions,
    contract crates, contract ids, CI files, releases, demo links, last
    commit dates and counts, the empty repo, and all 10 SCF items.
  - Label corrections, each recounted by eye from the dump, not from the
    API: repo-05 test files 26, not 28 (24 `*.test.*`, `test.rs`,
    `src/test/setup.ts`); repo-01 38 (label said about 35);
    DocForum/docforum-escrow 40 (label said about 40). DocForum's
    `go:go.mod` is true: `sdk-go/go.mod` requires
    `github.com/stellar/go-stellar-sdk`.
  - Changed between label and run, re-read and not counted:
    repo-01 gained 2 commits (141 to 143, last
    2026-10-23T17:40:55Z, what the review served); its README is
    unchanged (4,520 characters, the same three links).
  - Incomplete but not false: packages off Scout's list are not listed
    (Kivo's `@trustless-work/escrow`, flexipay's `stellar-tokens` family,
    DocForum's `@subql/types-stellar`); the finding says "Scout
    recognises".
- Diagnosis: the class is a test-file count from a name heuristic served
  as a total. The rule mixed conventions with guesses (`_tests.py`,
  `test-*.ts`). Fix: the rule becomes each ecosystem's documented test
  conventions only, the finding and spec name them, and `count` means
  files following them, a floor of the repo's tests. Not tuned to the ten:
  the same change drops repo-03 from 7 to 1 (its
  `scripts/_test-*.ts` follow no convention). Gate for the fix: a fresh
  held-out set, labelled before the run (below).
- Fix (test rule): conventions only, named in the finding and the spec;
  regression test `never counts a file that only looks test-named` fails
  with pass 1's rule (`failing-first-testrule.txt`: 1 failed of 16) and
  passes with the fix.
- Held-out set for the fix, picked by rule before any of it was opened:
  the two pre-registered spares (repo-08,
  TTL-Legacy/TTL-Legacy) and the next three unused repos of the second
  search, in its order (BudakGPT/apac-stellar-hackathon,
  Pathnomic/stellar-hackathon-starter,
  repo-09). Same bar as (c): labels
  first, 0 false claims. Test files are labelled two ways: every code file
  a reader would take for a test, and the files following the conventions
  the finding names; the served count is checked against the second, and
  the first is reported.
- 20:30Z to 20:45Z: held-out labels written
  (`labels-heldout.json`, before the run). Test files counted by
  `label_tests.py`, a Python re-implementation of the conventions the
  finding states, plus an eye scan of every path naming test or spec.
- 20:35:15Z to 20:35:36Z, held-out run 1 (current code): all 5 answered
  200; live read 695 to 1,001 ms, warm 0 to 1 ms.
- Held-out comparison, 45 evidence items and 15 not-checkable criteria:
  - **The test-rule fix held**: all 5 test counts equal the convention
    counts (79, 146, 0, 15, 1). The eye scan shows what conventions leave
    out (TTL-Legacy's `bug_fix_tests_1264...rs`, `waterfall_proptests.rs`,
    `setupTests.ts`; soroban-amm's `tests_issue_*.rs`, its
    `integration-tests` crate; Ek-isler's `scripts/e2e*.ts`), which the
    finding and the spec now call a floor.
  - **2 false claims, both repo-08, both counts over a
    partial manifest read** (12 of 38): `stellarPackages` count 1 where
    the repo declares 3 (`@stellar/stellar-sdk` in five package.json files
    and Python `stellar-sdk==16.1.0` sit in unread manifests; the finding
    did say 12 of 38 were read), and `contractCrates` count 9 where the
    repo builds 15 or more, with no word that 15 Cargo.toml files were
    unread. **Bar missed again; the ship stays stopped.**
  - TTL-Legacy also read 12 of 14 manifests; the two left
    (`libs.versions.toml`, `Package.swift`) declare nothing Stellar, so its
    counts are right.
  - Every other value agrees, the SCF item included.
- Diagnosis: the class is a count served as a total over a partial read.
  Fix it for every item that can be partial: stellarPackages and
  contractCrates count null when a manifest went unread, and contractCrates
  says how many Cargo.toml files were not read; contractIds count null
  (and "at least") when the README was cut short; ciConfig count null when
  the tree was cut short; demoLinks never counts. Gate: a third set of five,
  fresh, labelled before its run.
- Fix (partial-read counts): regression test `never serves a count over a
  partial read, and says what was not read` fails with the old counts
  (`failing-first-partial-counts.txt`: stellarPackages expected 1 to be
  null) and passes with the fix.
- Third set (the gate for both fixes), picked by rule before any of it was
  opened: the first five repos of the first search (`soroban`, by update)
  not yet used and not stored, in its order: repo-10,
  nirium-protocol/nirium, repo-11,
  repo-12, Stellar-Cost-Labs/soroban-cost-estimator
  (repo-15, stored, is skipped by the rule). Labels first, then one
  run; the bar is 0 false claims and nothing is tuned after it.
- 20:42:30Z: third-set labels written (`labels-third.json`, before the
  run). 20:42:29Z to 20:42:50Z, third-set run 1: all 5 answered 200; live
  read 635 to 1,019 ms, warm 1 to 2 ms.
- Third-set comparison, 45 evidence items and 15 not-checkable criteria:
  - **Both fixes held.** Test counts equal the convention counts (19, 37,
    375, 85, 18). Partial reads are said and uncounted: nirium read 12 of 19
    manifests and trustlend-stellar 12 of 21; their `stellarPackages` and
    `contractCrates` counts are null, the findings say how many were not
    read, and nirium's `contractCrates` is could-not-check (its only
    Cargo.toml was not read). Every listed value is declared in the repo.
  - **1 false item: repo-11 `demoLinks`** lists
    `https://www.conventionalcommits.org` and
    `https://stellar-intel.vercel.app/docs` as labelled demos. The label
    window borrowed the line above: in a badge row, the Conventional
    Commits badge took the label of the "Deployed on Vercel" badge on the
    previous line, and the docs link took "a live API playground" from the
    sentence wrapped above it. **Bar missed; the ship stays stopped.**
  - Every other value agrees, the SCF item included.
- Diagnosis: the class is a demo label lent to a link from text that is not
  its own. Fix: a link's label is only its own text (markdown label, a
  badge's alt text, an HTML anchor's text with tags stripped) and the words
  between it and the previous link on its own line; no previous-line
  window; "live" counts only as "live demo", "live app" and the like, or
  as "Live:". Expected cost, stated before re-running: a demo named only on
  the line above its link (Foryield's "The demo UI serves this instance
  at") is no longer found and reads could-not-check. Gate: a fourth fresh
  set, labelled before its run.
- Fix (label window): regression test `never lends the line above to a
  link, in a badge row or a wrapped sentence` fails on the previous window
  (`failing-first-labels.txt`: 2 failed of 17, the second being the
  fixture test that now encodes the stated recall cost) and passes after.
- Fourth set (the gate), picked by rule before any of it was opened: the
  next five repos of the first search, in its order, not yet used, not
  stored, and listed with a description (MarbleHydromancer/pkikkdwq and
  rankemissarygate/bbxnkgqo, random names with no description, are skipped
  by that rule): Heliobond/frontend,
  repo-13, repo-14,
  Specula-Labs/specula-contracts, Specula-Labs/specula-app. Labels first,
  one run, nothing tuned after it.
- 20:50Z: fourth-set labels written (`labels-fourth.json`, before the
  run). 20:47:54Z to 20:48:15Z, fourth-set run 1: all 5 answered 200; live
  read 719 to 1,007 ms, warm 0 to 2 ms.
- **Fourth-set comparison (the gate): 45 evidence items, 0 false claims;
  15 not-checkable criteria, each with its reason.** Test counts equal
  the convention counts (145, 28, 102, 1, 3). Demo items: two websites
  found; two not-found where the README links only code hosts, docs,
  explorers and local addresses; two could-not-check where unlabelled
  links exist (wraith's API instance and docs; specula-app's badge link to
  nextjs.org, on README line 8). specula-app's not-found Stellar packages
  is true: its one package.json declares none. **Bar (c) met on the fresh
  set.**
- 20:48:50Z to 20:50:23Z: the 20 earlier repos re-run on the final code
  (seen sets, a regression check, not a gate). Item diff against their
  first runs (`diff_runs.py`): 162 unchanged, 18 changed, **0 new false
  claims**. Changes: demoLinks never counts (7 items: count to null);
  partial reads uncounted and said (flexipay, TTL-Legacy, soroban-amm);
  the three fixes (Foryield tests 24 to 23; stellar-intel demo links down
  to its website; soroban-amm counts); stated costs (InternStellar tests 7
  to 1 under conventions; Foryield's demo, named only on the line above its
  link, now could-not-check; nirium's "Live usage" page no longer a demo);
  a precision gain (quilltip's "Watch Demo" badge link, which its label
  lists); and repo movement (flexipay 143 to 196 commits, 38 to 46 test
  files, between runs).
- Totals over the 25 repos: 225 evidence items on first runs, 5 false
  (2 test counts, 2 partial-read counts, 1 demo item with 2 wrong links),
  each fixed by class with a failing-first test; the fourth set, fresh and
  run once on the final code, 45 items with 0 false; 75 not-checkable
  criteria, each with its reason. Live read cold 527 to 1,064 ms (all 50
  cold reads inside the 4,000 ms budget), warm 0 to 4 ms.
- 20:51:21Z: two live stored reviews captured read-only, no hackathon
  parameter (apiVersion 1.9.101 at start and end):
  `link=github.com/repo-16` (13,088 bytes, sha256 8f9f396b...) and
  `link=https://github.com/repo-15` (11,357 bytes, sha256
  e1a162aa...). `stored-replay.test.ts` puts each body's review object and
  generatedAt back through the lane's GET handler: **2 of 2 byte
  identical.** Check (d) met.
- Checks (e) and (f): the deadline test returns at a 300 ms budget within
  the 250 ms slack; the cap and floor tests make no GitHub call once the
  hour's cap is spent or the pool is under the floor, and answer
  could-not-check (repo-live-read.test.ts).
- Correction (append-only): the totals line above gives the first runs'
  timing. Over all 45 cold reads (the 25 first runs and the 20 re-runs)
  the live read took 527 to 1,205 ms (median 792, 90th percentile 1,001)
  and the handler 529 to 1,212 ms; warm 0 to 5 ms; all 45 answered 200.
- Write set, beyond the lane line above: `src/lib/github.ts` (an exported
  `githubToken()`, the app's existing order), `src/lib/__tests__/
  rate-limited-429.test.ts` (the review route joins the 429 guard, which
  needs its query), `src/lib/__tests__/spec-enum-parity.test.ts`,
  `public/skills/references/api-reference.md`, `scout-mcp/README.md` and
  two Next items and one owner decision in `improvements/TODO.md`.
- 20:54Z, full suite (CI's command):
  `npx vitest run src/lib/ src/components/ src/app/ src/collections/
  src/data/ --maxWorkers=4 --minWorkers=1`: first run 1 failed of 2,702
  (the 429 guard did not list the review route); after moving the window
  check before any store work and listing the route: 216 files, 2,703
  tests passed. `npx tsc --noEmit`: exit 0. `pnpm contract:write`, then
  `CONTRACT_BASE=origin/main pnpm contract:check`: all checks pass;
  changelog-contract-check passes. `pnpm raven:gate --raven <clone>`:
  exit 0, **Raven would ACCEPT 1.9.104**, accepted totals kept, 0
  hit-to-miss, 2 gains (`raven-gate.txt`). Biome on the lane's files: 0
  errors (7 warnings, all `noExplicitAny` on existing lines of
  `src/lib/github.ts`); the repo-wide errors are in files this lane does
  not touch.

## Outcome

Built and measured; committed on `lane/j2-judging-review`, not pushed.
Every bar in the method holds on the final code: (c) 0 false claims on
the fresh fourth set and none new on the 20 seen repos, with every
not-checkable criterion said with its reason; (d) 2 of 2 stored bodies
byte identical; (e) every cold read inside its budget, and a test for the
deadline; (f) tests for the cap and the floor. Open: an independent review
on another model, the orchestrator's push and PR, a live re-check after
deploy, and the owner decision on the production token.
- Self-review before hand-back: an unstored repo held for malware served
  the stored builds' hold note, which says the GitHub link is withheld,
  while that response echoes the caller's own link. It now says Scout does
  not read the repo; the route test pins the wording (the old note,
  "so its GitHub link is withheld", fails it). Full suite again: 216 files,
  2,703 tests passed; tsc exit 0; byte replay 2 of 2.

## Review round 1 (appended 2026-10-23)

- Independent review (the orchestrator's reviewer): **GATE: fix first.**
  Verified: SSRF-safe (17 crafted links stayed on api.github.com with
  validated names), the token never logged, byte identity 2 of 2, the
  gate set 0 false over 45 items plus 4 of the reviewer's own repos at 0
  false, contract and Raven gate pass, the no-token path honest. Ten
  findings to fix, tests first: (1, high) the tree was read at ref `HEAD`,
  which GitHub resolves to a branch literally named HEAD when one exists
  (stellar/stellar-cli has one, 338 commits behind main); (2) a cut-short
  tree listing turned a README missing from the listed part into "no
  README"; (3) the raw-file size bound read compressed bytes and decoded
  the whole body; (4) one caller could spend an instance's hourly budget;
  (5) the website counted as a demo whatever it points at; (6) an npm
  alias version was nulled as if it were a language marker; (7) the
  criteria clause test held only through a count pin; (8) "ACCEPT 1.9.104"
  is stale (ships as 1.9.102); (9) the unread note blamed GitHub for every
  part; (10) committed labels, run bodies and fixtures named individuals'
  GitHub handles.
- The orchestrator merged origin/main into the branch (83a69cd9, spec
  renumbered to 1.9.102). This lane's worktree had meanwhile been checked
  out to another lane's branch (lane/lk-winner-scf-links), holding that
  lane's uncommitted edits, and the isolation guard runs version control
  only from that worktree. So this round works in a scratch extraction of
  83a69cd9, never touching that lane's files, and records its commit
  through object-level commands that touch only this branch's ref.
- Criteria for this round, fixed before any result: each finding gets a
  test that fails before its fix; then the fourth (gate) set and the
  reviewer's five (stellar/soroban-cli, stellar/soroban-examples,
  stellar/js-stellar-sdk, stellar/freighter, stellar/quickstart), the
  reviewer's five labelled by hand from GitHub before their run; bar: 0
  false claims, every not-checkable criterion said with its reason.

## Review round 1: work and results (appended 2026-10-23)

- Correction to the 20:54Z entry: "Raven would ACCEPT 1.9.104" was the
  number before the orchestrator renumbered the spec. The branch ships as
  1.9.102, and the gate re-run below answers ACCEPT 1.9.102.
- Finding 10 is the one exception to append-only: individuals' GitHub
  handles in the earlier entries above were replaced in place by
  pseudonyms (`repo-NN`, `owner-NN`, and `owner-04.example` for one
  personal domain); no other past line was edited. The same holds for the
  labels and run bodies (run files renamed to `repo-NN.json`), and the src
  fixtures are synthetic (`example.net`, `team/app`, a placeholder id).
  The map is kept in the operator's scratch, never committed, so
  `measure.test.ts` has no default list and needs `MEASURE_REPOS`.
  Organizations' repos keep their names. Two mentions on main that predate
  the lane (the review route's example link and the spec's example
  question) are not this lane's to change.
- 22:0xZ: the orchestrator reported this worktree clean on LK's branch at
  32801488 (`git status` empty, HEAD 32801488): `git switch
  lane/j2-judging-review` (83a69cd9). The scratch round was copied in
  (content-compared copy) and the old run files removed with `git rm`;
  LK's branch is untouched at 32801488. The commit below is an ordinary
  commit on this branch.
- 22:04:30Z to 22:05:54Z: the reviewer's five dumped with `dump.py`, which
  itself read the tree at the ref HEAD (the same trap); it now reads the
  newest commit's tree and contents at that commit. Labels written
  22:11:30Z (`labels-reviewer.json`), before any run on them. 22:11:52Z:
  live scfPitch read again: Round 46, Submission, deadline 2026-11-08,
  unchanged.
- 22:14:15Z to 22:14:38Z, reviewer's five, first run: all 200;
  stellar/soroban-cli answers as stellar/stellar-cli, read at main's
  90a3d42, not at the HEAD branch's 4ff88b7. 50 items, **1 false**:
  stellar/freighter's stellarPackages cited `@stellar/freighter-api@workspace:*`
  (its root package.json's resolutions) as an SDK version. The old
  `includes(":")` had nulled that value by accident; finding 6's fix let
  it through. Fixed test-first: no version is cited for a workspace, file
  or git reference, while an npm alias is. Also freighter's could-not-check
  sentence said no README link is labelled a demo, while its localhost
  pages are labelled "playground": the sentence now states its scope.
  22:18:06Z re-run: 50 items unchanged, freighter's sentence cites no
  version.
- 22:18:54Z to 22:19:17Z, fourth (gate) set again: 0 false; 44 items
  unchanged, 6 changed, all from the website split (a new `website` item,
  and Heliobond/frontend's demoLinks without its website), each agreeing
  with `labels-fourth.json`.
- 22:19:55Z to 22:21:24Z, the 20 earlier repos again: 0 false; 168
  unchanged, 32 changed: 20 new `website` items, 7 demoLinks moved by the
  split, and 5 changes from repos that moved, each re-read on GitHub:
  repo-01's README rewritten with no contract id (2,119 bytes at its newest commit)
  and 221 commits; nirium-protocol/nirium 38 test files and 185 commits;
  repo-08 1,083 commits.
- 22:25:08Z, fifth set picked by rule (the first search, `soroban` by
  update, the first five unused, described and about Stellar; all 404 on
  live reviewSubmission at 22:25:48Z), dumped 22:25:57Z to 22:26:53Z,
  labelled 22:30:40Z. Run 22:31:11Z to 22:31:32Z: 50 items, **1 false**:
  repo-18's demoLinks served its docs portal as a labelled demo ("Live
  Documentation Portal: ... specifications ... are hosted at" the link)
  from the cue word "hosted". Fixed test-first: "hosted" counts only as a
  label ("Hosted:", "hosted version"), and a link whose words say docs is
  never a demo.
- 22:46:49Z, sixth set picked by the same rule, 404 at 22:47:04Z, dumped
  22:47:13Z to 22:48:19Z, labelled 22:52:10Z. Run 22:52:41Z to 22:53:03Z:
  50 items, **3 false**, one class: the demo sentences spoke of every label
  a README uses. MMM-pay/payflow-frontend ("Livedemo:") and repo-21 ("Live
  at") got "No link ... is labelled as a demo or live app";
  nirium-protocol/nirium-core got "README.md links 2 page(s) its text
  labels as a demo" while it also calls a third link "the demonstration".
  Fixed test-first: both sentences now speak of what Scout reads ("Scout
  reads N link(s) as labelled ...; a link labelled in other words is not
  listed"; "Scout reads no demo or live-app label on README.md's N
  link(s) ..."). This change only narrows two sentences, so it can add no
  claim; it is gated by running all 40 again, not by a seventh fresh set.
- 22:54:36Z to 22:57:37Z, all 40 on the final code, in four processes of
  10 (one caller's share is 60 calls an hour): all 200; 400 items, **0
  false**. Against each repo's last checked run, 3 changes: repo-18's
  website (its owner set the field at 22:48:42Z, after labelling) and its
  demoLinks (found to could-not-check, the fifth-set fix), and
  nirium-protocol/nirium at 191 commits. 120 of 120 not-checkable criteria
  carry their reason. The 40 cold reads took 478 to 1,542 ms (median 988);
  all 85 cold reads of this round answered 200 in 478 to 1,842 ms. Every
  diff is in `runs/round1/diffs.md`.
- The ten findings and their tests (the tests for 1 to 6 and 9 fail on the
  old code, `failing-first-review1.txt`; 7 is a rule whose test passes on
  the old code too, see below; 8 and 10 are not code): (1) tree at the newest commit: "reads every
  part at the default branch's newest commit, never a branch named HEAD"
  and "reads no tree when the newest commit did not answer, and says so";
  (2) cut listing: "leaves the README unread, not absent, when the listing
  was cut short without it" and "reads the README items could-not-check
  over a listing cut short without it"; (3) "reads a raw file only to its
  byte cap, asking for no compression and cutting the stream" (on the old
  code the endless body crashed the worker); (4) "holds one caller to its
  share of the hour, leaving the rest to others"; (5) "reports the website
  as the website, never as a demo"; (6) "keeps an npm alias of the Stellar
  SDK as declared", then "cites no SDK version for a workspace, file or git
  reference, which names none"; (7) the count pin is removed and the data
  test applies a rule to the record (no criterion holds ", " or " and ");
  "rejects criteria merged into one entry, which the clause alone accepts"
  runs the clause check and that rule, both helpers inside the test file,
  on crafted records, so it passes on the old code as well: it shows what
  the rule catches, not a failure of the old code; (8)
  the gate re-run; (9) "lists a part that did not answer as unread, never
  as empty, with its own reason", "gives the tree's own reason when GitHub
  answers an error for it" and "says could-not-check for the items a part
  that did not answer holds"; (10) the redaction above.
- What a determined caller with many addresses can still do (finding 4).
  One caller is a partner key, or else the first x-forwarded-for address
  the platform passes, as the rate limiter keys it. With 4 or more
  addresses a caller can spend one instance's 240 calls in an hour (60
  each), and every other caller's live reads on that instance then answer
  could-not-check until the hour turns; serverless instances each keep
  their own count, so a burst spread over many instances can spend 240 on
  each. It must ask for distinct repos, since a repo read in the last 5
  minutes comes from the instance's cache and spends nothing. Two bounds
  hold whatever the addresses: the 20-a-minute window per address on
  hackathon requests, and the 1,500 floor. Every instance reads the same
  pool from GitHub's answers, and the first answer under the floor stops
  that instance's reads until GitHub's reset, so the scan token is never
  taken far below 1,500 (a read already in flight makes at most 3 more
  calls). A share counted across instances would need shared state, a
  store or a cache service; not built.
- Checks on the final tree: `npx tsc --noEmit` exit 0; `npx vitest run
  src/lib/ src/components/ src/app/ src/collections/ src/data/
  --maxWorkers=4 --minWorkers=1`: 219 files, 2,735 tests passed; `pnpm
  contract:write`, then `CONTRACT_BASE=origin/main pnpm contract:check`:
  all checks pass (origin/main 85843791); `pnpm raven:gate --raven
  <clone>`: exit 0, **Raven would ACCEPT 1.9.102**, accepted totals kept,
  0 hit-to-miss, 2 gains (`raven-gate.txt`); biome on the lane's files: 0
  errors (7 warnings, `noExplicitAny` on existing lines of
  `src/lib/github.ts`); byte replay of the two stored bodies through the
  final handler: 2 of 2 identical.

## Re-check 2 and fixes (appended 2026-10-23)

- The re-check of d7fc841b: **GATE: fix first**. The code fixes for
  findings 1 to 9 hold. Eight items to fix, below; the branch is squashed
  before push, so only the final tree matters.
- (1, high) The pseudonyms were reversible through commit SHAs: a GitHub
  commit search on a body's SHA returns the one repository. Every SHA of a
  pseudonymized repo is now redacted: `"commit": "<redacted>"` and "Read at
  the default branch's newest commit." in the bodies of repo-17 to repo-21,
  the `commit` of those repos in `labels-fifth.json` and
  `labels-sixth.json`, every "Read at commit" text in
  `runs/round1/diffs.md` (some cut mid-SHA there), and repo-01's commit in
  the audit README and in the 22:19:55Z entry above. Editing that past
  line is the same exception as the handles. Sweep: every 7 to 40
  character hex token in the lane's files was checked against the 20 SHAs
  known for pseudonymized repos (from every run and dump): none is left.
  The hex tokens that remain are organizations' commits (stellar,
  soroworks, Lumeeena, StellarCanary, MMM-pay, nirium-protocol), this
  repository's own commits, the Raven clone's commit, sha256 prefixes of
  the two stored bodies, test fixtures, and image URLs in the curated data
  that predate the lane. The local paths in `raven-gate.txt` now read
  `<worktree>` and `<clone>`.
- (2) A personal account's GitHub repo URL in repo-05's
  `otherReadmeLinks` (`labels.json`) now reads "a third party's GitHub
  repo". Every other github.com owner in the labels, bodies, diffs and this
  ledger is a pseudonym or an organization (checked with `gh api
  users/<owner>`).
- (3) "All 85 cold reads" rested on 55 committed rows. The 30 rows of the
  round's re-runs are now committed (`runs/round1/reruns/`): 85 rows, all
  200, 478 to 1,842 ms, median 1,030.
- (4) The finding-7 line in the round-1 entry above is reworded in place,
  as asked: its test exercises the rule, a helper inside the test file, on
  crafted records and passes on the old code too.
- (5) YouTube `si=` share parameters stripped. They sat only in item diffs
  (`runs/final/diff-ten-more.txt`, `runs/round1/diffs.md`); no body or
  label held one.
- (6) A README or manifest served as UTF-16 (a byte order mark) or holding
  NUL bytes was decoded as UTF-8, which hid every link and id: a false
  not-found. Such a file is now unread with the reason "not UTF-8 text",
  so its items say could-not-check; a manifest's reason no longer says
  "did not arrive" for a file that arrived. Test: "leaves a file that is
  not UTF-8 text unread, with that reason".
- (7) A 200 whose body stalled past the deadline was explained as "GitHub
  answered 200 for the newest commit". It now says the answer did not
  arrive within the budget (a 200 whose body would not parse says so).
  Test: "says a body that stalled past the deadline did not arrive in
  time".
- (8) Links inside HTML comments, which GitHub does not show, are no longer
  read, and both demo sentences name HTML comments in their scope. Fenced
  code blocks are read as before, and contract ids are still read from the
  whole file. Tests: "reads no link inside an HTML comment", and the scope
  in "does not call an unlabelled README link no demo" and "reports the
  website as the website, never as a demo".
- The three new tests and the two changed scope assertions failed on
  d7fc841b's code, 5 failures (`failing-first-review2.txt`). The spec
  (`demoLinks`, `repo.unread`) and the changelog entry say the same.
- 23:31:52Z to 23:34:37Z, all 40 repos on the re-check code: all 200; 400
  items, **0 false**. Against round 1's final runs, 3 items changed, each a
  repo that moved, re-read on GitHub: nirium-protocol/nirium at 6 releases
  (nirium-cli@3.0.0, published 23:18:40Z) and 193 commits, and
  soroworks/soroforge at 79 commits (`runs/recheck2/diffs.md`). The 40
  cold reads took 593 to 1,509 ms (median 947), rows in `runs/recheck2/`.
- Left as it is: individuals' product URLs (website and demo links),
  README contract ids, video ids and distinctive paths are still in their
  bodies and labels, and a web or code search on one can lead back to a
  repository. The review asked for SHAs, GitHub paths and share tokens. If
  the pseudonyms must not be reversible at all, the clean option is to drop
  individuals' bodies and labels from the committed evidence and keep the
  counts, since masking every value would leave nothing to check.
- Checks: `npx tsc --noEmit` exit 0; the full vitest command: 219 files,
  2,738 tests passed; `pnpm contract:write`, then `CONTRACT_BASE=origin/main
  pnpm contract:check`: all pass (merge-base 85843791); `pnpm raven:gate`
  (the spec text changed): ACCEPT 1.9.102, 0 hit-to-miss, 2 gains; byte
  replay 2 of 2; biome on the lane's files: 0 errors (the same 7 warnings
  in `src/lib/github.ts`); the branch's added lines hold no en or em dash
  and no individual's handle. `gitleaks git --log-opts="85843791..HEAD"
  --redact`: 1 finding, a false positive in history: commit aa779f2f's
  ledger line read "API:" followed by an individual's owner/repo as a
  generic API key. That line now names the pseudonym, and gitleaks over the
  branch's net diff, the content the squash keeps, finds no leak.

## Re-check 3 and merge (2026-10-24)

- Re-check of 0a8e460c (same reviewer, Claude Fable 5.1, high effort):
  GATE push. Every item verified; the final tree holds no account
  identifier (no handle, no commit SHA of a pseudonymized repo, no share
  token, no local path). Left as it is, by decision: individuals' product
  URLs, README contract ids and demo video ids stay, as product facts the
  house rule allows; a web search on one can still lead to its repo.
- Merge: main merged in at 4cb05ea2 (spec 1.9.108); this change is spec
  1.9.109. Two conflicts, both where each side appended at the same place:
  improvements/TODO.md (both kept) and the review route's tests (both
  blocks kept, each with its own closers). Main's award-category test
  requested the fixture repo by its original owner, which this lane had
  pseudonymized; it now requests the pseudonym. Checks on the merged tree:
  tsc exit 0; vitest (src/lib, src/components, src/app, src/collections,
  src/data) 222 files, 2,876 tests passed; contract:write no diff;
  contract:check exit 0; Raven gate ACCEPT 1.9.109; writer conformance and
  scripts types green.
- History: squashed into one commit before its first push, so no earlier
  commit holding an individual's handle reaches the remote.

