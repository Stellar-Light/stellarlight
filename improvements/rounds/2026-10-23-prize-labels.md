# 2026-10-23: a prize category served as a winner's award

## Scope

Every Stellar Hacks: Real-World ZK winner (event `stellar-hacks-zk`) is
served `award: "$10,000 XLM Prize"`, the title of the award its five
placements sit in, beside its own prize (`placement` "3rd Place - $1,250
in XLM", `prizeUsd` 1250). Live 1.9.101, getHackathon read 2026-10-23
18:03:43Z. An agent reading `award` reports each winner as having won
$10,000. Spec 1.9.26 documented the field as a category; the served value
still sits under a key that reads as the winner's own award.

Done means: text that names an award category several placements share is
never served as a winner's `award`; it is served beside the winner's own
prize under a key that says what it is, on every surface that serves
`award`; award text that is a winner's own prize is served as before.

## Lane

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| PL: prize labels | Claude Opus 5.5, high | own worktree, branch `lane/pl-prize-labels`: the DoraHacks integration helpers, the builds search, getHackathon, getHackathonSubmission and review code paths and their tests, the builder page line, spec, skill reference, changelog, version, contract artifacts, `improvements/audits/2026-10-23-prize-labels/`, this ledger | a commit on the branch, not pushed |

Draft PR #1871 moves the getHackathon route body into
`src/lib/hackathon-detail.ts`; edits to that route stay small and in
separable hunks.

## Review

Not yet reviewed. The orchestrator holds the push; an independent review
on another model is due before it.

## Method and ship criteria (fixed before any replay or hand check was read)

The rule, from the brief: an award text is a category when, within one
event, winners carrying it hold different placements (amounts are parsed
from placements, so different amounts are different placements).

- (a) No pool or category as a winner's prize. On every event the sweep
  lists, every served row of a winner (searchHackathonBuilds rows,
  getHackathon `winners`, `submissions` and `stats.hiddenWinners`,
  getHackathonSubmission top level and `entries`) serves that text only in
  the new `awardCategory` field, and `award` null. Checked over the replay
  bodies, every row of the listed events.
- (b) Own prizes unchanged. Every other row that carries award text keeps
  `award` byte-identical and serves `awardCategory` null.
- (c) Replay, builds search and getHackathon for 10 events. The real GET
  handlers over one capture of the live API (read-only GETs 2 s apart,
  apiVersion at the start and the end), the clock pinned, no database,
  run on the base tree before any code change and on the lane's tree.
  Every difference is listed. Allowed: (1) the key `awardCategory` added
  beside every served `award`; (2) on rows of the listed events, `award`
  null and the text in `awardCategory`. Any other difference fails.
  Events: the seven the investigation found (below) and three whose award
  text is each winner's own prize: `stellar-hacks-zk-gaming` (one award
  per winner), `buildonstellarchile` (the same text on 10 winners of one
  placement, and a hidden winner) and `stellar-latam` (two co-winners of
  one prize).
- (d) Hand check, 10 winners against DoraHacks' own winner assignments for
  their events (`/api/v1/hub/hackathon-winner-assignments`, read-only,
  2 s apart): one changed winner from each of the seven events and the
  three unchanged events. Pass: for a changed row the award entry holds
  several differently named prizes and the served `placement` is the
  prize this build holds; for an unchanged row the award entry holds one
  prize and this build holds it.
- (e) Every new test fails with the fix reverted; the failing run is kept.

## Log

- 2026-10-23 18:03Z (lane PL): `git fetch origin`; branch
  `lane/pl-prize-labels` off origin/main e94ef292 (spec 1.9.101). Live
  read of the bug, `/api/hackathons/stellar-hacks-zk`, apiVersion 1.9.101:
  five winners, `award` "$10,000 XLM Prize" on each, placements 1st to 5th,
  `prizeUsd` 5000, 2000, 1250, 1000, 750.
- Paused by an API rate limit; resumed in a new worktree (the first was
  cleaned up with no changes). 20:27Z: `git checkout -B
  lane/pl-prize-labels origin/main`, HEAD 724f4e6a (spec 1.9.101, a data
  refresh on top of e94ef292).
- Where the field comes from: `fetchWinnerPrizeMap`
  (`src/lib/integrations/dorahacks.ts`) gives each winning buidl
  `placement` = the prize's name and `award` = the title of the
  `award_list` entry holding the prize; `scripts/sync-hackathon-builds.ts`
  stores it as `award`. On an event whose organizer put several placements
  in one award, that title is the category, often named for the whole pool.
