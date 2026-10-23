# 2026-10-23: demand report for agents behind an MCP server

## Scope

Raven (an MCP server on Cloudflare Workers) calls Scout from its execute
sandbox with no key and no User-Agent, so its calls land in the residual
`other` usage bucket with every other UA-less client. Its maintainer wants
to know what callers ask. Scout sees every call, so Scout can report the
demand side for its own operations: calls per operation, empty, partial and
error rates, and the terms agents ask about, per client class.

Answer two questions, then build the smallest useful version:

1. Can Raven's calls be told apart today without its maintainer changing
   anything?
2. What can Scout report while storing no new raw query text?

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| P: demand report | Claude Opus 5.5, high | own worktree, branch `lane/p-demand-report`: `src/lib/api-usage.ts`, `src/collections/ApiUsage.ts`, `src/payload-types.ts`, `src/lib/demand-report.ts`, `src/app/api/admin/demand-report/`, three search routes' log calls, tests, `improvements/audits/2026-10-23-demand-report/`, this ledger | a commit on the branch, not pushed |

The orchestrator's independent review follows on a model other than the
author's.

## Log

- Branch `lane/p-demand-report` from origin/main at 02d7deba.
- Read Raven's Scout adapter at b1dc866: GET sends no headers, POST only
  Content-Type; sandbox `globalOutbound: null`, the host Worker fetches.
  wrangler.jsonc routes every hostname through the `stellar.buzz` zone.
- `dig +short stellarlight.xyz` gave 216.150.1.1 (Vercel); `curl -sI
  https://stellarlight.xyz/api/status` gave 200, no redirect, no
  Cloudflare proxy. No middleware in the repo.
- Tests first: `npx vitest run src/lib/__tests__/demand-report.test.ts
  src/app/api/admin/demand-report --maxWorkers=4 --minWorkers=1` on the
  base: 2 files failed to import. With the report and route but the old
  `api-usage.ts`: 3 failed, 12 passed. (`--maxWorkers=4` alone dies on
  this machine with a Tinypool minThreads conflict; `--minWorkers=1`
  fixes it.)
- Gate mutation, `!user && !isAdmin(...)`: the partner-account test
  failed (1 of 4); reverted.
- `pnpm generate:types` with a dummy secret: the generated `ApiUsage`
  types match the hand edit; the rest of the file drifts from main in
  unrelated collections, so only the hand edit is kept.
- `npx tsc --noEmit -p tsconfig.json`: exit 0.
- `npx vitest run src/lib/__tests__ src/app/api --maxWorkers=4
  --minWorkers=1`: exit 0, 181 files, 2,267 tests.
- `pnpm contract:check`: exit 0 (spec, skills and changelog unchanged, so
  no version bump and no Raven gate run).

## Review

- Pass 1 at b0f36097: Claude Fable 5.1, high. GATE: push. Verified the
  auth gate, cache headers, payload-types against `generate:types` byte
  for byte, the research log move, and null versus 0 rates. Five low
  findings, each answered in the follow-up commit:
  1. Key check ran per punctuation piece, so a UUID or
     `sl_live_k9f3h2j8d7s6a5` leaked pieces. Fixed: each whitespace word
     is judged whole (emails, URLs, paths, non-ASCII, any key-shaped piece,
     or key-shaped once punctuation is removed) before splitting; tests
     for UUID, two key shapes, G and C strkeys, email, URL, bare repo path,
     non-ASCII, and `pay-per-call` surviving.
  2. README section 3 called `cfWorker` Cloudflare-set rather than caller
     text. Fixed to match section 1: caller-supplied, hostname-validated,
     attribution not identity.
  3. Floor untested. Added: `?minTermCount=0` serves `meta.minTermCount: 2`.
  4. README privacy limits added: a repeated letters-only word can still
     identify; non-ASCII words drop while the call stays in `termBasis`.
  5. `$group` memory: `allowDiskUse: true` passed (driver supports it;
     test asserts it). No window cap or pre-reduce. `createdAt` is indexed
     by Payload's timestamp field config; the live index was not checked.
     Both noted in the README.

## Log (review fixes)

- Tests first: `npx vitest run src/lib/__tests__/demand-report.test.ts
  src/app/api/admin/demand-report --maxWorkers=4 --minWorkers=1`: 2
  failed, 16 passed (whole-word key test, `allowDiskUse` assertion).
  After the fix: 18 passed.
- Sample report regenerated from the same fixtures: byte-identical.
- `npx tsc --noEmit -p tsconfig.json`: exit 0.
- `npx vitest run src/lib/__tests__ src/app/api --maxWorkers=4
  --minWorkers=1`: exit 0, 181 files, 2,270 tests.
- `CONTRACT_BASE=02d7deba pnpm contract:check`: exit 0.
- biome on the changed files: exit 0.

## Outcome

A commit on `lane/p-demand-report`, not pushed: CF-Worker zone and the
partial flag recorded at log time, and the admin-only
`GET /api/admin/demand-report`. Evidence:
`improvements/audits/2026-10-23-demand-report/README.md`. Not verified
live: nothing is deployed. Owner decisions recorded there: the consumer
report's published raw query list, and a retention bound on `api-usage`.
