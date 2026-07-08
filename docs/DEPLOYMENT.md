# Deployment

Stellar Light deploys on **Vercel** with **MongoDB Atlas** and **Cloudflare R2** for media. This is the full setup + troubleshooting reference; the short version lives in the root README.

## Prerequisites

- Vercel account
- MongoDB database (Atlas recommended)
- GitHub repository
- Node.js 24.12.0 (Vercel handles this automatically)

## 1. Prepare the repository

Ensure the project builds:

```bash
pnpm install
pnpm build
```

## 2. Set up MongoDB

1. Create a MongoDB Atlas account (or use another provider).
2. Create a cluster + a database user with read/write permissions.
3. Copy the connection string — `mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority`.
4. Network Access → allow `0.0.0.0/0` (or Vercel's IP ranges).

## 3. Deploy to Vercel

**Dashboard:** Add New Project → import the GitHub repo → Framework **Next.js**, Build `pnpm build`, Install `pnpm install`, Output `.next`.

**CLI:** `npm i -g vercel && vercel` (follow the prompts).

## 4. Environment variables

Required:

```env
DATABASE_URI=mongodb+srv://…            # or MONGODB_URI
PAYLOAD_SECRET=<openssl rand -base64 32>
NEXT_PUBLIC_APP_URL=https://stellarlight.xyz
CRON_SECRET=<openssl rand -base64 32>
```

Optional: `GITHUB_TOKEN` (higher GitHub rate limits), `VOYAGE_API_KEY` (embeddings for /ask + semantic search), `ANTHROPIC_API_KEY` (concierge + grounded answer), `RESEND_API_KEY` (+ `EMAIL_FROM_ADDRESS`, for partner sign-in + reminder emails), the `R2_*` block (below), the `AIRTABLE_*` block (import), `LUMENLOOP_PATH` (sync), `VERCEL_DEPLOY_HOOK_URL` (deploy-on-data-refresh).

> ⚠️ `NEXT_PUBLIC_APP_URL` is inlined at build time — never set it to a localhost value on Vercel (it poisons OG tags + absolute URLs). Prefer omitting it and letting `getAppUrl()` derive from the Vercel host, or set the real production URL.

## 5. Cloudflare R2 (media storage)

Media can't live on Vercel's read-only FS. R2 is free (10GB + unlimited egress) and S3-compatible.

1. Cloudflare → **R2** → Create bucket (e.g. `stellarlight-media`).
2. **Manage R2 API Tokens** → Create (Object Read & Write, scoped to the bucket) → save the Access Key ID, Secret, and Endpoint.
3. Add to Vercel (all environments): `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_REGION=auto`.
4. Redeploy — the storage adapter enables automatically.

## 6. Cron jobs

Configured in `vercel.json` (5 crons: github-refresh, rss-sync, builders sync, partner-freshness, partner-digest). Vercel injects `Authorization: Bearer $CRON_SECRET`; the routes verify it (both `CRON_SECRET` and `VERCEL_CRON_SECRET` are accepted).

> **Plan note:** the Hobby plan caps crons to daily. This project runs 5 (4 daily + 1 weekly) → needs **Pro**, OR convert them to a single GitHub Actions pinger workflow (curl each on schedule with the bearer secret) to make the Vercel tier irrelevant.

## 7. Verify

- `/admin` loads → create the first admin user.
- Create a test project, upload media, sync an RSS feed, confirm GitHub stats refresh.
- Vercel → Cron Jobs shows execution history.
- `/api/status` per-source freshness timestamps advance day over day.

## Troubleshooting

**Build: module not found** — a dep is missing from `package.json`; run `pnpm install` locally.

**Build: Payload config** — check `PAYLOAD_SECRET`, `DATABASE_URI`, and that `NEXT_PUBLIC_APP_URL` isn't a stale localhost value.

**DB connection** — verify the URI format + SSL params, the Atlas IP allowlist (`0.0.0.0/0`), and the user's read/write permission.

**Crons not running** — confirm `CRON_SECRET` is set, the routes aren't blocked by middleware, and check Vercel function logs.

**GitHub rate limits** — add `GITHUB_TOKEN`.

**R2 uploads ("useUploadHandlers must be used within UploadHandlersProvider")** — bucket + token exist, all 5 `R2_*` vars set for all environments, then redeploy.

**A merged PR didn't deploy** — usually a missed webhook, not a quota cap; push an empty commit to `main` to re-fire, or check the repo↔Vercel Git connection.
