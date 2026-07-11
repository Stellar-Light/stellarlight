# Ops: polling loops, Payload API shapes, contract gates (2026-07-11)

**Background CI-wait loops are banned.** Two multi-hour hangs from the same bug: a wait-loop's inline jq had broken quote-escaping, errored on every poll, treated error as "pending", and slept in circles — while the PR it watched had been green for an hour. Check-and-merge in the foreground with short direct calls; if a wait is unavoidable, the failure mode of the CHECK must be loud, never "keep waiting".

**Payload find() gotchas (verified live):** `sort` must be a comma-separated STRING — the array form `["-a","-b"]` is silently ignored (a rescan wave picked hackathon repos over the score-74 SDK). Add to the existing list: stored URLs are www-stripped; logger writes stdout.

**Contract gate:** any change to `src/lib/openapi-spec.ts` requires `pnpm run contract:write` (regenerates specs/openapi.json + api-client/src/schema.ts) or CI blocks the PR — and that regen means the PUBLISHED npm client is now stale: bump + republish api-client (and scout-mcp if a tool schema changed) as part of the same wave, not as an afterthought.

**Shared rate budgets:** local eval runs and CI share one GitHub API account (5,000/hr). A burst of local full-evals starved CI into false reds. Sample locally (DEPTH_EVAL_SAMPLE), full-run once before ship, and treat budget exhaustion as SKIP, never red.
