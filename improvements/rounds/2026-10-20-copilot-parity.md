# 2026-10-20: Copilot v2 parity for Raven

Reconstruction: this ledger was written at the end of the round from the
lane reports and the orchestrator's own commands, before the rounds
convention existed in this repo. Numbers marked (lane) were reported by a
lane and not re-run by the orchestrator; numbers marked (orch) were run or
re-checked by the orchestrator. Lane outputs live in the session scratchpad
and are not committed. The API version was not recorded per call:
production moved from 1.9.82 to 1.9.83 at about 22:25 UTC, during several
lanes.

## Scope

Can Raven answer, from Scout data, the questions Colosseum Copilot v2
answers for Solana (review a project, check an idea against every hackathon,
what winners built, previous attempts, what to read, trends, feedback, tools),
and where does Scout feed it wrong or padded data?

## Lanes

Orchestrator: Claude Opus 5.5. Every agent lane: Claude Opus 5.5, one agent
per lane. Reviewer on every push: Grok, through the grok CLI.

| lane | write set | output |
| --- | --- | --- |
| Showcase questions in Stellar form (orchestrator) | scratch | 9 capabilities answered live; routing replica: first pick right 8 of 16 phrasings, top two 11 (orch) |
| Question battery: 90 questions, 29 held out before any routing run | scratch | expected op in top two: 52 of 90 on the PR #1838 spec, 20 of the 29 held out; answered end to end: 37 of 90, 16 of the 29 held out; idea maze 0 of 7 routed (lane) |
| Competitors: blind labels, rubric comp-v1, 508 candidates over 40 ideas | own worktree | not-competitor rows served 78 to 32 of 160 on the 20 tuned ideas and 70 to 44 on the 20 held out; direct competitors 38 to 38 (3 lost, 3 gained) and 32 to 32 (1 swapped) (lane); PR #1841 |
| Idea checks: vetIdea, brief and pitch on 40 ideas | scratch | before #1838, 154 of 173 prior-art repo rows unrelated; the pitch's "went quiet" claims 1 real of 17 (lane) |
| Previous attempts | scratch | 32 of 1,344 builds linked to a project; repo activity stored for 88% of entries, served on none (lane) |
| /quality drops | own worktree | three false breaches; PR #1839 |
| Consumer-style QA round: 60 questions graded on structured fields only | scratch | 27 verified; 23 findings, 3 high (lane) |
| Cold-outsider contract audit | scratch | 35 findings (lane) |
| stellar-raven analysis: infra and CI | scratch | adoption list (lane) |
| stellar-raven analysis: agents and process | scratch | adoption list; their open findings about us (lane) |
| stellar-raven analysis: evals | scratch | adoption list; Raven holds our spec at 1.9.61 (lane) |
| Research ranking | own worktree | running |
| Raven routing gate replica | own worktree | running |

## Review

Grok gated every push, with web search off, git denied, and a bundle of only
the diff and the evidence it needed.

- #1838 (HackMeridian, hybrid prior art): four rounds plus a final gate and a
  separate routing gate; push.
- #1839 (/quality): push with one major (an off-site redirect read as
  "still inactive"), fixed to could-not-check; re-gate push.
- #1840 (after-the-event fields): do not push (unknown SCF read as false,
  incomplete absence notes, reused ids), fixed; two more rounds; push.
- #1841 (competitor floor): do not push (label chosen before the cut), then
  three rounds on overclaiming text and a missing test; push.
- #1842 (null funding, dead prior art): push on the first round.
- `fix/vet-vertical-map`: do not push three times (Stablecoin-last too blunt,
  missed word forms, tests that could not fail); push on the fourth.
- This ledger and the queue: do not push (missing probes, no model names,
  unsplit numbers, vague rules); fixed.

## Log

- 21:44 UTC (orch): `GET /api/hackathons/builds?q=wallet&mode=meaning`
  matched 0; `q=AI agent that pays for API calls with USDC using x402` with
  mode=hybrid returned the same six builds and scores as at 19:57 UTC.
  Short queries never clear meaning search's 0.68 floor; not a regression.
- 22:18 UTC (orch): `gh pr merge 1838 --squash --match-head-commit 1a763392...`;
  merged as 4a3999b7.
- 22:19 UTC (orch): `gh workflow run curated-builds.yml --ref main -f execute=false`
  (run 39507276543): 6 creates, 0 updates, 0 hides, 0 failed.
- About 22:45 UTC (orch): `GET /api/openapi.json` reported version 1.9.83;
  `GET /api/hackathons/builds?q=wallet&limit=1` reported mode requested
  hybrid, served hybrid.
- 23:26 UTC (orch): `gh pr merge 1839 --squash --match-head-commit a0ddf8b2...`;
  merged as aa8c4bfd.
- After 23:26 UTC (orch): the curated-builds execute was refused by the
  session's permission classifier as a production deploy; queue item 2.
- After 23:26 UTC (orch): `gh pr create` opened #1840, #1841 and #1842.

## Outcome

Shipped: #1838 and #1839. Open: #1840, #1841, #1842 and
`fix/vet-vertical-map`. The 1.9.83 changelog's HackMeridian 2025 winners
claim is not true until the curated-builds execute runs (queue item 2).
Every unresolved finding moved to `improvements/TODO.md`.
