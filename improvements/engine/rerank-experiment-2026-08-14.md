# Reranker experiment — measured, verdict: SKIP (2026-08-14)

Question: would a commercial reranker (Voyage `rerank-2.5`) over our served
top-20 improve the rank of the known-correct document on the golden research
cases? Method: adopt-only-on-measured-lift. Baseline = live `/api/research`
order; treatment = same 20 docs reranked; ground truth = each golden case's
`expectUrlIncludes`.

## Result

| case | expected rank before → after |
|---|---|
| agentic-payments-x402 | 1 → 1 (tie) |
| q-org-sdf-structure-mandate | 1 → 1 (tie) |
| q-org-sdf-enterprise-fund | **1 → 5 (LOSS)** |
| q-org-sdf-leadership-roles | 1 → 1 (tie) |
| soroban-hosterror-decode | 1 → 1 (tie) |
| soroban-storage-ttl-cap | **4 → 1 (WIN)** |
| soroban-test-event-assertions | 1 → 1 (tie) |

`model=rerank-2.5 · n=7 · W/L/T 1/1/5 · MRR 0.893 → 0.886`

## Verdict

No measured lift — MRR slightly *down*. The one win (storage-ttl 4→1) is
bought with a worse loss: the reranker demoted the canonical enterprise-fund
page from 1 to 5. Our confidence composition's authority/freshness floors
encode domain knowledge (which page is *canonical*, not merely relevant) that
a generic relevance reranker cannot see. Adding a per-query paid API call +
latency for a net-negative would be adoption by fashion, not evidence.

Re-open only if: the golden set grows enough that rank-of-expected misses
become common (today 5/7 are already at rank 1 — there is almost no headroom),
or a reranker can consume our authority/freshness signals as features.

Script: session scratchpad `rerank-experiment.ts` (read-only against prod,
paced 1.1s; reproducible with `VOYAGE_API_KEY` against the committed
`scripts/eval/golden-questions.json`).
