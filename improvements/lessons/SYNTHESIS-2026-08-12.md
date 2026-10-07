# Lessons synthesis — the month since, and where this points (2026-08-12)

The [07-12 synthesis](./SYNTHESIS-2026-07-12.md) reduced 26 classes to one
root: *a gap between what is true and what the system asserts.* One month
later that framing held — every new incident was an assertion-truth gap —
but the month moved the FRONT. The 07-12 corpus was mostly about gaps in
the DATA (fields, rankings, identities). This month's incidents were mostly
gaps in the MACHINERY THAT CHECKS THE DATA. The watchers became the weak
layer, which is exactly what should happen as the data layer hardens: the
defect migrates to wherever nobody is looking.

## The three shapes this month keeps producing

**S1 — Watchers that can't scream.** The single most recurring shape, hit
at least six distinct ways: `| tee` under GitHub's pipefail-less default
shell muted every detector step in **14 workflows** (the nightly red-issue
path had never fired once); `gh run watch --exit-status` disagreed with
run conclusions; failed dispatches read the *previous* run as success;
rescan waves exited green having scanned nothing; a stale evidence
artifact is indistinguishable from a quiet pass; and the enrich read-back
guard cried wolf for 772 rows that had persisted fine. The trajectory that
works: **evidence as committed files, not log lines** (the ledger feed
exposed the pipefail hole within ONE run by making the artifact and the
exit code disagree visibly), honest exits everywhere, and treating a
false-alarming guard as near-P1 — a guard that is red for a month teaches
people to ignore it, and its credibility IS the mechanism.

**S2 — Identity by ad-hoc string comparison.** Fifth-plus incident in the
family: case-variant twin repos, Payload `contains` substring traps, the
read-back keyed by URL-casing while rows store canonical casing, and the
capstone — the SCF matcher comparing SPACELESS names by substring, so
"Soroban Disassembler" (soro·**band**·issassembler) wrote another
project's $100k award onto Band Protocol and **18 rows corpus-wide carried
other projects' award data**, some for weeks, some feeding sls-063's
"awarded but no record" residuals. Each writer reinvents matching; each
reinvention rediscovers a trap. The gap is structural: **there is no
shared identity module.** canon(), title-prefix, case rules, and dupe
routing live in four scripts with four behaviors.

**S3 — Advertised ≠ persisted ≠ served.** `sdkCapabilities` was in the
spec, the client, the serving path, and the changelog — and had never
persisted once, because the write mapping dropped it and the schema never
declared it, behind three guards that were each blind by construction
(tsc can't see scripts/, agreement tests pass when both sides share the
omission, population probes only watch pinned fields). The conformance
that prevents this — read-back, population probe, shape test, zero-work
red — exists but is **opt-in per writer**, and grandfathered writers are
exactly where the class lives.

## Meta-lesson updates

1. **The commit message is not the diff.** A "fix" PR claimed the pipefail
   change; its patch script had aborted before the edit and the
   verification grep was misread. Self-applied verification is not
   optional: after any scripted multi-edit, the intended change must be
   IN the diff, and grep output must be read, not glanced.
2. **Guards compound — and so does guard debt.** 07-12's economics claim
   held (the 18-row poison cost one evening *because* the audit method,
   verdict parser, dry-run Action, and allowlist repair pattern already
   existed). The new corollary: an unenforced guard convention is debt
   that compounds too — every new writer shipped without conformance is a
   future incident with a known shape.
3. **The external-referee thesis is confirmed and now reciprocal.**
   sls-063's full-sweep method was adopted as our record-completeness
   detector; our drift reports feed their re-baselines. The channel is a
   two-way eval exchange now — protect it by never overclaiming (the x402
   ledger finding was left open rather than rubber-stamped).

## The consumer trajectory, read from Raven's repo

Raven's visible moves — auth (CIMD), multi-model gauntlets, blind-authored
holdout evals, per-user MEMORY, standardized multi-service QA registers —
are the moves of a system hardening for serious, possibly institutional
users. A memory-carrying agent serving accountable users changes what it
needs from a data layer:

- **Citations, not just answers**: every fact needs basis + as-of +
  source URL, because a memory that stores our claim must be able to
  defend and re-verify it. We built this for lifecycle status (sls-024:
  statusBasis/statusAsOf/statusSourceUrl). Nothing else has the full
  triple.
- **Deltas, not re-reads**: a memory reconciles; it should ask "what
  changed since T" instead of re-reading the corpus. We keep the
  timestamps (lastEnrichedAt, scannedAt, statusAsOf, dataAsOf) but serve
  no delta surface.
- **Calibrated confidence**: institutions act on numbers; a served fact
  with no confidence forces the consumer to invent one. (#87 has been
  pending since the API-hardening arc — it is now strategic, not nice-to-have.)
- **A visible SLA**: /quality + DATA_SLA exist and await flip-on; the
  ledger spine now genuinely covers nightly + weekly detectors, so the
  numbers behind that page are real.

## Roadmap (build order, each killing a family or serving the trajectory)

1. **Citation-grade provenance** — extend the sls-024 triple
   (basis/asOf/sourceUrl) to the other served fact families: SCF awards
   (official page URL per round), repo code facts (scannedAt exists; add
   source), partners/anchors. One uniform shape the spec documents once.
2. **Writer-conformance guard** — a CI meta-check that enumerates the
   recurring writers and asserts each has read-back + zero-work-red + a
   population probe; plus the mechanizable lesson lints (no `| tee`
   without `shell: bash`, no `process.exit(0)` after exitCode set). Kills
   S3's grandfather problem and part of S1 by construction.
3. **Shared identity module** — one `src/lib/identity.ts`: canon, spaced
   and spaceless normalization, title-prefix matching, case-insensitive
   lookup + canonical-key write-back, dupe routing. All writers import
   it; its unit tests carry every past trap as a fixture. Kills S2.
4. **Memory-delta feed** — `/api/changes?since=` from existing
   timestamps, so Raven's memory (and any institutional cache) reconciles
   instead of re-reading. Pairs with webhooks (#90) later.
5. **Confidence scores (#87)** — per-fact confidence derived from basis
   (human-verified > official-record > source-inherited > derived >
   unverified), freshness, and cross-check agreement. The provenance work
   in (1) is its input, which is why it is sequenced after.
