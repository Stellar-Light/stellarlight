# 2026-10-23: admin and sync route auth, raw queries in public reports

## Scope

Close three security gaps found in code on main: five admin routes gated
on query secrets hardcoded in this public repo, four sync routes that
accepted any signed-in user (partners included), and a monthly report that
committed consumers' raw query texts to the repo. Sweep `src/app/api` for
the same classes. Evidence: `../audits/2026-10-23-admin-auth/README.md`.

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| T: admin auth | Claude Opus 5.5, high | own worktree, branch `lane/t-admin-auth`: the routes listed in the audit, `src/lib/admin-auth.ts`, `src/lib/consumer-report.ts`, `scripts/consumer-report.ts`, their tests, `improvements/consumers/`, the audit, this ledger, two owner decisions in `improvements/TODO.md` | a commit on the branch, not pushed |

## Review

Pending: the orchestrator's independent review on a model other than the
author's, and a second-family review for code.

## Log

- `git switch -c lane/t-admin-auth origin/main` at 02d7deba (spec 1.9.94).
- Callers of the five admin routes: `git grep` for each literal and each
  route path over the tree: hits only in the routes themselves. Callers of
  the sync routes: two admin panel buttons and the rss-management page
  (session), the daily cron in `vercel.json` (`sync/builders`, env bearer),
  `package.json` `seed:lumenloop` (a Payload JWT placeholder).
- Tests written first: `src/app/api/admin/__tests__/admin-auth.test.ts`,
  `src/app/api/sync/__tests__/sync-auth.test.ts`,
  `src/app/api/import/__tests__/airtable-auth.test.ts`,
  `src/lib/__tests__/consumer-report.test.ts`.
- Failing first, on main's route code with only the new helper present:
  admin 45 failed, 3 passed of 48 (each route lacks POST, and still serves
  GET); sync and import 7 failed, 13 passed of 20 (every route admitted a
  partner session; airtable admitted no auth). With main's GET handlers
  called directly, `?secret=<retired value>` answered 200 on all five.
  `consumer-report.test.ts` failed to import (no module on main).
- After the fix: the four files, 73 passed of 73.
- `pnpm exec tsc --noEmit -p tsconfig.json`: exit 0.
- `pnpm exec tsx scripts/check-scripts-types.ts`: GREEN, 28 baselined, exit 0.
- `npx vitest run src/lib/__tests__ src/app/api --maxWorkers=4 --minWorkers=1`:
  183 files, 2325 tests passed, exit 0.
- `npx biome check` on every changed file: exit 0.
- Spec, skills and changelog: none of these routes is documented, so no
  version bump and no changelog entry; contract check and Raven gate not
  needed.
- Committed reports: the 100 raw query rows in the four
  `improvements/consumers/raven-*` pairs replaced with replay counts per
  endpoint. Git history still holds the old text (and the retired
  literals). A history rewrite is an owner decision, added to
  `improvements/TODO.md` with the default of no rewrite.

## Outcome

Committed on `lane/t-admin-auth`, not pushed. Live checks for after deploy
are in the lane report; no route was called against production.
