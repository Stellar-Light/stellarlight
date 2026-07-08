# ideas/

Proposals that aren't committed work yet — things we (or collaborators) think
are worth doing, captured before they're scheduled. An idea graduates by moving
into [../improvements/](../improvements/) (with a concrete plan + a way to
measure it) and then into an experiment or a PR. Add one as `ideas/<slug>.md`,
or extend the list below.

## Open ideas

### Code-truth / repo indexing
- **Non-Rust code depth** — `codeDepth` only scores cargo-sdk repos today; the ~1,900 JS/TS/Go repos get a flat shallow score. What does "depth" mean for a dapp (real wallet integration vs boilerplate, tx-building complexity)? Needs its own adversarial spec, like the Rust `code-depth` v2 got.
- **Semantic / code-content indexing** — we know a repo *has* a deployable contract with auth + storage; we don't index *what it implements*. "Find me a Soroban escrow" matches on README/topics luck, not code. Options: symbol/function extraction (cheap), code embeddings, or per-repo summaries.
- **Scan-freshness scheduler** — re-scan repos prioritized by `lastCommitAt > scannedAt` + query traffic, so a repo that bumps its SDK doesn't keep a stale `versionStatus` until the next manual wave.
- **Bigger code-truth label set** — grow the `depth-labels.ts` answer key from audit corpus + SCF-delivered milestones + mainnet-deployment evidence + DeepWiki cross-checks (see the gap write-up shared with Raph).

### Agent contract
- **Field selection** (`?fields=`) and **webhooks** (`POST /api/subscribe`) — let agents ask for only what they need / get pushed changes instead of polling.
- **A public `code-truth` surface** — open the scoring modules (`code-depth`, `code-signals`, `soroban-versions`, the eval/labels) as their own readable repo, if we want the grading logic fully in the open.

### Ecosystem
- **Golden-question eval mirroring cf-flue** — expand the Guard's ground-truth set to track the exact questions Raven is graded on.
