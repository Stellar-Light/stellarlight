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
- **Machinery nobody consumes is not a feature — it is a liability.**
  (Added 2026-08-30 after two independent cross-vendor audits.) The
  dominant defect class here is NOT bad logic. It is correct, tested
  logic whose output nothing reads:
    `codeProofTier`   tested, called only by a read-only report
    `triageTags`      derived for 12,961 repos, read by no serving path
    `tier=quality`    written to prod, and no ranker reads it
    `tierReason`      schema field the write built for it leaves null
    `knowledgeNotes`  8 notes / 7,000 repos, no writer, no cadence
  Each looked finished. None changed a single answer an agent receives.
  **Before building a value, name its consumer. A change that adds a
  field without a reader is not done — it is dead on arrival.**
- **A lesson in a doc is not a guard; only a lane that fails loud is.**
  We wrote the line above into this file and then produced four fresh
  instances of the same class within hours. Docs cannot fail a build.
  The guard is `scripts/check-consumption.ts`, gating in CI
  (`.github/workflows/consumption-guard.yml`) and rendered on `/quality`
  as the `consumption` row. If a future defect belongs to a class we
  have already named, the correct response is not another note — it is
  to ask why no lane caught it, and build that lane.
- **A lane that never runs is not a guard either.** (Added 2026-08-31,
  one day after the line above.) `consumption-guard.yml` — the lane built
  to enforce "a lesson in a doc is not a guard" — installed pnpm with
  `npm i -g pnpm`, drew pnpm 11 against an `engines.pnpm` of `^9 || ^10`,
  and died at the install step. Three runs, zero completions. It was on
  `/quality` as a named guard the entire time, which is worse than absent:
  a listed guard is a reason to stop looking. Two lessons already written
  down cover it — "an armed schedule is not moved data", "a quiet detector
  looks like a live one" — and neither could fail a build.
  The lane is `scripts/check-workflow-health.ts`, on `/quality` as
  `workflow-health`. It asks GitHub what our lanes actually did, and it
  found two more: `generated-recall.yml` had never run since the day it
  was added (2026-07-09), and `sync-scout-mcp.yml` has been red since
  2026-07-03 on a missing secret, so the npm mirror is two months stale.
  **A guard counts from its first green run, not from its merge.**
- **A gate that is only as wide as its config.** (Added 2026-08-31.)
  `tsconfig.json` excludes `scripts/**`, so `tsc --noEmit` reported a
  clean tree while ~200 node-side scripts went unchecked — including
  `enrich-repos.ts`, which writes repo grades to the production database.
  Two broken scripts shipped in consecutive commits behind a fully green
  CI run, both one-line mistakes a compiler catches for free. Every
  check has a scope, the scope is invisible in its output, and "green"
  means nothing until you know what was in it.
  Guard: `scripts/check-scripts-types.ts`, ratcheted against a frozen
  63-error baseline, on `/quality` as `scripts-types`.
  **Ask what a passing check did NOT look at.**
  Its first version then failed CI while passing locally, for the sharper
  version of the same thing: the config pulled in `src/**`, which reaches the
  Payload admin routes, which import `importMap.js` — a file Payload
  GENERATES and `.gitignore` excludes. It exists in every working tree and no
  fresh checkout. **A guard whose inputs include generated or ignored files
  is measuring the developer's laptop, not the repo.** Reproduce a
  local-passes/CI-fails split in a fresh clone before theorising; four
  theories were wrong before that clone answered it in one run.
- **A detector that reports on missing evidence manufactures fires.**
  (Added 2026-08-31.) The workflow-health sweep hit a GitHub rate limit,
  read the 403 as "cannot tell", and reported a lane broken that had been
  correctly cleared minutes earlier. Three separate versions of the same
  error in one sitting: judging a current file by runs of a since-fixed
  version, counting runs from branches that never merged, and calling a
  deliberate `exit 1` a failure. Each would have put a permanent red on
  the board for something nobody could fix, which is how a board stops
  being read. **Absence of evidence gets reported as inconclusive — a
  sweep that could not measure writes no number.**
- **Silence closed findings and noise did not reopen them.** (Added
  2026-08-31.) `upsertFindings` auto-`cleared` a finding when its detector
  stopped reporting it, and the re-raised branch preserved `status` — so a
  cleared finding the detector raised AGAIN stayed cleared. The ledger could
  record a regression and never show one. Measured before the fix: **191 of
  406 cleared findings had a `lastSeen` after their `clearedAt`**, meaning a
  detector had re-raised them while the board counted them closed. Six were
  live at the moment of the fix, `usdc-swap` and `stellars-finance` among
  them — the exact queries whose page-size defect this same branch repairs.
  `cleared` now reopens on re-detection; the deliberate states (in-wave,
  fixed, verified) still never auto-change, because a person asserted those.
  **A closure statistic that only moves one way is a measure of question
  frequency, not of repair.**
