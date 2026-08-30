# Plan — where StellarLight is going

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md) (how it works today).
This is the forward plan: what each subsystem becomes next and why.
Phases are sequenced by dependency, not by calendar.

## 0. Findings that shape the plan

- **Agents need truth to act** (Raven's founding problem). The scarce
  resource is not answers — it's evidenced, dated, re-verifiable facts.
  Everything below deepens one model of ecosystem reality.
- **Code truth is the spine.** The hardest questions agents get asked
  (what does this contract expose, is it maintained, is it USED, is its
  audit current) are answered from source + chain, not from prose. Our
  differentiated joins — code-verified × mainnet-used × audit-currency
  × toolchain × succession — exist nowhere else; the plan widens and
  deepens them relentlessly.
- **Population beats features.** Recurring external findings are mostly
  "the field exists but rows are empty." Coverage and completeness
  work ranks above new surface area.
- **A quiet detector looks like a live one.** Every lane must fail loud
  on zero work; every claim must carry its date; every write must prove
  itself by read-back.

## 1. Coverage — the substrate (in flight)

- **EC taxonomy ingest** — LANDED. 12,961 repos indexed (measured
  2026-08-30), against the ~12.2k net Stellar list and ~2.6k at the time
  this was written. 10,018 of them (77%) are EC-sourced; 2,314 (18%)
  carry a project link.
- **Tier gating — NOT OPERATIVE (2026-08-30).** This section used to
  claim the corpus was "tier-gated (`quality/community/archive`) so bulk
  rows can't displace canonical answers". It is not: `tier=quality` has
  **zero** members. `codeProofTier` (src/lib/code-signals.ts) is
  unit-tested and called from exactly one place —
  scripts/scan/scan-report.ts, a READ-ONLY report whose own header says
  it prints what the scanner "WOULD assign" and that its checks mirror
  "the circuit breakers the WRITE path will enforce". That write path was
  never built, so nothing has ever been promoted or demoted. SDF's own
  repos sit in `community` beside the EC long tail.
  Worse, the rule is inverted: a dry run of the missing write path
  proposes 1,330 promotions and not one is canonical — `js-stellar-sdk`
  (695★, depth 0.94) fails on proof kind, `rs-soroban-sdk`,
  `stellar-cli` and OpenZeppelin's contracts all miss the 0.6 depth bar,
  while student dApps clear it. `codeDepth` measures how heavily a repo
  USES the SDK, so an app scores high and the SDK itself scores low. The
  fix is a canonicality signal (curation, ownership, dependents), not a
  threshold tweak. Diagnostic: scripts/backfill-code-tier.ts (unarmed).
- **Scan coverage of the new corpus — 53%.** "Prominence-first scan waves
  bring code truth to the new corpus" is half true: 6,873 scanned, 5,839
  still `pending`, 238 `error` (2026-08-30). Most of the pending tail is
  EC bulk that should get a cheap triage verdict rather than a deep
  index, so the number to drive is canonical coverage, not corpus
  coverage — see the curated-canonical guard below.
- **Contracts as first-class entities — NOT BUILT (2026-08-30).** There
  is no Contracts collection; contract data lives as fields on
  `Projects`. The Soroban "verified contract set" does not exist as an
  entity layer yet. Kept here as the intent, not as work in flight.
- **People/orgs — barely started (2026-08-30).** The `entities`
  collection holds **46 rows** against 1,036 projects and 12,961 repos.
  The org ↔ project ↔ repo ↔ contract resolution is the intent; the
  population is not there.

## 2. Indexing & code depth — the standing arcs

- **Interface & symbol completeness**: per-crate entry-file guarantees
  landed; next is workspace-level cross-crate linking and re-export
  resolution so a facade crate doesn't hide its implementation.
- **Language depth**: Rust and JS lanes are calibrated; Python/Go/JVM
  lanes have calibrated flagships. Arcs: close the JS frontier blind
  spots, hand-verify shallow-side labels per language, converge
  calibration on the operational answer keys.
- **Incremental scanning — NOT BUILT (2026-08-30).** No workflow, no
  `repository_dispatch` hook; rescan-on-push is still an idea doc
  (improvements/ideas/rescan-on-push.md). Everything re-verifies on the
  nightly wave today.
- **The dependency graph — BUILT and populated (2026-08-30).**
  `stellarDeps` is filled on 4,289 repos with real entries (981 empty of
  5,270 carrying the field, 18.6% — checked against the empty-array
  pathology rule, which flags a field empty on 60%+ of rows). Forward
  read works; the reverse read (dependents) is a search-time join. Feeds
  "what breaks if X dies", underwriting, and ecosystem cartography.

## 3. Knowledge — from facts to understanding

- **knowledgeNotes deepening — effectively unstarted (2026-08-30): 8
  notes across 7,000 repos (0.1%).** The intent stands — extraction-
  derived notes (README/docs claims with provenance, release-note
  deltas), per-symbol knowledge (what `release_escrow` does, from doc
  comments), architecture summaries for flagship repos, every note dated
  and sourced and rebuilt wholesale so nothing rots silently — but the
  population is ~nil, so any claim resting on it is a claim about intent.
  This is also where an agent-facing ORIENTATION layer would live: the
  facts no human wrote down because no human needed them written
  (superseded-by, deprecated-at, this-example-predates-protocol-20).
  Note the standing risk: authored truth has no upstream to re-derive
  from, so each note needs machine-checkable evidence and a re-check
  cadence or it becomes a hand-set number wearing a citation.
- **Triage notes for the long tail**: internal-visibility notes are the
  memory of "not worth it" — as the ~12k EC corpus lands, most repos
  get a cheap triage verdict instead of a deep index, recorded
  internally so the judgment isn't re-litigated every wave and never
  published. Scan-wave prioritization learns to skip internally-triaged
  repos; a curator lane proposes triage notes from farm/fork/dead
  signals for human confirmation.
- **Research corpus**: canonical non-blog page families (org pages,
  research-grant pages) complete; SEP/protocol coverage carries the
  documents' own dates; the agentic-payments landscape gets a
  research-grade entry.
- **Honest semantics**: semantic fallback stays labeled; refusals stay
  the design when we hold nothing.

## 4. The engine — toward self-maintenance

- **Curator phase 2 (discovery)**: agents propose NEW rows (projects,
  repos, contracts) from primary sources; the deterministic layer
  verifies and disposes. Closes the long-tail gap no manual pass
  reaches.
- **Curator phase 4 (self-correction)**: detector findings become
  curator drafts automatically — the loop probe → gap → fix → verify
  runs without a human in the inner loop, humans hold the gates.
- **Ledger as spine**: every detector, eval, and external finding in
  one status-tracked ledger; nothing closes without live verification.
- **Feedback→confidence**: agent-reported answer quality keeps flowing
  into per-surface confidence; low-confidence surfaces get probed
  harder automatically.

## 5. Verification as a surface

- **Verify v1**: claim in → verdict + evidence + confidence out, for
  the claim types we already defend internally (audit currency,
  canonical repo, contract liveness). Multi-source agreement weighting;
  single-source claims say so.
- **Event-driven freshness**: the webhook/event layer that triggers
  re-verification (pushes, releases, on-chain events) — p50 staleness
  on tracked events under 24h.
- **Composite endpoints**: vet-idea / find-partner / competitor-scan —
  the joins packaged as one-call workflows for agent consumers.

## 6. The standard & the benchmark

- **Data-trust conformance**: publish the discipline this repo runs on
  (provenance trios, dated claims, read-back writes, zero-work reds,
  documented-empty allowlists) as a runnable conformance suite others
  can adopt; we are the reference implementation.
- **Repo-facts correctness benchmark**: publish the golden answer-key
  eval as a public benchmark — fact layers currently have no
  scoreboard; ours already runs nightly.
- **Public quality surface**: the internal quality/ledger status page
  goes public when it's ready to be held to.

## 6b. Scheduled from the 2026-08-30 plan audit

Measured, not assumed — each line below was checked against the live corpus
and is either half-built or unbuilt. Ordered by what unblocks the most.

1. **Arm the tier write path.** The rule is fixed (quality = CURATED, not
   code-depth) and dry-runs clean: 39 promotions, every one canonical.
   `scripts/backfill-code-tier.ts` is written and unarmed. Blocked only on the
   decision to write.
2. **Proof-engine language coverage.** `stellarProof` looks for Rust
   `soroban-sdk` and JS `@stellar/stellar-sdk`, so an AssemblyScript Soroban
   contract reads as `none` — the dry run proposed archiving
   Soneso/as-soroban-examples on that silence. Demotions stay gated behind
   `--include-demotions` until proof covers the languages we index. An
   archive decision made on an engine's blind spot is a guess.
3. **Scan the curated stragglers, or drop them from curation.** 5 curated
   canonical repos still carry no code signals (0-3★, `pending`/`error`). Each
   is a curation question before it is a scan question — a repo nothing stars
   and nothing scans may not be canonical. Guarded by
   `scripts/check-curated-canonical.ts`, surfaced on /quality.
4. **Contracts as first-class entities** (was P1, unbuilt). No collection
   exists; contract data is fields on `Projects`.
5. **People/orgs population** (was P1, 46 rows). The resolution model is
   designed; the corpus is not there.
6. **Incremental scanning / rescan-on-push** (was P2, unbuilt). Still an idea
   doc; everything waits for the nightly wave.
7. **knowledgeNotes population** (P3, 8 notes across 7,000 repos). The
   orientation layer agents actually need — superseded-by, deprecated-at,
   this-predates-protocol-20 — lives here, and needs a re-verification cadence
   from day one because authored truth has no upstream to re-derive from.

**The pattern the audit found, worth stating once.** Every defect above is the
same shape: the machinery exists, is tested, produces a value — and nothing
consumes it. `codeProofTier` tested and called only by a report. `triageTags`
derived for 12,961 repos and read by no serving path. The curated canonical
list floated in search but never verified, so 10 of its names matched zero
rows for months. A lesson recorded in a doc is not a guard; only a lane that
fails loud is. Prefer adding the guard to writing the note.

## 7. Open decisions (defaults chosen, flag to reverse)

- **Scan capacity**: default GitHub token caps waves; a dedicated
  fine-grained PAT unlocks full-corpus coverage. Default: staged waves
  under budget guards until then.
- **EC removals**: EC delisting a repo tiers it to archive (their
  curation, our guards: allowlist + fresh-commit review list). Default:
  trust-with-guards, never delete.
- **Premium lanes**: metered access for heavy composite/bulk consumers
  is designed but not scheduled; the keyless free tier is permanent
  either way.
- **Spaced-name identity**: multi-word product-name queries ride exact
  identity at ≥3 words; two-word phrases stay vocabulary (F4). Revisit
  only with answer-key evidence.
