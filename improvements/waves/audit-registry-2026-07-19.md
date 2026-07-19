# Audit registry — structured audits, verified project linkage (2026-07-19)

## Why

Recon (4-probe sweep, 2026-07-19) confirmed the audit corpus had the
"structured truth trapped in prose" defect: no audit↔project linkage, no way
to enumerate the ~58 reports (vector retrieval caps distinct docs), severity
mostly `unknown` at serve time, and `/api/research` silently ignored
`auditor=`/`protocol=`/`severity=` — the omission-trap class. The failed
per-finding extraction attempt (PDF-mangled) was never needed for the main
questions: "list audits for X" is REPORT-level, and report metadata is clean.

## What shipped

- `audits` collection + **GET /api/audits** (project/auditor/q/since filters,
  strict params — unknown params 400, never silently ignored), openapi@1.8.0.
- `/api/research` now honors `auditor`/`protocol`/`severity` (post-filters on
  audit-chunk metadata; unknown severity 400 with a caveat about inference).
- Identity hygiene (`src/lib/audit-identity.ts`): NFKC + homoglyph repair —
  the portal ships **"Сoinspect" with a Cyrillic Es** — canonical auditor
  casing, whitespace repair ("Reflector Oracle Protocol ").
- Ingest registry upsert in `ingest-soroban-security.ts` + finding-ID heading
  promoters for Hacken (`F-2026-…`) and Coinspect (`TRI001`) formats.
- `/api/status` gains an `audits` source row (arms the daily freshness guard).

## Linkage method (the part that must not be guessed)

47 distinct audited-protocol names triaged by a 6-agent verification pass
against the live directory (name + description + site/repo evidence,
precision-over-recall), then every claimed slug re-verified to exist via the
live API: **41 verified slugs, 51/58 reports linked, 7 verified no-match**
(CapyFi, FxDAO (record removed), ICON xCall, OctoLend, Stellar Soroban Core,
Token Vesting F&M), **0 untriaged**. Evidence per link lives in the session
record; the map is `AUDIT_PROJECT_ALIASES` with `basis` provenance
(name-exact / alias / unmatched). New reports with unmapped protocols surface
loudly in the ingest dry-run as `UNTRIAGED`.

## Explicit non-claims

- `findingsTotal` / `severityCounts` ship as **null = not extracted, NOT
  zero** — deterministic per-auditor extraction is a follow-up; we do not
  launder inferred severity into structured truth.
- Absence of a report at /api/audits ≠ "unaudited" (stated in meta.note and
  the spec).

## Verify

- Dry-run: `pnpm exec tsx scripts/ingest-soroban-security.ts` → "Registry: 58
  reports — 51 linked, 7 verified no-match, 0 UNTRIAGED".
- After prod execute: `curl /api/audits?project=blend` → 5 reports (OtterSec,
  Certora ×3, Code4rena); `curl /api/audits?auditor=Coinspect` → matches both
  homoglyph-mangled reports; `/api/research?q=vulnerability&severity=critical`
  no longer silently ignores the filter.
