# Audit findings extraction v2 (per-auditor deterministic parsers)

**Projects from:** the audits-registry ship (2026-07-19) + lessons class 2 (ambiguous null). **Status: proposed — the natural next audits step.**

**What:** populate `findingsTotal` + `severityCounts` on /api/audits rows for the auditors whose report formats parse CLEANLY — OtterSec (`OS-XXX-ADV-NN` IDs), Code4rena (severity-sectioned), Veridise (`V-XXX-VUL-NNN`) — leaving null (= not extracted, NOT zero) for the mangled rest. Strictly deterministic, per-auditor format parsers; NO LLM in ingest (boxy architecture call, 2026-07-16), no laundering of the unreliable chunk-level severity inference into structured truth.

**Why:** the two headline fields ship 100% null today; "which audited projects have criticals" stays unanswerable. The earlier one-parser-for-all attempt failed on PDF mangling — per-auditor parsers sidestep that by only claiming what a format guarantees.

**How:** extend `ingest-soroban-security.ts` with a `FINDING_FORMATS` table (auditor → finding-ID regex + severity-section grammar); a report populates counts ONLY when its parse round-trips (IDs unique, severities enumerable); dry-run prints per-auditor parse coverage before any write.
