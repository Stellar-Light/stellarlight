# Media records with no file, and the predicted logo repair

Evidence for the media round of 2026-11-13 (branch `lane/r1113-media-missing`).
Everything here was read with GET from public sources. Nothing was written to
production, and the repair has not been run: the plan is a prediction.

## What was measured

1. **Which media records have a file.** One GET of `/api/media/file/<filename>`
   for each of the 1,232 media records the public API lists: 832 answered 200
   and 400 answered 404, none unchecked. 137 served rows point at a record
   with no file, all of them project logos (117 Live, 9 Development,
   4 Pre-Release, 4 Inactive, 3 Draft). 263 records with no file have no row
   pointing at them. Measured four times on 2026-11-13 between 22:30 UTC and
   2026-11-14 00:06 UTC, with the same result each time; the last run read
   production's API version, 1.9.149, at its start and its end. The artifact of
   the run at 2026-11-13T23:02Z is `../media-files-latest.json`.
2. **What the repair would do for the 137 rows.** A dry run of
   `scripts/data/repair-missing-logos.ts` on 2026-11-14 from 01:15 UTC to
   01:17 UTC, with production at API version 1.9.150 at its start and its end:
   117 repairs planned and 20 rows left unchanged. For each row it reads the
   image on the row's own SCF page and takes it only when the page confirms
   the row: a reviewed join, a site on the same host, a GitHub owner both
   link when no other project links it, or the same GitHub repository. The
   plan was computed three times as the rule was tightened after two audits
   (2026-11-13 23:53 UTC, 2026-11-14 00:49 UTC and 01:15 UTC): the same 117
   repairs and the same 20 rows each time, with only the wording of what
   confirms a row changing.

## Files

- `predicted-repair-plan.txt`: the counts, then one line per row: the source
  URL and what would be written, or why the row is left as it is.
- `predicted-repair-plan.json`: the same plan as data (`--plan-out`).
- `repair-dry-run.log`: the dry run's full output.

## How to reproduce

No secret and no database are needed. From the repository root:

```sh
# 1. every media record's file, and the rows that point at a missing one
pnpm exec tsx scripts/check-media-files.ts --out /tmp/media-files.json

# 2. the repair plan (reads the public API, SCF's listing and SCF's project pages)
pnpm exec tsx scripts/data/repair-missing-logos.ts --plan-out /tmp/plan.json
```

Step 1 makes about 1,250 requests to the site and takes about a minute.
Step 2 makes about 900 requests to the site, one to SCF's listing, about 130
to SCF's project pages and about 120 to SCF's image host, and takes about
four minutes. Read `/api/status` before and after a run and record
`apiVersion`: a run that straddles a release is not comparable.

The plan moves when SCF changes an image or a page's links, when a row's
links or SCF page change, or when a file is restored. Compare the rows, not
the totals: a total that did not move can hide a swap.

## The order to execute in

The repair writes to production, through `repair-missing-logos.yml` on main
only. Dispatch it in this order, and read each run before the next:

1. A dry run (`execute` unticked). Compare its lines with
   `predicted-repair-plan.txt`.
2. One small row: `execute` ticked, `only=komet` (3,882 bytes). Read the three
   steps (Plan, Execute, Re-plan says 0) and open the new logo URL.
3. One large row: `only=azza` (6,074,818 bytes). The largest file production
   serves today is 1,854,840 bytes (`agama-scf.jpg`, read 2026-11-13), and 13
   of the planned sources are larger. The two largest, `hatom-protocol`
   (8,738,618 bytes) and `cryptomate` (8,595,074 bytes), are larger than
   anything the site has served, so prove a 6 MB file reads back before the
   run reaches them.
4. Every row: `only` empty. Re-plan must say 0.

The run stops at the first upload or file read-back that fails and names the
row. A row whose own update or read-back fails is counted, the run goes on,
and the Execute step ends red with the rows named on its last line.

## What was not measured

- The repair's execute path has never run against production. Its order
  (upload, read the file back, then move the row, then read the row back) is
  held by tests with a stand-in store and site
  (`src/lib/__tests__/logo-repair.test.ts`).
- The probe's verdict is the GET status. It does not compare the bytes a file
  serves with the size on its record.
- The records from 2025-11 and 2025-12 have no run log; who wrote them is
  inferred from their names and timestamps, not proven.
