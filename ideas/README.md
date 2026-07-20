# ideas/

Proposals that aren't committed work yet — captured before they're scheduled. An idea graduates by moving into [../improvements/](../improvements/) (with a concrete plan + a way to measure it) and then into an experiment or a PR. Add one as `ideas/<slug>.md`, or extend the list below.

Two provenance streams feed this folder:
1. **Product ideas** — things we or collaborators want built.
2. **Lesson projections** — each defect class in [../improvements/lessons/](../improvements/lessons/README.md) applied *forward* to surfaces that haven't broken yet (tagged `Projects from: class N` in the file). Mistakes generate the backlog before the next incident does.

## Open ideas

### Code-truth / repo indexing
- ~~JS/TS symbol extraction + dapp depth~~ — **shipped 2026-07-09** (#397–#402: sdkCapabilities + calibrated jsDepth + 29-label answer key + gate; 3 JS frontier blind spots remain).
- ~~Re-scan on push~~ — **shipped 2026-07-09**: weekly stale-first re-scan (real this time, #387) + daily backlog wave (#401) + PR sample gate + post-merge full gate.
- ~~Bigger code-truth label set~~ — **in flight 2026-07-08**: label-mining workflow over audit corpus + SCF-delivered + template evidence, adversarially verified.
- ~~Semantic / code-content indexing~~ — **shipped 2026-07-08** as `codeVerified.symbols` (search matches pub fn/type names).

### Retrieval quality
- **[Shared synonym registry](./shared-synonym-registry.md)** — guard phase **shipped 2026-07-19 (#601)** (canonical key list + 27 CI coverage tests); phase 2 (value merge) open.
- **Hybrid lexical+vector research retrieval** — "fastest cheapest way to move assets from Ethereum to Stellar" retrieves payments dev-docs, not bridge routes: the answer exists but embeddings never fetch it (class 19 residual). Union lexical matches into the vector pool before ranking. Aligns with raven#12's atlas+lexical+semantic direction — coordinate, don't pre-build. *(Projects from: class 19)*
- **Research ingest title/dedupe hygiene** — meeting-notes chunks surface under nav/date titles ("11 posts tagged with …", "2024-08-23") and the same content appears under multiple URLs (tag page + canonical page), which per-URL dedupe can't collapse. Fix at ingest: title from page h1, skip tag-aggregation URLs, content-hash dedupe. Golden eval counts BAD-TITLE 11 today. *(Projects from: classes 10/19)*
- **[Capability-mismatch sweep](./capability-mismatch-sweep.md)** — generalize the dual-identity sweep beyond ramps (class 14; `audd` is the open candidate).
- **[Mention-vs-identity for repo search](./mention-vs-identity-repo-search.md)** — port the 2026-07-19 project-search identity fix (#590/#592) to repos. *(Projects from: the custody re-measure)*
- **Fee-transparency axis** — structured `feeBps` + `asOf` on ramp corridors so "ranked by fee" is answerable (raven#8 / Raph; class 1). Needs grounded doc-crawling per provider.

### Data honesty / guards
- **[Audit findings extraction v2](./audit-findings-extraction.md)** — per-auditor deterministic parsers populate findingsTotal/severityCounts (null≠zero today on 58/58 rows); the natural next audits step after the registry (#589).
- **[Audit coverage watch](./audit-coverage-watch.md)** — UNTRIAGED portal protocols must reach the tracked issue queue, not a workflow log.
- **[Status-recency detector](./status-recency-detector.md)** — statusAsOf is median 130d old on prominent projects with no watcher; weekly verification batches, never bulk demotion.
- **[/api/status rows for research + partners](./status-source-rows.md)** — the daily freshness guard is blind to the #2 endpoint's corpus; audits row (#589) is the template.
- ~~On-chain metrics~~ — **descoped 2026-07-20** ([reasoning](./onchain-metrics.md)): explorers already serve it; duplication isn't a public good.
- **[Feedback → quality loop](./feedback-quality-loop.md)** — `success_rate` from the existing feedback intake into `confidence` (the one self-improving axis we lack).
- **[Research-doc freshness + SDK-version tagging](./research-doc-freshness.md)** — per-doc `lastVerifiedAt` + version-status on tutorials/setup guides (classes 8/18, Beacon Q2).
- ~~Field coverage on every endpoint~~ — **audits + research rows shipped 2026-07-19 (#594)** and caught two missing-CORS-header bugs pre-merge the same day; remaining row shapes (builders/rfps/hackathons/skills) still open in [the idea](./field-coverage-all-endpoints.md).
- ~~Skill-mirror freshness guard~~ — **shipped 2026-07-19 (#594)**: daily self-audit lane, 3 files hash-compared.
- **Slug-join identity cross-check** — partner→project joins match by slug with no entity verification (review 2026-07-08 #21); the Spectra near-miss proved the class live (class 21). Add a domain/website cross-check to the join before the next curation wave adds partners.

### Agent contract
- **Field selection** (`?fields=`) and **webhooks** (`POST /api/subscribe`) — let agents ask for only what they need / get pushed changes instead of polling.
- **A public `code-truth` surface** — open the scoring modules (`code-depth`, `code-signals`, `soroban-versions`, the eval/labels) as their own readable repo, if we want the grading logic fully in the open.

### Ecosystem
- **Golden-question eval mirroring cf-flue** — expand the Guard's ground-truth set to track the exact questions Raven is graded on.
