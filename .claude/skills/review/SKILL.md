---
name: review
description: Use before every push of a change (code, docs, spec text, data rules) to get the independent review AGENTS.md requires. Picks the reviewer by the kind of change, gives it a real sandboxed checkout, and reconciles every finding.
---

# Independent review

## Pick the reviewer

The reviewer runs on a model other than the author's and starts from a fresh
context.

- Docs, API text, product judgment: a fresh-context Claude review on a
  different model from the author's. Make a clone with no push remote,
  `git clone --quiet --no-hardlinks --branch <branch> "$(git rev-parse --show-toplevel)" <dir> && git -C <dir> remote remove origin`,
  then start the reviewer with the Agent tool, name the model
  (`model: "fable"` when the author is Opus), and give it the clone path, the
  brief below, and read-only instructions (no installs, no network, no
  writes). Only the Grok runner below is OS-sandboxed.
- Code, data rules, anything executable: also a model from another family.
  Today that is Grok, run with `run-grok-review.sh`.
- Grok's findings are leads, not verdicts: reproduce each one before acting,
  and answer a refuted finding with the evidence.

Record the reviewer's model and effort, and its verdict, in the PR body or the
round ledger.

## Give it the real branch

```bash
zsh .claude/skills/review/run-grok-review.sh <branch> <brief.md> [max-turns] [evidence files...]
```

The script clones the branch into a throwaway directory and runs
`grok -m grok-4.7 --reasoning-effort high --sandbox strict` there (override
with `GROK_MODEL` and `GROK_EFFORT`; check `grok --help` and the CLI's model
list when versions change). The reviewer can read the whole repository and
run read-only git commands; its tools have no network. Use 60 turns for a
multi-commit branch, because 30 has run out. The script prints the findings
path.

Facts the repository cannot hold (live API results, CI runs) go in evidence
files passed to the script; the brief names them.

## Brief

- What changed and why, in two or three sentences.
- "Your job is to break the change, not to approve it."
- Verify every claim that can be checked inside the repository, with
  file:line evidence. List claims about live data as unverifiable rather than
  wrong.
- Do not modify, commit or create anything.
- Output: first line exactly `GATE: push` or `GATE: do not push`, then
  numbered findings marked [checked] or [inferred]. No em dashes or en
  dashes.

## Reconcile

1. For each finding: reproduce it, then fix it or answer it in writing with
   evidence. Settle a disagreement with a probe, not a vote.
2. Re-run the reviewer on the fix commit with its own findings in the brief,
   until it accepts or the remaining findings are answered.
3. Never copy secrets or `.env` files into the clone, and never give the
   reviewer push rights.
