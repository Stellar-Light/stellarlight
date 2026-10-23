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

## Follow-up: ratios over incomplete rows (from the coordinator, 15:45Z)

Scope: close the two leads this lane queued, same class (incomplete rows
distorting a served number), on top of 8a9d2b1c, without merging main.

1. compareHackathons serves apac-stellar-hackathon-2026
   `prizePerWinnerUSD` 60,000: its pool over the 1 winner on record, while
   its winnersNote says only one track's winners are published.
2. analyzeHackathonSubmissions across every event counts the 12 curated
   winners in its rates: 80 winners of 1,383 (5.8%) against 68 of 1,371
   (5.0%) without them.

Decisions, fixed before any result:

- One rule for every ratio served over stored rows (a share, a winner
  share, a rate, a prize per winner) in compare, getHackathon and analyze,
  and in reviewSubmission's all-event share, which is the same class: no
  ratio's denominator comes from incomplete rows. Incomplete: only the
  winners are stored (coverage winners-only), or the winners are published
  only in part. Such a ratio is null, never a computed number, and the
  reason is on the row (compare: a `notes` list; a profile: its
  `coverage`; analyze: meta.warnings).
- The "published only in part" signal: a dated entry in
  `CURATED_WINNERS_NOTES` (`src/data/curated-hackathons.ts`). It is the
  only machine-readable record of that state today, kept for exactly the
  curated events whose winners are published in part or not at all
  (apac-stellar-hackathon-2026 partial; two others not announced, which
  have no winners, so no ratio to withhold). A published winner count
  below declared tracks is not available: no event declares its tracks.
  DoraHacks events whose winners are hidden by their teams or named off
  DoraHacks are a different state with their own notes, and they are full
  events, which must stay byte identical; they stay out of this rule and
  are recorded as a lead.
- All-event analyze: leave winners-only rows out of every count and share
  when the counted set also holds events whose full listing is stored, and
  say so in one meta line naming the events and the rows left out. Chosen
  over a separate group because one basis per response keeps counts and
  shares consistent (a share is still builds over known) and adds no block
  every client must merge. A set made only of winners-only rows (a
  hackathon value naming only such events, or filters that leave only
  them) keeps its counts, which describe the winners on record, and serves
  every share null.

Criteria, fixed before any result:

- (a2) The replay's requests naming only full or unstored events stay byte
  identical to the base. The all-event analyze requests change only by the
  winners-only rows leaving their counts and shares, plus the line; every
  such diff is listed.
- (e) apac-stellar-hackathon-2026 rows in compare serve `prizePerWinnerUSD`
  null with a note giving the reason, and no prize-per-winner spread names
  it; every other ratio over incomplete rows is null.
- (f) All-event analyze requests carry no winners-only row in any count,
  share or group, and the line names the three events and 12 rows; a set of
  winners-only rows alone serves every share null.
- The sweep is extended to these fields.

### Log

- 15:53Z, read-only, apiVersion 1.9.99: TODO Now item 2's probes have
  flipped: `/api/hackathons/hackmeridian-2025` serves 6 winners (Lance,
  The Simple Fund, Star Lends, 4Bridge, Panorama Block, Stellar Forge) and
  `/api/hackathons/builds/curated-hackmeridian-2025-lance` answers 200.
- 16:05Z: a third item from the coordinator, for the owner, same branch:
  getHackathon `hackmeridian-2026` serves `tracks: []` and `prizeTiers: []`,
  each asserting none, while its record states two categories (Genesis,
  Scale), two thematic tracks (Stellar Unlocked, Stellar Composed) and
  judging per category.
