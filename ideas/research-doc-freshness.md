# Research-corpus doc freshness + SDK-version tagging

**Projects from:** lessons class 8 (undated metrics) + class 18 caution (old ≠ wrong) + Beacon Q2 (stale setup advice). **Status: proposed.**

**What:** per-doc `lastVerifiedAt` on research-corpus entries, plus SDK-version tagging on version-bearing docs (a setup guide showing `wasm32-unknown-unknown` gets `versionStatus: deprecated` via the same dated table repos use). A weekly cron flags staleness-SENSITIVE docs (setup guides, tutorials — NOT specs/whitepapers, which are old AND canonical) older than a threshold → files a review issue.

**Why:** repos carry `sorobanSdkVersion`+`versionStatus` (it's what made the wasm32v1-none answer good); docs carry nothing. The exact stale-playbook class Beacon's Q2 praised us for catching on repos is unguarded on the docs side.

**How:** extend the research ingest with a doc-kind classifier (spec/tutorial/blog), run `soroban-versions.ts` detection over doc content, stamp + expose in /api/research rows; flag-for-review cron mirroring self-audit's issue-filing plumbing. Review, never auto-down-rank.
