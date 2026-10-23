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

## Log, second commit (review request: fold in three open risks)

- Scope added: `/api/preview` took `PAYLOAD_SECRET` in its query string;
  `payload-jobs` read and delete were `!!req.user`; `sync/builders` GET
  honoured an admin session.
- Design for preview: admin session (`isAdminRequest`), no secret in the
  URL. The editor is signed in when they click Preview; a preview-only
  secret would still sit in a URL and adds an env value to manage. No new
  env var.
- Found while checking jobs: `jobs.access.run`, `queue` and `cancel` were
  unset, and Payload's default is any logged-in user, so a partner could
  call `GET /api/payload-jobs/run`. Gated on `isAdmin` with the rest.
  Callers checked: `sync/rss`, `sync/rss/[id]` and `cron/rss-sync` call
  `payload.jobs.queue` and `payload.jobs.run` through the local API, which
  overrides access unless `overrideAccess: false` is passed; none passes it.
- `sync/builders` callers: the cron in `vercel.json` (GET, env Bearer) and
  `BuildersSyncButton.tsx` (POST, session). GET is now Bearer only; POST
  keeps Bearer or an admin session.
- Tests first: `src/app/api/preview/__tests__/preview.test.ts`,
  `src/collections/__tests__/jobs-access.test.ts`, one new case in
  `src/app/api/sync/__tests__/sync-auth.test.ts`. On the first commit's
  code: 10 failed, 20 passed of 30 (preview admitted the old query secret
  and refused an admin session; the Blog URL carried the secret; jobs read
  and delete admitted a partner; jobs.access run, queue and cancel were
  unset; builders GET admitted an admin session). After the fix: 38 of 38
  in those files plus `access.test.ts`.
- `PAYLOAD_SECRET`: if it was ever exposed in logs, rotating it is an owner
  decision (it signs every session; rotating logs everyone out). Added to
  `improvements/TODO.md`.

## Review

- Independent security review, Claude Fable 5.1, effort high, on the two
  commits: GATE push. Verified POST-only admin routes and forged collection tokens rejected by construction (reasoned from Payload's JWT strategy, which reads the collection from the signed token; no forged token was sent); the secret path (SHA-256 then timingSafeEqual, never
  echoed); CSRF (Lax cookies, every admin UI caller a same-origin POST);
  the job runner on the local API with the REST jobs endpoints admin-only;
  every collection refusing partner writes; consumer reports carrying
  counts only. Confirmed 13 tests fail on the old handlers. Two low
  findings, fixed in a third commit below.

## Log, third commit (review findings)

- `tests/e2e/social-embed.e2e.spec.ts` still opened the preview with the
  signing secret in the query (now a 401, timing out `beforeEach`) and
  carried a hardcoded hex fallback for it. Removed both. `beforeEach` now
  signs in through `POST /api/users/login` with `E2E_ADMIN_EMAIL` and
  `E2E_ADMIN_PASSWORD` from the env (the e2e setup had no test-admin
  credentials) and opens `/api/preview?slug=test`; the suite skips with a
  message when either is unset. Not run: e2e needs a dev server and a
  seeded test admin.
- `src/collections/Blog.ts`: the preview URL is now relative
  (`/api/preview?slug=...`), so the admin panel's anchor resolves it
  against its own origin instead of an env base URL. The preview test now
  asserts the exact relative URL.
- `.env.example`: `ADMIN_ROUTE_SECRET=` beside `CRON_SECRET`, with its
  rules (optional, 32 or more characters, `x-admin-secret` header).
- `pnpm exec tsc --noEmit -p tsconfig.json`: exit 0.
- `npx vitest run src/lib/__tests__ src/app/api src/collections/__tests__ --maxWorkers=4 --minWorkers=1`:
  186 files, 2346 tests passed, exit 0.
- `npx biome check` on the changed files: exit 0 (two warnings on
  untouched lines).
