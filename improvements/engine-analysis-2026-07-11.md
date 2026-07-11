# Engine-system analysis — 2026-07-11 (full run + meta-review)

Boxy's ask: analyze, run tests, find improvements — the engine is the breakthrough bet. Everything below was measured TODAY against live.

## North-star (the one number)

**Fresh 198-probe audit re-run (same 19 cells, fresh sampling, 6 independent agents): ok-rate 76%** — trajectory 59% (07-09 baseline) → 69% (07-09 post-wave rerun) → **76%** (today). Target ≥85%. Every number below traces to a run from today.

## What ran green today

| Engine | Result |
|---|---|
| Engine A (generated recall, 8 buckets) | ALL GREEN — P-KNOWN 99.7%, P-TYPE 100%, P-ORDER 100%, P-PHRASE 72.6% (floor 60), P-ATTR 85.7%, PA-CAP 100%, B-USER 100%, R-SYM 100% |
| Engine B (data sweeps) | S3 dupes 0 · S3b domain dupes 0 open · S1 divergence 6 rows (helix ×5, templar ×1) · S4 staleness 392/146 pool |
| Golden retrieval eval | 30/34 pass · 0 forbidden-hits · 0 junk · 0 bad-titles |
| Engine C weekly (dispatched end-to-end) | completed/success, tracker #436 refreshed |
| SCF cross-check | 0 overstated / 0 understated (320 matches) |
| depth-eval (codeDepth) | green, JS margin 0.128 |

## What the audit caught that the engines could NOT (the meta-lesson)

**Generated evals structurally can't see coverage holes.** Engine A generates probes FROM persisted data, so it only tests what's already indexed: R-SYM scored 100% on **5 probes** (only 5 repos have symbols persisted) while the audit's real-world symbol queries (TransactionBuilder, scValToNative) failed — the definer (stellar/js-stellar-sdk) simply hasn't been scanned yet, and passkey-kit isn't indexed at all. Three eyes needed, all now standing: generated recall (is what we have retrievable), demand mining (what real consumers ask), and periodic external-sample audits (what the world needs that we lack).

**The loop can create its own bug classes.** The 07-10 dupe-merge wave created "lineage shadows" that ranked #1 for their own names serving status=Inactive while the Live canonical was absent (q=stellarexpert — a cold consumer reads "flagship explorer: dead"). Relied on "consumers follow the canonicalSlug pointer" — a prose contract (our own catalogued class). Every fix wave needs a next-audit check on the wave itself.

## Fixed TODAY from the analysis (all shipped, conclusion-gated merges)

