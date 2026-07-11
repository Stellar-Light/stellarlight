# Full-surface coverage plan — v2, redrafted from the audit

**v1 of this plan was drafted from the incidents boxy happened to mention (bridges, Etherfuse) — class 22, instance-calibration, committed by the plan itself.** So we ran the audit first: 597 ground-truth-graded probes across 19 lane×intent cells, adversarially verified — see [audit-2026-07-09-full-surface.md](./audit-2026-07-09-full-surface.md) and the 138 reproducible findings in [audit-2026-07-09-findings.json](./audit-2026-07-09-findings.json). This v2 is drafted from what the audit actually found.

**The audit's central result:** 138 findings collapse into **8 systemic roots**, and most are fixed by ONE general mechanism each — not per-category patches. The plan is therefore: (Part 1) fix the roots, each with a mechanism that covers its whole surface; (Part 2) stand up the engines that hold the line afterward; (Part 3) the data-truth waves the engines can't do alone.

## Part 1 — the fix program (one mechanism per root)

| # | Root (audit evidence) | The ONE mechanism | Measure of done |
|---|---|---|---|
| F1 | Structured fields don't drive inclusion (types 3/15–63/141 retrievable; seps/currencies/username never) | fold ALL structured fields into the candidate haystack + type-name synonym table; same for builders (username, location umbrellas) | audit probes for type-browse, attributes, builders flip green; recall@10 per type ≥90% |
| F2 | Lexical gaps: stemming, rare-token weighting, digit-boundary tokens, punctuation forms | shared tokenizer upgrade (light stemmer + IDF-style rare-token weighting + letter/digit boundary splits) in `contentTokens` — one module, all four lanes (the shared-synonym-registry idea, widened) | donate/donations, gaming/game, groth16, secp256r1, D'CENT probes pass; "peruvian sol" inflation gone |
| F3 | Semantic lane: no zero-hit fallback, inconsistent supplementation, `types=[]/prominence=null` serialization bug, uniform 0.97 confidence | vector fallback when keyword total=0; fix semantic-row serialization; make keyword confidence discriminative | misspelling/slug known-item probes retrieve; semantic rows serve full fields |
| F4 | Repos ranking: no Stellar-relevance factor (dead other-chain repos beat codeVerified Stellar repos on 7 verticals); owner unsearched; explain token-soup fallback | stellarProof/codeVerified as a ranking factor ahead of raw token count; index owner; explain falls back to canonical-or-honest-miss instead of token-soup top-1 | the 7 vertical probes flip; named-project explain routing (blend/freighter) correct |
| F5 | Research corpus holes + hygiene: /docs/learn,/tokens,/validators absent; CAPs absent; author-pagination dupes; broken sdf-blog titles; undated docs win news queries | extend dev-docs ingest allowlist; ingest stellar-protocol /core (CAPs — feeds the /api/protocol build); exclude author/pagination URLs; title-extraction fix; date-aware demotion for news-intent | section-coverage list checked in; CAP queries answerable; news cell probes flip |
| F6 | Partners quality bar hides 19/45 (ALL wallets+protocols) via tagline=null; total=0 reads "none exist" | tagline backfill (19 rows, from each partner's own site) + `meta.counts.filteredOut` honesty field | wallet/protocol partner probes return rows; filteredOut serialized |
| F7 | Cross-lane signposting absent (8/12 wrong-lane probes) | replicate builders' empty-state advisory + add per-lane "wrong-lane hints" to meta notes (cheap: the in-lane precedents already exist) | wrong-lane probes return a pointer |
| F8 | Superlatives mislead ("biggest dex" = literal keywords) | honesty note in meta when superlative tokens detected + (later) the tvl/usage data axis | superlative probes carry the disclaimer |

Order: F1+F2+F3 first (same code area, biggest breadth), then F4, F6 (data-only, fast), F5, F7, F8. Every fix wave checks off its findings in the JSON by re-running the probe URLs.

## Part 2 — the engines (hold the line)

- **Engine A — generated recall matrix**: derive the eval from the data itself — every record's structured fields imply the queries that must retrieve it (types, coverage, seps, networks, symbols, usernames). The audit's 19 probe generators are the templates; Engine A mechanizes them into a weekly scored run (recall@K per category bucket, trended). Each Part-1 fix graduates its audit probes into the matrix as permanent regression guards.
- **Engine B — class-projection sweeps** (report-only, scheduled): prose⇄structure divergence diff, field-population census (now with baselines: descriptions 59 null, builders location 23%, partner taglines 19 null), staleness/liveness exposure, identity/dupes (slug-normalization class: name vs name+suffix), contract shape coverage (live ⊆ spec on all ~10 shapes).
- **Engine C — the weekly loop** (self-improvement engine #2): run A+B, diff week-over-week, file the worst buckets as tracker issues with reproducible probes; fixes target roots, the next run measures the delta.
- **Engine E — contract-honesty sweep** (2026-07-11, from the sls-020..051 wave; `scripts/eval/engine-e-contract.ts`): spec-derived probes on every operation — enum/boolean params probed value-by-value against a baseline (silent = no value has any observable effect on rows+counts), invalid values must 400, and documented⇄served response fields diffed both ways (top 2 levels). The generalization of check-api-drift's hand-picked assertions; single-value enums that may restate the default go to `ambiguous`, never accused. Runs in engine-c-health weekly + post-deploy-eval per ship. First-run baseline: `engine-e-baseline-2026-07-11.json` (1 silent param — leaderboard `range`; 4 invalid-accepted; 63 undocumented served fields).
- **SCF round-membership check** (2026-07-11, extends `scripts/eval/scf-crosscheck.ts`): the phoenix class — totals right, round membership wrong. Every awarded match with a non-empty `scfAwardedRounds` is verified against the detail page's per-submission verdicts (affirmative "Not Awarded" only; page badges/`buildAwardRounds` include not-awarded rounds and must never be trusted). Ambiguity → `roundsUnverifiable`, never accused. First-run baseline: `scf-membership-baseline-2026-07-11.json` (74 rounds-overstated of 272 checked, 37 unverifiable).
- **Per-ship eval cadence** (`.github/workflows/post-deploy-eval.yml`): Tyler re-evals per absorb; we now eval per ship, not just weekly — API-surface/ranking pushes to main wait for the deploy (apiVersion gate), run golden + sampled recall + Engine E, comment the scorecard on the rolling tracker issue (#436), and gate on golden regression or silent params.

## Part 3 — data-truth waves (human-verified, engines can't do these alone)

1. **Liveness wave** (the audit's biggest data number: ~28% of sampled Live rows have dead/parked/squatted sites → est. 150–250 records): candidate list generated from link-checker consecutiveFailures + redirect signals **+ the DefiLlama TVL signal** (scripts/enrich-tvl.ts, built 2026-07-09: llama-listed + TVL <$5k + status Live → report row; null = not-tracked, never zero; CEX rows excluded; also reports unmapped Stellar-chain llama protocols as DISCOVERY candidates) → owner review → status corrections via curated lists (never bulk heuristics — class 18; precedent: Slender Live→Inactive, human-confirmed at TVL $93). The squatted-domain sub-class (kunst21) gets link-checker's hijack lane priority. TVL *serving* (tvlUSD/tvlAsOf on rows + superlative answers) ships with **F8**, not before; the schema fields already exist.
2. **Null-description backfill**: 59 records (28/32 Assets — unblocks the entire currency lane after F1 makes fields matchable).
3. **Dupe collapse**: slug-normalization pairs (detect-duplicate-projects.ts exists — run it, canonicalSlug lineage, merge conflicting scfAwarded truth).
4. **Category verification waves** (bridge-matrix method, primary sources): wallets → oracles → DEXs → infra, each producing an exact-sync curated matrix.

## Sequencing + measures

| Phase | Work | Measure |
|---|---|---|
| 1 | F1–F3 (search core) + F6 (partner taglines) | audit probe flip-rate on those roots; recall@10 per type ≥90% |
| 2 | F4 (repos relevance) + F5 (corpus holes) + Engine A v1 | 7 vertical probes green; section coverage complete; first weekly matrix baseline |
| 3 | Engine B+C live; F7/F8 | first engine-filed issues; wrong-lane hints served |
| 4 (rolling) | Part-3 waves | Live-rows-with-dead-sites → <5%; null descriptions → 0; dupes → 0 |

**North-star measure:** the audit re-run (same 19 cells, fresh sampling) — target ok-rate from today's **59% → ≥85%** after Phases 1–2, and every future incident answerable with "which root/engine missed it, and why."
