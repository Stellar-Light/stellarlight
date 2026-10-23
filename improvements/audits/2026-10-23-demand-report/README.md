# Demand report: what agents behind an MCP server ask Scout (2026-10-23)

Raven calls Scout from its execute sandbox with no key and no User-Agent.
Its maintainer wants to know what callers ask. Scout sees every call, so
Scout can report the demand side for its own operations. This note covers
how those calls can be attributed, what is stored, the privacy reasoning,
and a sample report built from fixtures. Round ledger:
`improvements/rounds/2026-10-23-demand-report.md`.

## 1. Attribution

### What Scout logs today

`logApiHit` (`src/lib/api-usage.ts`) writes one row per call to the
`api-usage` collection (`src/collections/ApiUsage.ts`) in the production
Mongo database, fire-and-forget through Payload's local API:

| field | what | on which calls |
| --- | --- | --- |
| endpoint | route path | every logged call |
| query | `q`, lowercased, first 100 characters | routes that pass one |
| uaBucket | coarse User-Agent class; the raw UA is not stored | every call |
| scoutVersion | `X-Scout-Version` header | when sent |
| country | edge geo header | when present |
| filtersJson | filter params, JSON, first 200 characters | routes that pass them |
| resultCount | rows returned | 8 search and list routes |
| matchMode | match tier or retrieval mode | projects/search, research |
| status | HTTP status answered | nearly every call site |
| durationMs | handler wall time | when `startedAt` is passed |

No IP and no request or response body. Access: read and delete admin only,
create through the local API only, update forbidden. There is no TTL: rows
stay until an admin deletes them.

Readers: `getUsageStats` (`/api/status`), `getUsageUaSplit`
(`/analytics`), `scripts/recent-api-usage.ts`,
`scripts/eval/engine-d-demand.ts` and `scripts/consumer-report.ts`.

### What Raven sends

Read from the server's source at commit b1dc866 (2026-10-15),
`src/adapters/scout.ts`: a GET carries no headers at all; a POST carries
only `Content-Type`. The execute sandbox runs with `globalOutbound: null`,
so the call is made by the host Worker, not by model code. The default base
is `https://stellarlight.xyz`. So today a Raven call buckets as `other`,
together with every other client that sends no User-Agent. The monthly
consumer report already reads `other` as Raven and says it is an upper
bound.

### What can tell Raven apart without any change on its side

Cloudflare adds a `CF-Worker` header to every subrequest a Worker makes. Its
value is the name of the zone the Worker runs on, and the Worker cannot
remove or override it. Raven's `wrangler.jsonc` routes all three of its
hostnames through the `stellar.buzz` zone (`raven.stellar.org/*` with
`zone_name: stellar.buzz`, and two `stellar.buzz` custom domains), so the
expected value is `stellar.buzz`.

Scout's runtime should see it: `stellarlight.xyz` resolves straight to
Vercel (216.150.1.1; `/api/status` answered 200 with no redirect on
2026-10-23), no Cloudflare proxy sits in front, the repo has no middleware,
and Vercel passes custom request headers through to the function. Until
this change, `logApiHit` read only `user-agent`, `x-scout-version` and the
geo headers, so the signal arrived and was dropped.

Not measured: no row in production carries the header yet, because nothing
recorded it. The first live check after deploy is whether rows with
`cfWorker = stellar.buzz` appear, and whether their count roughly matches
the `other` bucket's research and project-search volume.

Limits of the signal:

- It is attribution, not identity. A client outside Cloudflare can send
  the header itself.
- Every Worker on the `stellar.buzz` zone shares the value.
- MCP and Playground calls come from the same Worker, so they are not
  split.
- Raven's own eval scripts that run in Node, not in the Worker, do not
  carry it.

### The one-line change the maintainer could make

Only needed if the zone ever proves ambiguous. In `callScout`, send a
User-Agent on every call, for example:

```ts
const init: RequestInit = { method, headers: { "User-Agent": "stellar-raven (+https://raven.stellar.org)" } };
```

(and merge `Content-Type` into that object on the POST branch). Scout's
`bucketUserAgent` would then need one rule mapping it to its own bucket;
that rule is not added until the header exists.

## 2. What was built

- **Log time** (`src/lib/api-usage.ts`): `cfWorkerZone()` reads the
  `CF-Worker` header, lowercases it and keeps it only when it is a hostname
  of at most 100 characters; `logApiHit` stores it as `cfWorker`. It also
  takes an optional `partial` flag and stores it when given.
- **Partial**: projects/search, research (both paths) and repos/search
  pass `partial: failedReadsOf(warnings).length > 0`, the same rule
  `withPartial` uses for the served `meta.partial`. In research the
  single-source path logged before its warnings list existed; the log call
  moved below that list, unchanged otherwise. Other routes do not log it,
  so their partial rate is `null`, not 0.
- **Collection**: `cfWorker` (text, indexed) and `partial` (checkbox) on
  `api-usage`, and the matching `payload-types.ts` lines (checked against
  `payload generate:types`: no difference in the `ApiUsage` types).
- **Aggregation** (`src/lib/demand-report.ts`): `buildDemandReport` takes
  grouped rows and returns, per client class and operation, calls, error
  (5xx), rejected (4xx), empty and partial counts with each one's basis
  and rate, and the operation's top terms. Client class is
  `cf-worker:<zone>` when the zone was recorded, otherwise the UA bucket.
