# 2026-10-20: hackathon answers for Raven

Reconstruction: this ledger was written at the end of the round from the
lane reports and the orchestrator's own commands, before the rounds
convention existed in this repo. Numbers marked (lane) were reported by a
lane and not re-run by the orchestrator; numbers marked (orch) were run or
re-checked by the orchestrator. Lane outputs live in the session scratchpad
and are not committed. The API version was not recorded per call:
production moved from 1.9.82 to 1.9.83 at about 22:25 UTC, during several
lanes, so their live numbers are diagnostic and not comparable across that
change.

## Scope

Can Raven answer, from Scout data, the questions builders ask about
hackathons (review a project, check an idea against every hackathon, what
winners built, previous attempts, what to read, trends, feedback, tools),
and where does Scout feed it wrong or padded data?

## Lanes

Orchestrator: Claude Opus 5.5. Every agent lane: Claude Opus 5.5, one agent
per lane. Reviewer on every push: Grok, through the grok CLI.

| lane | write set | output |
| --- | --- | --- |
| Showcase questions in Stellar form (orchestrator) | scratch | 9 capabilities answered live; routing replica: first pick right 8 of 16 phrasings, top two 11 (orch) |
| Question battery: 90 questions, 29 held out before any routing run | scratch | expected op in top two on the PR #1838 spec: 32 of 61 tuned, 20 of 29 held out; answered end to end: 21 of 61 tuned, 16 of 29 held out; idea maze 0 of 7 routed (lane) |
| Competitors: blind labels, rubric comp-v1, 508 candidates over 40 ideas | own worktree | not-competitor rows served 78 to 32 of 160 on the 20 tuned ideas and 70 to 44 on the 20 held out; direct competitors 38 to 38 (3 lost, 3 gained) and 32 to 32 (1 swapped) (lane); PR #1841 |
| Idea checks: vetIdea, brief and pitch on 40 ideas | scratch | before #1838, 154 of 173 prior-art repo rows unrelated; the pitch's "went quiet" claims 1 real of 17 (lane) |
| Previous attempts | scratch | 32 of 1,344 builds linked to a project; repo activity stored for 88% of entries, served on none (lane) |
| /quality drops | own worktree | three false breaches; PR #1839 |
| Consumer-style QA round: 60 questions graded on structured fields only | scratch | 27 verified; 23 findings, 3 high (lane) |
| Cold-outsider contract audit | scratch | 35 findings (lane) |
| stellar-raven analysis: infra and CI | scratch | adoption list (lane) |
| stellar-raven analysis: agents and process | scratch | adoption list; their open findings about us (lane) |
| stellar-raven analysis: evals | scratch | adoption list; Raven holds our spec at 1.9.61 (lane) |
| Research ranking | own worktree | cause: the query was embedded as typed; golden research 37 of 37 before and after in simulation (lane); branch `fix/research-trailing-question-mark` after four review rounds |
| Raven routing gate replica | own worktree | reproduces Raven's accepted totals exactly (lane; re-run by the orchestrator: self-check yes, main HOLD, branch ACCEPT); branch `feat/raven-gate-replica` after two review rounds |

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
- #1842 (null funding, dead prior art): push on the first round. Its
  changelog follow-up from the contract audit (name reviewSubmission, type
  the entry changed): push on the first round, no findings (2026-10-21).
- `fix/vet-vertical-map`: do not push three times (Stablecoin-last too blunt,
  missed word forms, tests that could not fail); push on the fourth.
- This ledger and the queue: do not push three times (missing probes and
  states, no model names, unsplit numbers, vague or contradictory rules, a
  log line with placeholders); push on the fourth.

## Log

- 21:44 UTC (orch): `GET /api/hackathons/builds?q=wallet&mode=meaning`
  matched 0; `q=AI agent that pays for API calls with USDC using x402` with
  mode=hybrid returned the same six builds and scores as at 19:57 UTC.
  Short queries never clear meaning search's 0.68 floor; not a regression.
