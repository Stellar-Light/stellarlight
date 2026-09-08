# Git hooks

`pnpm hooks:install` points `core.hooksPath` here. One-time, per clone.

## pre-push

Runs the cheap half of CI, scoped to the files you changed:

| check | runs when | catches |
|---|---|---|
| `tsc --noEmit` (app) | `src/**` or `tests/**` `.ts(x)` changed | type errors vitest cannot see — it strips types |
| `scripts/check-scripts-types.ts` | `scripts/**.ts` changed | new signatures in the scripts ratchet |
| `biome check <changed>` | any ts/tsx/js/json/css changed | formatting and lint |
| `vitest run src/lib/__tests__` | `src/lib/**` changed | unit regressions in the grading/serving core |

Deliberately NOT run: `next build` (minutes), and anything reading the live API
— a production monitor is not a pre-push gate; it goes red on the very change
that fixes it.

Bypass with `git push --no-verify` on a WIP branch. CI still gates the PR.

## Why it exists

2026-09-08: a commit that did not typecheck reached a PR and failed its Vercel
preview build. `vitest` had passed it — vitest strips types and cannot see a
`Set<never>` — and `tsc` was run two minutes later, after the push. The hook was
verified against that exact error before landing: it exits 1 and names the file
and line.

Two scope traps worth remembering, both of which cost time the same night:

- **Counting type errors is not running the ratchet.** `check-scripts-types.ts`
  compares error IDENTITY (file + TS code + message, no line/column), so an edit
  that changes an existing error's message text is a NEW signature at an
  unchanged total. `tsc | grep -c` cannot see it.
- **A green suite has a scope.** Ask what a passing check did not look at.
