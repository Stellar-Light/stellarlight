# AGENTS.md: how work is done in this repo

One rulebook for every agent and person working here. `CLAUDE.md` imports
it. Durable rules live in this file, not in anyone's private notes.

## What we are

Stellar Light serves the Scout API: evidenced, dated facts about the Stellar
ecosystem, consumed by agents (Raven first) and people. Four sources of truth
must agree: the live API, the OpenAPI spec (`src/lib/openapi-spec.ts`), the
skill docs (`public/skills/`, `src/lib/stellar-scout-skill.ts`) and the
changelog (`src/lib/changelog.ts`, served at `/api/changelog`).

Our spec text is Raven's discovery index. Raven builds its catalog from it,
gates every new version on its own routing evals, and holds the old snapshot
when a version fails. A routing-text change that captures another provider's
questions blocks every later change of ours from reaching Raven's agents.

## The work loop

1. **Queue.** Every known gap is one item in `improvements/TODO.md`. A Now
   item states what is wrong, how it was found (a probe or a named source),
   its state, and what done means; a Next item states what is wrong and how
   it was found, and gains the rest when it moves to Now. Owner decisions sit
   at the end, each with a safe default.
2. **Round.** Multi-step or multi-agent work opens a ledger in
   `improvements/rounds/` before it starts: scope, lanes, an append-only log
   with exact commands and results, outcome.
3. **Lanes.** Split work only where pieces can move independently, isolate
   risk, or give an independent check; never just to add agents. One agent
   per lane, with a written brief: the goal, what done means, the files it
   owns, what it must not do, and the checks to run. A lane returns its
   result, evidence paths, the checks it ran and open risks, not a
   transcript. Name the model and effort for every lane and never rely on a
   default: Sonnet for bounded sweeps and lookups, Opus for hard
   implementation, planning and synthesis. Agents never share a worktree.
   The orchestrator alone holds git pushes, PRs, production runs and
   anything outward.
4. **Review.** Every push gets an independent review on a model other than
   the author's, picked by the kind of change: a fresh-context Claude
   review on a different model for docs, API text and product judgment;
   for code, also a model from another family (today Grok). Grok's
   findings are leads until reproduced, never the verdict. The reviewer gets
   a real checkout of the branch (a throwaway clone, sandboxed, no network
   for its tools), not a curated excerpt, and is told to break the change.
   Record the reviewer's model and effort. Every finding is fixed or
   answered in writing, and the reviewer re-checks the fixes.
5. **Receipts.** "Verified" means a live re-check after deploy, by someone
   other than the author, with the commit. A test that passes is not a
   receipt. A closed issue is evidence to inspect, not proof.
6. **Skills.** Recurring procedures are skills in `.claude/skills/`:
   `merge-train`, `live-checks`, `raven-gate`, `red-lane-triage`,
   `secret-scan` and `review`. Use the matching skill when a task triggers
   it, and fix the skill when a step in it turns out wrong.

## Measurement

- Grade against ground truth, not opinions: blind labels with a written
  rubric stored next to them (for example 2 same, 1 related, 0 words only;
  ties to the stricter grade), labelled before the served list is opened.
- Hold out a slice of every question set before looking at any result, and
  never tune on it. Report tuned and held-out numbers separately.
- Every fix ships a test that fails with the fix reverted. Show it failing.
- Measure on the full corpus the route serves, not only a fixture. A small
  fixture hid an over-correction that dropped real matches on the full
  corpus.
- Record the API version at the start and end of every live eval run; a
  mismatch means the run is not comparable.
- A total that did not move can hide a swap. Report what was lost and gained.

## Routing text

- Descriptions stay within 600 characters; vocabulary goes in
  `x-routing.keywords`. Topic words (a protocol, a product) do not belong in
  one operation's keywords.
- Check routing changes against Raven's gate before shipping:
  `pnpm raven:gate --raven <stellar-raven checkout>` must say ACCEPT
  (exit 0). Exit 1 is a hold. Exit 2 means no verdict can be trusted (the
  replica could not run, or its self-check failed); re-port or fix first.
  The script, `scripts/eval/raven-gate-replica.ts`, is the authority on
  the conditions behind each exit. Batch routing edits into one
  release.
- Never copy eval questions into example questions.

## Data and contract rules

The nine recurring bug classes, checked on every new field and endpoint:

1. A fact an agent would cite needs a structured field; prose is display copy.
2. Omission reads as negation: document what absence means.
3. `null` means could not check; `[]` means checked and none. Never serve
   `[]` or `0` for something that was not computed.
4. Array order reads as rank: carry an explicit rank and say when order is
   meaningless.
5. Free-text matching uses the shared scorer; a query term of five letters
   or fewer matches whole words only, never inside another word.
6. Authority signals (prominence, SCF awards, stars, source authority) break
   ties; they never beat relevance or an exact name.
7. Aggregates carry their basis and date; never a headline beside an empty
   breakdown.
8. Descriptions are routing contracts: scope every name-drop.
9. Duplicates get a canonical pointer, never two answers.

Every served field is in the spec; a served enum value is in its enum; a
served `null` is declared nullable. A filter value the API does not
recognise answers 400 with the valid values when the set is closed (slugs,
enums), and otherwise a warning in the response naming what was not
recognised; never a silent empty 200.

## Production and outward actions

- Production data changes run only through GitHub Actions lanes: a dry run
  whose printed diff is read, then an execute dispatched on its own, then a
  read-back of every written row through the live API.
- Opening or merging a PR needs the owner's explicit go for that PR. A merge
  uses `gh pr merge --squash` pinned to the verified head, never `--admin`.
- Posting upstream (issues, handoffs, comments on other repos) needs the
  owner's approval. Draft first.
- One spec version per merged PR. Open PRs that share a version are
  renumbered at merge, so a client keyed on the version never misses one.
- Every observable change gets a changelog entry; Raven reads it.

## Writing

- No em dashes or en dashes in anything new or edited: copy, API text,
  docs, code comments, commit messages. Historical files are not rewritten
  for it.
- No third-party personal names in commits. Rules and docs say what we do
  and why; they do not attribute practices to other people, teams or
  products. No private repo paths in this public repo. Never print or
  commit secrets.
- Plain language: say what was measured, with numbers, and what was not.
