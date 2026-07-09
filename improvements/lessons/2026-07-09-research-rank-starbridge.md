# 2026-07-09 — stale-but-close outranks current (Starbridge)

**Class 19.** A consumer asked Raven "fastest/cheapest way to bring assets from EVM onto Stellar" and our `/api/research` served **Starbridge** — a 2022 SDF research protocol that was never productionized — twice in the top-5, plus one audit duplicated, while the current answers (CCTP live on Stellar, Allbridge) sat at pool ranks 11–20.

## Three compounding mechanisms

1. **Vector similarity loves stale-on-topic docs.** Starbridge posts are literally *about bridging Stellar*; cosine 0.789 vs 0.738 for CCTP content. Embeddings don't know a protocol died.
2. **No per-document dedupe.** One Spectra audit held **8 of 25** pool slots; Starbridge chunks ×3. Duplicates physically crowded correct answers out of the page.
3. **Order ignored our own trust signal.** Every row already carried a confidence score with staleness priced in (540-day half-life: 2022 post → 0.15 freshness vs 0.93), and `meta.scoreModel.note` told agents "sort by it" — but the server returned raw-cosine order, so freshness/authority never affected position.

## Fix (general — no per-doc hacks)

`src/lib/research-rank.ts`, shared by the vector and keyword paths: low-value filter → best-chunk-per-URL collapse (graceful refill for thin corpora) → **order by the confidence signal** with raw-score tie-breaks. The stale-advice failure is the same class as recommending `wasm32-unknown-unknown`: the corpus knew better, the ranking didn't.

## Guards

- Golden question `bridge-evm-to-stellar` with **`forbiddenRegex: starbridge`** — a stale protocol crowding a consumer bridge query turns the eval red.
- 5 unit tests pin the policy (dedupe, stale-vs-fresh flip, refill, low-value drop, keyword normalization).

## Method worth reusing: offline re-rank simulation

Before shipping a ranking change, fetch prod's real over-fetched pools (`limit=25`) and run the new pure ranker locally — this proved Starbridge-out/CCTP-in **and** 21/21 golden questions unchanged *pre-merge*. Ranking changes never need to ship blind.

## Known residual

"fastest cheapest way to move assets from Ethereum to Stellar" (that exact phrasing) retrieves payments dev-docs, not bridge routes — an embedding-distance gap that needs hybrid lexical+vector retrieval (see ideas; aligns with raven#12's discovery redesign). Reordering can't fix what retrieval never fetched.
