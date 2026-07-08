# lessons/ — the mistake corpus

Every real defect we've shipped, filed by **class**, with the mechanized guard that now catches it. The point is not the history — it's that each class is a **design checklist item**: when building any new endpoint, field, or surface, walk this table and ask "does the new thing reintroduce one of these?"

Sources: sls board (`kalepail/stellar-raven/improvements/stellar-light-scout`, 18 items), our tracker issues, cold audits, user demo feedback, and our own gists/postmortems. New incidents get a row here (and a detail file when the story carries design weight) as part of closing them — same loop as filing the verification comment.

## The classes

| # | Class | Archetype incident | Mechanized guard (what catches it now) |
|---|---|---|---|
| 1 | **Prose-only facts** — a fact lives only in a sentence, so it can't be filtered, ranked, or dated | sls-012 (anchor corridors), sls-016 (winner amounts), sls-007 (RFP rounds) | structured fields (`coverage`, `prizeTiers`, `round`); api-drift field-coverage check |
| 2 | **Omission = negation** — a missing field reads as "doesn't have it" | sls-017 (LOBSTR's XRPL support absent → "Stellar-only") | `supportedNetworks` + fill-if-empty curation; spec documents "empty = unknown" semantics |
| 3 | **Ambiguous null** — null can mean "no", "unknown", or "undisclosed" | sls-002 (SCF award amount null) | disambiguator enums (`scfAmountStatus`); *never put a null literal inside an OpenAPI enum — it crashes spectral* (see [2026-07-08 spec drift](./2026-07-08-schema-drift-contract-as-code.md)) |
| 4 | **Order-implies-rank** — consumers read array order as meaning | sls-001/005 (winners unordered) | self-describing arrays (`placementRank`, sorted + documented) |
| 5 | **Literal matching / strict-AND** — natural queries dead-end on vocabulary or one missing word | sls-010 (builders), partners `q`, Sushi ("pool"), Beacon Q3 ("Ethereum" vs "EVM") | synonym layers + tiered AND→relaxed matching + shared stopword tokenizer (`contentTokens`); known-item recall answer key in daily self-audit |
| 6 | **Structured truth not driving inclusion** — curated fields affect ranking but not *whether a record is retrieved at all* | sls-018 (Etherfuse: coverage said Mexico/MXN, search never read it) | structured fields folded into candidate query + admission rules (`project-search-match.ts`, unit-tested); recall guard |
| 7 | **Authority outranks relevance** — high-prominence/high-score records lead queries they're off-topic for | sls-009 (q=Blend → Reflector), rwa→dfns tunnel | exact-name contract > liveness > relevance > type-match > authority sort tiers; stopwords for zero-signal tokens ("stellar", "protocol", "best") |
| 8 | **Undated metrics** — a number with no as-of date gets cited as current forever | EC snapshots, coverage, scan results | `asOf`/`computedAt`/`scannedAt` stamps on every derived fact |
| 9 | **Descriptions are routing contracts** — tool/op description changes silently re-route downstream agents | Raven's catalog diffs our op descriptions | param-level docs for neutral additions; description changes = re-baseline handshake via `/api/changelog` |
| 10 | **Duplicate records** — the same project under two names splits funding/stats | sls-008 (Orbit/OrbitCDP) | `canonicalSlug` lineage + dupe detector script |
| 11 | **Contract under-documentation (schema drift)** — the live API serves fields the spec doesn't document; downstream catalogs generated from the spec under-describe reality | [2026-07-08](./2026-07-08-schema-drift-contract-as-code.md): #353 deleted `anchorProfile` from the spec as "never-implemented" while live rows kept serving it; `getPartners` had NO response schema | **contract-as-code**: committed spec snapshot + generated client types + PR gate (`contract-gate.yml`) + changelog coupling; api-drift live-⊆-spec field coverage |
| 12 | **Verify-before-advertise** — a surface names an artifact that doesn't work yet | the npx-before-npm-org incident; [2026-07-08](./2026-07-08-verify-before-advertise-npm.md): changelog named `scout-mcp@1.1.8` ~1h before it existed | `verify-claims` CI; self-audit asserts every changelog-advertised npm version is installable |
| 13 | **CI grading a deploy race** — push-triggered checks against the LIVE url grade the pre-deploy state | openapi-lint false-failed minutes after the fix it checked for had merged | push/PR checks grade **committed artifacts**; only scheduled runs grade the live URL |
| 14 | **Multi-product single-identity** — a company's record reflects its dominant product; secondary capabilities are invisible | raven#8 (Etherfuse = Stablebonds *and* a Mexico ramp) | additive `TYPES_ADD` curation + report-only dual-identity sweep in every curate run |
| 15 | **Structure ≠ semantics** — the index knows a repo HAS a contract, not WHAT it implements | code-depth gist honest-gap 3 ("find an escrow implementation" = README luck) | code-symbol extraction (`code-symbols.ts`) — search matches the pub fn/type surface |
| 16 | **Adversarial evals manufacture problems** — "find the worst" judges over-rotate fixes | the 6-deploy repo-search over-rotation | grade against ground-truth answer keys (depth-labels, recall answer key, golden eval) — never adversarial judging |
| 17 | **Happy-path testing** — we test our intent, a stranger hits the contract | Tyler's cold audit found 15 bugs ours missed | cold-outsider probes in api-drift (method misuse, invalid filters, no-query calls); test natural-but-"wrong" inputs |
| 18 | **Repo staleness ≠ product death** — archiving live products off a heuristic | bidali/bitwage/yieldblox marked from stale repos | owner-confirmed-dead lists only; reports are not action lists; dry-run → review → execute on all data mutations |

## Detail files

- [2026-07-08 — schema drift → contract-as-code](./2026-07-08-schema-drift-contract-as-code.md)
- [2026-07-08 — structured recall (Etherfuse/Sushi)](./2026-07-08-structured-recall-etherfuse-sushi.md)
- [2026-07-08 — verify-before-advertise (npm window)](./2026-07-08-verify-before-advertise-npm.md)

## The loop

1. An incident lands (sls item, tracker issue, demo feedback, our own audit).
2. Fix it **and** identify the class. New class → new row + guard; existing class → ask why the guard missed it and strengthen it.
3. Close the incident with reproducible probes; the guard keeps it fixed.
4. Before shipping anything new, walk the table — the checklist is the "ahead of the curve" part.
