# On-chain, identity & vocabulary — 2026-07-20/21 (#605–#645, ~35 PRs)

Two heavy shipping days after the 07-19 improvement day (#589–#603). This entry is
the paper-trail catch-up: `improvements/` last moved at #604 while #605–#645 merged
live. Companion: lessons classes 27–30 (../lessons/2026-07-19-improvement-day.md) still
hold — nothing here introduced a new durable failure class not already guarded.

## Arc 1 — the corpus learns on-chain truth
| PR | What |
|---|---|
| #608 | on-chain metrics v1 — verified join keys + stellar.expert enrichment |
| #609 | asset-holders parse fix (trustlines is an object on the current API) |
| #610 | seed expansion — 12 more verified projects (49 contracts, 2 assets) |
| #611 | on-chain v2 — snapshot deltas + partner-asset auto-join + agent docs |
| #614 | partner join — explicit overrideAccess + input diagnostics |

## Arc 2 — partner ↔ project identity becomes structured
| PR | What |
|---|---|
| #612 | verified partner→project identity links (42/47) + link script |
| #613 | correct collection slug — `partner-accounts`, not `partners` |
| #615 | top-level `projectSlug` field — link writes were silently dropped (silent-drop class) |
| #619 | partner→project identity cross-check guard + boss-pay hijacked-domain fix |

## Arc 3 — one vocabulary, three surfaces
| PR | What |
|---|---|
| #618 | shared synonym registry — one core vocabulary across projects/repos/research (cleared last run's P1 StellarX + P3 NL-phrase misses) |
| #628 | Raven-discovery vocabulary — onchain routing + research query alias (openapi@1.8.11) |
| #621/#622 | repo mention-vs-identity ranking (#590/#592 port); test uses options object — unbreaks the Vercel build |

## Arc 4 — spec & guards keep pace
| PR | What |
|---|---|
| #616/#617 | status rows for research+partners + audit-coverage lane + ideas ledger truth; endpoints[] lists /api/people (drift-guard catch) (openapi@1.8.8) |
| #620 | row schemas for all 7 undocumented list shapes + field-coverage guard (openapi@1.8.9) |
| #626 | `?fields=` response projection on 5 list endpoints (openapi@1.8.10) |
| #627 | routes-axis query crashed the sweep — paged projection + JS filter |
| #629 | audits rollup on searchProjects rows (openapi@1.8.12) |
| #644/#645 | Raven catalog-drift guard (consumer-side mirror of check-api-drift) + grace window — catalog lag is cadence, not drift |

## Arc 5 — retrieval hygiene & curation
| PR | What |
|---|---|
| #624 | meeting recaps get citation-grade titles (BAD-TITLE 11 → 0) |
| #625 | generalized capability-mismatch sweep (raven#8) — 4 axes, report-only |
| #630 | leaderboard ranks the FULL eligible population + agent-loop clarity (openapi@1.8.13) |
| #636 | `--only owner/repo` targeted rescan (default-branch-switch class) |
| #637 | follow-ups batch — triage promotions + verified corrections |

## Arc 6 — SCF Public Goods Award as structured truth
| PR | What |
|---|---|
| #631 | SCF Public Goods Award as a structured field (openapi@1.8.14) |
| #632/#634 | PG-award recipients join the candidate pool on public-goods intent; haystack carries 'scf' |
| #633/#635 | eval grades a top-10→12 window (pg-atlas legitimately competes) |

## Arc 7 — i³ Awards voting
| PR | What |
|---|---|
| #638 | i³ Awards voting — recovered #537 + stellar-markets dark restyle (hidden /awards) |
| #640/#641 | warm layered dark + framer-motion; step-through how-it-works + RainbowKit wallet modal + mobile ballot toast |
| #642/#643 | Action to seed the mock i³ round on prod; nominee 'year in review' highlights + real TVL |

Also: skill/api-reference catch-up (#606). No new lessons row — #615 (silent-drop),
#619 (hijacked partner domain, now guarded by the identity cross-check), and #621/#622
(repo mention-vs-identity) each fall under an already-mechanized class. Watch: hijacked/
parked partner domains trusted via bare domain-match — the #619 cross-check now guards it,
kept as a note under the existing "verify from primary source" class rather than a new one.
