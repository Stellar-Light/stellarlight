# Directory-quality engine — liveness + tagging

The self-improving loop that keeps the projects directory correct: are records
**alive** (and to what degree), and are they **correctly tagged**. Same
`detect → verify → curate` flywheel for both axes, so neither is a one-off
manual pass.

```
        ┌─────────── DETECT (cheap, deterministic, report-only) ───────────┐
        │  report-liveness.ts      3 death signals → ≥2-signal shortlist    │
        │  report-tag-mismatch.ts  description names a PRIMARY function     │
        │                          its `types` omit → mismatch shortlist    │
        └──────────────────────────────┬───────────────────────────────────┘
     monthly CI (liveness-watch.yml, tag-watch.yml) → rolling review issues
                                        │  candidates (never verdicts)
        ┌───────────────────────────────▼──────────────────────────────────┐
        │  VERIFY (Scale-AI layer — agents web-check each candidate)        │
        │  scripts/eval/directory-quality-verify.workflow.js                │
        │  one agent/candidate → unified verdict, in ONE site visit:        │
        │    liveness: live | partially-live | dead   (partial = entity     │
        │              alive but Stellar product announced/testnet — the    │
        │              sls-023 DTCC case)                                   │
        │    tagging:  the correct `types` from what it ACTUALLY does       │
        │  + evidence + confidence. Moved/quiet ≠ dead (class 18).          │
        └──────────────────────────────┬───────────────────────────────────┘
                    high-confidence     │      medium / uncertain
        ┌───────────────────────────────▼───────┐   ┌──────────────────────┐
        │ CURATE (auto-apply tier)               │   │ human review queue   │
        │ STATUS_FIX (Live→Inactive / →Dev) and  │   │ (the watch issues)   │
        │ TYPES_SET rows in curate-projects.ts   │   └──────────────────────┘
        │ → curate-projects Action (dry→execute) │
        └────────────────────────────────────────┘
```

## Why the verify step is non-negotiable

The detectors are heuristics: a stale repo isn't death (bidali/moneygram/fluxity
are alive with stale repos), and a passing mention isn't a mistag. The
`directory-quality-verify` workflow is what turns a candidate into a grounded
verdict — it caught 9/20 liveness candidates as **alive/moved** on the first
run (fluxity = our own streaming flagship), and it distinguishes
**partially-live** (announced/testnet) from **live** and **dead**.

## Frontend/API note

`/directory` and the API read the SAME Payload `projects` collection. `Inactive`
records are filtered out of the directory (`status ∈ {Live, Development,
Pre-Release}`), so marking a dead project `Inactive` **hides it** — no display
change needed. A curation fix reaches both surfaces at once.

## Run it

```sh
# detect (report-only)
pnpm exec tsx scripts/report-liveness.ts          # dead candidates
pnpm exec tsx scripts/report-tag-mismatch.ts      # mistag candidates
pnpm exec tsx scripts/report-tag-mismatch.ts --json > /tmp/tags.json

# verify a candidate set (agents web-check each; args = detector --json output)
Workflow({ scriptPath: "scripts/eval/directory-quality-verify.workflow.js", args: <candidates> })

# curate high-confidence verdicts → TYPES_SET / STATUS_FIX in
# scripts/data/curate-projects.ts + scripts/data/curation-maps.ts, then the
# curate-projects Action (dry-run → execute). Never bulk-flip on a heuristic.
```

Cadence: detectors monthly (CI, 1st of month) → review issues; verify + curate
on the delta.
