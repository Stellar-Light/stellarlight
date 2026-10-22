---
name: live-checks
description: Use after a merge deploys, before calling any change verified, and when re-checking earlier claims after time has passed. Turns each claim into a live probe with an assertion that would fail if the claim were false.
---

# Live checks

"Verified" means a live probe passed after the deploy. A passing test or a
merged PR is not a live check.

## Steps

1. Confirm production runs the merged version:
   `curl -s https://www.stellarlight.xyz/api/openapi.json` and read
   `info.version`. Record it at the start and at the end; if it moved, the
   checks are not comparable.
2. List every claim the change makes: changelog entries, the PR body, queue
   items it closes.
3. For each claim, write one probe: a request plus an assertion that is false
   if the claim is false. Prefer exact fields over text matching.
4. Check the denominator. A probe that saw zero relevant rows proves nothing.
   Re-run it on a request that returns the rows the claim is about, and say
   that you did.
5. Run the probes, read the results and record pass or fail per claim with the
   numbers behind it.
6. Record commands, times and results where the change is tracked (round
   ledger or PR). A failure that comes from a pending owner action (for
   example an execute lane not yet run) is a fail with that reason, not a pass.

## Rules

- Never round a vacuous pass up to a pass.
- Name what was not checked.
- A count that did not move can hide a swap: report what was lost and gained.
- Read back what you post or write, through the same public path a consumer
  uses.
