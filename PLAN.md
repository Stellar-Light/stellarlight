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

- **EC taxonomy ingest** (staged, budget-guarded): ~12.2k repos in the
  net Stellar list vs ~2.6k indexed today. Metadata-only for the long
  tail, own-merit scored, tier-gated (`quality/community/archive`) so
  bulk rows can't displace canonical answers (post-ingest answer-key
  gate). Then prominence-first scan waves bring code truth to the new
  corpus.
- **Contracts as first-class entities**: every mainnet contract an
  entity with code + usage + audit + succession joined — the Soroban
  "verified contract set", defined by evidence.
- **People/orgs**: the entities layer grows portfolio and identity
  depth (org ↔ project ↔ repo ↔ contract, resolved in one namespace
  discipline).

## 2. Indexing & code depth — the standing arcs

- **Interface & symbol completeness**: per-crate entry-file guarantees
  landed; next is workspace-level cross-crate linking and re-export
  resolution so a facade crate doesn't hide its implementation.
- **Language depth**: Rust and JS lanes are calibrated; Python/Go/JVM
  lanes have calibrated flagships. Arcs: close the JS frontier blind
  spots, hand-verify shallow-side labels per language, converge
  calibration on the operational answer keys.
- **Incremental scanning**: rescan-on-push generalized — a push, a
  release, or new on-chain activity triggers re-verification of exactly
  what changed, instead of waiting for the nightly wave.
- **The dependency graph**: who builds ON whom (manifest-level, both
  directions). Feeds "what breaks if X dies", underwriting, and
  ecosystem cartography no one else can draw.

## 3. Knowledge — from facts to understanding

- **knowledgeNotes deepening**: today curated + audit-crosslink derived;
  next, extraction-derived notes (README/docs claims with provenance,
  release-note deltas), per-symbol knowledge (what `release_escrow`
  does, from doc comments), and architecture summaries for flagship
  repos — every note dated and sourced, rebuilt wholesale so nothing
  rots silently.
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