- Surfaces that serve `award`: searchHackathonBuilds rows; getHackathon
  `winners`, `submissions`, `stats.hiddenWinners` and the
  `stats.winnersNote` text built from them; getHackathonSubmission and
  reviewSubmission (`submission`) top level and `entries`; the builder
  profile page (`/builders/{username}`, "placement · award"). Not served:
  vetIdea prior art, hackathonBrief and its vet block (placement only),
  analyzeHackathonSubmissions and compareHackathons.
- 20:27 to 20:29Z: sweep, getHackathon for all 27 listed events, one GET
  every 2 s, apiVersion 1.9.101 before and after. Same award text on
  winners of different placements: 7 events, 34 winners
  (`stellar-hacks-zk` 5, `stellar-agents-x402-stripe-mpp` 5,
  `scaffoldstellar` 5, `stellar-hacks-blend` 3,
  `stellar-hacks-kale-reflector` 10, `stellar-hacks-paltalabs` 3,
  `build-on-stellar` 3). Award text that is each winner's own prize: 32
  served winners in 5 events (zk-gaming 5, ideaton2026 6,
  ideatontelluscoop 3, buildonstellarchile 14, stellar-latam 4) and one
  hidden winner. No award text: 5 events with winners (alebrije2026 and
  four events off DoraHacks).
