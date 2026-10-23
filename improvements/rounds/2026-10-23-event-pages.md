# 2026-10-23: an event page for every event the API serves

## Scope

`https://www.stellarlight.xyz/hackathons/<slug>` answered 404 for every
event tried (hackmeridian-2026, hackmeridian-2025, stellar-hacks-zk, each
404 at 17:09Z) while `GET /api/hackathons/<slug>` answered 200 for all 27
events `/api/hackathons` lists (20 DoraHacks, 7 curated). The page reads the
Payload `hackathons` collection, which is empty in production (the listing's
`meta.counts` and the sitemap's own comment say so); the API resolves a slug
through that collection first and then through the DoraHacks listing, which
carries the curated events (`fetchAllDoraHacksHackathons`). HackMeridian 2026
runs 25 to 26 October and builders will open these URLs. This round makes the
page render from the function the API uses, keeps the API's output byte
identical, and submits the event pages in the sitemap.

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| EP: event pages | Claude Opus 5.5, high | own worktree, branch `lane/ep-event-pages` off origin/main (d9bd53b5, spec 1.9.101): new `src/lib/hackathon-detail.ts` (the detail route's body, moved), `src/app/api/hackathons/[slug]/route.ts` (left a thin handler), `src/app/(frontend)/hackathons/[slug]/page.tsx` and a new page test beside it, `src/app/sitemap.ts`, `improvements/audits/2026-10-23-event-pages/`, this ledger | one commit on the branch, not pushed |

The orchestrator holds the push, the PR (its preview deploy renders the page)
and the independent review.

## Review

Pending: the orchestrator's independent review, on a model other than the
author's.

- 2026-10-23, review of c9f1a516 by the orchestrator's independent reviewer
  (its model and effort were not stated to this lane): GATE, fix first.
  Verified on its own: its capture and replay byte identical on 42 lines;
  the move's token diff and the regex equivalence; the only logging delta is
  the one stated; the 28 route tests pass unedited; failing first
  reproduced; the 27-body sweep passes; no injection path (no
  dangerouslySetInnerHTML, all text escaped); tsc, 2,679 tests and
  contract:check pass. Findings: 2 MEDIUM, 3 LOW, fixed in the commit after
  c9f1a516 (log below). The reviewer's re-check is pending.

## Design (fixed before implementation)

- **One function for both.** The detail route's whole body, from the
  `hackathons` collection read to the response object, moves to
  `getHackathonDetail(payload, slug)` in `src/lib/hackathon-detail.ts`, with
  its helpers (placement ranks, prize tiers, the curated roster, the no
  winners note, the closest slugs). It returns `{ found: false, body }` (the
  404 body) or `{ found: true, source, body }` and touches no HTTP: the route
  keeps the 503 when the store is down, the 404 and 200 envelopes, the cache
  header, the usage log and the 500. The page calls the same function, so
  the page and the API cannot drift (a server component never fetches its own
  API over HTTP). This is the smallest shared piece: everything the page
  shows is computed inside that body (stored or live roster, winners and
  their notes, null counts), so any smaller piece would copy that logic.
- **Moved, not rewritten.** Code moves in its order. Only comment
  punctuation changes (em and en dashes become commas, colons or parentheses)
  and the prize-tier regex writes its two dash characters as `\u2013` and
  `\u2014`, the same pattern. `logApiHit` now runs after the body is built
  rather than before it on the DoraHacks branch: same filters, and a request
  that throws (a 500) is no longer logged as a hit first.
- **The page keeps its design:** back link, hero (status badge, organizer,
  name, dates, official site link, description), Winners grid, the four stat
  blocks, the outcomes funnel, the Projects grid, the same components and
  classes. It reads the API's body: winners (the DoraHacks shape, the curated
  roster shape, or the collection shape), submissions, stats. A winner or
  submission with a directory project links to `/project/<slug>`; any other
  opens its own `url` (the DoraHacks page or the page that names the win) in
  a new tab, as the listing's external cards do. Rows carry no logo, so the
  existing fallback icons show. Tracks, prize tiers, rules and profile are
  not shown: the page has no place for them, and the curated descriptions
  already state tracks and judging in prose.
- **Honesty.** A null count prints "not known", never 0. The Submitted
  block reads `stats.totalSubmissions`; on a winners-only event
  (`hackathon.coverage`, from #1869) it is null, and the Projects grid does
  not list the winners again as submissions: it says only the winners are on
  record. Outcome blocks read `stats.outcomes`; when nothing is classified
  (built, in progress and abandoned all 0 beside an unknown count, as the
  API serves for every stored DoraHacks roster) each prints "not known" and
  the funnel stays hidden, as it does today with nothing tracked. The stat
  row shows only when at least one block is known. `stats.winnersNote` and
  `stats.coverageNote` print beside the Winners and Projects headings when
  set; a winners-only event's note is the page's own sentence, since the
  API's names JSON fields. A winner with no prize figure says "Prize not
  stated", not "Prize awarded".
- **Description.** A curated or collection event's description prints in
  full, as now. A DoraHacks event's description is its stored event page in
  markdown (up to 23,058 characters, Real-World ZK): the page prints its
  first paragraph of prose as plain text, clamped at a sentence, and the
  official site link carries the rest.
- **Dates** are formatted in UTC: the API serves UTC calendar dates, and
  parsing "2026-10-25" in a zone west of UTC printed the day before.
- **404 only for a slug the API does not know:** `notFound()`, the site's
  existing not-found page. A store outage throws (the error page), as the
  API answers 503 and never "unknown event".
- **Metadata:** the event's name as title; the description's first prose
  clamped to 160 characters; `alternates.canonical` as the project and
  stablecoin detail pages carry. One read per request: `react` `cache`
  dedupes the metadata's call and the page's.
- **Sitemap:** event pages join it from the same listing the API resolves
  slugs with, beside the collection pull it already has (now said to be
  empty, not "no detail pages"), deduplicated.

## Criteria (written before any result was read)

- (a) Byte identical: the real GET handler of origin/main (d9bd53b5) and of
  this branch, over the same inputs with the clock pinned, give the same
  status, content type, cache header and body bytes for every request:
  every event of a read-only capture of production (27 events, inputs
  rebuilt from their served bodies), unknown slugs, and the branches a
  capture cannot reach (a collection row, the curated roster through the
  collection, a live roster, failed reads, a store outage, a thrown read).
  Proven with `cmp` of the two output files. The route's existing tests pass
  unedited.
- (b) The page renders for all 27 captured bodies; on none does a stat block
  print 0 where the served value is null or unclassified, a winner count
  appear as a submission count, or the Projects grid list a winners-only
  roster.
- (c) The page test fails on origin/main's page and passes on this branch.
- (d) `pnpm exec tsc --noEmit -p tsconfig.json`, vitest over
  `src/lib/__tests__`, `src/app/api` and the page test, biome on the changed
  files, and `CONTRACT_BASE=origin/main pnpm contract:check`, all exit 0.

## Log

- 17:05Z: `git fetch origin`; `git checkout -b lane/ep-event-pages
  origin/main` at e196cea1. `pnpm install --frozen-lockfile --prefer-offline
  --ignore-scripts`: exit 0. `pnpm generate:importmap` (no env, no database):
  exit 0. Base `pnpm exec tsc --noEmit -p tsconfig.json`: exit 0. Base route
  tests: 18 passed.
- 17:09Z, read-only, apiVersion 1.9.100: page 404 and API 200 for
  hackmeridian-2026, hackmeridian-2025 and stellar-hacks-zk;
  `/api/hackathons?limit=100` listed 27 (curated 7, dorahacks 20), every id
  `dorahacks-<n>`, so none came from the collection.
- 17:20Z: origin/main moved to d9bd53b5 (#1867 no dashes part A; #1869
  winners-only coverage, spec 1.9.101, live at 17:20:01Z), before any code
  here. `git merge --ff-only origin/main`. #1869 is the lane this page uses
  for null field counts (`hackathon.coverage`, `stats.coverageNote`, null
  `totalSubmissions` and `outcomes`, declared tracks and judging on curated
  records).
- 17:21Z: base route tests at d9bd53b5: 28 passed. This ledger's design and
  criteria written, before any code.
- 17:22:42Z to 17:23:53Z: capture (`node
  improvements/audits/2026-10-23-event-pages/capture.mjs <scratch>`),
  read-only, 2 s apart: apiVersion 1.9.101 at both ends, listing and 27
  details, all 200. Kept in scratch (upstream text), sha256 658b2a75...
- The move: the route's helpers and GET body to `src/lib/hackathon-detail.ts`
  by a script (exact-string replacements of the HTTP envelope, each asserted
  to occur once), then the comment dashes (16 edits, the regex escapes),
  then `biome format`. Route tests: 28 passed. `move-check.py` (token diff,
  whitespace ignored): 32 changed spans, 4,026 of 4,233 tokens equal; every
  span is a comment dash, the regex escape, the HTTP envelope or one line
  biome joined (`move-check.txt`).
- Replay (`replay.test.ts`, 42 requests) on this tree and on `git archive
  d9bd53b5`: `cmp` exit 0, sha256 dc6feaea... both. Mutant (winnersRanked by
  `every`): 2 responses differ, `cmp` exit 1; the lib restored from its copy
  (`cmp -s` equal) before the runs that count.
- Failing first: the page test on the base page, then the page and sitemap
  tests on `git archive d9bd53b5`: 8 failed, 2 passed (`failing-first.txt`).
- Page changed; page test 8 passed. Sweep (`page-sweep.test.tsx`) over the
  27 captured bodies: passes; one line per event in `page-sweep.txt`.
- Changed after reading a result: the sweep showed two DoraHacks pages whose
  first non-structural block is a label ("Formação de equipe", "Fechas"), so
  the hero's lead is now the first block of at least 60 characters holding a
  sentence end; mqcstellar's page has none and shows no description. Not in
  the design above, decided while writing the page: every winner shows (the
  six-card cap hid 6 of the Builder Summit's 12 roster winners, which appear
  nowhere else on the page); the empty Projects card says "No submissions
  from this event are on record" ("yet" before the end) and drops its
  second line, which said projects appear once linked from the directory,
  untrue of stored DoraHacks rosters; a winners-only event shows no empty
  card, its coverage line says it.
- Sitemap: event URLs from `fetchAllDoraHacksHackathons`, after the
  collection pull, deduplicated; the comment saying event pages 404 is
  replaced. New `src/app/__tests__/sitemap.test.ts`: 2 passed (1 fails on
  the base, above).
- Size: the largest page, stellar-hacks-zk (319 submissions), renders
  432,493 characters of markup, 34,888 bytes gzipped (`page-sweep.txt`);
  hackmeridian-2026 renders 4,977.
- 17:44Z: origin/main moved to 7457e0c8 (#1870: scout-mcp 1.8.0, the
  leaderboard route, the changelog; no file the detail route, the page or
  the sitemap reads). `git merge --ff-only origin/main` with the work
  uncommitted (no overlap). Replay again with `git archive 7457e0c8` as the
  base: `cmp` exit 0, the same sha256 dc6feaea... as both earlier runs.
- Checks on 7457e0c8 plus this change: `pnpm exec tsc --noEmit -p
  tsconfig.json` exit 0; `pnpm exec vitest run src/lib/__tests__ src/app/api
  --maxWorkers=4 --minWorkers=1` exit 0, 196 files, 2,544 tests; the page
  and sitemap tests 2 files, 10 tests; `pnpm exec biome check` on the 11
  changed files exit 0 (one warning, `as any` at `src/app/sitemap.ts:162`, a
  line this change does not touch); `CONTRACT_BASE=origin/main pnpm
  contract:check` exit 0 (contract fresh, opacity 0, honesty debt 0, enum
  literals 98, longest description 600, routing-surface-check OK).
- No spec version and no changelog entry: the API's bytes do not change
  (replay above), and the changelog's surfaces are the API, MCP, client and
  skill, not site pages.

- 20:30Z, the review's findings, each fixed with a test written first:
  1. MEDIUM: the winners-only line said "how many projects were submitted is
     not known" while the hero prints the record's own figure ("32
     submissions", "110+ submissions"). Now: "Only this event's winners are
     stored here, not its full list of submissions."
  2. MEDIUM: no deadline on the page's read. A cold read chains DoraHacks
     reads (5 s timeouts), the store reads and a live roster read; every
     event with no stored submissions, four of the seven curated ones
     (HackMeridian 2026 among them), takes the live branch on every view.
     Now the page races `getHackathonDetail` against 6 s, the bound
     `/hackathons` puts on the same reads. Measured first, read-only,
     20:30:59Z, a cache-busting query on six events, x-vercel-cache MISS:
     0.73 to 1.56 s (hackmeridian-2026 the slowest), so 6 s is about four
     times the warm read. Past it the page renders the event's facts, from
     the curated record (no DoraHacks read) or the listing row (read in
     parallel, only for a slug not curated), with "This event's winners and
     submissions could not be loaded right now. Reload the page to try
     again." A slug neither knows is an error, never a 404; nothing waits on
     the platform's timeout. The read runs on and warms the caches, as on
     `/hackathons`. Not done: skipping the live roster read for curated
     events inside `getHackathonDetail` (it always yields none for a
     curated event, so the bytes would not change); that changes the API's
     code path, which this lane leaves to the orchestrator.
  3. LOW: the Builder Summit's roster badges read "1st", an em dash and the
     category, as one pill. The page now splits a placement at a spaced
     hyphen, en dash or em dash (the two dashes written as escapes): the
     place in the badge; what follows in the footer's track slot unless it
     names a prize ("$"), which the footer shows from prizeUsd.
     `parsePlacement` is unchanged: its four callers are the detail lib, the
     builds route and `hackathon-builds.ts` (prizeUsd only) and the
     `/hackathons` winners carousel (its label). Lib, API and data diff
     against c9f1a516: 0 lines.
  4. LOW: a DoraHacks winner's category line was empty; it falls back to the
     track, as the project cards do, and the footer's track slot shows only
     the collection's prize track or the roster's category, so a track does
     not show twice.
  5. LOW: the move's delta, in full. Besides comment punctuation (em and en
     dashes to commas, colons, semicolons or parentheses), the move holds one
     reworded comment (`hackathon-detail.ts` lines 93 to 94: the quoted
     Spanish placement now reads `"Primer lugar" and a category`, not the
     label with its en dash), the prize-tier regex's two dash characters
     written as `\u2013` and `\u2014` (the same pattern), one line biome
     joined (`dora.organization.name.toLowerCase().replace(...)`) and the
     `logApiHit` move stated under Design.
- Failing first, the page test on `git archive c9f1a516` with this test
  file: 6 failed, 7 passed (one per finding; the three deadline tests time
  out at vitest's 5 s). On this branch: 13 passed (`failing-first.txt`).
- Sweep: two checks added, a winners-only page says nothing is "not known"
  and no placement badge holds an em or en dash. Passes on this branch over
  the 27 captured bodies; on c9f1a516's page the badge check fails (12
  Builder Summit badges).
- Noted, left as the review said: page size (comparable to `/hackathons`);
  the curated description printing whole; the 4th to 10th place badge style.
  Track names and descriptions served from DoraHacks still hold em dashes
  on some pages (buildonstellarchile's track, for one): quoted upstream
  text, as the no-dashes lane leaves it.
- CI: `tests.yml` runs `pnpm exec vitest run src/lib/ src/components/`
  only, so the page and sitemap tests, like the route's own tests, do not
  run in CI. A separate follow-up.
- Checks after the fixes (origin/main moved to 724f4e6a meanwhile: the
  workflow-health JSON and the Electric Capital snapshot, which no file the
  route, the page or the sitemap imports reads; not merged here): replay on
  this tree `cmp` against the 7457e0c8 base, exit 0, sha256 dc6feaea... as
  before; sweep passes; `pnpm exec tsc --noEmit -p tsconfig.json` exit 0;
  `npx vitest run src/lib/ src/components/ src/app/ src/collections/
  src/data/ --maxWorkers=4 --minWorkers=1` exit 0, 217 files, 2,684 tests;
  `CONTRACT_BASE=origin/main pnpm contract:check` exit 0; `pnpm exec biome
  check` on the 11 changed files exit 0 (the one existing warning at
  `src/app/sitemap.ts:162`).

- Supersedes the finding 2 entry, the failing-first counts and the
  checks above: written while checking finding 2, the store's start
  (`getPayloadSafe`, which retries once and has no bound of its own) now
  sits inside the 6 s race too, since a slow start could still reach the
  platform's timeout. The store down (the API's 503) now renders a known
  event's facts with the same line instead of the error page; a slug
  nothing knows is still an error, never a 404. Two tests for it: a store
  that never starts, and the outage test, which now expects the curated
  record and the error. Failing first on `git archive c9f1a516` with this
  test file: 8 failed, 6 passed; on this branch 14 passed
  (`failing-first.txt`). Checks after it: replay `cmp` against the 7457e0c8
  base exit 0 (sha256 dc6feaea...), lib, API and data diff against
  c9f1a516 0 lines; sweep passes; `pnpm exec tsc --noEmit -p
  tsconfig.json` exit 0; `npx vitest run src/lib/ src/components/ src/app/
  src/collections/ src/data/ --maxWorkers=4 --minWorkers=1` exit 0, 217
  files, 2,685 tests; `CONTRACT_BASE=origin/main pnpm contract:check` exit
  0; `pnpm exec biome check` on the 11 changed files exit 0 (the existing
  warning at `src/app/sitemap.ts:162`).

## Outcome

One commit on `lane/ep-event-pages`, not pushed. Verified locally only: the
page renders all 27 captured production bodies under test; nothing here is
a receipt until the PR preview renders `/hackathons/hackmeridian-2026`,
`/hackathons/hackmeridian-2025` and `/hackathons/stellar-hacks-zk` and a
reviewer reads them.

Left open, for the orchestrator (not added to `improvements/TODO.md` by this
lane):

- `/hackathons` still links past events to DoraHacks or the organizer's page
  unless the empty collection matches by name; its cards could link the
  event pages now that they render.
- The `/hackmeridian` page (branch `lane/k2-hackmeridian-kit`) did not link
  the event page because it answered 404; it can once this ships.
- A `hackathons` collection row would render without the logos and project
  types the old page read (the API's rows carry neither); the collection is
  empty in production.
- The detail read has no deadline: a cold DoraHacks listing (six reads, 5 s
  timeout each, cached an hour) delays the page as it does the API.

After the review: a second commit on `lane/ep-event-pages`, on top of
c9f1a516, not pushed. The API's bytes are unchanged (replay above); the
receipt is still the PR preview, now also with a read past the deadline
seen to render rather than wait.
That supersedes the open item above on the detail read's deadline: the page
now bounds it at 6 s; the API's own read is still unbounded.
