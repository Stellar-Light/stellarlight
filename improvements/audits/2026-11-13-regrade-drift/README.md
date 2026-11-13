# Regrade drift, 2026-11-13

Read-only measurement. No database writes, no workflow dispatched. Inputs:
the public `/api/repos` rows (13,868, all of them) and `/api/projects` rows
(1,157), read 2026-11-13 01:20 to 01:30 UTC, graded locally with the regrade
lane's own per-row code (`src/lib/repo-regrade.ts`). The replay reproduces
the lane: the regrade dry run (run 43343702683, 01:16 UTC) printed `13868
read · 6339 would change`; the replay on rows read minutes later gives 6,351.
Of the 12 extra, 8 are rows a code scan wave rewrote after the dry run
started, and 4 cross a rounding edge as the clock moved (the same snapshot
gave 6,347 at 01:30 UTC and 6,351 at 01:50 UTC). Its top 20 moves are the
dry run's top 20 (ties in another order). Every count below is from the
6,351.

## Decision asked

Run the full regrade once, put it on a schedule, or have the writers that
create rows grade them at creation.

**Recommendation: schedule it (weekly, after the scan, activity and builder
lanes), and let its first run be the one-time catch-up.** About 72% of the
drift is time only (commit and release age), which accrues on every row every day whatever any
writer does; only a recurring pass removes it. Grading at creation fixes 7%
(the 425 builder-owned rows) and adds another writer of `repoScore`. A single
full run fixes today and drifts back: 4,556 rows moved by time only out of their stored
grade in the two months since the last full run.

Guards the schedule should carry before it writes unattended: the read-back
this branch adds (a write that does not read back fails the run), a cap on
rows changed per run like enrich's `UNLINK_CAP` (a weekly run moves a few
hundred rows by 1 or 2 points; thousands means an input lane misbehaved), and
`scripts/check-repo-ranking.ts` after it. This lane changes no schedule.

## 1. The scoped run for the 38 unlinked rows

`unlinked-38.txt` is the 38 `unlink` lines of run 43338207416.
`predicted-scoped-plan.txt` is what
`scripts/regrade-repos.ts --only-file=improvements/audits/2026-11-13-regrade-drift/unlinked-38.txt`
prints as a dry run, computed by `predict.mts` from the public rows. It is
exact if the rows are unchanged when the run happens: every grade input is
served publicly (internal notes are stripped, and they count for nothing in
the grade anyway), and none of the 38 rows was written after the unlink at
01:03 UTC. Moving the run date: +1 and +3 days give the same lines; +7 days
changes 4 lines by 1 point.

- 38 of 38 named rows match; 27 would change, 11 already hold their grade.
- Every change is a drop of 1 to 12 points; all 38 are `low` before and after.
- 12 drop because the old project no longer counts (OCTO 7 rows, -3 each;
  DeFindex 3 rows, -7, -9 and -12, the -12 including 2 points of commit
  age; RAMM -11; PayKit -5). Those projects are
  SCF-awarded; DeFindex also has prominence 78.
- 15 drop 1 or 2 points by time only (commit and release age) since the last full regrade (graded
  with the old project linked at 2026-09-15, they equal their stored score).
- None of the 38 appears in the top 10 of any of the 20 queries below, so the
  scoped run moves no measured search result.

For the workflow, the `only` input is the 38 names joined by commas (1,183
characters).

## 2. Why 6,351 rows drifted

The last full regrade execute (run 34919573771, 2026-09-15 02:02 UTC) printed
`13260 read · 1 would change`: every row then held its own grade. Each move is
split against that point with `drift2.mts`: the grade at 2026-09-15 with
today's stored inputs, against the stored score.

| cause | rows |
|---|---|
| Time only (commit and release age): inputs unchanged since 2026-09-15 | 4,556 |
| Inputs rewritten since 2026-09-15 by lanes that never grade (activity refresh: stars, commits, archive flag; code scan: Stellar proof, code depth, SDK pin, tests, CI; package check) | 1,358 |
| Never graded: builder-owned rows created after 2026-09-15, stored as 0 with no label | 425 |
| Project-link rows created after 2026-09-15, inputs changed after | 12 |

By source: ec-taxonomy 5,262, builder-owned 630, project-link 455 (163 still
linked to a project). Size: 5,533 move 1 or 2 points, 421 move more than 10;
5,358 go down, 897 up, 93 change only the label. Label changes: 393 none to
low, 32 none to medium, 96 low to medium, 92 medium to low, 1 high to medium.

Who writes what:

- **Write `repoScore`:** enrich-repos (weekly, only rows a project claims),
  ingest-ec-taxonomy (at create, own merit only; manual), ingest-dora-evals
  (at create or as a judge lift; manual), regrade-repos (manual dispatch only;
  last full execute 2026-09-15).
