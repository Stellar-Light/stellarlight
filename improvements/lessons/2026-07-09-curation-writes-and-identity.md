# 2026-07-09 — the corridor-matrix day: three write-path classes + one process class

One thread (boxy: "same issue for Solana? … some bridges are launching, not launched") surfaced four distinct defect classes while shipping the bridge corridor matrix (#408–#416). Each is a row in the README table; the stories:

## Class 20 — batch writes fail dark

The corridor execute (run 29030282070) died on `ValidationError: The following field is invalid: Types` — and **all 13 queued writes were lost**, including 12 valid ones, because the apply loop was all-or-nothing. Three stacked mechanisms, each independently making failure invisible or total:

1. **All-or-nothing apply loops.** One bad row aborted the batch. Same pattern existed in `curate-partners`, `enrich-partner-onchain`, `enrich-repos` (hundreds of repos/wave), and `check-links` (2,106 writes/day — a mid-loop throw also abandoned the cleanup pass). Fixed everywhere (#411, #412): per-write try/catch, `FAILED: <row> — <error>` lines, nonzero exit.
2. **Cross-collection enum assumption.** `Infrastructure` was a valid *partners* type, not a *projects* type. Check the TARGET collection's option list before adding select values — enums are per-collection, not global vocabulary.
3. **Exit-code stomping.** The script ended with `process.exit(0)`, silently overriding the `process.exitCode = 1` set by a failed write — the failed Spectra seed produced a **green** run (run 29032893299), defeating the fail-loudly guarantee the isolation sweep had just added. Fixed (#416): `process.exit(process.exitCode ?? 0)`. Any script that sets `exitCode` on partial failure must not end with a bare `exit(0)`.

Also required for creates, discovered the loud way: `provenance.source` (select: LumenloopSeed/UserSubmitted/AdminEdit — curated seeds use `AdminEdit`).

## Class 21 — name-match identity (same name ≠ same entity)

Seeding Spectra Finance nearly shipped a false identity claim: **spectra.finance's own site has zero Stellar mentions**, so "the Certora Spectra Bridge audit belongs to spectra.finance" was unverifiable by name. Resolution: pull the actual audit PDF (Certora/SecurityReports) and follow its **scope links** — they resolve to `github.com/perspectivefi/audit-bridge-stellar`, and `perspectivefi` = Perspective (perspective.fi), Spectra's parent org. Identity confirmed by artifact, not name.

**Rule: verify audit/announcement subject identity via the artifact's own links (repos, domains, orgs) — never by name match.** Cousin of class 10 (duplicates) and of the still-open slug-join finding (review 2026-07-08 #21): partner→project joins by slug have the same shape and still need a domain cross-check.

## Class 22 — instance-calibrated fixes

The Beacon-Q3 fix (chain vocabulary + `supportedNetworks` seeds) was calibrated to its triggering example: EVM names only, `[stellar, evm]` seeds only. The CLASS was "every chain corridor" — so Solana/Tron/XRPL/Polkadot queries stayed broken, Rozo (a live Solana bridge) was invisible, and the fix looked done because its own example passed.

Fixed by building the **whole matrix at once**: every bridge's chain list verified from primary sources (vendor docs/APIs, quotes in code comments), exact-sync applied, full chain vocabulary, a second-chain golden question, and a daily guard (Bridge-typed ⇒ non-empty `supportedNetworks`). **Rule: when a fix closes an instance, enumerate the sibling instances before closing the item** — the README loop's step 4, applied *during* the fix instead of after the next incident.

## Class 12 extension — the advertised probe (?ramps=)

Our own closing comment on stellar-scout#7 cited `GET /api/partners?ramps=on-ramp → includes Etherfuse` as a verification probe — **the param didn't exist**. The endpoint silently ignored unknown params, so the probe "passed" vacuously (the unfiltered set contains Etherfuse). Caught by our own adversarial verify pass; fixed by implementing the real filter (#404) with 400-on-unknown-values, and correcting the public record.

Two strengthenings of class 12: (a) a cited probe must be **run** and checked for **discrimination** — would it fail if the claim were false? A no-op filter passes any inclusion probe. (b) Silently-ignored unknown query params are the enabling bug — new filter params reject unknown values (`validRamps` pattern).
