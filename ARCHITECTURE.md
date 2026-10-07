# Architecture — how StellarLight actually works

StellarLight is the Stellar ecosystem's data layer: a continuously
re-verified index of projects, repos, partners, audits, builders, and
research that agents (Stellar Raven first) and humans query for ground
truth. Every claim aims to be **evidenced, dated, and re-checkable** —
the system below is organized around producing and defending that.

Consumers: the REST API (`/api/*`, OpenAPI at `/api/openapi.json`),
the Scout MCP server (`@stellar-light/scout-mcp`), the Scout skill
(`Stellar-Light/stellar-scout`), Raven's unified catalog (which ingests
our spec text as its discovery index), and the site itself.

## 1. A repo search, end to end

`GET /api/repos/search?q=…` (src/lib/repo-search.ts):

1. **Candidate pool** — Payload query over `repos` (metadata + README
   excerpt + extracted code symbols + dependency lists), plus curated
   canonical answers and vertical flagships admitted even without a
   keyword hit.
2. **Per-doc signals** — field-weighted relevance (name/topics 5 >
   symbols 4 > description/owner 3 > deps 2 > README 1, multi-term
   coverage bonus), then the evidence signals: code-verified stellarness,
   anchor identity (mention-vs-identity), verified mainnet usage
   (`codeInUse`), exact alias identity (separator-insensitive owner/
   name/path — including spaced product names, ≥3 words), liveness,
   staleness, supersession, quality tier.
3. **The comparator** — most → least decisive:
   `canonical correction → exact alias identity → curated flagship float
   → stellarness tier → anchor identity → mainnet usage → keyword score
   → archive-tier demotion → superseded demotion → 2y-stale demotion →
   alive → SDF org → stellar mention → repoScore → stars`.
   The standing contract (F4): **Stellar evidence ranks above raw
   keyword luck, and identity never lets a no-evidence repo beat a
   code-verified one.**
4. **Serve** — rows carry the grade, tier/source, activity signals,
   code-truth block, knowledge notes, relations (successor, project),
   and a `deepWikiUrl` handoff for internals questions. Explanations of
   WHY something ranked (`rankedBecause`) ride along for transparency.

Project search (`/api/projects/search`) follows the same philosophy over
the curated directory (prominence, verification, funding, lifecycle) and
joins inline code references and on-chain metrics; `builtBy` derives at
query time from the entities collection (org ↔ project links).

## 2. The Code-Truth Ledger — scanning real source

The scanner (scripts/scan/, nightly + dispatchable per-repo) turns
"repo exists" into **code-verified facts**:

- **Fetch & selection** (fetch-repo-code.ts) — tree walk with per-crate
  entry-file guarantees (contract impls can't be starved by
  bigger files), language-aware source selection (Rust + JS/TS + Python/
  Go/JVM behind Stellar-context gates).
- **Extraction** — `stellarProof` (cargo-sdk strongest → none),
  `codeDepth` (0–1, per-crate, calibrated against DeepWiki-graded
  answer keys; language lanes mirror the Rust lane), contract
  interfaces (public contract fn signatures), public symbols, SDK
  capabilities, toolchain (CI/tests/artifacts), soroban-sdk version →
  dated `versionStatus`, anti-farm signals, README contract ids
  verified live on mainnet.
- **Write-shape** (write-shape.ts) — signals-only writes: a scan can
  never demote tier/score by construction; scores move when enrich
  next runs. `pending`/`error`/`incomplete` states are never demoted.
- **Joins** — enrich-onchain attributes mainnet contract activity to
  repos (`codeInUse`: invocations, events, weekly deltas); audits gain
  `codeChangedSinceAudit`/`driftDays` (audit currency vs the code as it
  is TODAY); successions (`successorRepo`) demote superseded
  generations behind their successors.
- **Budget discipline** — waves ride a shared PAT with hard budget
  guards: a starved run exits RED (`BUDGET-STOPPED`), never silently
  green; targeted re-scans serialize through a concurrency group.

The eval gate: scripts/scan/depth-eval.ts holds labeled repos
(deep/shallow, per-language) and fails CI when calibration drifts.

## 3. Knowledge & relations

- **knowledgeNotes** (src/lib/repo-knowledge.ts) — dated, sourced facts
  on repo rows: a curated map plus derived notes (audit crosslinks),
  rebuilt wholesale each enrich pass so notes can't rot silently.
  Notes carry a **visibility**: `public` (default) serves everywhere;
  `internal` is triage memory — most of the EC long tail doesn't merit
  surfacing or deep indexing, and an internal note records that
  judgment (junk/farm/irrelevant/dupe-of) for curators and
  wave-prioritization without publishing verdicts about someone's
  repo. Internal notes are filtered at the collection layer
  (afterRead, covers the raw Payload REST too) AND at serve — they
  never leave the DB for unauthenticated readers.
- **Relations** — audit engagements (engagement id, report version,
  supersession — never guessed), repo generations (curated
  `REPO_SUCCESSIONS`), org attribution (entities → `builtBy`, resolved
  in the entity namespace), canonical identity (dupe/alias links).