- 20:37 to 20:38Z: DoraHacks winner assignments for the 13 DoraHacks
  events with winners, read-only, 2 s apart, to see the structure behind
  the rule: each of the seven events has one award entry holding several
  differently named prizes; every other award entry holds one prize
  (buildonstellarchile repeats a title over separate one-prize entries;
  stellar-latam's Track 2 prize has two buidls). The hand check (d) reads
  these against the replay's rows once the replay exists.
- 20:42 to 20:44Z: `pnpm exec tsx
  improvements/audits/2026-10-23-prize-labels/capture.mts <scratch>`: 39
  GETs 2 s apart; apiVersion 1.9.101 at the start (status cached
  20:38:31Z) and the end (20:42:49Z). The replay's 10 events, their builds
  pages (981 rows), and the 10 hand-check winners' detail.
- `replay.test.ts` on the base tree before any code change: 37 requests
  (10 event pages, 15 builds pages by event, 2 more builds searches,
  10 submission details), all 200: `replay-base.json`. Fidelity: every replayed body equals the live body
  it was rebuilt from (generatedAt aside), except one submission detail's
  `project.factsReadAt`, a read-time stamp.
- Tests first, before any implementation (`failing-first.txt`): 6 files,
  13 failed, 133 passed. New: the rule's unit tests
  (`dorahacks-rosters.test.ts`), the builds search, getHackathon (winners,
  submissions, hidden winners, the note, a live roster), review and
  submission detail cases, and `builds/[id]/__tests__/route.test.ts` for
  the detail route's read of the event's winners. One existing
  expectation gained the new key (hidden winners).
- 20:45 to 20:50Z: another lane (DQ1, dead-protocol guard) was resumed into
  the same worktree: its reflog shows it checked out its branch at
  20:27:03Z, 17 s before this lane's `checkout -B`, and its files appeared
  from 20:45Z. Switching that worktree's branch back was refused as
  interference with another workload, so this lane left its HEAD alone,
  moved its own files to a new worktree on branch `lane/pl-prize-labels-b`
  (origin/main 724f4e6a; `lane/pl-prize-labels` is still checked out in
  the shared worktree) and removed only its own files from the shared one.
  The base replay re-run in the new worktree hashes identical.
- Implementation: `prizeCategories` and `prizeLabels` in
  `src/lib/integrations/dorahacks.ts` (the rule, keyed by event and award
  text; placements compared trimmed and lowercased). searchHackathonBuilds
  reads the categories over the whole index and serves `award` and
  `awardCategory` per row. getHackathon reads them over the event's served
  roster (stored or live) and labels `submissions`, `winners` and
  `stats.hiddenWinners`; placementRank still parses the stored text, so no
  rank moves. `buildDetailFromStored` takes the categories as a required
  argument: review passes them from the index, getHackathonSubmission from
  a new read of its events' served winners, and answers 503 when that read
  fails. The builder page labels its lines the same way. No stored data,
  sync or search matching changes.
- Spec: `awardCategory` (string, nullable) beside `award` on
  searchHackathonBuilds rows, getHackathon winners and hidden winners, and
  the submission detail (top level and entries, shared by
  getHackathonSubmission and reviewSubmission); `award` descriptions say
  null on a category row; getHackathon `submissions` gains a description
  (its items stay an open map); prizeUsd and matchedTerms descriptions
  name the new field. Field descriptions only: no operation description,
  summary, parameter or x-routing text changed. Skill reference lines for
  getHackathon, the builds search and the submission detail. Changelog
  entry; version 1.9.109 (placeholder).
- Replay on the lane's tree (`replay-lane.json`, a second run identical)
  and `diff.mjs` (`diff.txt`, exit 0): 0 unintended differences; the new
  key beside every served award, and 155 award values moved to
  awardCategory, all on rows of the 7 listed events. Criterion (a): 1,741
  rows with an award field on the listed events, 0 with award text.
  Criterion (b): 371 rows elsewhere, 0 with awardCategory, every award
  byte-identical. Pass.
- 20:58 to 20:59Z: `handcheck.mjs` (`handcheck.txt`): DoraHacks winner
  assignments for the 10 events read live, read-only, 2 s apart; 10 of 10
  pass (criterion d).
- 20:59 to 21:02Z: `sweep.mjs` (`sweep.txt`), every listed event, 27
  getHackathon reads 2 s apart, apiVersion 1.9.101 at both ends: the same
  7 events and 34 winners as the investigation; submission names left out
  of the output (one holds a person's name). A first run that printed
  names was discarded.
- Checks on the final tree: `pnpm generate:importmap` (exit 0), then
  `pnpm exec tsc --noEmit -p tsconfig.json` exit 0 (the first run caught a
  review test fixture missing the new field, and a replay import of a
  `.mts` path; the capture script is now `capture.ts`). `npx vitest run
  src/lib/ src/components/ src/app/ src/collections/ src/data/
  --maxWorkers=4 --minWorkers=1`: 216 files, 2,681 tests passed.
  `pnpm contract:write` (specs/openapi.json, api-client/src/schema.ts);
  `CONTRACT_BASE=origin/main pnpm contract:check` exit 0. `pnpm raven:gate
  --raven <scratch>/raven-src/stellar-raven`: exit 0, ACCEPT 1.9.109
  (legacy 220/298/326 and 112, skills 17/23/23, holdout 24 passed with 10
  forbidden captures, 2 questions moved, 0 hit-to-miss); the same command
  on origin/main 724f4e6a printed the same output but the candidate version
  line, so the change moves no routing. Biome on the 22 changed code files
  other than the builder page: no findings; the builder page has the same
  2 errors and 7 warnings as on origin/main, none on a changed line.
  Added lines: no em or en dashes (quoted titles print dashes as escapes),
  no barred names, no local paths.
- Fix reverted (`fix-reverted.txt`): the final 7 test files copied onto a
  clean origin/main 724f4e6a checkout, no code change: 13 failed, 141
  passed (criterion e).
- 21:14 to 21:18Z: origin/main moved to 85843791 (#1871 merged: the
  getHackathon body now lives in `src/lib/hackathon-detail.ts`, which the
  event page renders too; the page shows no award text). Rebased this
  lane's unpushed commit onto it: one conflict,
  `src/app/api/hackathons/[slug]/route.ts`, resolved by taking main's
  shell and porting the five getHackathon hunks unchanged into
  `src/lib/hackathon-detail.ts`. On the rebased tree: tsc exit 0; vitest
  218 files, 2,698 tests passed; `contract:write` changed nothing;
  `CONTRACT_BASE=origin/main pnpm contract:check` (85843791) exit 0; biome
  clean; the base replay on a clean 85843791 checkout hashes identical to
  724f4e6a's for all 37 requests, the lane replay is identical to
  `replay-lane.json` and `diff.txt` to the committed one; the Raven gate
  prints the same output, ACCEPT 1.9.109.

## Outcome

One commit on `lane/pl-prize-labels-b`, on origin/main 85843791, not
pushed (the shared worktree holds `lane/pl-prize-labels`; see the log). Not yet reviewed, not deployed:
no receipt. For the queue: `prizeUsd` is null on the 22 winners whose own
award names the amount (zk-gaming 5, ideatontelluscoop 3,
buildonstellarchile 14), and vetIdea and hackathonBrief serve those
winners' placement "Winners" with no amount; getHackathon `submissions`
items are still an open map.
