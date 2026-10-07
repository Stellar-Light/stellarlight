# Idea: nightly detectors feed the improvement ledger

**Shipped 2026-08-12** — scripts/nightly-findings.ts + four detector hooks +
four feeder specs + nightly-health commit step. First feed carried 4 real
api-drift findings.

Projects from: *advertised-but-never-persisted* (lessons/2026-08-12).

The improvement ledger ingests only the **weekly engine artifacts**
(engine-a/d/e, golden, raven-drift). The **nightly** detectors —
field-population, record-completeness, api-drift, verify-claims — file a
GitHub issue on red but never reach `ledger/findings.json`, so /quality's
closing-rate row is blind to the incident class the nightly layer exists to
catch. The sdkCapabilities hole is the proof case: had its probe existed and
fired, the ledger would still have carried nothing.

Sketch: nightly-health uploads each detector's failing output as a small
committed JSON artifact (same shape discipline as the weekly ones); the
feeder gains one ArraySpec per detector (surface: data-quality, mode from the
probe name). No new infra — the feeder is already pure repo-file read.

Effort: small (one workflow step + feeder specs). Value: the ledger becomes
the single spine it claims to be — every detector, one status-tracked list.