- Decisions for item 3, fixed before any result:
  - A curated record may declare `tracks`, each `{ name, kind, description }`
    with kind `category` or `track`, taken from its description with no
    new claim (a test holds every declared name and description to a
    phrase of the description), and `judging`, a sentence copied verbatim
    from its description, with the page it was checked against and the
    day. `kind` is the smallest shape that keeps categories honest in the
    one list: Genesis and Scale are divisions every entry picks, the two
    thematic tracks are themes an entry can target, so four peer tracks
    would misstate it.
  - getHackathon: with no roster held (no stored row and no live roster),
    serve the declared tracks with `submissionCount` and `winnerCount`
    null, or `tracks: null` when none is declared; a winners-only event
    whose winners name no track also serves `tracks: null`. Never `[]` for
    not known. A roster held serves its tracks as before.
  - `prizeTiers` on an event off DoraHacks: its record is a summary, not
    the organizer's page, so when it itemizes nothing the tiers are null,
    not `[]`. DoraHacks events keep `[]` for a stored page with no
    itemized split.
  - Each such null carries its reason in a new `hackathon.notes` list,
    present only then. Judging declared on a curated record is served as
    `rules: { judgingCriteria, source, checkedOn }`, the other rules keys
    absent (not known).
- Criteria for item 3, fixed before any result:
  - (a3) The replay's requests naming only full events stay byte
    identical. Compare pairs naming unstored events stay identical (compare
    serves no tracks or tiers). The event pages of unstored and
    winners-only events change only in tracks, prizeTiers, notes and rules.
  - (g) hackmeridian-2026 serves its four declared items with null counts,
    `prizeTiers` null with a note, and its judging sentence in rules with
    source and day; no curated event serves `tracks: []` or `prizeTiers:
    []`; the sweep covers these fields.
- Tests first for items 1 and 2, run on 8a9d2b1c's code before any change:
  4 files, 15 failed, 47 passed (`failing-first-followup.txt`): APAC
  prizePerWinnerUSD 60000 not null, all-event placement field 18 not 6,
  mixed filter field 8 not 2, shares not null, the row notes missing from
  the spec, `incompleteRows` missing. The guard tests that full events keep
  their shape passed.
- Implementation, items 1 and 2: `incompleteRows(slug, coverage)` in
  `src/lib/hackathon-analytics.ts` is the one rule (winners-only coverage,
  or a curated winners note); `incompleteEvents`, `withoutShares` and
  `leftOutWarning` beside it. compare withholds prizePerWinnerUSD and
  activeRatePct over incomplete rows with a row `notes` line each;
  `eventProfile` serves no share over incomplete rows; analyze partitions
  the counted set (incomplete rows beside full listings are left out of
  every count and share, one line; alone, counts kept and shares null);
  reviewSubmission's category share leaves them out. The winners-only
  warning now reads "its rows are its winners ... and no share is computed
  over them", true whether a request counts them or leaves them out.
