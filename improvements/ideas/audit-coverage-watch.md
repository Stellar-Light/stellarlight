# Audit coverage watch (UNTRIAGED → issue)

**Projects from:** the audits-registry linkage method (2026-07-19). **Status: proposed, small.**

**What:** when a NEW report appears on stellarsecurityportal.com whose protocolName has no `AUDIT_PROJECT_ALIASES` entry, file/refresh a rolling issue (the ingest already prints `UNTRIAGED:` loudly — but only into a workflow log nobody reads; the signal must reach the tracked queue, same class as the engine exit-1 dead ends fixed in #591).

**How:** ~15 lines in the ingest's registry step — on untriaged > 0 in an Actions run, emit a `::warning` + write a marker the workflow's rolling-issue step picks up; or fold into the daily self-audit (compare portal list vs registry count). Alias triage stays human-verified (precision over recall).
