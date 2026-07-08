# Admin & data operations

The Payload CMS admin panel manages content; this doc covers the admin workflows and the one-off data imports. Collections themselves are documented in [COLLECTIONS_EXPLANATION.md](../COLLECTIONS_EXPLANATION.md).

## Admin panel

Navigate to `/admin`. If no admin user exists you're prompted to create one on first visit.

### Projects

The core collection — every project in the directory.

- **Status:** `Draft` (hidden, pending approval) · `Development` / `Pre-Release` / `Live` (visible + ranked) · `Inactive` (defunct — dropped from listings, heavily down-ranked in search).
- **Verification:** `Unverified` (default for submissions) · `Verified (SDF)` · `Verified (Community)`.
- GitHub stats (stars/issues/last commit) are cached ~6h and refreshed daily by cron.

### Entities

Organizations/teams that build multiple projects — link projects, add domains + links; the entity page shows all associated projects.

### Blog & RSS feeds

Blog posts support manual creation, RSS auto-import, featured flags, categories/tags, markdown. RSS feeds are configured per-source (enable/disable, auto-publish for trusted feeds, default category/tags) and sync daily at 04:00 UTC or via the admin **Sync RSS Feed** button (results in the Sync Jobs collection).

## Common workflows

**Approve a user-submitted project:** Projects → filter Status `Draft` → review → set status to Development/Pre-Release/Live, add verification + logo + entity → Save.

**Add an RSS feed:** RSS Feeds → Create New → Name, Feed URL, Category, Tags, Auto Publish, Enabled → Save. Sync from the feed's edit page.

## Automated jobs (cron)

- **GitHub Refresh** (daily 02:00 UTC) — refreshes GitHub stats for every project with repos.
- **RSS Sync** (daily 04:00 UTC) — imports new posts from enabled feeds.
- Plus builders sync, partner-freshness, and the weekly partner-digest. See `vercel.json`. Check Vercel → Cron Jobs for history; `CRON_SECRET` must be set.

## Data import — Airtable CSV

Imports projects from `scripts/airtable_import.csv` into production, uploading images to R2.

**Prereqs:** the CSV committed, R2 configured in production, `CRON_SECRET` set.

```bash
curl -X POST https://stellarlight.xyz/api/import/airtable-csv \
  -H "Authorization: Bearer $CRON_SECRET"
```

It reads the CSV, downloads + uploads images via the Media collection, creates projects with category mapping, and **skips existing slugs** (idempotent — safe to re-run). Returns `{ success, stats: { created, skipped, errors, total } }`.

Category mapping:

| Airtable category | Schema |
|---|---|
| AMM, DEX, DAO & Governance, Lending & Borrowing | Protocol/Contract |
| Block Explorer, Indexing, Oracle, RPC & Nodes | Infrastructure |
| Bridge | Partner Integration |
| Wallet, Gaming, NFT, Domain Service, Content & News, Education, Sustainability | User-Facing App |
| Stablecoin, Collateralized Stablecoin, RWA | Asset |
| Payments | Anchor |
| Dev Tools, IDE, Data & Onchain Tools | Tooling |

## Curator data changes

Bulk data edits (partner enrichment, project coverage, on-chain, etc.) run through scripts in `scripts/data/` via GitHub Actions with the discipline **dry-run → owner review → `--execute`** — never a blind bulk write. Every change lands in the transparency log.
