# Project status-recency detector

**Projects from:** 2026-07-19 staleness recon + lessons class 8 (undated metrics). **Status: proposed — track 2 headline.**

**What:** a weekly detector ranking projects by prominence × statusAsOf age × signal absence (no statusSourceUrl, no repo activity) that files a verification batch (~10 projects) into the adversarial-verify pipeline. NOT bulk demotion — repo-stale ≠ defunct (moneygram/yieldblox rule); the output is a human-verified re-check queue.

**Why:** statusAsOf on the prominent sample is median 130 days old, ALL source-inherited, and nothing watches it — the directory's core claim (what's Live) ages silently while liveness-watch only checks site liveness monthly.

**How:** `scripts/status-recency-report.ts` (read-only, weekly cron + rolling issue via the #591 composite); reuse the liveness-triage wave format for the human pass.
