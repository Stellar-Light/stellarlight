# Idea — self-sustaining quality loop (crawl → walk → run)

**Status:** crawl shipped; **walk phase shipped 2026-08-13** — first curator loop ran end-to-end (wallet-availability agent → reviewed drafts PRs → gated apply with read-back; 19 wallets landed + live-verified). **Goal:** the maintainer sets
policy; agents run the cycle. Most operational toil today is plumbing a
machine can own: dispatch-and-watch of Actions, post-deploy verification,
detector sweeps, triage.

## Crawl (deterministic, no LLM — shipping now)
- Every pipeline run tells the truth with its exit code (zero-work-red,
  shipped #775/#776).
- Field-population guard: values-arrive checks daily, pinned known-item
  rows, knownFailing markers tied to issues (#779).
- Nightly health run: execute the detector suite (drift, field-population,
  golden eval, verify-claims, ledger summary) on cron and file/update ONE
  triaged issue with probes when something goes red — wake up to findings,
  not to sweeps.

## Walk (agents open PRs, humans merge)
- Curator agents (discovery / enrichment backfill) propose dry-run-first
  PRs from detector findings; the loop-agent triage protocol reviews.
- The improvement-ledger orchestrator runs on every detector refresh, so
  findings carry ids from detection → wave → verified without hand-curation.

## Run (agents merge behind gates humans set)
- Detector finds gap → agent branches a fix → CI + eval gates arbitrate →
  merge → live read-back posts to the ledger. Guardrails already exist as
  code: write-shape allowlists, dry-run defaults, zero-work-red,
  never-accuse curation, PAT budgets.

**Non-goals:** LLM judgment inside ingest (SURFACE-don't-summarize stands);
autonomous prod mutations without a dry-run artifact.
