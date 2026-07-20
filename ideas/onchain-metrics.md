# On-chain metrics on project profiles — SHIPPED

**Status: shipped 2026-07-20** (v1 #608/#609, expansion #610, v2 deltas #611, partner links #612-614; openapi@1.8.6/1.8.7). Briefly descoped earlier the same day, then rebuilt on boxy's call with the duplication concern answered by design: we don't re-serve explorer data as our product — we store the **join** (contract/asset ↔ curated project identity, hand-verified with primary-source URLs) plus snapshot metrics with full provenance, refreshed weekly. 17+ projects served; deltas (eventsDelta/subinvocationsDelta/assetHoldersDelta) activate per-project from the second snapshot.

Remaining (tracked, not open-ended): wire deltas into confidence freshness (capped) + the status-recency detector once a week of delta history exists; expansion pass 3 over the remaining verified-candidate list.
