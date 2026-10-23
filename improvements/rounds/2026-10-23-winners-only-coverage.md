# 2026-10-23: an event whose stored rows are its winners only

## Scope

The owner imported curated hackathon rows today
(`scripts/import-curated-builds.ts` from `src/data/curated-builds.ts`,
buildIds `curated-...`). They are the winners only, for three events whose
full submission lists we do not hold: HackMeridian 2025 (6), Build on
Stellar Philippines 2026 (5) and APAC Stellar Hackathon 2026 (1).

Several surfaces now present those winners as the whole field. Live 1.9.97,
read 2026-10-23 15:04Z:

- compareHackathons (`slugs=hackmeridian-2025,build-on-stellar-philippines-2026,apac-stellar-hackathon-2026`):
  `submissionCount` 6, 5 and 1, equal to `winnerCount`, and
  `profile.submissions` the same; `deltas.notes` says "submission count:
  hackmeridian-2025 = 6 vs apac-stellar-hackathon-2026 = 1 (6.0x spread)".
  `withStored` fills `submissionCount` from the stored profile when the
  event has none.
- getHackathon `hackmeridian-2025`: `stats.totalSubmissions` 6,
  `outcomes.unknown` 6, `profile.submissions` 6 with every facet at
  `builds: 6`, `tracks[].submissionCount` 3 and 3, and `meta.note` calls it
  a DoraHacks event. The event's own record says 110+ submissions, 56 in
  Open Innovation and 35 teams in Composability.
- The benchmark check "2025 submission count is null or >= 100, never a
  fabricated small number" passed on 1.9.94 (null) and fails now (6).

Done means: one shared notion of an event's coverage, decided from its
stored rows and read by every reader; on a winners-only event every count
of the field is null, winner counts and the declared hackersCount stay, the
profile says it describes the winners, and a declared `coverage` field and
a note say only the winners are on record; full events serve exactly what
they serve today.

## Lane

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| V: winners-only coverage | Claude Opus 5.5, high | own worktree, branch `lane/v-winners-only-coverage`: the coverage helper, the compare, getHackathon and analyze routes and their tests, one insertion in `src/lib/hackathon-build-query.ts`, spec, skill reference, changelog, version, contract artifacts, `improvements/audits/2026-10-23-winners-only-coverage/`, this ledger | a commit on the branch, not pushed |

Other lanes edit `src/lib/hackathon-brief.ts`, `src/lib/vet-idea.ts`,
`src/lib/hackathon-build-query.ts` and the builds route; edits there stay
minimal and in one place.

## Review

Not yet reviewed. The orchestrator holds the push; an independent review
on another model is due before it.

## Method and ship criteria (fixed before any result was read)

- (a) Byte identity for full events. For every event whose coverage is
  full, the before and after responses are byte identical for:
  compareHackathons over every pair of full events; getHackathon; and
  analyzeHackathonSubmissions with the hackathon filter, in one dimension
  (`facet=category`) and two (`facet=library&by=track`). Method: the real
  GET handlers replayed over an index captured from the live API
  (read-only GETs about 2 s apart, apiVersion at start and end), the clock
  pinned, sha256 of every body on the base tree before any change and on
  the final tree. No database connection.
- (b) The three winners-only events serve null field counts (compare
  `submissionCount`, getHackathon `stats.totalSubmissions`,
  `tracks[].submissionCount`, `outcomes`, and any rate over submissions),
  a declared winners-only coverage and the note, with `winnerCount`,
  `stats.winners`, per-track `winnerCount` and the declared `hackersCount`
  unchanged.
- (c) The benchmark question "Compare HackMeridian 2025 with HackMeridian
  2026" (`compare?slugs=hackmeridian-2025,hackmeridian-2026`) serves a 2025
  `submissionCount` of null.
- (d) No count of a winners-only event, on any route above, equals its
  winner count presented as submissions. A sweep over every route above for
  the three events lists each field checked.
- Any full-event body that differs fails (a); no tuning to make it pass.

## Log

- 2026-10-23 15:03Z (lane V): `git fetch origin`; `git checkout -b
  lane/v-winners-only-coverage origin/main`; HEAD bf8262db (spec 1.9.97).
  `pnpm install --frozen-lockfile --prefer-offline`: exit 0.
- Live check of the bug, read-only, apiVersion 1.9.97 (`/api/status`
  15:03:53Z): compare for the three events served `submissionCount` 6, 5
  and 1 and `winnerCount` 6, 5 and 1; getHackathon `hackmeridian-2025`
  served `totalSubmissions` 6 and tracks 3 and 3, as in Scope.
- 15:07 to 15:09Z: `pnpm exec tsx
  improvements/audits/2026-10-23-winners-only-coverage/capture.mts
  <scratch>`: 60 GETs 2 s apart; apiVersion 1.9.97 at the start and the
  end; 27 listed events, 23 indexed, 1,383 entries.
- Coverage from the capture (table in the audit README): 1,383 stored
  rows, 12 curated and 1,371 synced. 20 events full (synced only), 3
  winners-only (hackmeridian-2025 6 of 6 curated winners,
  build-on-stellar-philippines-2026 5 of 5, apac-stellar-hackathon-2026 1
  of 1), 4 listed events with nothing stored. No event mixes curated and
  synced rows, so no curated row duplicates a synced one. Rule for a mix:
  any synced row makes the event full; a test keeps every curated row a
  winner, so a curated non-winner cannot make an event read full unseen.
