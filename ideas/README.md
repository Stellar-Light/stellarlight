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
- ~~[Shared synonym registry](./shared-synonym-registry.md)~~ — **shipped 2026-07-20**: guard phase (#601) + phase 2 value merge (#618) — one core vocabulary in `search-vocabulary.ts`, consumed by all three search surfaces.
- **Hybrid lexical+vector research retrieval** — "fastest cheapest way to move assets from Ethereum to Stellar" retrieves payments dev-docs, not bridge routes: the answer exists but embeddings never fetch it (class 19 residual). Union lexical matches into the vector pool before ranking. Aligns with raven#12's atlas+lexical+semantic direction — coordinate, don't pre-build. *(Projects from: class 19)*
- **Research ingest title/dedupe hygiene** — meeting-notes chunks surface under nav/date titles ("11 posts tagged with …", "2024-08-23") and the same content appears under multiple URLs (tag page + canonical page), which per-URL dedupe can't collapse. Fix at ingest: title from page h1, skip tag-aggregation URLs, content-hash dedupe. Golden eval counts BAD-TITLE 11 today. *(Projects from: classes 10/19)*
- **[Capability-mismatch sweep](./capability-mismatch-sweep.md)** — generalize the dual-identity sweep beyond ramps (class 14; `audd` is the open candidate).
- ~~[Mention-vs-identity for repo search](./mention-vs-identity-repo-search.md)~~ — **shipped 2026-07-20 (#621)**: identityZone + identity-over-mention sort key + candidate-pool admission ported to repo search, so a repo that IS the thing outranks one that merely mentions it. *(Projects from: the custody re-measure)*
- **Fee-transparency axis** — structured `feeBps` + `asOf` on ramp corridors so "ranked by fee" is answerable (raven#8 / Raph; class 1). Needs grounded doc-crawling per provider.

### Data honesty / guards
- ~~Audit findings extraction v2~~ — **shipped 2026-07-19 (#603)**: deterministic parsers put verified findingsTotal/severityCounts on 20/58 reports; PDF-mangled remainder stays honestly null (null≠zero) — see [the idea](./audit-findings-extraction.md) for the residue.
- ~~Audit coverage watch~~ — **shipped 2026-07-20**: daily self-audit lane compares approved portal reports against `AUDIT_PROJECT_ALIASES`; untriaged protocols now land in the tracked red queue, not a workflow log.
- ~~Status-recency detector~~ — **shipped 2026-07-19 (#604)**: weekly verification queue (statusAsOf age × prominence), human-verified flips only, never bulk demotion.
- ~~/api/status rows for research + partners~~ — **shipped 2026-07-20**: researchDocs + partners rows on `sources[]` + self-audit staleness thresholds (audits 7d / researchDocs 3d / partners 45d).
- ~~On-chain metrics~~ — **shipped 2026-07-20 (#608–#615)**: verified contract/asset registry + stellar.expert enrichment + weekly snapshot deltas + partner-asset join, served on searchProjects rows. Tx-volumes/active-addresses per-project still open in [the idea](./onchain-metrics.md).
- **[Feedback → quality loop](./feedback-quality-loop.md)** — `success_rate` from the existing feedback intake into `confidence` (the one self-improving axis we lack).
- **[Research-doc freshness + SDK-version tagging](./research-doc-freshness.md)** — per-doc `lastVerifiedAt` + version-status on tutorials/setup guides (classes 8/18, Beacon Q2).
- ~~Field coverage on every endpoint~~ — **fully shipped 2026-07-20**: audits + research rows (#594, caught two missing-CORS-header bugs pre-merge) + the remaining seven shapes (builders/people/rfps/hackathons/skills/clusters/leaderboard) got named component schemas + live-⊆-spec guards (#620, openapi@1.8.9). Every list op is guarded — see [the idea](./field-coverage-all-endpoints.md).
- ~~Skill-mirror freshness guard~~ — **shipped 2026-07-19 (#594)**: daily self-audit lane, 3 files hash-compared.
- ~~Slug-join identity cross-check~~ — **shipped 2026-07-20 (#619)**: registrable-domain (eTLD+1) cross-check over the 42 partner→project links, with a reviewed allowlist for legitimately-different pairs and a self-audit lane; the pass also caught the boss-pay hijacked-domain case. *(class 21, the Spectra near-miss)*

### Agent contract
- **Field selection** (`?fields=`) and **webhooks** (`POST /api/subscribe`) — let agents ask for only what they need / get pushed changes instead of polling.
- **A public `code-truth` surface** — open the scoring modules (`code-depth`, `code-signals`, `soroban-versions`, the eval/labels) as their own readable repo, if we want the grading logic fully in the open.

### Ecosystem
- **Golden-question eval mirroring cf-flue** — expand the Guard's ground-truth set to track the exact questions Raven is graded on.
