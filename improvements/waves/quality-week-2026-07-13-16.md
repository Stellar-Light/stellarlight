# Quality week — 2026-07-13 → 07-16 (retro wave report)

The heaviest shipping stretch yet: **~30 PRs (#527–#569), spec 1.7.19 → 1.7.28**, five
arcs. Written retroactively on 07-16 — this folder went stale for four days while the
work happened, which is itself a defect (see "process fix" at the bottom).

## Arc 1 — Tyler's sls loop: deep-fix completion + re-check closures

| Item | State | Where |
|---|---|---|
| sls-019/020/022 research lane | ✅ FIXED | #529 spec 1.7.21 (CAP exact-ID pins; security-program ingest via HackerOne GraphQL; yieldblox facts corrected in our own seed) |
| sls-024 provenance | ✅ FIXED completely | #527 (755 rule-derived writes) + **#545 universal floor** after boxy caught the gated partial: 0/845 active rows null statusBasis |
| sls-033 wallet contract + data | ✅ FIXED completely | #540 (productKind/availability contract) + #543 (first 51 rows) + **#558 (final 14 — verify workflow, 14 agents)**: 65→62 exact rows (3 non-wallets de-typed), 1 honest null (mxlet, defunct) |
| sls-036 leaderboard semantics | ✅ FIXED | #540 + **#542** (Payload `contains` = substring on hasMany → `in` + JS backstop; the filter LOOKED wired because ?type=bad 400'd — only live-filter verification caught the no-op) |
| sls-055 SDF team roles | ✅ FIXED | #544 spec 1.7.26 (`__NEXT_DATA__` card extraction + signature guard; `observedAt` crawl-stamps born) — Tyler's 07-15 re-check confirms |
| sls-056 count-after-dedup | ✅ FIXED | #557 spec 1.7.27 (counts computed AFTER the shadow-fold; invariants `returned === projects.length`, `total >= returned`) |
| sls-023/029 product-deployment models | ⏸ structural asks | tracked in #494/#514; false-live halves fixed (DTCC=Development, oracle statusBasis populated) |
| sls-039 TVL history | ✅ declined-upstream | provider-hosted history accepted as the design boundary |

## Arc 2 — Directory-quality engine + curation passes

- **Engine born (#551): detect → verify → curate** as a reusable flywheel
  (`report-tag-mismatch.ts` + `tag-watch.yml` + `directory-quality-verify.workflow.js`;
  `docs/directory-quality-engine.md`). First tag pass #552: 15 verified writes.
- Dead-project pass #550: 6 verified-defunct → Inactive (adversarial verification saved
  9 false positives the staleness heuristic would have killed).
- Seeds: **stellar-defi-hub + sentora** (#554), **gami-labs + defa-invoicemate** (#563 —
  from the coverage report). SEEDS type gained status-provenance fields.
- **lobster scope-out (#555)** — owner call; recorded honestly as "active, scoped out —
  NOT defunct" (SCF #36 grantee; the near-removal was paused when the record's
  `scfAwarded:true` contradicted the removal premise).
- **Tier 1 validators (#563)**: MoneyGram, Figure, Range (7→10 orgs) recorded as dated
  description facts (range's raw SCF-proposal description rewritten).

## Arc 3 — Coverage & freshness gap engine (raven#18)

- **#561/#562**: `report-coverage-gaps.ts` (4 lanes: defillama / scf / partner-docs /
  freshness) + monthly `coverage-watch.yml` + rolling issue. THE metric for "move
  faster to find, index and serve".
- **Per-chain TVL truth (#563)**: the report AND prod `enrich-tvl.ts` used llama's
  cross-chain headline — Sentora would have written **$2.06B** as Stellar TVL (real
  slice: $1.3k). Both now use `chainTvls.Stellar`. Found because boxy questioned the
  report's "missing" list ("aren't those on other chains?") — NEAR Intents's $92M was
  $11.5k on Stellar.
- raven#18's Alchemy case verified **closed end-to-end**: mmazco's stellar-docs#2573
  merged 07-14 → our dev-docs refresh auto-ingested it the same evening → retrievable.

## Arc 4 — Retrieval: brand/lookup queries (#565 → #567, spec 1.7.28)

`q=Alchemy` returned 0 (vector-first route; lone-word embeddings land in junk) and the
full brand query ranked the answer below top-15. Fix = the third **fetch-not-rank**
sibling (after sls-019 ID pins + the recency supplement): lexical pool supplement +
`fullLexicalMatch` relevance floor 0.8. **Two post-deploy golden regressions forced two
gates** (46→43→44→46): the discriminating gate (floor only when ≤5 chunks carry
coverage — generic vocabulary is not a lookup key) and the recency-intent guard (a
time-anchored query is not a lookup). End state: golden 46/46, forbidden 0, q=Alchemy
0→5, brand query → Indexers Overview #1.

## Arc 5 — Ops

- **npm auto-publish** (#560): publish-packages.yml (idempotent, smoke-gated,
  token-graceful) + api-client **1.7.0 published** (was 6 spec versions stale).
- **Actions minutes crisis (#568)**: measured ~164 min/2 days ≈ 2,460/mo vs the 2,000
  free tier. check-links daily→weekly (18 min/run!), content-freshness push trigger
  path-filtered, post-deploy-eval ceiling 25→12. Projected ~1,400/mo.
- **Self-audit green (54/54)** after 5 red days (#568/#569): bridge-corridors — 7 rows
  of verified networks + the zkliquid→liquidsfi rebrand merge (held-queue item closed).
- **Improvement-loop agent scheduled** (Sundays 09:02, local Claude app, zero Actions
  minutes): reads all rolling issues + its own prior report, PRs the safe data class,
  queues code-class items with probes.

## Process fix (why this file is retroactive)

The changelog is CI-enforced; this folder was habit — and habit lost to shipping
velocity. Standing fix: the Sunday improvement-loop agent's weekly PR now **must**
include the week's `improvements/waves/` + `improvements/lessons/` entries, and
in-session waves append their entry in the same PR that ships the work.