- **Rewrite grade inputs and never grade:** scan-repo-code (every 2 hours),
  enrich-repo-activity (daily), verify-published-packages (weekly), the
  enrich-repos unlink (manual), backfill-version-status (manual).
- **Create rows and never grade:** enrich-builder-repos (weekly, Tuesdays; 9
  runs since 2026-09-15, all succeeded). Its code says enrich-repos owns the
  derived fields, but enrich-repos only visits rows a project claims, and a
  builder-owned row has no project, so no scheduled lane ever grades one. 425
  of the 918 builder-owned rows have no grade: all but one created since the
  last full regrade. 315 of them are already code-scanned, so their facts are
  stored and only the grade is missing. Search's candidate window (top 600
  keyword matches by `repoScore`) and the scanner's queue both sort by
  `repoScore`, so an ungraded row sits at the bottom of both.

## 3. How the full regrade would reshuffle repo search

`search-replay.mts` runs the real `searchRepos` over the public rows with an
in-memory stand-in for Payload's find (`like` as an AND of case-insensitive
word matches, the `-repoScore` sort with Payload's `-createdAt` fallback,
`select` exclusions honoured). With stored scores it reproduces the live
`/api/repos/search?limit=10` top 10 exactly on 20 of 20 queries
(`replay-vs-live.txt`). The after-ranking is the same replay with the scores
the full regrade would write; nothing else changes.

Queries: the 11 repo search live probes, the 6 golden repo questions, and
payments, remittance, nft marketplace, wallet.

- 13 of 20 queries change their top 10: 12 repos enter, 12 leave, 43 reorder
  inside. 7 are unchanged (anchor platform, stellar wallets kit, soroswap,
  passkey smart wallet, stellar core consensus, oracle price feed, wallet).
- The first and second results do not change on any query; the third changes
  on one (remittance: a never-graded row, 0 to 25, rises from 7th).
- 2 of the 12 entrants are never-graded builder rows
  (Timrossid/global-remittance-bridge, 0 to 43, enters remittance at 9th);
  the other 10 are graded rows, which enter because their own score rose or
  because rows ahead of them moved. Search ranks a 600-row candidate window
  cut by `repoScore`, so a regrade also changes which rows are ranked at all.
- The ranking answer key (`improvements/evals/repo-ranking-answer-key.json`)
  holds 11 of 11 pairs before and after.

Full before and after lists: `ranking-diff.txt`.

## 4. Are the big drops right

46 rows drop 10 points or more. `drops.mts` restores one input at a time to
find what drives each:

| driver | rows |
|---|---|
| SDK pin now `deprecated` (x0.75) | 16 |
| Archived on GitHub (x0.5) | 11 |
| Archived and commit age | 3 |
| Archived and deprecated SDK | 2 |
| Scan found no Stellar code | 2 |
| Archived and no Stellar code (ravendevteam/alternet) | 1 |
| Commit age, alone or with deprecated SDK | 2 |
| No single input | 9 |

For all 45 that existed then, the grade at 2026-09-15 with today's inputs is
within 1 point of today's grade, so the drops come from inputs written after the last regrade,
not from time. Each is what the current definition asks for: an archived repo
is a weaker reference, a repo pinned to a deprecated SDK is penalised, and
stars from outside Stellar count for a quarter when a scan found no Stellar
code (the rule written for iancoleman/bip39). The 9 with no single driver
were sampled three times (AgriTrust-Protocol/AgriTrust-Contracts,
Fluxora-Org/Fluxora-Contracts, VeriNode-Labs/VeriNode-Frontend): each was
re-scanned after 2026-09-15 and loses on several scanned facts at once.

**ravendevteam/alternet, 67 to 18.** A web protocol with 976 stars. It was
graded when unscanned (no Stellar verdict, so full star credit) and
unarchived. The scan on 2026-10-02 found no Stellar code, and the activity
refresh on 2026-10-31 recorded that the owner archived it. Under the current
grade it is 18, and it was 18 at 2026-09-15 with today's inputs. Correct.

One caveat: drops through `deprecated` inherit the stored SDK pin. The queue
already records 166 stored `versionStatus` values that lag the 2026-11-12 SDK
table, and the support-floor choice is an open owner decision. The regrade
writes whatever the row stores.

## Reproduce

Fetch the rows into one folder (`repos-all.json` as a JSON array of every
`/api/repos?depth=0` row, `projects-all.json` as the `/api/projects?limit=2000&depth=0`
body, plus a copy of `unlinked-38.txt`).
With `sort=id`, `/api/repos` answers 500 from page offset 11,600 on (the
default sort pages to the end); past it, read with
`sort=id&where[id][greater_than]=<last id>`. Then from the repo root run
`pnpm exec tsx improvements/audits/2026-11-13-regrade-drift/<tool> <folder>`:
`plan.mts` first (it writes `after-grades.json`, which `search-replay.mts`
reads), then any of the others.
