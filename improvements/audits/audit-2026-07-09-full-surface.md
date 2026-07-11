# Full-surface retrieval audit — 2026-07-09

**Method:** 162 agents · 19 lane×intent cells · **597 live probes** · ground-truth grading only (a failure must be provable from the record's own structured data) · explicit no-anchoring rule (bridges/ramps/Etherfuse excluded — those were just fixed) · every claimed failure adversarially refuted before counting. **138 confirmed / 4 rejected.** Full reproducible findings: [audit-2026-07-09-findings.json](./audit-2026-07-09-findings.json).

**Headline: boxy was right.** The corridor/bridge fixes were a drop in the bucket. But the 138 findings are NOT 138 problems — they collapse into **8 systemic roots**, most fixable by one general mechanism each.

## Scoreboard (ok probes / total)

| Cell | OK | Worst confirmed modes |
|---|---|---|
| Projects × known-item | 42/47 | slug/punctuation forms (D'CENT), zero-hit → no vector fallback |
| Projects × type browse | 16/28 | **types[] doesn't drive inclusion** (Social Impact 3/15 retrievable, SDK 63/141) |
| Projects × attributes | 13/25 | seps/currencies never drive inclusion; 59 null descriptions |
| Projects × status/temporal | 27/36 | query-shape sensitivity; semantic rescue inconsistent |
| Projects × vague consumer | 12/19 | no stemming; common tokens outrank rare intent tokens |
| Projects × superlative | 10/24 | "biggest/best" = literal AND keywords; no honesty note |
| Repos × tech/keyword | 11/42 | **no Stellar-relevance factor** — dead other-chain repos beat codeVerified Stellar repos on 7 new verticals |
| Repos × symbols | 38/47 | fix generalizes ✓; digit-boundary residual (groth16/secp256r1/ed25519 unfindable) |
| Repos × canonical/explain | 17/30 | unmapped NL → token-soup top-1; named-project routing misses (blend, freighter) |
| Research × how-to/setup | 12/23 | staleness CLEAN ✓ (wasm32v1-none 5/5); **ingestion holes**: /docs/learn, /docs/tokens, /docs/validators absent |
| Research × concepts/SEPs | 15/22 | SEP recall 9/9 ✓; **CAPs not ingested at all** |
| Research × safety/audits | 16/30 | audit known-item strong ✓; incidents corpus = 1 doc, misses "stellar hacks" |
| Research × news/current | 6/18 | undated dev-docs immune to freshness term dominate news queries; broken sdf-blog titles |
| Partners × non-ramp | 17/38 | **19/45 fresh partners tagline=null → quality bar hides ALL wallets + ALL protocols**; total=0 reads "none exist" |
| Builders | 25/35 | githubUsername/location not driving inclusion; skill= silently aliased to q; location 23% populated |
| Long-tail endpoints | 25/28 | contract honesty excellent ✓ (RFP round EXACT vs communityfund; analyze = gold standard) |
| Cross-lane routing | 16/33 | signposting absent API-wide (8/12 wrong-lane probes = confident off-question answers) |
| Multi-product | 20/31 | secondary-capability prose retrieval mostly OK ✓; slug-normalization dupe class (3 pairs in 19 sampled) |
| Data-truth spot-verify | 13/41 | **~28% of sampled Live rows have dead/parked/squatted sites** → est. 150–250 records; 1 squatted-domain safety case |

## The 8 systemic roots (ranked by breadth × leverage)

1. **Structured fields still don't drive inclusion — generally.** The sls-018 fix covered coverage.countries + supportedNetworks; `types[]`, `coverage.seps`, `coverage.currencies`, builders' `githubUsername`/`location` still only match if the prose happens to contain the word. One mechanism fixes all: fold EVERY structured field into the candidate haystack + type-name synonym expansion (dex↔decentralized exchange, social impact, education…). *Largest single win in the audit.*
2. **Lexical machinery gaps** (all lanes): no stemming (donate/donations, gaming/game, fuzzing/fuzzer), no rare-token weighting (common verbs dominate — "peruvian sol" → 113 rows via 'sol'), digit-boundary tokenization (groth16/secp256r1/ed25519 unfindable), punctuation/slug forms (D'CENT), repos OR-semantics total inflation.
3. **Semantic lane inconsistent + a serialization bug**: zero-keyword-hit queries return total:0 with NO vector fallback (misspellings, slug forms); supplementation fires inconsistently; semantic rows serialize `types=[]`/`prominence=null` for records that have both; keyword confidence is a uniform non-discriminative 0.97.
4. **Repos ranking lacks a Stellar-relevance factor**: keyword-token score first, so org-swept non-Stellar dead repos beat codeVerified Stellar repos on niche verticals (nft, governance, testing, game, flutter, indexer, audit) — the documented relevance defect reproduced on 7 NEW verticals; owner unsearched; explain inherits token-soup top-1 for unmapped questions.
5. **Research corpus coverage holes + hygiene**: /docs/learn, /docs/tokens (asset issuance!), /docs/validators not ingested — and vector search papers over the holes at "high" confidence; **CAPs entirely absent** (the /api/protocol CAP-matrix build covers this); author-pagination dupe pages; some sdf-blog titles broken (P27 Zipper guide); undated docs dominate news queries; incidents = one document.
6. **Partners quality-bar over-filtering**: 19/45 fresh partners (ALL 5 wallets, ALL 4 protocols, reflector, stellarexpert, finclusive) have tagline=null → hidden by default → `counts.total=0` implies "none exist". Fix = tagline backfill + `filteredOut` count in meta. The q-matcher itself is healthy.
7. **Data truth at scale**: ~28% of sampled Live rows have dead/expired/squatted websites (est. 150–250 of ~883 — the known defunct-flag gap, now quantified); 59 null shortDescriptions (28/32 Assets → the currency lane is invisible); slug-normalization dupes with conflicting scfAwarded values; builders location 23% populated. One squatted-domain case (kunst21.com) is a safety sub-class — the link checker's redirect/hijack lane should own it.
8. **Cross-lane signposting absent**: wrong-lane queries get confident off-question answers with no pointer to the right lane; in-lane precedents exist (deepWikiUrl handoff, scfCountBasis→analyze) and builders' empty-state advisory is the model to replicate on partners/repos.

## What's confirmed HEALTHY (don't churn it)

Exact-name recall (15/15 random records top-1, aliases too) · SEP retrieval (9/9 top-2 + honest 400s) · audit known-item recall (~40 protocols) · setup-advice freshness (wasm32v1-none, renamed CLI, SDK v16 — all current) · long-tail contract honesty (RFP live round EXACT, /api/analyze methodology notes, leaderboard consistency, uniform enum 400s) · Live-first ordering · orbitcdp's lifecycle block (the honesty template).

## Disposition

The fix program + hold-the-line engines are in [full-surface-coverage-plan.md](./full-surface-coverage-plan.md) (redrafted from these findings). Every finding in the JSON carries a reproducible probe URL — fix waves check off against it, and Engine A regression-guards each root once fixed.
