# The ledger + the Raven loop — 2026-07-22/23 (#646–#696, ~40 PRs)

Paper-trail catch-up for the two days after the on-chain/vocabulary wave
(../waves/onchain-identity-vocab-2026-07-20-21.md, #605–#645). The theme is a
step change in *how* we improve: every isolated detector was unified behind one
status-tracked backlog, and the consumer (Raven) became a measured input to that
backlog rather than an occasional manual probe.

Written by the improvement-loop agent on 2026-07-23. One new durable failure
class came out of it — lessons class 31 (build-only breakage) — plus a guard for
it that shipped the same day it bit.

## Arc 1 — the improvement ledger becomes the spine
Three slices, all merged, turning N isolated detectors into one backlog with
surface tags and closing rates.

| PR | What |
|---|---|
| #683 | improvement ledger slice 1 — lib + orchestrator + `/quality` row (278 findings; isolated 8 contract gaps) |
| #684 | slice 2 — through-Raven feeder: findings sourced from what the consumer actually failed at |
| #685 | slice 3 — waves close the loop (wave/lesson id-linkage) |
| #688 | ledger honesty — dedupe, drop synthetic-query fires, refresh golden (HIGH 30→24) |
| #686 | engine-e: optional-absent is spec-compliant, not drift — moved the contract wave's closing rate off 0% |

Class note: #686 is the recurring shape from lessons class 27 seen from the other
side — a **detector** over-flagging is as costly as one under-flagging, because a
permanently-red engine stops being read. See also this run's self-audit finding
(npm 5xx read as "version missing"), queued for the same reason.

## Arc 2 — ask the consumer what it actually misses
The demand side stopped being sampled by hand.

| PR | What |
|---|---|
| #687 | raven-loop demand parity — Engine D's real demand queries replayed through the gateway |
| #689 | raven-routing eval — ask Raven natural questions, assert it routes to the right op |
| #692 | demand-drive the routing engine — ask Raven what we actually miss; fix project-name routing |
| #695 | wire `searchHackathonBuilds` into the prior-art routing eval |
| #696 | code-question battery in both evals — routing **and** answer depth |

## Arc 3 — identity and prior art
| PR | What |
|---|---|
| #690 | builders real-name overlay — Raven could not answer "who is Tyler van der Hoeven" |
| #691 | complete the real-name fix — resolve name→handle **and** name the code-derived row |
| #693 | `searchHackathonBuilds` — prior-art search over hackathon prototypes |
| #694 | dedupe hackathon builds by event+name (kills the FixedRateX ×2 duplicate) |

Class note: #690 fixed the wrong of the two builder paths and shipped; the live
verification caught it and #691 fixed the real one. This is lessons class 22
(instance-calibrated fixes) recurring on a **two-path** surface — the guard that
would have caught it is "enumerate the paths, not the examples". Recorded here
because the class already exists; no new row.

## Arc 4 — build gates
| PR | What |
|---|---|
| #675 | guard: reject non-handler exports from `route.ts` before merge |
| #676 | full `next build` gate in CI — catch build-only failures before merge |
| #673 | move helpers out of `route.ts` — unbreak Vercel deploys (the triggering incident) |

New durable class → **lessons class 31** (build-only breakage passes every
pre-merge check we had). Detail in the classes table.

## Arc 5 — awards surface polish
| PR | What |
|---|---|
| #677 | de-clamp the wallet connect drawer spacing |
| #678 | de-AI the eyebrow labels (uppercase micro-caps → readable) |
| #679 | mobile ballot overlap + consistent Highlights TVL position |
| #680 | wallet logos in the connect picker |
| #681/#682 | Family-style error toast, then neutral (drop the amber) |

## Process note (carried forward)
The 07-13/16 entry recorded that `improvements/` went four days dark during the
heaviest shipping week. It did not go dark this time, but only because the
scheduled improvement-loop run wrote this entry — the wave doc still lags the
merges by a day or two. The standing fix stays: **the loop checks
`git log -1 -- improvements/` every run and writes when it is behind the merge
list.**
