# Idea: memory-delta feed — /api/changes?since= for memory-carrying agents

**Shipped 2026-08-12** — GET /api/changes (openapi@1.8.48, PR #832): updatedAt row-level changes + dated facets (status, scf-awards, code-facts, toml; ["row"] = undated), per-surface truncated paging. Live-verified 2026-08-13 serving the curator availability writes as they landed.

Projects from: SYNTHESIS-2026-08-12 (Raven trajectory: per-user memory,
institutional hardening).

Raven now carries per-user memory. A memory doesn't want to re-read the
corpus; it wants to RECONCILE: "what changed since I last looked." Every
institutional cache wants the same. We already keep the timestamps —
lastEnrichedAt, statusAsOf, scannedAt (codeVerified), dataAsOf
(leaderboard), tvlAsOf, changelog dates — but serve no delta surface.

Sketch: `GET /api/changes?since=<iso>&surfaces=projects,repos,partners`
→ `{ changes: [{surface, slug, changedAt, fields?: [...]}, ...], meta:
{asOf, truncated} }`, built from the existing per-row timestamps (no new
write path; a Mongo query per surface sorted by the timestamp we already
store). Field-level granularity only where a dated sub-field exists
(status, code facts, tvl); row-level otherwise — honest about resolution.

Pairs with, later:
- **Webhooks (#90)** — the push form of the same feed.
- **Confidence (#87)** — a delta entry with falling confidence is a
  memory-invalidation signal, the exact thing an agent memory needs.

Care: this surface makes STALENESS legible to consumers — which is the
point, but it means dataAsOf discipline (generatedAt stamping, the
stale-evidence rule) becomes consumer-visible; ship after
citation-grade provenance so the timestamps it exposes are the honest,
uniform ones.

Effort: small-medium (one read endpoint + spec + probes). Value: the
feature a memory-carrying Raven can't get anywhere else in the ecosystem.
