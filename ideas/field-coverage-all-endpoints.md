# Field-coverage check on every list endpoint

**Projects from:** lessons class 11 (contract under-documentation). **Status: proposed.**

**What:** extend the api-drift live-⊆-spec field-coverage check (currently searchProjects + partners rows) to every list op: builders, rfps, hackathons, skills, clusters, leaderboard, research rows — and one level of nested objects.

**Why:** the anchorProfile under-documentation class was caught on 2 of ~10 row shapes; the other 8 can drift exactly the same way and nothing would notice until a consumer's detector does.

**How:** mechanical — add entries to the existing `fieldCoverage` list in `scripts/check-api-drift.ts`; requires documenting the missing row components in the spec first (Builder, RFP, Hackathon rows), which is itself the point.