- One more test after the code, for a path no production event takes (a
  curated record's activeRatePct over a winners-only event): on an archive
  of 8a9d2b1c extracted to scratch it fails (activeRatePct 67, not null);
  on the lane it passes.
- The served-shape check in the new compare test found compare's deltas
  spreads undeclared (prizePoolUSD, submissionCount, prizePerWinnerUSD,
  hackersCount, activeRatePct; TODO Now item 3 listed four). Declared with
  one shared spread schema; that item's list drops them.
- Tests first for item 3, run before its implementation: 2 files, 6
  failed, 30 passed (`failing-first-tracks.txt`); the guard that a stored
  DoraHacks event keeps its tracks, tiers and no notes passed.
- Implementation, item 3: `CuratedTrack`, `CuratedHackathon`
  (`tracks`, `judging`) and `TRACK_KINDS` in
  `src/data/curated-hackathons.ts`; hackmeridian-2026 declares Genesis and
  Scale (category) and Stellar Unlocked and Stellar Composed (track) and
  its judging sentence verbatim (source hackmeridian.com, checked
  2026-10-20, as the row's comment records); stellar-journey-to-mastery-2026
  declares its builder and startup tracks, each from its description.
  getHackathon serves declared tracks with null counts when no roster is
  held, null when nothing tells, prizeTiers null on a curated event whose
  record itemizes none, `hackathon.notes` for each null, and the judging
  sentence as rules. The other curated records state no tracks (Jaipur,
  the Builder Summit), or hold rows (HackMeridian 2025 and APAC derive
  theirs; the Philippines winners name none, so null).
- `contract:check` first failed on the enum ratchet (99 hand-typed enum
  arrays, baseline 98): the track kind enum now spreads `TRACK_KINDS`.
- Replay, extended to 455 requests (four all-event analyze requests, two
  mixed sets and one winners-only set reached by filters) and three
  classes (full, names-unstored, names-winners-only). Base rerun from an
  archive of bf8262db extracted to scratch: `replay-base.json`, run twice,
  `cmp` exit 0; the fidelity check still 27 of 27 live pages. Final tree:
  `replay-lane.json`, run twice, `cmp` exit 0. `diff.mts`: full 270 of 270
  identical (190 compare, 20 event pages, 40 analyze, 20 builds);
  names-unstored 86 compare identical and the 4 event pages changed in
  tracks, prizeTiers, notes and rules only; names-winners-only 95 of 95
  changed. The all-event diffs, field by field, are in the audit README
  (facet=placement winners 80 to 68 of 1,383 to 1,371; facet=event 3
  events left out, 5 shares move by 0.001 to 0.002; by=event 20 full
  groups identical; winnersOnly=1 field 80 to 68).
- `sweep.mts` extended (APAC prize per winner and notes, profile shares,
  tracks and tiers never [], declared tracks, rules, all-event and mixed
  analyze sets): 1,562 checks pass on the lane; 710 fail on the base.
- Checks on the final tree: `pnpm exec tsc --noEmit -p tsconfig.json` exit
  0; `npx vitest run src/lib/__tests__ src/app/api --maxWorkers=4
  --minWorkers=1` exit 0, 189 files, 2,425 tests; `npx vitest run
  src/data/__tests__` exit 0, 4 files, 31 tests; `pnpm contract:write`
  exit 0; `CONTRACT_BASE=origin/main pnpm contract:check` exit 0 (enum
  literals 98 hand-typed, 57 spread); biome on the 20 changed code files:
  no errors; no operation description, summary, parameter or x-routing
  changed against bf8262db, and new schema property names were added, so
  `pnpm raven:gate --raven <scratch>/raven-src/stellar-raven` ran: exit 0,
  ACCEPT 1.9.102 (legacy 220/298/326 and 112, skills 17/23/23, holdout 24
  passed with 10 forbidden captures, 0 hit-to-miss); added lines: no em or
  en dashes, no barred names, no local paths.
- TODO: Now item 2 (HackMeridian 2025 winners not served) closed as done
  by today's curated import, live since 13:55Z (coordinator), receipt
  above (15:53Z, 1.9.99: 6 winners, the curated build answers 200); its
  owner decision "Run the curated-builds execute [run]" removed, since the
  execute ran. The Next item on HackMeridian 2026 tracks, categories and
  judging in prose removed (served now; its venue and deadline hour are
  covered by the events-fields item). The two Next leads this round queued
  removed (fixed). Now items renumbered: this round's item is now 10.

## Outcome (follow-up)

- Items 1 to 3 committed on `lane/v-winners-only-coverage` on top of
  8a9d2b1c, not pushed, still spec placeholder 1.9.102 with one changelog
  entry covering the three. Criteria (a2), (a3), (e), (f) and (g) hold on
  the replay and the sweep; nothing is deployed, so nothing is verified
  live.
- Leads, not fixed: DoraHacks events whose winners are hidden by their
  teams (buildonstellarchile, 14 of 15 served) or named off DoraHacks
  (alebrije2026, one named winner not served) keep a prize per winner over
  the winners served; their notes record a different state and they are
  full events, which had to stay byte identical. The Builder Summit's
  bounty tracks live only in its winners roster's labels.