- 22:18 UTC (orch): `gh pr merge 1838 --repo Stellar-Light/stellarlight --squash --match-head-commit 1a763392bab09768d796fa459484abb2b12e761e`;
  merged as 4a3999b706eb1447fcd754430540abb66cd2b02e.
- 22:19 UTC (orch): `gh workflow run curated-builds.yml --ref main -f execute=false`
  (run 39507276543): 6 creates, 0 updates, 0 hides, 0 failed.
- About 22:45 UTC (orch): `GET /api/openapi.json` reported version 1.9.83;
  `GET /api/hackathons/builds?q=wallet&limit=1` reported mode requested
  hybrid, served hybrid.
- 23:26 UTC (orch): `gh pr merge 1839 --repo Stellar-Light/stellarlight --squash --match-head-commit a0ddf8b2d3b7ca3d402263b5f8c546dd307a6eea`;
  merged as aa8c4bfdd0ba83e55621b355040cf897975d29db.
- Between 23:26 and 23:27 UTC (orch): `gh workflow run curated-builds.yml --repo Stellar-Light/stellarlight --ref main -f execute=true`
  was refused by the session's permission classifier as a production
  deploy; queue item 2.
- 23:27:53 to 23:27:56 UTC (orch), with each description written to a
  local file first:
  - `gh pr create --repo Stellar-Light/stellarlight --base main --head feat/hackathon-outcomes --title "feat(hackathons): say what happened after the event on builds and winners" --body-file pr-outcomes.md`
    opened #1840.
  - `gh pr create --repo Stellar-Light/stellarlight --base main --head fix/vet-competitor-floor --title "fix(vet-idea): serve competitors that match enough of the idea" --body-file pr-competitors.md`
    opened #1841.
  - `gh pr create --repo Stellar-Light/stellarlight --base main --head fix/dead-prior-art-claims --title "fix(pitch, brief): null funding without a vertical; dead means dormant or archived" --body-file pr-dead.md`
    opened #1842.

- 2026-10-21, the merge train (orch; times are the squash commits'
  timestamps from `git log`; GitHub's `mergedAt` can be a second later).
  Each merge followed
  `gh api repos/Stellar-Light/stellarlight/commits/<head>/check-runs`
  reading every run completed and success, <head> being the commit each
  command below pins:
  - 18:55:41 UTC (orch): `gh pr merge 1843 --repo Stellar-Light/stellarlight --squash --match-head-commit b2154cdbd555a5981d1a2759b863453292e1cb3e`;
    merged as 25840f27.
  - 18:56:03 UTC (orch): `gh pr merge 1844 --repo Stellar-Light/stellarlight --squash --match-head-commit 9f0e7b8c35dd042976813977a1b8bfbf40fdd2a9`;
    merged as ee5e9ca3.
  - 18:57:34 UTC (orch): `gh pr merge 1847 --repo Stellar-Light/stellarlight --squash --match-head-commit 1428218c65a15fc0f3ed1be9fd7a64fed068c7b5`;
    merged as 605e4df6.
  - 19:00:12 UTC (orch): `gh pr merge 1845 --repo Stellar-Light/stellarlight --squash --match-head-commit ee099a661c101451d84dd1c0f5c7471f96b71db7`;
    merged as 8568ac17 (main merged into the branch first).
  - 19:04:37 UTC (orch): `gh pr merge 1846 --repo Stellar-Light/stellarlight --squash --match-head-commit e4d1a9389416b9aec504c87bdfedbddb328845b2`;
    merged as 9ddf4ebd (main merged into the branch first).
- About 19:00 UTC (orch): `GET /api/openapi.json` reported 1.9.84;
  `pnpm raven:gate --raven <clone> --spec <file>`, with <clone> a clone of
  stellar-experimental/stellar-raven at b1dc866 and <file> that response:
  ported sources identical to b1dc866, accepted totals reproduced,
  220/298/326/112, no hit-to-miss flip, ACCEPT.
- 19:05 to 19:21:08 UTC (orch): before its push, each spec PR got main
  merged into it, changelog entries merged by entry, its own entries
  renumbered, and artifacts rebuilt; then `pnpm exec tsc --noEmit -p .`
  exit 0, `pnpm contract:check` exit 0, `pnpm exec vitest run` with one
  failing file, `tests/int/api.int.spec.ts` (it needs a Payload secret),
  and `pnpm raven:gate --raven <clone>` ACCEPT at that version. Merged
  with `--match-head-commit` as above:
  - #1840 to 1.9.85 at d3d302ca76986774e473bb8754d6c82a2e4a9a96 (vitest
    passing; the log kept no count); merged as 31c940fb at 19:09:14.
  - #1841 to 1.9.86 at 740b6c0ebc7623dfd8092c7662374b3c9f75c624 (vitest
    2243 passed); merged as f4c3ac3d at 19:14:13.
  - #1842 to 1.9.87 at 06a5691479e29d70ef979a57cd39104b6115e9c7 (vitest
    2246 passed), its changelog naming reviewSubmission (it serves the
    whole ScfPitchReport) and typed changed; merged as e8f6e4bb at
    19:21:08.
