# Feedback → quality loop (`success_rate`)

**Projects from:** lessons class 8 (undated/unverified metrics) + boxy's metadata proposal (2026-07-08). **Status: proposed.**

**What:** wire the existing `POST /api/feedback` intake into a per-slug quality signal. Aggregate "did this work?" votes per project/repo/research-doc; expose as a `usage` sub-signal inside the existing `confidence` decomposition (relevance/freshness/authority — pure math, no AI, same philosophy).

**Why:** the intake exists but is write-only — nothing loops back into ranking. It's the one self-improving axis we don't have: the system currently learns from OUR audits, never from CONSUMER outcomes.

**How (MVP):** a "Did this work?" affordance on /ask + the MCP `submit_feedback` tool already used by agents → nightly aggregation into a `feedbackScore` (with floors: minimum N votes before it counts, rate-limited per IP/agent, capped influence so it nudges quality, never dominates).

**Risks:** gameable (a partner thumbs-upping itself) → aggregation floors + capped weight; cold-start (near-zero volume today) → build plumbing, expect signal later.
