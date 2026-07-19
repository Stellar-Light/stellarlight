# Engine loop integrity — signals must not die in dead ends (2026-07-19)

## Why

The 07-19 engine recon found the loop's weakest point is not detection but
what happens AFTER: Engine A and the daily api-drift / content-freshness /
openapi-lint guards ended at exit-1 + a step summary nobody is paged on;
self-audit files issues on red but nothing closed them on green (#487 open
days after the audit returned to 54/54); and the top-ranked defect from the
07-11 analysis (custody negation/mention ranking) sat unfixed for 8 days
with no issue tracking it — which proved the point.

## What shipped

- **`.github/actions/rolling-issue`** — one composite action: on failure,
  upsert ONE rolling issue (comment, never spam per-day issues); on green,
  comment + auto-close. The open-issue queue now reflects reality.
- Wired into: **self-audit** (close-on-green added to its existing filer),
  **generated-recall / Engine A**, **api-drift**, **content-freshness**,
  **openapi-lint** (scheduled/dispatch runs only — PR reds are the PR's
  problem). Each detector still fails its run (the red stays visible in
  Actions); it just also lands in the tracked queue.
- **engine-b-sweeps schedule retired** (dispatch-only now): engine-c-health
  re-runs A+B an hour later and upserts tracker #436, so the standalone
  Sunday run produced an unread report while Actions minutes are rationed.
- **The 07-11 fix-queue #1 defect is FIXED** (separate PR, mention-vs-identity
  ranking): records that ARE the anchor capability outrank records that
  merely mention it mid-prose; mention-only rows cap at 0.7 "medium".

## Verify

- Next daily self-audit green run should close the rolling "Self-audit
  failure" issue automatically (#487 closed manually with the same
  rationale when this merged).
- Force a check: dispatch api-drift with base=https://example.com → red run
  files/updates "API drift guard red"; next normal run closes it.
