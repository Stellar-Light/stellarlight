# codeDepth track status — 2026-07-10 (#126 substantially complete)

Full audit of the codeDepth stack while closing the "DeepWiki calibration" sub-item. The track is built, calibrated, and flowing to production ranking.

## What's in place

| Piece | State | Where |
|---|---|---|
| Rust depth model | v2, 11-patch adversarial-hardened, gated | `src/lib/code-depth.ts` |
| JS/TS depth model | calibrated (the ~1,900 non-Rust repos) | `src/lib/js-depth.ts` |
| Answer-key eval | **green** — Rust + JS DEEP/SHALLOW separate with margin | `scripts/scan/depth-eval.ts` |
| CI gate | runs on PRs touching the scoring stack | `.github/workflows/depth-eval.yml` |
| Scanner | daily backlog (60/day, converging ~1,700) + weekly stale-first | `scripts/scan/scan-repo-code.ts`, `scan-repo-code.yml` |
| Flows to ranking | `codeDepth` → `repo-grade.ts` (clamped, scored) → `repoScore` | `src/lib/repo-grade.ts:121` |
| DeepWiki calibration | **new** — independent external cross-check | `scripts/scan/deepwiki-calibrate.ts`, `deepwiki-calibrate.yml` |

Last eval (2026-07-10): JS `min(DEEP)=0.510 max(SHALLOW)=0.400 margin=0.110`; Rust separation holds → gate passed.

## DeepWiki calibration — the finding

Asks DeepWiki (Cognition/Devin, which has read each repo) to independently classify every answer-key repo substantial-vs-template, diffed against our DEEP/SHALLOW label. **Of 83 answer-key repos, only 3 are DeepWiki-indexed** (DeepWiki indexes on demand and the MCP exposes no index-trigger tool). Of those 3, **100% agree** with our label. So it's a *confidence supplement*, not a coverage-complete guard — hence **dispatch-only** (no cron; a scheduled run would grade a near-empty set). The comprehensive validation remains the answer-key depth-eval gate. Coverage grows automatically as repos get indexed; re-dispatch to re-measure.

## Remaining (optional, not #126-core)

- **JS frontier blind spots (3):** `allbridge-io/allbridge-core-js-sdk` (0.300 — a real cross-chain SDK at the boilerplate floor), `chatch/stellarexplorer` (0.418), `lobstrco/lobstr-browser-extension` (0.369). Real false-negatives the JS scorer under-rates; tracked non-gating in the eval. Lifting them needs a careful JS-model tweak-signal pass (risk: the passing gate) — a follow-up, not a blocker.
- **Semantic / code-content indexing:** a separate larger feature (vector index over code), not part of #126's scanner/eval/gate scope.

**Verdict:** #126 (full codeDepth scanner + DeepWiki calibration + eval + CI gate) is done. codeDepth is a live, gated, self-refreshing signal feeding repo ranking. Moves to maintenance.
