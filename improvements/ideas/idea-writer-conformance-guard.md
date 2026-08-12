# Idea: writer-conformance guard (kill the grandfather problem)

**Shipped 2026-08-12** — scripts/check-writer-conformance.ts (C1 read-back/exemptions, C2 tee/pipefail lint, C3 exit-stomp lint, C4 write-shape probe coverage), wired into contract-gate. First run found 2 REAL exit-stomps (curate-partners, enrich-partner-onchain) + 1 in engine-d + 3 unprobed served fields — all fixed in the same PR.

Projects from: SYNTHESIS-2026-08-12 S3 (advertised ≠ persisted) + S1
(watchers that can't scream).

Every write-path incident this month happened on a writer that predated a
convention the newer writers follow: sdkCapabilities predated the
population-probe rule; curate predated zero-work-red (and had the exact
exit-stomp bug enrich had already fixed and documented); 14 workflows
predated the pipefail rule. Conventions enforced by memory don't hold —
conventions enforced by CI do.

One meta-check, `scripts/check-writer-conformance.ts`, asserting:
1. Every recurring DB writer (enumerate them: enrich-repos, enrich-from-scf,
   curate-projects, sync-lumenloop, scan-repo-code, fix-scf-rounds,
   ingest-*) imports the read-back verifier OR carries a documented
   exemption with a dated reason.
2. Every workflow `run:` step containing `| tee` declares `shell: bash`
   (the pipefail lint — pure YAML grep, already burned us in 14 files).
3. No `process.exit(0)` in scripts that set `process.exitCode` (the
   exit-stomp class, third occurrence).
4. Every field served from a scan/enrich pipeline appears in
   check-field-population's probe list or in a dated allowlist (ties the
   SHIPPING.md rule to CI instead of review memory).

Runs in the contract CI job (fast, pure file reads). New writers fail
closed until they conform — the grandfather problem ends by construction.

Effort: small-medium (the checks are greps + import-graph walks). Value:
converts three recurring incident classes from "remembered rule" to
"impossible by CI".
