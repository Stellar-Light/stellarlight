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
   store and DoraHacks mocked from the capture. 451 requests: compare over
   every pair of the 27 listed events plus the three winners-only events
   together; every event page; per indexed event, analyze with the
   hackathon filter in one dimension (`facet=category`) and two
   (`facet=library&by=track`) and a builds search with the filter; and
   three analyze requests across every event (`facet=event`,
   `facet=category&by=event`, `facet=placement`). Each body's sha256 and
   length: `replay-base.json` (base tree bf8262db, run before any code
   change) and `replay-lane.json` (final tree).
3. Fidelity: on the base tree the replay reproduces all 27 live event pages
   exactly (generatedAt aside), and the live compare of the three
   winners-only events and the live `analyze?facet=event`.
4. `diff.mts` writes `diff.txt`; `sweep.mts` reads the lane's bodies of
   every request naming a winners-only event and writes `sweep-lane.txt`;
   `sweep-base-summary.txt` is the same sweep over the base bodies.
5. `failing-first.txt`: the new tests run before the implementation.

## Results

- (a) Byte identity for full events: 360 of 360 requests that name only
  full or unstored events are identical (276 compare pairs, 24 event
  pages, 40 analyze requests with the hackathon filter, 20 builds
  searches). PASS.
- Requests naming a winners-only event: 90 of 91 changed; the one
  unchanged is `analyze?facet=placement` across every event, which has no
  per-event split.
- (b) The three events: compare `submissionCount` null and
  `profile.submissions` null on all 81 rows naming them, `winnerCount` 6,
  5 and 1 and `hackersCount` 400, 165 and null (as each event declares)
  kept, `coverage: winners-only` on the row and its profile, a
  `deltas.notes` line naming them. getHackathon: `coverage`,
  `stats.totalSubmissions` null, `stats.outcomes` null, every
  `tracks[].submissionCount` null with per-track `winnerCount` kept (3 and
  3; Payment & Consumer Application 1; the Philippines winners carry no
  track), `stats.winners` 6, 5 and 1, `stats.coverageNote` the
  winners-only note, `profile.submissions` null, `meta.note` no longer
  "DoraHacks event". PASS.
- (c) Benchmark ("Compare HackMeridian 2025 with HackMeridian 2026"):
  hackmeridian-2025 `submissionCount` null (was 6). PASS.
- (d) Sweep: 1,140 field checks over the lane bodies pass; the same sweep
  fails 583 of them on the base bodies. Fields checked: compare
  submissionCount, winnerCount, hackersCount, coverage, activeRatePct,
  profile.coverage, profile.submissions, profile.winners,
  deltas.submissionCount, deltas.notes (no submission-count spread naming
  them, the winners-only line, no "none stored" line), deltas.facetShifts;
  getHackathon hackathon.coverage, hackersCount, stats.totalSubmissions,
  stats.upstreamSubmissions, stats.outcomes, stats.winners,
  stats.coverageNote, profile.coverage, profile.submissions,
  profile.winners, hackathon.tracks and tracks (submissionCount,
  winnerCount), winners, meta.note; analyze and builds with the hackathon
  filter: the meta.warnings line; analyze by=event: groups[].coverage on
  23 groups and the warning; analyze facet=event: the warning.
- Readers the replay cannot run (they need the store), read live,
  read-only, at 1.9.99 (15:35Z): getHackathons for q=meridian,
  philippines and apac serves no submission count; reviewSubmission of
  curated-hackmeridian-2025-lance and curated-apac-stellar-hackathon-2026-olio,
  vetIdea and hackathonBrief for two ideas whose prior art is a
  winners-only winner (Sobre, Olio) name the build's event as its label and
  state no event's field size or share; the only submission-like number is
  review's `otherSubmissionsOfRepo` 0, about the repo. This lane does not
  change their code paths.

## Not changed, on purpose

- analyze and builds keep counting stored rows; their numbers for a
  winners-only event are its winners, and a warning line says so.
- analyze across every event without a per-event split still counts the
  12 curated winners among 1,383 entries (winners 80, 5.8%; without them
  68 of 1,371, 5.0%). Queued in `improvements/TODO.md`.
- compare's `prizePerWinnerUSD` stays a rate over winners: APAC serves
  60,000 (pool 60,000 over its 1 published winner, while its winnersNote
  says only one track's winners are published). Queued.
