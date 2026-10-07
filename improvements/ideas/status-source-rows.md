# /api/status source rows for research-docs + partners

**Projects from:** 2026-07-19 staleness recon (self-audit blindness). **Status: proposed, small.**

**What:** /api/status has no source row for the research corpus (the #2 endpoint by usage) or partners, so the daily self-audit freshness guard is structurally blind if their crons stall. Add both rows (count + freshest observedAt/lastPartnerUpdateAt) — the audits row (#589) is the template; the existing MAX_AGE_DAYS guard picks them up for free.