- 19:15:36 UTC (orch): live spec 1.9.85; then the receipts script
  (scratch): build rows carry afterEvent 10 of 10; winner rows carry
  prizeUsd, afterEvent and project; Builder Summit serves 12 ids for 12
  rows.
- 19:20 UTC (orch): `gitleaks git --redact=100 --no-banner --log-opts=origin/main --report-format json --report-path <scratch file> .`
  (8.30.1, run locally so findings stay out of public Actions logs;
  <scratch file> is a JSON report in the session scratchpad, not
  committed): gitleaks reported 2,474 commits scanned and 10 findings,
  none a credential: six Airtable base, table and view ids (each match
  holds one 17-character value starting app, tbl or viw), two Airtable
  attachment URLs, a property name in `engine-b-sweeps-latest.json`, and
  a README curl example whose header value is a placeholder. Each recorded
  with its reason in `.gitleaksignore`; at 19:22 UTC the same scan
  reported no leaks.
- From 19:23:12 UTC (orch), when `GET /api/openapi.json` first reported
  1.9.87: the receipts script (scratch) passed 9 of 10; the miss is the
  HackMeridian 2025 winners (queue item 2). Its SCF-repeat check had served
  0 SCF rows, so it proved nothing; re-run on four questions that return
  SCF rows: 32 SCF rows, 28 with a project page, no repeat by page or by
  title.
  `pnpm raven:gate --raven <clone> --spec <that response>`: ACCEPT, legacy
  220/298/326/112 against accepted 219/298/326/112, skills 17, holdout
  at 10 forbidden captures.
  `pnpm exec tsx scripts/eval/run-golden.ts --json`: 50 pass, 2 N/A,
  1 fail (`recent-mainnet-upgrade`, queue item 10). The question ends
  in no "?" and its results hold no SCF row, the two things #1846
  changed.

## Outcome

Shipped: #1838 and #1839 on 2026-10-20; on 2026-10-21, in this order, #1843
(the gate replica and Raven-safe routing text, 1.9.84), #1844 (secret scan),
#1847 (this working model), #1845 (vertical map), #1846 (research), #1840
(1.9.85), #1841 (1.9.86) and #1842 (1.9.87). Each merge was pinned to a head
whose check-runs all read success. #1840 to #1842 each passed raven:gate
before its push, and #1843's branch did in the orchestrator's re-run
(Lanes). On 1.9.87 the live receipts pass except the HackMeridian 2025
winners, and Raven's gate replica accepts the live spec. The 1.9.83
changelog's HackMeridian 2025 winners claim is not true until the
curated-builds execute runs (queue item 2). Every unresolved finding moved
to `improvements/TODO.md`.
