# DRAFT — upstream issue for stellar-experimental/stellar-raven (not filed; owner's call)

**Title:** Gated pass scores stopwords like content words — long natural-language questions route to the wordiest description, not the covering one

## What we observed (2026-09-05, live gateway, catalog manifest 2026-09-03T17:09Z)

Question: `is anyone actually building on Stellar or is it dead?`

| entry | live score | content words covered | note |
|---|---|---|---|
| scout.listContracts | 211 | 4 of the question's content words MISSING | long description, rich in "is / it / on / or" |
| scout.analyzeEcosystem | 171 | every content word covered | shorter description |

On the same question with stopwords removed, analyzeEcosystem is #1 (125). The gated pass scores stopwords like any token (5 × 4 per description hit) and only strips them on the rescue path, so a description dense in function words outscores one that covers every content word. Newcomers write full sentences, so this hits them hardest: our builder-persona battery routes 2/7 for a brand-new asker, 3/5, 5/8, and 6/8 for an SDF-level asker — the gradient tracks sentence length, not vocabulary.

## How we know it is the scorer

We vendored the public scorer (`src/catalog/vendor/search-scoring.ts`, `src/catalog/scoring.ts`, `src/catalog/extract-keywords.ts`, `scripts/build-catalog.mjs`) into a replica and ran it over the text Raven indexes. The replica reproduces the live score exactly on 206 of 269 scout hits, so the mechanism above is measured, not inferred. Artifact with per-question evidence: `improvements/engine/raven-routing-latest.json` in Stellar-Light/stellarlight (public), fields `evidence.intended[].score / gate / coverage / missingWords`.

## Related, same battery

- Id-noun exclusion (#124): "top Stellar projects by GitHub activity" — the token `projects` pulls searchProjects to #1 and the covering op (getLeaderboard) is excluded by the coverage gate; "what can you actually build on Stellar?" — `build` pulls searchHackathonBuilds to #1.
- A bare project name ("freighter") has no field anywhere in the catalog that carries it; resolveProject cannot be reached by a name. Not a bug in the scorer, but the shape newcomers use most.

## What we are NOT asking

No vocabulary change on our side fixes any of the three: "is / should / what / which" are your stopwords and can never be routing words, and widening the widest op captures siblings (we measured and reverted one such widening).

## Suggested direction (yours to judge)

Apply stopword stripping in the gated pass, or weight stopword hits at a fraction of content hits; alternatively score coverage over content words only and let stopwords break ties. Happy to run the 65-question bank against a preview and report the before/after.
