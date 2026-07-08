# ideas/

Proposals that aren't committed work yet — captured before they're scheduled. An idea graduates by moving into [../improvements/](../improvements/) (with a concrete plan + a way to measure it) and then into an experiment or a PR. Add one as `ideas/<slug>.md`, or extend the list below.

Two provenance streams feed this folder:
1. **Product ideas** — things we or collaborators want built.
2. **Lesson projections** — each defect class in [../improvements/lessons/](../improvements/lessons/README.md) applied *forward* to surfaces that haven't broken yet (tagged `Projects from: class N` in the file). Mistakes generate the backlog before the next incident does.

## Open ideas

### Code-truth / repo indexing
- **[JS/TS symbol extraction + dapp depth](./js-symbol-extraction.md)** — the non-Rust half of code truth (~1,900 repos). *(Rust symbol extraction shipped 2026-07-08.)*
- **[Re-scan on push](./rescan-on-push.md)** — stale `versionStatus` until the next wave is self-inflicted stale advice.
- ~~Bigger code-truth label set~~ — **in flight 2026-07-08**: label-mining workflow over audit corpus + SCF-delivered + template evidence, adversarially verified.
- ~~Semantic / code-content indexing~~ — **shipped 2026-07-08** as `codeVerified.symbols` (search matches pub fn/type names).

### Retrieval quality
- **[Shared synonym registry](./shared-synonym-registry.md)** — one vocabulary module across all four search surfaces (class 5).
- **[Capability-mismatch sweep](./capability-mismatch-sweep.md)** — generalize the dual-identity sweep beyond ramps (class 14; `audd` is the open candidate).
- **Fee-transparency axis** — structured `feeBps` + `asOf` on ramp corridors so "ranked by fee" is answerable (raven#8 / Raph; class 1). Needs grounded doc-crawling per provider.

### Data honesty / guards
- **[Feedback → quality loop](./feedback-quality-loop.md)** — `success_rate` from the existing feedback intake into `confidence` (the one self-improving axis we lack).
- **[Research-doc freshness + SDK-version tagging](./research-doc-freshness.md)** — per-doc `lastVerifiedAt` + version-status on tutorials/setup guides (classes 8/18, Beacon Q2).
- **[Field coverage on every endpoint](./field-coverage-all-endpoints.md)** — extend the live-⊆-spec check from 2 row shapes to all ~10 (class 11).
- **[Skill-mirror freshness guard](./skill-mirror-freshness-guard.md)** — advertised skill ⊆ reality (class 12).

### Agent contract
- **Field selection** (`?fields=`) and **webhooks** (`POST /api/subscribe`) — let agents ask for only what they need / get pushed changes instead of polling.
- **A public `code-truth` surface** — open the scoring modules (`code-depth`, `code-signals`, `soroban-versions`, the eval/labels) as their own readable repo, if we want the grading logic fully in the open.

### Ecosystem
- **Golden-question eval mirroring cf-flue** — expand the Guard's ground-truth set to track the exact questions Raven is graded on.
