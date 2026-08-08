# 2026-08-08 — Zero-work green runs, and shape ≠ population

## What happened

The contractInterface backfill wave (post-#774) hit the shared scan PAT's
rate limit **0.8 seconds in**, scanned zero of its 40 selected repos, and
exited green. Every dashboard said healthy; the field served empty. The
follow-up sweep found the same class in four more places: `curate-projects`
stomped its own failure exit-code with `exit(0)` (the exact bug
`enrich-repos` had already fixed and *documented* — the lesson was written
down but never swept across siblings), `sync-lumenloop` swallowed per-item
errors, `enrich-from-scf` treated a 200-with-zero-rows listing as success.

While diagnosing, a hand-rolled probe used the wrong field name
(`codeSignals` — the Payload group name — instead of the served
`codeVerified`) and manufactured a fake global outage for an hour.
Meanwhile the real regressions sat elsewhere: a curated knowledgeNote wiped
on one repo (#777) and capStatus nulls in the CAP crosswalk (#778) — both
live-verified at ship time, both silently degraded later, both invisible
because nothing re-checked population after day one.

## The root

Three failure modes, one family — **evidence decays and nothing re-reads it**:

1. **A run's exit code can lie.** Zero-work and failed-work runs exiting 0
   make starvation look like health. A quiet detector is indistinguishable
   from a green one (see 2026-07-16 slice-truth lesson — same family).
2. **Shape checks don't verify values.** engine-E and check-api-drift prove
   the spec and the serving shape agree; neither notices a field that serves
   `[]`/null forever. Ship-time verification is a snapshot, not a guard.
3. **Lessons don't propagate by being written down.** The exit-stomp fix
   lived in enrich-repos with a comment; three sibling writers kept the bug.
   A lesson only sticks when it becomes a detector or a swept fix.

## Standing prevention

- **Zero-work/failed-work runs exit 1** — shipped across scan-repo-code
  (#775), curate-projects, sync-lumenloop, enrich-from-scf (#776);
  enrich-repos already had it. New pipeline scripts must follow: an empty
  upstream sweep or swallowed item errors are failures.
- **Field-population guard** (`scripts/check-field-population.ts`, daily in
  api-drift.yml, #779): every advertised field has a probe pinned to a row
  where it MUST exist (curated entry / hand-verified backfill — known-item
  style). Known regressions carry `knownFailing: "#issue"` → daily ⚠ until
  closed. SHIPPING.md rule: a PR adding a served field adds a probe.
- **One shared PAT budgets ALL scan/enrich Actions** (5,000/hr). Sequencing
  a corpus re-stamp and a wave in the same hour starves the second. Space
  dispatches or budget the hour; the wave log line `⏸ GitHub rate limit
  hit` is the tell. (The run-log ZIP endpoint works when the jobs-listing
  endpoint 403s.)
- **Verify with the served field name** — from RepoResult / the OpenAPI
  spec, not from memory. A wrong-key probe invents an outage; the guard's
  probes are the canonical names now.