1. **Shadow-fold** — search swaps surfaced shadows for their canonical record; Engine A generator stops probing shadows.
2. **Match candidate pre-selection** — /api/partners/match ranked candidates by scorePartners(need) instead of insertion-order slice(0,40) that dropped all 5 audit firms ("look outside this ecosystem (e.g. OtterSec)" — OtterSec is IN the directory).
3. **S2 census applicability** — tvlUSD no longer flagged for categories where TVL is meaningless; real gap surfaced (Protocol/Contract 8%).
4. **Golden eval goes standing** — weekly in engine-c-health with forbidden-hits as a red class.
5. **Scale experiment actually parked** — /experiments entry + design brief (discovered the earlier directive was never executed; memory misattributed it to #466).

## Fix queue from the audit (ranked, all with reproducible probes)

1. **Symbol→repo coverage**: prioritize canonical SDK repos in the scan queue (js-stellar-sdk unscanned); index passkey-kit (enrich discovery gap); then symbol queries resolve via the existing symbolsHaystack matching.
2. **Silent-ignore of unknown search params** (status/type/country/sep/network): echo unknown params + advisory, and/or support a real `status` filter — 81 Inactive projects currently unreachable by filter; `q=anchor&country=NG` returns unfiltered results as if filtered.
3. **Research freshness ranking**: "latest/recent/current" queries retrieve ancient sections while fresher chunks are indexed (P20 section served for "latest soroban release"; P27 Zipper indexed but not surfaced). publishedAt should boost recency-intent queries. Plus junk-chunk classes: meeting stubs, SDP auth-API refs, heading-only stubs.
4. **Named-entity/exact-ID research lookup**: cap-46 / certora / ottersec miss documents provably in the index (PDF extraction may lose firm names).
5. **"X vs Y" comparison queries drop a subject** (blend vs yieldblox loses Blend); **"highest tvl" ignores tvlUSD** (F1-class: structured fields must drive inclusion).
6. **Negation matching**: "custody" matches "NON-custodial" (omission=negation class, live again).
7. **Data truth**: venalabs pivoted (education → airdrop farm) but listed Live with stale description; helix/templar supportedNetworks additions (S1 rows).
8. **stellar-core codeVerified wart**: isDeployableContract=true for a C++ validator (embedded Rust host).

## Engine-system state (what stands guard now)

Daily: self-audit (19 checks) · api-drift · check-links · scan-repo-code backlog · EC + corpus refresh crons.
Weekly: engine-c-health (A recall + B sweeps + corpus S5-S8 + Engine D demand + SCF cross-check + golden eval, with week-over-week deltas → tracker #436) · depth-eval · enrich-tvl.
Monthly: liveness-watch.
Dispatch: deepwiki-calibrate (3/83 indexed — coverage-limited by design).
On-PR: depth-eval gate on the scoring stack · contract gate · vitest.

## The breakthrough assessment (honest)

The engine is real and compounding: it found, root-caused, and shipped fixes for 5 classes TODAY, and its measurement dimensions (supply, demand, data-truth, corpus, code) are each guarded. What makes it "the breakthrough" is the Scale move: the measurements become the product (/quality scoreboard + per-consumer report + DATA_SLA — parked as experiment `scale-model-quality-products`, brief in improvements/idea-scale-model.md). Two structural limits to respect: generated evals can't see coverage holes (keep external-sample audits in the loop), and a public scoreboard is only an asset while reds get fixed fast — which is exactly what the engine is for.

Next measurable milestone: **north-star ≥85%** on the next audit re-run after the fix queue above lands.

## Re-measure (same day, post fix-queue): 82%

**163/198 OK — 59% → 69% → 76% → 82%** (target ≥85). Same 19 cells, fresh sampling, six independent agents. Per family: projects-core 32/33 · routing/multiproduct/truth 25/29 · partners/builders/longtail 28/33 · projects-intent 26/32 · repos 25/33 · research 27/38 (NEWS 13% → 37.5% → 50%).

Confirmed fixed live: match returns directory audit firms (Veridise/OtterSec/Halborn top-3 for the probe that failed yesterday); tombstones fold to Live canonicals; tvl-superlative ranks by tvlUSD exactly; vs-queries pin both subjects (blend/yieldblox #1-2 — noting YieldBlox is a pool ON Blend, which our record correctly states); known-item 11/11; browse 11/11 (authority-tunnel gone); canonical repo routing 11/11; long-tail 11/11 on spec 1.7.12.

The re-measure also graded the wave itself → same-day fixes: #481 (Payload `sort` array silently ignored — comma-string; TS rescan re-dispatched) and #482 (status-browse counts exact via DB shadow-exclusion in no-q mode; vs subjects re-pinned post-sort).

**Next queue (ranked, reproducible probes in the agent outputs):** (1) negation loophole — the scoreTokens fix ships but "custody with staking" still matches non-custodial products at 0.97 live; suspect readmission via the structuredHit/intentTypes path; (2) js-stellar-sdk symbols — verify the re-dispatched rescan lands real symbols (the 07-06 scan yielded zero; JS extraction may find nothing in the SDK's layout); (3) research pool-recall: `path payments`, `sep-10` self-name, single-token auditor names (ottersec/certora) miss docs provably indexed; (4) header-only chunk hygiene — dev-meeting date stubs survive `isLowValueChunk` and get promoted by the recency re-rank; (5) NL status intent ("defunct projects") should route to the status machinery; "scf awarded X"-in-q should map to the structured filter; (6) data: involt carries Ping's description verbatim; Yellow Card `coverage.countries` null; `coverage.seps` populated on only ~3 anchors; (7) cross-lane hints only fire on semantic/empty — keyword-mode how-to queries serve 0.97-high project noise with no hint.
