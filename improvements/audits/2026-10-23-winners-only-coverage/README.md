# 2026-10-23: events whose stored rows are their winners only

Round ledger: `../../rounds/2026-10-23-winners-only-coverage.md`.

## Question

The curated import (`scripts/import-curated-builds.ts`, from
`src/data/curated-builds.ts`) stores only the winners of three events off
DoraHacks. On live 1.9.97, compareHackathons and getHackathon served those
winners as each event's whole field (submissionCount 6, 5 and 1 equal to
winnerCount; HackMeridian 2025 totalSubmissions 6, tracks 3 and 3). Which
events hold only their winners, and does serving their field counts as
null leave every full event's responses unchanged?

Two follow-ups of the same class joined the round: ratios computed over
incomplete rows (APAC's prize per winner, all-event analyze rates counting
curated winners), and lists served as `[]` where nothing is known
(hackmeridian-2026's tracks and prize tiers).

## Coverage per event (live index, 1.9.97, 15:07 to 15:09Z)

Read from `/api/hackathons/builds?hackathon=<slug>` for every event
`/api/hackathons/analyze?facet=event` lists (the index the routes read).
Curated = a `curated-<event>-<name>` id; synced = `dorahacks-buidl-<n>`.

| event | rows | curated | synced | winners | coverage |
| --- | ---: | ---: | ---: | ---: | --- |
| stellar-hacks-zk | 319 | 0 | 319 | 5 | full |
| stellar-agents-x402-stripe-mpp | 249 | 0 | 249 | 5 | full |
| stellar-hacks-zk-gaming | 95 | 0 | 95 | 5 | full |
| build-on-stellar | 82 | 0 | 82 | 3 | full |
| telluscoop-ideaton | 73 | 0 | 73 | 0 | full |
| ideaton2026 | 67 | 0 | 67 | 6 | full |
| stellar-pulso-hackathon | 66 | 0 | 66 | 0 | full |
| scaffoldstellar | 63 | 0 | 63 | 5 | full |
| codigoraiz2025 | 59 | 0 | 59 | 0 | full |
| stellar-hacks-kale-reflector | 45 | 0 | 45 | 10 | full |
| stellarhack | 42 | 0 | 42 | 0 | full |
| buildonstellarchile | 41 | 0 | 41 | 14 | full |
| stellar-hacks-blend | 39 | 0 | 39 | 3 | full |
| alebrije2026 | 28 | 0 | 28 | 2 | full |
| stellar-hacks-paltalabs | 26 | 0 | 26 | 3 | full |
| stellar-latam | 22 | 0 | 22 | 4 | full |
| ideatontelluscoop | 22 | 0 | 22 | 3 | full |
| buildonstellarhack | 21 | 0 | 21 | 0 | full |
| give-hackathon-argentina | 6 | 0 | 6 | 0 | full |
| mqcstellar | 6 | 0 | 6 | 0 | full |
| hackmeridian-2025 | 6 | 6 | 0 | 6 | winners-only |
| build-on-stellar-philippines-2026 | 5 | 5 | 0 | 5 | winners-only |
| apac-stellar-hackathon-2026 | 1 | 1 | 0 | 1 | winners-only |
| total | 1,383 | 12 | 1,371 | 80 | |

Four more listed events hold no stored row (hackmeridian-2026,
stellar-builders-camp-jaipur-2026, stellar-builder-summit-2026,
stellar-journey-to-mastery-2026): no coverage, as before.

No event mixes curated and synced rows, so no curated row duplicates a
synced one. The rule still says what a mix would mean: any synced row makes
the event full (the sync stores an event's whole DoraHacks listing), and a
curated row that is not a winner would too, so a test keeps every curated
row a winner until a partial curated listing gets its own value.

## Method (read-only, no database)

1. `capture.mts <dir>`: 60 GETs 2 s apart. apiVersion 1.9.97 at the start
   and the end (`/api/status`, cached at 15:03:53Z and 15:09:25Z). The
   listing, `analyze?facet=event` and `facet=category` (each type's
   precision and recall), every listed event's page, and every indexed
   event's rows. The capture stays in scratch: it carries third-party
   project text.
2. `replay.test.ts` (config `vitest.replay.config.mts`): the real GET
   handlers of compare, getHackathon, analyze and builds over an index
   rebuilt from the capture, the clock pinned at 2026-10-23T15:10:00Z, the
   store and DoraHacks mocked from the capture. 458 requests: compare over
   every pair of the 27 listed events plus the three winners-only events
   together; every event page; per indexed event, analyze with the
   hackathon filter in one dimension (`facet=category`) and two
   (`facet=library&by=track`) and a builds search with the filter; seven
   analyze requests across every event (`facet=event`,
   `facet=category&by=event`, `facet=placement`,
   `winnersOnly=1&facet=package`, and `facet=event&value=hackmeridian-2025`,
   `facet=track&value=Open Innovation` and `facet=event&value=stellar-hacks-zk`);
   and three sets reached by a track or a hackathon value
   (`track=open innovation`, winners-only rows alone; `track=composability`
   and `hackathon=stellar-hacks-zk,hackmeridian-2025`, mixed). Each request
   is classed by the events it names: full, names-unstored or
   names-winners-only. Each body's sha256 and length: `replay-base.json`
   (bf8262db, run from an archive of that commit extracted to scratch;
   main at e196cea1, spec 1.9.100, replays all 458 identically) and
   `replay-lane.json` (final tree); each run twice, identical.
3. Fidelity: on the base tree the replay reproduces all 27 live event pages
   exactly (generatedAt aside), and the live compare of the three
   winners-only events and the live `analyze?facet=event`.
4. `diff.mts` writes `diff.txt`; `sweep.mts` reads the lane's saved bodies
   (every event page and every request naming a winners-only event) and
   writes `sweep-lane.txt`; `sweep-base-summary.txt` is the same sweep over
   the base bodies, failures counted by field.
5. Tests run before each implementation: `failing-first.txt` (coverage),
   `failing-first-followup.txt` (ratios over incomplete rows),
   `failing-first-tracks.txt` (tracks, tiers, judging) and
   `failing-first-review.txt` (the review's six findings).

## Results

- (a) Byte identity for full events: 270 of 270 requests naming only full
  events are identical (190 compare pairs, 20 event pages, 40 analyze
  requests with the hackathon filter, 20 builds searches). The 86 compare
  pairs naming an event with nothing stored are identical too. PASS.
- Changed, as intended: the 4 pages of events with nothing stored (only
  tracks, prizeTiers, notes and rules), and all 98 requests naming a
  winners-only event.
- (b) The three events: compare `submissionCount` null and
  `profile.submissions` null on all 81 rows naming them, `winnerCount` 6,
  5 and 1 and `hackersCount` 400, 165 and null (as each event declares)
  kept, `coverage: winners-only` on the row and its profile, every profile
  share null, a `deltas.notes` line naming them. getHackathon: `coverage`,
  `stats.totalSubmissions` null, `stats.outcomes` null,
  `tracks[].submissionCount` null with per-track `winnerCount` kept (3 and
  3; Payment & Consumer Application 1), the Philippines tracks null (its
  winners name none), `stats.coverageNote` the winners-only note,
  `meta.note` no longer "DoraHacks event". PASS.
- (c) Benchmark ("Compare HackMeridian 2025 with HackMeridian 2026"):
  hackmeridian-2025 `submissionCount` null (was 6). PASS.
- (e) Ratios over incomplete rows: on all 27 compare rows where APAC has a
  pool, `prizePerWinnerUSD` is null with the reason in the row's `notes`
  (was 60,000); no prize-per-winner spread names it; no full or unstored
  row carries `notes` (72 checked). A curated record's `activeRatePct`
  over a winners-only event is withheld by the same rule (route test; no
  production event has such a record). PASS.
- (f) Across every event, analyze leaves the 12 winners-only rows out of
  every count and share and says so in one line. Exact diffs against the
  base:
  - `facet=placement`: field, builds and known 1,383 to 1,371; winners 80
    to 68; shares 0.058 to 0.05 and 0.942 to 0.95; the line.
  - `facet=event&top=30`: field, builds and known 1,383 to 1,371; the 3
    events leave the values (23 to 20) and 5 shares move by 0.001 to 0.002
    (stellar-hacks-zk 0.231 to 0.233); winnersVsOthers winnersKnown 80 to
    68, each event's winnersShare and lift rise, othersKnown 1,303 kept;
    the line.
  - `facet=category&by=event`: field and builds 1,383 to 1,371, unknown 12
    to 0 (the curated rows were the only uncategorized rows); the 3 groups
    leave (23 to 20) and the 20 full groups, total.values, winnersVsOthers
    and measured are identical; the line.
  - `winnersOnly=1&facet=package`: field and builds 80 to 68, unknown 32
    to 20, shares unchanged; the line.
  - `track=composability`: HackMeridian 2025's 3 rows leave; field 48 to
    45, winners 13 to 10. `hackathon=stellar-hacks-zk,hackmeridian-2025`:
    field 325 to 319, unknown 6 to 0; both warning lines.
  - `track=open innovation` (its rows alone): counts kept, share 1 to null,
    the winners-only line.
  - A value only left-out rows carry (review finding 1):
    `facet=event&value=hackmeridian-2025` builds 6 to 0 with share 0.004
    to null and winnersVsOthers' winnersShare 0.075 to null (it served 0
    before this fix); `facet=track&value=Open Innovation` the same (3 to
    0, share null); each with the line "value '...': only rows left out
    above carry it". `facet=event&value=stellar-hacks-zk` keeps a share
    over the full listings (0.231 to 0.233) and no such line.
  PASS.
- (g) Tracks and tiers: no curated event serves `tracks: []` or
  `prizeTiers: []`. hackmeridian-2026 serves Genesis and Scale (category)
  and Stellar Unlocked and Stellar Composed (track), counts null, and its
  judging sentence as `rules` with source and day; Stellar Journey to
  Mastery its builder and startup tracks; the Jaipur camp and the Builder
  Summit `tracks: null` with a note; all seven curated events
  `prizeTiers: null` with a note. PASS.
- Review findings 3 to 5: a declared track is backed only when its name
  and description sit side by side in one clause of the record's
  description (Genesis and Scale with swapped descriptions, and Scale
  described as "Stellar", now fail the data test); a winners note that says
  not announced gives that reason, not "published in part"; a winners-only
  page's submissions and winners rows serve `source: curated`, DoraHacks
  rows `dorahacks`.
- (d) Sweep: 1,582 field checks over the lane bodies pass; the same sweep
  fails 726 of them on the base bodies. Fields checked are listed in
  `sweep-lane.txt`.
- Readers the replay cannot run (they need the store), read live,
  read-only, at 1.9.99 (15:35Z): getHackathons for q=meridian,
  philippines and apac serves no submission count or tracks;
  reviewSubmission of curated-hackmeridian-2025-lance and
  curated-apac-stellar-hackathon-2026-olio, vetIdea and hackathonBrief for
  two ideas whose prior art is a winners-only winner (Sobre, Olio) name the
  build's event as its label and state no event's field size or share; the
  only submission-like number is review's `otherSubmissionsOfRepo` 0, about
  the repo. reviewSubmission's share of a category across every stored
  submission now leaves winners-only rows out (route test); live it is
  unchanged today, as those rows carry no category.

## Not changed, on purpose

- analyze and builds keep counting a winners-only event's rows when they
  are all a request asks for; a warning line says they are its winners.
- DoraHacks events whose winners are hidden by their teams
  (buildonstellarchile serves 14 of 15) or named off DoraHacks
  (alebrije2026) keep their prize per winner: their winners notes record a
  different state, they are full events, which stay byte identical, and
  the rule's partial-winners signal is the curated winners note only.
- The Builder Summit's bounty tracks appear only in its winners roster's
  labels, not in its record's description, so its tracks stay null.