- **Research corpus** — ingested sources (SDF org pages, SEPs with
  their own preamble dates, blogs, papers, audit registry) with the
  provenance trio (source URL, published/updated, observedAt) on every
  chunk; semantic fallback is labeled as such — a vector neighbour is
  never served as a fact.

## 4. The truth engine — detectors → ledger → fixes → proof

The engine's job is to find where the index is thin or wrong BEFORE a
consumer does:

- **Detectors** (nightly): record completeness (S0 referential
  integrity — every served cross-reference must resolve in its own
  namespace; S1 field completeness with documented-empty allowlists),
  api-drift (live API ⇄ OpenAPI ⇄ docs agreement), content freshness,
  link checks, coverage-watch (scan coverage holes), battery-coverage
  (walks Raven's own eval battery against our surfaces), consumer
  report, db-space.
- **Engine lanes** (scripts/eval/engine-{b..e}*.ts) — corpus sweeps,
  health, demand, contract conformance.
- **The improvement ledger** (src/lib/improvement-ledger.ts) — every
  detector finding lands in one status-tracked ledger; open items
  become GitHub issues; fixes must live-verify to close.
- **Golden evals** (scripts/eval/run-golden.ts + golden-questions.json)
  — ground-truth answer keys, graded against the live service; plus
  live answer-key probes (repo-search-live-probes.ts) that gate bulk
  ingests: canonical answers must keep their top-3.
- **Feedback loop** — `/api/feedback` (agents report answer quality)
  feeds `success_rate` into per-surface confidence scores.

Zero-work discipline everywhere: an empty sweep or a starved wave exits
red — a quiet detector must be distinguishable from a green one.

## 5. Curation — never-guess, gated, read-back

Curated truth lives in versioned maps (scripts/data/curation-maps.ts):
SCF award corrections vs official pages, type/status fixes, canonical
dedupes, successions, protected-repo allowlists. Discipline:

- **Never guessed** — every entry cites what was verified and when;
  unverifiable stays null ("amount confirmed, not verifiable → null").
- **Ownership-registered** — curated fields are registered so sync
  passes can't clobber them.
- **Gated application** — prod mutations run via GitHub Actions with
  dry-run default; execute only after the dry-run report is inspected;
  writes are read back (`findByID`) and a mismatch fails the run —
  Payload reports success even when it drops an unknown key, so
  read-back is the only proof a write happened.
- **Agent curators** — the curator loop proposes (draft JSON via PR),
  the deterministic layer disposes (apply script with only-empty
  writes + read-back + zero-work red). Agents propose; gates decide.

## 6. The refresh chain — keeping the index honest

~72 workflows, the load-bearing cadence:

| When | What |
|---|---|
| nightly | repo scan wave (re-scan policy: changed + never-scanned compete on score), enrich-repos (grades, notes, successions), detectors (S0/S1, drift, freshness, coverage), self-audit |
| weekly | on-chain metrics (enrich-onchain → codeInUse), TVL, EC snapshot, partner enrich/toml, research corpus refresh |
| on merge | contract gate (spec snapshot + generated client freshness + routing-surface limits), tests, spectral lint, Vercel deploy |
| on dispatch | targeted scans (`--only owner/repo`), curation passes, EC taxonomy waves (staged, budget-guarded), seeds/backfills |
| continuous | sync chains: SKILL.md → stellar-scout repo, scout-mcp → npm, catalog text → Raven's re-baseline handshake |

`/api/changes?since=` is the public delta feed of all of it.

## 7. The contract

One spec module (src/lib/openapi-spec.ts) is the single source of truth,
served at `/api/openapi.json`, snapshotted in `specs/`, and codegen'd
into the typed client (`api-client/`). The contract gate fails any PR
whose spec, snapshot, generated client, version, and changelog don't
move together. `API_VERSION` bumps on ANY externally visible change —
consumers (Raven's catalog) treat an unbumped change as invisible.
Changelog entries (src/lib/changelog.ts) are written for agent readers:
what changed, how to use it, what to stop doing.

## 8. Operating limits

- GitHub API: shared PAT pool across scan/enrich/ingest; GraphQL runs
  carry the rateLimit meter and stop at a reserve with a resume offset.
- Repos CDN cache ~5min (`s-maxage`) — verification probes cache-bust.
- Payload/Mongo: select-projection on heavy fields (README excerpts
  excluded from search reads); bulk ingests are metadata-only for the
  long tail.
- Concurrency groups serialize scan waves and debounce chase enriches
  (at most one running + one pending).

## 9. Evals

Three layers, all against the LIVE service:

1. **Golden questions** — ground-truth answer keys, scored.
2. **Answer-key probes** — canonical query → expected top-3, run
   post-deploy and as the gate after bulk ingests.
3. **Depth calibration** — labeled deep/shallow repos per language,
   CI-gated.

Plus the external loop: Raven's own eval battery and improvements
channel (`improvements/stellar-light-scout` in stellar-raven) file
findings against us; our battery-coverage detector walks his battery
nightly so we see what he sees before he does.
