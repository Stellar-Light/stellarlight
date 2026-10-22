---
name: red-lane-triage
description: Use when a scheduled GitHub Actions lane is red, after a batch of merges, or when asked whether the lanes are healthy. Classifies each failed run and records new problems in the queue.
---

# Red-lane triage

## List what did not pass

```bash
gh run list --repo Stellar-Light/stellarlight --limit 200 --created '>=<ISO time>' \
  --json workflowName,event,conclusion,createdAt,databaseId \
  -q '.[] | select(.conclusion != "success" and .conclusion != "skipped") | "\(.createdAt) \(.workflowName) \(.event) \(.conclusion) \(.databaseId)"'
```

## For each run

1. The failing step:
   `gh run view <id> --repo Stellar-Light/stellarlight --json jobs -q '.jobs[].steps[] | select(.conclusion=="failure") | .name'`
2. The error: save `gh run view <id> --log-failed` to a file and read the
   lines before the first `##[error]`. The step column can read
   `UNKNOWN STEP`, so do not filter on it.
3. History: `gh run list --workflow "<name>" --limit 10`. Red before the
   change you are checking means the change did not cause it. Check the
   failing step of earlier failures too; a lane can fail in different steps.

## Classify

- **Designed signal:** the lane exits 1 when it finds something (for example
  the gone-repos probe while deleted repos are still served). Read its finding.
- **Upstream outage:** a source answered 5xx or timed out. Note the next run.
- **Known intermittent:** the same step has failed before the change. Queue
  it if it is not queued.
- **Superseded:** cancelled because a newer push started the same workflow.
- **Regression:** it started with a merge. Fix it now.

## Record

Every new problem becomes an item in `improvements/TODO.md` with how it was
found (run ids, failing step, history). Never call a lane healthy because it
is usually red; a signal that stays red hides real breakage.
