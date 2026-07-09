# Full-surface coverage plan — from incident fixes to sweeping engines

**The problem (boxy, 2026-07-09):** every retrieval/data fix so far was triggered by ONE observed instance — Etherfuse (Mexico ramp recall), Beacon Q3 (EVM bridging), the Solana corridor, Starbridge (stale ranking), the tag-page titles. Each fix was right, but the trigger was a human noticing. The data layer is ~900 projects × dozens of structured fields, ~2,300 repos, a research corpus, 26 partners, hackathons, builders — across four search surfaces. "There could be a million of those issues because the data is so wide." Waiting for demos and cold audits to find them one at a time doesn't scale.

**The insight that makes this tractable:** the [lessons corpus](./lessons/README.md) shows the failures are not a million random bugs — they are ~22 recurring **classes**. A class that broke once on one record/query is latent on every sibling record/query. So the systemic solution is not more spot fixes; it's one **sweeping engine per class family** that enumerates ALL instances mechanically, ranks the worst, and feeds the fix queue — before a user or Tyler's eval finds them.

## What already exists (build on, don't duplicate)

| Machinery | What it covers today | Its limit |
|---|---|---|
| Golden eval (34 questions) | hand-picked retrieval cases w/ answer+forbidden regexes | hand-written — coverage grows one incident at a time |
| Daily self-audit Guard | known-item recall (2 items), bridge networks, changelog-npm claims, freshness | point probes, not surface sweeps |
| Answer keys (depth labels, recall) | ground-truth discipline for scoring changes | scoped to code-depth + a few recall items |
| Dual-identity sweep (report-only) | multi-product detection for ramps | one capability, one surface |
| api-drift / contract gate | live ⊆ spec on 2 row shapes | 2 of ~10 shapes |
| Lessons class table (22 classes) | the taxonomy + per-class guards | guards check the archetype, not all siblings |

## The three engines

### Engine A — the generated recall matrix (coverage at data scale)

**Derive the eval from the data itself.** Every record with structured truth implies the natural queries that MUST retrieve it — no hand-writing, no adversarial judging (class 16 discipline: the answer key comes from our own curated fields):

- `coverage.countries=[Mexico]` + `types=[Anchor]` → "mexico on-ramp", "MXN off-ramp" must retrieve Etherfuse
- `supportedNetworks=[solana]` + `types=[Bridge]` → "solana bridge", "move usdc from solana to stellar" must retrieve it
- `types=[Oracle]` + status Live → "price oracle on stellar" must include it in top-K
- partner `rampTypes=[on-ramp]` + `country` → the partners `q` lane, same template
- repo `codeVerified.symbols` contains `escrow` → "escrow implementation" must retrieve it (repos lane)

Build: `scripts/eval/generated-recall.ts` — walks the directory + partners + repos, instantiates query templates per (type × structured-field) combination, runs them against the live API, and scores **recall@K per category bucket**. Hundreds→thousands of query-record pairs, weekly scheduled + on-demand. Report ranks the worst buckets (e.g. "Oracle × chain queries: 40% recall") — those become the fix wave. Etherfuse, Rozo/Solana, and the corridor gaps would ALL have been caught by this engine before any human noticed.

Guardrails: recall-only (a record failing its own implied queries is unambiguous); tolerance thresholds per bucket so it doesn't demand top-1 for crowded categories; failures file as a REPORT first (precision over recall — some structured data will itself be wrong, and the report catches that too).

### Engine B — class-projection sweeps (the lessons table as a machine)

Each class family gets a sweep that enumerates all instances across all surfaces, scheduled, report-only:

1. **Prose⇄structure divergence** (classes 1/2/6): for every record, extract candidate facts from its own prose (chain names, country names, SEP numbers, fee mentions, product nouns) and diff against the structured fields. Prose says "across Africa" but `coverage`/`regions` empty → row in the report. This generalizes the "chains named in description ⊆ supportedNetworks" guard to every field pair. (The Etherfuse notes boxy has belong here — paste them into this section's spec.)
2. **Field-population census** (class 2): % populated per structured field per category, trended weekly. A category where `supportedNetworks` is 20% populated is a standing omission=negation hazard.
3. **Staleness exposure** (classes 8/19): for a sampled query set, the freshness distribution of top-K per lane; flags lanes where >N% of served results are >18mo old with fresher on-topic content below the fold.
4. **Multi-product/identity** (classes 14/21): the dual-identity sweep generalized beyond ramps to all capability pairs + the slug-join domain cross-check.
5. **Contract shape coverage** (class 11): field-coverage-all-endpoints — live ⊆ spec on all ~10 row shapes (already in ideas; it's this engine's row).

### Engine C — the weekly loop (Experiments Lab, engine #2 of the self-improvement system)

The piece that makes it self-sustaining instead of another one-off: a weekly scheduled run that executes Engines A+B, diffs against last week, and **files the top-N worst buckets as tracker issues with reproducible probes** (same format as the sls verification issues). Fixes then target the CLASS bucket (like the corridor matrix did), the next run measures the delta, and the issue closes on green. Humans stay in the loop for every data mutation (report → review → curate); the machine does the finding and the measuring.

## Deep-audit waves (the human-verified backbone)

Generated evals find *retrieval* failures; they can't verify the data is TRUE. For that, the bridge-matrix method — parallel agents verifying every record in a category against primary sources, output = a curated exact-sync matrix with evidence quotes — applied category by category:

- ✅ bridges (2026-07-09: chains + launch status, 10 records)
- ✅ anchors/ramps (2026-07-06/08: stellar.toml + anchors.stellar.org parity + corridors)
- next, in order of query traffic: **wallets** (networks, custody model, live status), **oracles** (feeds, networks, live), **DEXs/AMMs** (live status, networks), infrastructure/RPC, audit firms (already partner-verified)

One category wave ≈ one session of agent verification + one curated matrix PR + Action apply. Every wave also seeds Engine A with denser truth to generate from — the engines compound.

## Sequencing

| Phase | Deliverable | Measure |
|---|---|---|
| 1 (now) | Engine A v1: generated recall matrix over projects+partners, report-only, manual dispatch | first full-surface recall baseline per category |
| 2 | Engine B sweeps 1+2 (prose⇄structure diff, field census) + field-coverage-all-endpoints | divergence report; % population trended |
| 3 | Engine C: weekly schedule + auto-filed issues w/ probes; golden eval absorbs generated cases that prove stable | incidents found by engine vs by humans (target: engine-first) |
| 4 (rolling) | category deep-audit waves (wallets → oracles → DEXs → infra) | verified-matrix coverage % of directory |

## Success criteria

- Recall@K per category bucket ≥ threshold, trended weekly — regressions caught by the engine, not by demos
- Every new lessons class gets a projection sweep within a week of filing (loop step 4 is mechanized, not aspirational)
- The next Etherfuse-shaped miss is found by Engine A before anyone asks Raven the question