- **Report** (`GET /api/admin/demand-report?from=&to=&minTermCount=&topTerms=`):
  one Mongo `$group` over the window, keyed on client, operation, query and
  outcome, so the read is one bucket per distinct combination instead of
  one document per call (the consumer report counted 124,173 `other` calls
  in 30 days). A Payload `count` over the same window is the reference; a
  mismatch is a warning in `meta`, not a silent short report.

## 3. Privacy

What is stored, where and for how long:

- Two new fields per `api-usage` row: `cfWorker`, the calling Worker's zone
  (a domain name that Cloudflare sets, not text from the caller), and
  `partial`, a boolean. Same collection, same production database, same
  access rules (admin read, append-only), same retention: none set, rows
  stay until an admin deletes them.
- No new query text. `query` is stored exactly as before (lowercased,
  first 100 characters, on the routes that already logged it). No prompt,
  no execute code and no request body reaches Scout from Raven beyond the
  query parameters Scout's own operations take.
- The report itself is computed per request and stored nowhere.

What the report hands back:

- Counts and rates only, each rate with its basis; `null` when no call
  recorded that outcome.
- Single words, never a query string. A word is listed only when at least
  `minTermCount` calls (default 5, floor 2) asked it of that operation.
  Stopwords are the shared search stopwords. A token longer than 24
  characters, or 12 or more characters mixing letters and digits, is
  dropped before counting: callers paste keys, seeds, addresses and hashes
  into query text. Tests assert that no fixture query string, no
  below-threshold word and no key-shaped token appears in the output.

Who can read it:

- Only a user from the `users` collection. Payload sets `req.user` for a
  token from any auth collection, partners included, so the gate is
  `isAdmin(user)` (the collection), not the presence of a user. Anyone else
  gets a 404. A test signs in as a partner account and expects 404; with the
  gate weakened to `!!user` that test fails (shown below).
- `Cache-Control: private, no-store`.
- Not in the public OpenAPI spec. The spec is hand-written in
  `src/lib/openapi-spec.ts`; no `/api/admin/*` or `/api/sync/*` path
  appears in it (`grep '"/api/admin\|"/api/sync' src/lib/openapi-spec.ts`
  finds nothing), and no contract script enumerates route files. The spec,
  skill docs and changelog are unchanged, so no version bump and no Raven
  gate run; `pnpm contract:check` still passes.
- Never run from a workflow: Actions logs on this public repo are world
  readable. It is a session-gated route, read in a browser by an admin.

## 4. Sample report from fixtures

Synthetic rows only, no production data. `minTermCount: 5`. Rates rounded.

`cf-worker:stellar.buzz`, 80 calls:

| operation | calls | 5xx | 4xx | empty | partial | top terms (calls) |
| --- | --- | --- | --- | --- | --- | --- |
| /api/research | 61 | 1 of 61 (0.016) | 0 | 6 of 60 (0.1) | 2 of 60 (0.033) | fee 52, transactions 52, bump 40, soroban 12, sponsorship 12, 10 6, challenge 6, sep 6, verification 6 |
| /api/projects/search | 10 | 0 of 10 | 0 | 1 of 10 (0.1) | 0 of 10 | lending 10, protocols 9, soroban 9 |
| /api/contracts | 7 | 0 of 7 | 0 | null (not logged) | null | none |
| /api/hackathons/[slug] | 2 | 0 of 2 | 2 of 2 | null | null | none |

`claude`, 5 calls: /api/projects/search, 1 rejected (429), 0 of 4 empty,
no term above the threshold ("blend", asked 4 times, is held back).

`other`, 3 calls: /api/research, no term above the threshold.

The fixture query `my key sbxq9z8y7x6w5v4u3t2 lending` contributes "key"
(1 call, below the threshold) and "lending"; the key-shaped token is
dropped. "rpc", "node" and "requirements" (2 calls) stay below the
threshold.

## 5. Checks

- Failing first, on the base: both new test files failed to import
  (`../demand-report`, `../route` absent). With the report and route
  written but `api-usage.ts` unchanged: 3 failed, 12 passed (the
  `cfWorkerZone` tests and the CF-Worker/partial logging test). Gate
  mutation (`!user && !isAdmin(...)`): the partner-account test failed, 1
  of 4.
- After: `npx tsc --noEmit -p tsconfig.json` exit 0;
  `npx vitest run src/lib/__tests__ src/app/api --maxWorkers=4 --minWorkers=1`
  exit 0, 181 files, 2,267 tests; `pnpm contract:check` exit 0.

## 6. Open items

- The monthly consumer report (`scripts/consumer-report.ts`,
  `consumer-report.yml`) commits the consumer's top query strings
  (first 100 characters) to `improvements/consumers/*.md` in this public
  repo. That is the published list of raw queries the server's own note
  rules out. Owner decision; safe default: switch that section to the
  term aggregate above.
- No retention is set on `api-usage`. Owner decision; safe default: a TTL
  index on `createdAt` of about 13 months.
- After deploy: confirm `cfWorker` rows appear and read the report once for
  a 7-day window.