- `replay.test.ts` on the base tree before any code change: 451 requests
  (every compare pair of the 27 listed events and the three together,
  every event page, per indexed event analyze with the hackathon filter
  in one and two dimensions and a builds search, three analyze requests
  across every event), all 200: `replay-base.json`. Fidelity: the
  replay's 27 event pages equal the 27 live pages captured (generatedAt
  aside), as do the live three-event compare and `analyze?facet=event`.
- Tests first, run before the implementation: 3 files,
  `src/lib/__tests__/hackathon-coverage.test.ts` (new), a winners-only
  block in the analyze route tests (compare and analyze) and one in the
  getHackathon route tests: 15 failed, 33 passed (`failing-first.txt`).
  The two that pass are the guards that a full event keeps its shape.
- Implementation: `eventCoverage`, `winnersOnlyEvents`, `winnersOnlyNote`,
  `winnersOnlyWarning` and `COVERAGE_VALUES` in
  `src/lib/hackathon-analytics.ts`; `eventProfile` marks a winners-only
  profile and serves `submissions` null, so compare's `withStored` no
  longer fills `submissionCount` from it. compare: `coverage` on the row,
  its own deltas line, left out of facetShifts and of the "none stored"
  line. getHackathon: `coverage`, null totalSubmissions, outcomes and
  track submissionCounts, the coverage note, its own meta.note. One
  insertion in `parseBuildFilters` (`src/lib/hackathon-build-query.ts`)
  warns for a winners-only hackathon value (analyze and builds); analyze
  marks by=event groups and warns for facet=event and by=event.
- Spec: `coverage` (enum `winners-only`, no null) on compare rows, profiles,
  the event and analyze groups; profile.submissions and getHackathon's
  track submissionCount nullable; getHackathon tracks items declared;
  field descriptions only, no operation description, summary, parameter or
  x-routing changed (checked against bf8262db's snapshot). Skill reference
  lines for getHackathon, compare and the hackathon filter. Changelog entry;
  version 1.9.102 (placeholder).
- One fix after self-review: compare's line now claims a null count only
  where submissionCount is null (a curated record's own count would stand).
- Checks on the final tree: `pnpm exec tsc --noEmit -p tsconfig.json` exit
  0 (after `pnpm generate:importmap`, exit 0); `npx vitest run
  src/lib/__tests__ src/app/api --maxWorkers=4 --minWorkers=1` exit 0, 189
  files, 2,409 tests; `pnpm contract:write` exit 0; `CONTRACT_BASE=origin/main
  pnpm contract:check` exit 0; biome on the 16 changed code files: no
  errors; `pnpm raven:gate --raven <scratch>/raven-src/stellar-raven` exit
  0, ACCEPT 1.9.102 (legacy 220/298/326 and 112, skills 17/23/23, holdout
  24 passed with 10 forbidden captures, 0 hit-to-miss); added lines: no em
  or en dashes, no barred names, no local paths.
- Replay on the final tree: `replay-lane.json`, two runs identical (`cmp`
  exit 0). `diff.mts`: (a) 360 of 360 full-or-none requests identical (276
  compare, 24 event pages, 40 analyze, 20 builds); 90 of 91 requests naming
  a winners-only event changed, `analyze?facet=placement` did not.
  `sweep.mts`: (b), (c), (d) 1,140 field checks pass; on the base bodies
  583 fail (`sweep-base-summary.txt`). (c): hackmeridian-2025
  `submissionCount` null, was 6.
- The base replay rerun from a `git archive` of bf8262db extracted to
  scratch: `cmp` with `replay-base.json` exit 0.
- origin/main moved to 08dd388c (spec 1.9.98 rerank, 1.9.99 locateSource)
  during the round. Its tree replays all 451 requests identical to
  bf8262db; this lane's five runtime files patched onto it (the import
  block in `hackathon-build-query.ts` by hand, the only hunk that did not
  apply) replay 360 of 360 full-or-none requests identical to it, and the
  whole output equals the lane on bf8262db (`cmp` exit 0).
- 15:35Z, read-only, apiVersion 1.9.99: getHackathons (q=meridian,
  philippines, apac) serves no submission count; reviewSubmission of two
  curated winners, vetIdea and hackathonBrief for two ideas whose prior art
  is a winners-only winner state no event's field size or share. 15:38Z:
  the probe still serves hackmeridian-2025 `submissionCount` 6 on 1.9.99,
  as expected before deploy.

## Outcome

- Committed on branch `lane/v-winners-only-coverage`, not pushed, spec
  placeholder 1.9.102. Criteria (a) to (d) hold on the replay and the
  sweep; nothing is deployed, so nothing is verified live.
- Merge notes: expect conflicts in `src/lib/version.ts`,
  `src/lib/changelog.ts` (two top entries), `specs/openapi.json` and
  `api-client/src/schema.ts` (regenerate with `pnpm contract:write`), and
  the import block of `src/lib/hackathon-build-query.ts` (keep both
  imports).
- Moved to `improvements/TODO.md`: Now item 11 (this fix, until verified
  live) and two Next leads: compare's `prizePerWinnerUSD` over a partial
  winners list (APAC 60,000), and all-event analyze counting the 12
  curated winners (winners 80 of 1,383, 5.8%; 68 of 1,371 without them).
