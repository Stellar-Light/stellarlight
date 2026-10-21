# rounds/: one ledger per multi-step effort

A round ledger is opened before the work starts and appended as it runs.
Filename: `YYYY-MM-DD-<slug>.md`. Never rewrite history in a ledger; add a
dated line that supersedes.

Sections:

1. **Scope.** The question the round answers, in one or two sentences.
2. **Lanes.** A table: lane, author (person or agent, and model), write set
   (scratch, own worktree, branch), output.
3. **Review.** Who reviewed each push and the verdict of every pass. The
   reviewer differs from the author.
4. **Log.** Append-only: the exact command or action, its result, and a
   timestamp or commit. "Tests passed" is not evidence; the counts are.
5. **Outcome.** What shipped (PRs, merges), what was verified live and how,
   and what moved to `improvements/TODO.md`.
