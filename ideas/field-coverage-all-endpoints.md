# Field-coverage check on every list endpoint

**Projects from:** lessons class 11 (contract under-documentation). **Status: SHIPPED 2026-07-20 (#620)** — the remaining seven row shapes (builders, people, rfps, hackathons, skills, clusters, leaderboard) now have named component schemas in the spec and live-⊆-spec field-coverage entries in check-api-drift.ts (openapi@1.8.9). Every list op is guarded.

**What:** extend the api-drift live-⊆-spec field-coverage check (currently searchProjects + partners rows) to every list op: builders, rfps, hackathons, skills, clusters, leaderboard, research rows — and one level of nested objects.

**Why:** the anchorProfile under-documentation class was caught on 2 of ~10 row shapes; the other 8 can drift exactly the same way and nothing would notice until a consumer's detector does.

**How:** mechanical — add entries to the existing `fieldCoverage` list in `scripts/check-api-drift.ts`; requires documenting the missing row components in the spec first (Builder, RFP, Hackathon rows), which is itself the point.
