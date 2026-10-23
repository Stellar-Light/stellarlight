# 2026-10-23: admin and sync route auth, and raw queries in public reports

Base: `origin/main` at 02d7deba (spec 1.9.94). Read from code; no route was
called against production.

## What was open

1. **Hardcoded query secrets on five admin routes.** `GET
   /api/admin/{cleanup-projects,fix-descriptions,fix-entities,score-projects,tag-projects}`
   compared `?secret=` against a string literal in this public repo. Two
   routes shared one value. All five write to the production `projects`
   collection (cleanup-projects also deletes rows). Anyone who read the
   source could run them. A secret in a query string also lands in access
   logs.
   - Callers: none. `git grep` for each literal and each route path over
     `.github/`, `scripts/`, `package.json`, `vercel.json` and `src/` found
     only the routes themselves.
2. **Sync routes accepted any signed-in user.** `POST /api/sync/lumenloop`,
   `POST /api/sync/rss`, `POST /api/sync/rss/[id]` gated on `!user`, and
   `GET|POST /api/sync/builders` on `!!user`. Payload sets `req.user` for a
   token from any auth collection, so a signed-in partner
   (`partner-accounts`) passed (src/collections/access.ts).
3. **No auth at all on `POST /api/import/airtable`.** Found by the sweep
   below. It writes `projects` whenever the Airtable env values are set.
   Its only caller is the admin panel button
   (`src/components/payload/AirtableSyncButton.tsx`), which sends the admin
   session.
4. **Raw query texts in a public report.** `scripts/consumer-report.ts`
   (monthly workflow `consumer-report.yml`) committed the 25 most-asked
   query strings of a consumer, with hit counts, into
   `improvements/consumers/raven-*.{md,json}`, plus an advisory note that
   could carry a person record's name. Four reports (2026-07-21 to
   2026-10-01) held 100 such rows.

## What changed

- `src/lib/admin-auth.ts` (new): `isAdminRequest(headers)` is true only for
  (a) a Payload session from the `users` collection (`isAdmin`), or (b) the
  server-only env value `ADMIN_ROUTE_SECRET`, at least 32 characters,
  presented in the `x-admin-secret` header. The compare hashes both sides
  with SHA-256 and uses `crypto.timingSafeEqual`. An unset or short env
  value, no Payload, or an auth error is a deny.
- The five admin routes: the literal checks are gone. Each now exports
  `POST` only and answers 401 `{"error":"Unauthorized"}` (unchanged body)
  unless `isAdminRequest` passes. `GET` is no longer exported, so Next
  answers 405: with session auth in play, a GET that writes could be fired
  by a cross-site link (the Payload cookie is SameSite Lax, which a
  top-level GET carries and a cross-site POST does not). `?dry=1` still
  works on the POST.
- Sync routes: session auth now requires `isAdmin(user)`. The bearer paths
  are unchanged in what they accept:
  - `sync/builders` keeps `Authorization: Bearer <CRON_SECRET or
    SYNC_API_KEY>` (env values, sent by the daily cron in
    `vercel.json`); the compare is now constant time.
  - `package.json` `seed:lumenloop` sends `Authorization: Bearer
    <ADMIN_TOKEN>`. That is a placeholder for a Payload JWT, which Payload's
    Bearer extraction resolves to a user; an admin's token still passes, a
    partner's no longer does.
- `POST /api/import/airtable`: `isAdminRequest` before anything else.
- Consumer report: rendering moved to `src/lib/consumer-report.ts`. The
  report now lists single query terms per endpoint asked in at least 5
  calls (top 20), dropping stopwords and tokens shaped like keys, hashes or
  addresses (longer than 24, or 12 or more mixing letters and digits). The
  live replay still runs on the top queries in memory, but only grades per
  endpoint are written. The advisory note is gone.
- The four committed reports: the query table, the open-miss list and the
  JSON `topQueriesReplayed` are replaced with replay counts per endpoint
  derived from the same rows; `queryTerms` is `null` there (not computed for
  those runs).
- Not in the public spec, skills or changelog: none of these routes is
  documented in `src/lib/openapi-spec.ts`, so no spec version or changelog
  entry.

## Every route checked

Mutating (writes, or exports POST/PUT/PATCH/DELETE handlers) under
`src/app/api`, 78 route files swept.

| Route | Gate before | Action |
| --- | --- | --- |
| `admin/cleanup-projects` | query literal | changed: admin session or env header, POST only |
| `admin/fix-descriptions` | query literal | changed, same |
| `admin/fix-entities` | query literal | changed, same |
| `admin/score-projects` | query literal | changed, same |
| `admin/tag-projects` | query literal | changed, same |
| `sync/builders` | env bearer or any user | changed: env bearer or admin |
| `sync/lumenloop` | any user | changed: admin |
| `sync/rss` | any user | changed: admin |
| `sync/rss/[id]` | any user | changed: admin |
| `import/airtable` | none | changed: admin session or env header |
| `import/airtable-csv` | env bearer (`CRON_SECRET`) | left: env value, fails closed when unset |
| `cron/github-refresh`, `cron/partner-digest`, `cron/partner-freshness`, `cron/rss-sync` | env bearer (`CRON_SECRET`) | left: same |
| `intake` | public, zod-validated, writes Draft rows only | left: a public submission form by design |
| `idea-submissions`, `community-skills`, `feedback` | public, rate limited | left: public submission by design |
| `partners/assistant`, `partners/magic-link`, `partners/submit-listing` | public partner flows, rate limited | left: partner-facing by design |
| `analyze` | public GET writing a funding snapshot | left: a derived cache row, no caller input stored |
| `projects/[id]/github` | public GET writing a GitHub cache row | left: a derived cache row |
| `preview` | `?secret=` against `PAYLOAD_SECRET` | left, not mutating (enables draft mode); see risks |
| every other route exporting POST/PUT/PATCH/DELETE | read-only handlers (405s or POST reads) | left: no write found |

## Open risks

- **History.** Commits before this change still hold the old literals and
  the raw query texts. The literals are dead (no code accepts them). The
  query texts stay readable in history until the owner decides on a
  rewrite (owner decision in `improvements/TODO.md`).
- **`/api/preview`** takes `PAYLOAD_SECRET` in the query string (the Blog
  collection's preview URL builds it). That puts the Payload signing secret
  in access logs and browser history whenever a preview is opened. Not
  mutating, so left; it needs its own fix (a separate preview secret, or a
  session check).
- **`payload-jobs` access** (`src/payload.config.ts`) lets any signed-in
  user, partners included, read and delete sync job records. Outside
  `src/app/api`, so left.
- **`sync/builders` GET** still honours an admin session, so a cross-site
  link could make an admin's browser start a builder sync. It only pulls
  public profiles; left so the route keeps its current callers.
