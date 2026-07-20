# Shared synonym registry

**Projects from:** lessons class 5 (literal matching). **Status: SHIPPED 2026-07-20 (#618)** — guard phase (canonical key list + CI coverage) landed #601; phase 2 (the value merge) merged the core vocabulary into all three surfaces (project/repo/builders) via `src/lib/search-vocabulary.ts`, so a vocabulary lesson taught once reaches every surface.

**What:** one vocabulary module (core chain/vertical/region synonyms) with per-surface extensions, consumed by all four search surfaces.

**Why:** we now maintain THREE separate synonym maps (project search, repo search, builders) + stopwords recently unified. Every vocabulary lesson (LatAm→countries, Ethereum→EVM, pool→liquidity) must currently be hand-copied to each map — the next miss will be a term fixed in one surface and absent in another (exactly how project search lacked stopwords repo search had for weeks).

**How:** extract to `src/lib/search-vocabulary.ts` (core + per-surface overlays), all maps import; a unit test asserts every core entry reaches every surface.
