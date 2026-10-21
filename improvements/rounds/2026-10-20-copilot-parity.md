# 2026-10-20: Copilot v2 parity for Raven

## Scope

Can Raven answer, from Scout data, the questions Colosseum Copilot v2
answers for Solana (review a project, check an idea against every hackathon,
what winners built, previous attempts, what to read, trends, feedback, tools),
and where does Scout feed it wrong or padded data?

## Lanes

| lane | author | write set | output |
| --- | --- | --- | --- |
| Showcase questions in Stellar form | orchestrator | scratch | 9 capabilities answered live; routing replica: first pick right 8 of 16 phrasings, top two 11 |
| Question battery (90 questions, 29 held out) | agent | scratch | expected op in top two 52 of 90 on the PR #1838 spec; 37 of 90 answered end to end; idea maze 0 of 7 routed |
| Competitors (blind labels, 508 candidates over 40 ideas) | agent | own worktree | padding 78 to 32 of 160 slots tuned, 70 to 44 held out, direct competitors unchanged in total; PR #1841 |
| Idea checks (40 ideas: vetIdea, brief, pitch) | agent | scratch | before #1838, 89% of prior-art repos unrelated; the pitch's "went quiet" claims 1 real of 17 |
| Previous attempts | agent | scratch | 32 of 1,344 builds linked to a project; repo activity stored for 88%, served on none |
| /quality drops | agent | own worktree | three false breaches; PR #1839 |
| Consumer-style QA round (60 questions, graded on structured fields) | agent | scratch | 27 verified; 23 findings, 3 high |
| Cold-outsider contract audit | agent | scratch | 35 findings |
| stellar-raven analysis (infra, workflow, evals) | three agents | scratch | adoption lists; Raven holds our spec at 1.9.61 |
| Research ranking | agent | own worktree | running |
| Raven routing gate replica | agent | own worktree | running |

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
  missed word forms, non-discriminating tests); push on the fourth.

## Log

- Live measurement: meaning search returns nothing above its 0.68 floor for
  queries of 1 to 3 words, so hybrid equals keyword there; full sentences
  return identical builds and scores across two reads hours apart. Not a
  regression.
- #1838 merged 22:18 UTC (4a3999b7); live as 1.9.83 with hybrid as the build
  search default.
- curated-builds dry run (run 39507276543): 6 creates, 0 updates, 0 hides,
  0 failed. Execute not run.
- #1839 merged 23:26 UTC (aa8c4bfd).
- #1840, #1841, #1842 opened; all claim 1.9.84.

## Outcome

Shipped: #1838 and #1839. Open: #1840, #1841, #1842 and
`fix/vet-vertical-map`. Every unresolved finding moved to
`improvements/TODO.md`, items 1 to 10 and the Next list.