- **`quality` has exactly ONE writer.** Two authorities over the same
  field is how curation gets silently reverted by sync (#730). Verified
  2026-08-30: a second writer would have demoted 34 of 39 curated rows
  and confirmed the clobber as success via its own read-back.

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

## 6c. Scheduled from the 2026-08-31 lane audit

Found by pointing the new `workflow-health` lane at our own repo. Each is
measured, not inferred.

1. **`sync-scout-mcp.yml` has been red since 2026-07-03** — the workflow's
   own guard reports `STELLAR_LIGHT_SCOUT_MCP_TOKEN` missing, so the npm
   mirror at `Stellar-Light/scout-mcp` is two months stale while the
   monorepo has moved on. Needs a secret only a human can set, and it
   should be a **deploy key rather than a PAT**: the last time this mirror
   died silently for a month it was also PAT expiry, and #945 moved the
   sibling sync to a deploy key for exactly this reason. Until it is set,
   anything installing the published package gets July's code.
2. **`generated-recall.yml` never ran once.** It used
   `pnpm/action-setup@v4` with no version, and `package.json` carries no
   `packageManager` field for it to read, so Engine A's weekly lane died at
   setup from the day it was added (2026-07-09). Pinned to 10; it stays
   flagged until a green run proves it, because a fix is not a fact.
3. **Retire the 63-error scripts baseline.** `scripts-types` is a ratchet
   with a frozen list, and a ratchet that never moves is just a permanent
   red with extra steps. Two error classes dominate and both are
   mechanical: `Options<>` mismatches on `payload.update/find` calls, and
   `string | null` passed where `string` is required. Worth one pass.
4. **`triageTags` and `tierReason` are named debt in `KNOWN_DEAD`.**
   `tierReason` needs a decision: whether a tier provenance field earns a
   writer. `triageTags` does NOT — §3 of this plan already names its
   consumer, "scan-wave prioritization learns to skip internally-triaged
   repos". So it is not a delete-or-keep question at all; the consumer was
   specified and never built, which reclassifies it from debt to unfinished
   P3 work. The list only turns one way — a field may leave it, never join
   it.
5. **`what is DD` stays an open recall miss on purpose.** A two-letter
   all-caps token is how people write categories, and there is no acronym
   vocabulary to gate it on. Reopen it if a curated acronym list appears.
6. **Cut searchProjects' question phrases — but measure first.** Its
   `x-routing` blob is 2,409 chars against a median of 515, and 77 keywords
   include whole question phrases ("which providers support stellar", "what
   services can I integrate") rather than nouns. The dilution is measurable:
   getPartners scores 75 on the bare query `wallet` and 23 on "what wallets
   support Stellar". The phrases belong in `exampleQuestions`, which the
   contract scores as a separate field — but the scorer's field weighting is
   not published, so cutting 77 keywords without re-measuring scout-only rank
   is a guess that could cost real recall. The directional `notFor` (activity
   ranking -> getLeaderboard) shipped; the cut needs a measured before/after.
   Note the inverse pathology in the same system: listContracts fails by
   term CONCENTRATION, searchProjects by DILUTION.
7. **Re-probe the 218 cleared on silence — 69 of them are high-severity.**
   434 of 461 findings are closed, and the basis splits three ways: 7 verified
   deliberately, 209 cleared by a live re-probe that PASSED (the stale sweep
   stamps `clearedBy`, and it clears on nothing else), and **218 cleared only
   because a detector stopped reporting**. The first two are evidence. The
   third is the backlog, and it is not small debris — 73 are high severity, of
   which 69 are genuine (4 are our own canaries); 131 medium; 14 low. By
   source: engine-d-demand 105, engine-a-recall 50, nightly-drift 22,
   scf-crosscheck 14, nightly-battery 14, raven-routing 7. By surface:
   retrieval 98, directory 59, contract 22, scf 14, corpus 14.
   All 218 carry a probe string, so the lane is mechanical: replay each probe,
   re-clear what passes with `clearedBy` set, reopen what does not.
   `scripts/quality/clear-stale-findings.ts` already does exactly this for
   `engine-a-recall` and is the model — it needs widening to the other
   sources, not inventing. Now that re-detection reopens, anything genuinely
   broken returns on its own; the number to watch is how many of the 218
   survive a re-probe, which is the true measure of how much the closed column
   was overstating. Spot-checked 2026-08-31: engine-d's
   `kutana`, `etesia` and `octopos` are all cleared, all still return
   semantic-mode no-match on the live API, and all carry SCF round badges.
   Nobody asked again, so the ledger called it closed. The board no longer
   says "90% closed" — it says "413 closed, 7 of them verified" — but the
   honest number is a stopgap for the real lane: sample the cleared set,
   re-probe it, and publish the resurrection rate. Until that exists, the
   closure statistic measures question frequency, not repair.
8. **The mid-sentence acronym hole.** Proper-noun promotion takes any
   capitalised 3+-char word, so "best DEX on stellar" hands rank 1 to a
   project named DEX — the same mention-vs-identity error the lowercase
   guards prevent, surviving where the category word is conventionally
   capitalised. Pinned as a standing `.fails` test in
   `identity-outranks-mention.test.ts` so fixing it breaks the test and
   tells the fixer to promote it to a real assertion.

**The pattern the audit found, worth stating once.** Every defect above is the
same shape: the machinery exists, is tested, produces a value — and nothing
consumes it. `codeProofTier` tested and called only by a report. `triageTags`
derived for 12,961 repos and read by no serving path. The curated canonical
list floated in search but never verified, so 10 of its names matched zero
rows for months. A lesson recorded in a doc is not a guard; only a lane that
fails loud is. Prefer adding the guard to writing the note.

**And the recursion, found the next day.** The lane written to enforce that
sentence had never completed a run. Every rung of this ladder fails the same
way — a note nobody reads, a lane nobody runs, a check whose config excludes
the files that matter, a sweep that reports a finding when it simply could not
measure. Each rung is a narrower version of the same question, so ask it at
every level: *what would this look like if it were not working, and would we
be able to tell?* If the answer is "identical", the guard is decoration.
`workflow-health` and `scripts-types` are the two rungs added on 2026-08-31.

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
