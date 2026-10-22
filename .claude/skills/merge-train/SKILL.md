---
name: merge-train
description: Use when two or more approved PRs must land in order, especially PRs that each bump the API spec version or add changelog entries. Covers renumbering, the entry-level changelog merge, gates, check-run gating and pinned squash merges.
---

# Merge train

One spec version per merged PR, merged one at a time, each pinned to the head
its checks ran on. Every PR in the train needs the owner's explicit go.

## Order

1. PRs whose spec text other systems must see first (for example routing text
   Raven gates on).
2. PRs that change no spec text, in any order.
3. Spec PRs, each renumbered to the next free version as it comes up.

## For each PR that conflicts with main or claims a taken version

Run from any worktree with dependencies installed (`pnpm install` done):

```bash
zsh .claude/skills/merge-train/update_pr_branch.sh <pr-worktree> <next-version>
```

It merges `origin/main`, takes main's generated files, merges
`src/lib/changelog.ts` by entry with the PR's own entries on top (renumbered),
sets `API_VERSION`, runs `pnpm contract:write` and commits. It stops on any
other conflict. For a test file where both sides only changed one import and
appended tests, set `TEST_FILE`, `TEST_MODULE` and `UNION_IMPORT` (see
`merge_appended_tests.py`). Never resolve the changelog line by line: both
sides insert at the top of one array, and a line-level resolve breaks it.

Then, in the PR worktree:

1. Diff every auto-merged source file against main
   (`git diff origin/main -- <file>`); it must equal the PR's own change.
2. Run the gates bare and read each exit code:
   `pnpm exec tsc --noEmit -p .`, `pnpm contract:check`,
   `pnpm exec vitest run` (locally `tests/int/api.int.spec.ts` fails without
   a Payload secret; any other failure stops the train), and the `raven-gate`
   skill when spec text changed.
3. Push, then get a review if the merge changed content (`review` skill).
4. Wait for every check-run on the pushed head:
   `zsh .claude/skills/merge-train/wait_checks.sh <head-sha> <expected-count>`.
   Merge only when every run is completed and success.
5. Merge pinned to that head:
   `gh pr merge <n> --repo Stellar-Light/stellarlight --squash --match-head-commit <head-sha>`.

## After the last merge

- Wait for the production deploy of the last merge commit, then run the
  `live-checks` skill against every claim the train made, and the
  `raven-gate` skill against the live spec.
- Record each merge (command, head, merge commit, time from `git log`) and
  each live check in the round ledger or PR.

## Known traps

- A worktree without `node_modules` cannot run the gates (`tsx: command not
  found`); that is not a failing gate.
- `Vercel Preview Comments` re-runs when a PR merges; its completion time can
  equal the merge time.
- Squash commit timestamps can be a second earlier than GitHub's `mergedAt`;
  record one source and say which.
