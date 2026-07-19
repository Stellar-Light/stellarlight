# Improvement day — 2026-07-19 (#589–#603, 15 PRs)

One day, four arcs, all live-verified. Companion docs: the audits-registry and
engine-loop-integrity waves (same day, per-arc detail) and lessons classes
27–30 (../lessons/2026-07-19-improvement-day.md).

## Arc 1 — audits become structured truth
| PR | What |
|---|---|
| #589 | audits collection + GET /api/audits (strict params); 51/58 reports hand-verified→project links; identity hygiene (the Cyrillic-Es "Сoinspect") |
| #596 | filters scope RETRIEVAL (class 27); since= real-date validation; didYouMean; dateBasis (44 published / 14 portal-record) |
| #603 | deterministic findings extraction — 20/58 reports carry round-trip-verified findingsTotal (4 with severity breakdowns); openapi@1.8.5 |

## Arc 2 — retrieval ranking: capability beats prose
| PR | What |
|---|---|
| #590/#592 | mention-vs-identity: identityZone + sort key + under-fill admission — "custody with staking" serves custody providers, not prose-mentioners at 0.97 |
| #595 | repo-search: hard-stale demotion above sdf-org authority; wallet + anchor flagship floats (q=wallet had 0/5 flagship recall) |
| #601 | shared-vocabulary key-coverage guard (27 CI tests across the three search surfaces) |

## Arc 3 — the corpus learns about events
| PR | What |
|---|---|
| #593 | `release` source (core/CLI/SDK release notes); foundation-news title repair (class 28 — the invisible Protocol 27 "Zipper" guide); self-audit event-recall lane |

## Arc 4 — the loop stops lying to itself
| PR | What |
|---|---|
| #591 | rolling-issue composite: every scheduled detector upserts on red AND auto-closes on green; engine-b standalone schedule retired |
| #594 | field-coverage on audits+research rows + daily skill-mirror lane — caught the missing /api/audits CORS headers pre-merge (class 30) |
| #597/#600 | codeDepth converge: PAT-powered 250-repo waves (backlog 22d → days) + enrich auto-chases dispatched waves |
| #598/#599 | scout-mcp 1.1.12 (get_audits + audit filters + release source); publish unblocked from the class-29 count assertion |
| #602 | ideas/lessons refresh (6 new ideas, 4 classes) |

Also: repo flipped PUBLIC (secrets audit clean, PR content swept); loop-agent
PRs triaged (#585/#587 merged, #588 rebased + header-fixed + merged); stray
PRs #183/#233 closed. Open thread: npm publish gated on a fresh NPM_TOKEN.
