# Code index — what we know about a repo, from its code

The Code-Truth Ledger's serving surface: every layer below is extracted from a
repo's **actual fetched source and manifests** (never READMEs alone, never
guessed), persisted by the scanner, and served on `/api/repos/search` rows.
Built across 2026-07 → 2026-08; each layer is guarded by a field-population
probe (`scripts/check-field-population.ts`, daily) so a layer that stops
populating goes visibly red.

## The five layers on a repo row

| Layer | Field(s) | Answers | Writer |
|---|---|---|---|
| **Relevance proof** | `codeVerified.stellarProof`, `codeDepth`, `isDeployableContract` | is this really a Stellar repo, and is there real contract substance? | scan |
| **Symbols** | `codeVerified.symbols` | WHAT it implements (`release_escrow`, `EscrowContract`) — searchable | scan |
| **Contract interface** | `codeVerified.contractInterface` | HOW TO CALL IT — full pub-fn signatures per `#[contractimpl]` block (`Swap.swap(a: Address, amount: i128) -> i128`), env stripped like the SDK's own contractspec. Both Soroban idioms: inherent impls export only `pub fn`; trait impls export all methods (pub is illegal there — the FxDAO class) | scan |
| **Protocol world** | `codeVerified.targetProtocol`, `protocolCaps` | which protocol the pinned soroban-sdk major targets, and the CAPs defining it — the sdk⇄protocol⇄CAP join. ADVISORY by the soroban-versions doctrine (derived + dated, Whisk irregularity pinned in tests, null never guessed) | serve-time join |
| **Dependencies** | `codeVerified.stellarDeps` | what it builds on (allowlist-matched ecosystem packages from Cargo.toml + package.json). Reverse read: querying a package name surfaces its DEPENDENTS at scoring tier 2 — usage evidence above README mentions, below identity | scan |

Plus repo-level intel written by enrich: `activityState` (derived
archived/active/dormant tag), `activitySignals` (commits90d, releases, PRs —
null = not-captured, never zero), `knowledgeNotes` (dated curated facts +
derived audit crosslinks — see `src/lib/repo-knowledge.ts`).

## In-repo docs → the research corpus

Documentation living INSIDE canonical repos (the Stellar-Indexer-SDK
per-protocol guides under `src/protocols/*/README.md`) is ingested into
ResearchDocs as `source=repo-docs` by `scripts/ingest-repo-docs.ts` (nightly
via refresh-research-corpus). **Curated sources only** — extend the SOURCES
list as consumers ask; never a corpus-wide README sweep. Tree listing costs
one API call per repo; file bodies come from raw.githubusercontent at zero
rate cost.

## Freshness: the re-scan policy

The daily 03:00 UTC scan wave treats *a stale scan as missing as no scan*:
never-scanned and pushed-since-scan repos compete on the same
`-repoScore,-lastCommitAt` key, so a changed canonical SDK re-scans before a
never-scanned hackathon repo. Every wave prints
`interface coverage: N/M contract repos extracted ≥1 signature` — a contract
repo extracting zero is an extraction gap with a name, not a benign absence.

## Operating rules (learned the hard way — see improvements/lessons/)

- **Zero-work/failed-work runs exit 1.** A wave the rate limit stopped 0.8s in
  once exited green; every pipeline script now reds instead.
- **One shared PAT budgets all scan/enrich Actions** (5,000/hr). Space
  dispatches; `⏸ GitHub rate limit hit` in a wave log is the tell.
- **Repo identity is case-insensitive.** Writers converge on one doc
  (canonical `nameWithOwner` casing); `dedupe-repos.yml` re-merges any stray
  case-variant twins.
- **A field is only served when every row-construction site carries it** —
  /api/research had five; verify against the live API, with the field names
  from the spec, never from memory.
- Missing beats lying, everywhere: unparseable manifests contribute nothing,
  unknown sdk majors serve null, ambiguous signatures are skipped not
  truncated.
