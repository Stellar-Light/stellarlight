# Short-idea prior art: the measurement behind #1851

Evidence for the 2026-10-22 round (`improvements/rounds/2026-10-22-queue-batch.md`).

- `short-ideas.json`: 36 short ideas written before any result was read, 23
  working and 13 held out.
- `test-ideas.json`: the 34 ideas already used in `vet-idea.test.ts`.
- `live-short.json`, `live-tests.json`, `live-one-word.json`: live
  searchHackathonBuilds rankings and vetIdea responses captured on API
  1.9.87 (the version was read at the start and end of each capture), by
  `fetch.mjs` and `fetch-full.mjs`.
- `labeler-prompt.txt`: the rubric given to one blind labeler (Claude Sonnet
  5.5): 2 same idea, 1 related, 0 words only.
- `label-sheet.md`, `label-key.json`, `labels.json`: the shuffled sheet the
  labeler saw, the key that maps it back, and the grades.
- `replay.mts`, `brief-replay.mts`, `text-only-check.mts`,
  `literal-check.mts`: replays of vetIdea's and hackathonBrief's prior-art
  cut over the captured rankings. `*.txt` are their outputs.

To rerun, copy the directory to `tmp/` at the repository root at #1851's
merge commit or later, then run `pnpm exec tsx tmp/replay.mts
tmp/live-short.json --rows` (and the same with `tmp/live-tests.json`). The
scripts import from `src/` by a path relative to `tmp/`. The replay of the
pre-change rule matched live vetIdea id for id on all 70 ideas.
