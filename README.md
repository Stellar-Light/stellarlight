# Stellar Light

The data layer for the Stellar ecosystem — a curated, always-fresh index of what's been built and who to work with, exposed to both people (a fast web app) and AI agents (the **Stellar Scout** API, MCP, and skill).

## Overview

Stellar Light started as a directory and has grown into the **data layer for the Stellar ecosystem**: a curated, freshness-checked index of the projects, code, research, and service providers on Stellar. It's exposed two ways — a fast human web app, and an agent-facing API + MCP + skill (**Stellar Scout**) that powers assistants like Raven. Built with Next.js 16 and Payload CMS on MongoDB.

## What's inside

### For people — the web app

- **Project & entity directory** (`/directory`) — browse and search projects and the orgs behind them, with GitHub activity, on-chain data, SCF funding, and live/inactive status.
- **Ask Stellar** (`/ask`) — natural-language search across the knowledge corpus (SEPs, dev docs, security audits, SDF + ecosystem writing) and the project directory, with a grounded, **cited** answer synthesized only from the results.
- **Partner Connector** (`/partners`) — a curated directory of vetted providers a builder hires or integrates with (anchors, on/off-ramps, auditors, infrastructure, tooling, wallets). Rich profiles (capabilities, **compliance & corridors**, freshness), a guided **matchmaker** (pick what you need → ranked partners with why-matched reasons), and an AI **concierge** chat. Partners log in and maintain their own profiles.
- **Skills marketplace** (`/skills`) — installable agent skills for building on Stellar.
- **Ecosystem reports** (`/blog`) — thesis-driven research on the state of Stellar.

### For agents — Stellar Scout

The same curated data, built to be consumed by AI agents and assistants:

- **REST API** — projects, repos, research, partners, hackathons, builders, RFPs, leaderboard, clusters, status, and more; documented at [`/api/openapi.json`](https://stellarlight.xyz/api/openapi.json).
- **MCP server** — [`@stellar-light/scout-mcp`](https://www.npmjs.com/package/@stellar-light/scout-mcp) wraps the API as agent tools.
- **Agent skill** — the Stellar Scout skill for Claude / Codex / Cursor ([`public/skills/stellar-scout.md`](./public/skills/stellar-scout.md)), mirrored to [`Stellar-Light/stellar-scout`](https://github.com/Stellar-Light/stellar-scout).
- **Typed client** — [`@stellar-light/api-client`](https://www.npmjs.com/package/@stellar-light/api-client).

### Kept honest

- A **freshness loop** (fresh → aging → stale → archived) so nothing dead surfaces as live.
- **Verified** system signals shown next to **partner-claimed** facts.
- Transparency logs, and curator data changes that run **dry-run → review → execute**.

### Admin

- **Payload CMS admin panel** for content management; Cloudflare R2 media storage; Airtable + Lumenloop sync; automatic transparency logging of changes.

## Tech Stack

- **Framework**: [Next.js 16.0.10](https://nextjs.org/) with App Router
- **CMS**: [Payload CMS 3.0](https://payloadcms.com/)
- **Database**: MongoDB (via MongoDB Atlas)
- **Storage**: Cloudflare R2 (S3-compatible)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Type Safety**: TypeScript
- **Testing**: Vitest, Playwright

## Quick Start

### Prerequisites

- Node.js 24.12.0 (LTS)
- pnpm 9+ or 10+
- MongoDB database (local or MongoDB Atlas)
- (Optional) Cloudflare R2 account for media storage

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd stellarlight/stellarlight
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Add the following required variables to `.env`:
   ```env
   MONGODB_URI=mongodb://localhost:27017/stellarlight
   PAYLOAD_SECRET=your-random-secret-key-min-32-characters
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. **Start development server**
   ```bash
   pnpm dev
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Admin Panel: http://localhost:3000/admin

6. **Create your first admin user**
   - Navigate to `/admin`
   - Follow the on-screen instructions to create your admin account

### Docker Setup (Optional)

For local development with Docker:

```bash
# Update MONGODB_URI in .env to: mongodb://127.0.0.1/stellarlight
# Update docker-compose.yml with the same database name
docker-compose up -d
pnpm dev
```

## Project Structure

```
stellarlight/
├── src/
│   ├── app/                    # Next.js app router pages
│   │   ├── (frontend)/         # Public-facing pages
│   │   │   ├── page.tsx        # Homepage
│   │   │   ├── directory/      # Projects directory
│   │   │   ├── entities/       # Entities listing & detail
│   │   │   ├── project/        # Project detail pages
│   │   │   ├── ask/            # Ask Stellar (NL search + grounded answer)
│   │   │   ├── partners/       # Partner Connector (directory, profiles, concierge)
│   │   │   ├── scout/          # Stellar Scout (agent data layer) landing
│   │   │   ├── skills/         # Skills marketplace
│   │   │   └── blog/           # Blog / ecosystem reports
│   │   ├── (payload)/          # Payload CMS admin
│   │   └── api/                # API routes (the Scout REST API)
│   ├── collections/           # Payload CMS collections
│   │   ├── Projects.ts         # Projects collection
│   │   ├── Entities.ts         # Entities collection
│   │   ├── Partners.ts         # Partner accounts (auth-enabled)
│   │   ├── Blog.ts             # Blog posts collection
│   │   └── ...
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── project-card.tsx    # Project card component
│   │   ├── entity-card.tsx     # Entity card component
│   │   └── ...
│   └── lib/                    # Utilities and helpers
├── public/                     # Static assets (incl. public/skills — Scout skill + references)
├── scripts/                    # Utility scripts (data curation, cron, enrichment)
├── jobs/                       # Background jobs
├── scout-mcp/                  # @stellar-light/scout-mcp — MCP server (npm)
└── api-client/                 # @stellar-light/api-client — typed API client (npm)
```

## Key Collections

### Projects
Individual projects, applications, and services in the Stellar ecosystem. Includes:
- Basic info (name, description, category, status)
- Links (website, GitHub, docs, social media)
- On-chain information (assets, contracts)
- Verification levels and provenance tracking
- GitHub statistics integration

### Entities
Organizations, companies, or teams that build multiple projects. Includes:
- Organization information
- Associated domains
- Linked projects
- Logo and description

### Partners
Vetted ecosystem service providers (anchors, on/off-ramps, auditors, infrastructure, tooling, wallets). An **auth-enabled** collection — partners log in and maintain their own profile. Includes:
- Capabilities (assets, SEPs, ramps) parsed from stellar.toml
- Compliance & corridors (licenses, KYC, Travel Rule, currencies) — curator-verified
- Freshness status + verified-vs-partner-claimed signals
- Powers the `/partners` directory, matchmaker, and concierge

### Blog
Blog posts with RSS feed integration. Supports:
- Featured posts
- Categories
- Markdown content
- RSS image URLs

See [COLLECTIONS_EXPLANATION.md](./COLLECTIONS_EXPLANATION.md) for detailed information about all collections.

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run linter
- `pnpm format` - Format code with Biome
- `pnpm test` - Run tests
- `pnpm test:e2e` - Run end-to-end tests
- `pnpm generate:types` - Generate Payload TypeScript types
- `pnpm cron:github` - Manually trigger GitHub refresh job

## Environment Variables

### Required

- `MONGODB_URI` - MongoDB connection string (or `DATABASE_URI` as alternative)
- `PAYLOAD_SECRET` - Secret key for Payload CMS (min 32 characters)
- `NEXT_PUBLIC_APP_URL` - Your application URL
- `CRON_SECRET` - Secret for securing cron endpoints

### Optional

- `R2_ACCESS_KEY_ID` - Cloudflare R2 access key (for media storage)
- `R2_SECRET_ACCESS_KEY` - Cloudflare R2 secret key
- `R2_ENDPOINT` - Cloudflare R2 endpoint URL
- `R2_BUCKET` - Cloudflare R2 bucket name
- `R2_REGION` - Cloudflare R2 region (use `auto`)
- `GITHUB_TOKEN` - GitHub personal access token (for enhanced API limits)
- `AIRTABLE_API_KEY` - Airtable API key (for Airtable import)
- `AIRTABLE_BASE_ID` - Airtable base ID (for Airtable import)
- `AIRTABLE_TABLE_ID` - Airtable table ID (for Airtable import)
- `AIRTABLE_VIEW_ID` - Airtable view ID (for Airtable import)
- `LUMENLOOP_PATH` - Path to Lumenloop repo (for sync)

**Note**: R2 variables are required for media uploads. Admin panel works without them, but uploads won't persist.

## Deployment

This project is optimized for deployment on Vercel with MongoDB Atlas and Cloudflare R2.

### Prerequisites

- Vercel account
- MongoDB database (MongoDB Atlas recommended)
- GitHub repository
- Environment variables configured
- Node.js 24.12.0 (automatically handled by Vercel)

### Step 1: Prepare Your Repository

1. Ensure all code is committed and pushed to your GitHub repository
2. Verify the project builds successfully:
   ```bash
   pnpm install
   pnpm build
   ```

### Step 2: Set Up MongoDB

1. Create a MongoDB Atlas account (or use another MongoDB provider)
2. Create a new cluster
3. Create a database user with read/write permissions
4. Get your connection string (MongoDB URI)
   - Format: `mongodb+srv://username:password@cluster.mongodb.net/database-name?retryWrites=true&w=majority`

### Step 3: Deploy to Vercel

#### Option A: Deploy via Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `stellarlight` (if your project is in a subdirectory)
   - **Build Command**: `pnpm build`
   - **Output Directory**: `.next`
   - **Install Command**: `pnpm install`

#### Option B: Deploy via Vercel CLI

```bash
npm i -g vercel
cd stellarlight
vercel
```

Follow the prompts to link your project.

### Step 4: Configure Environment Variables

In your Vercel project settings, add the following environment variables:

#### Required Variables

```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database-name?retryWrites=true&w=majority
# OR
DATABASE_URI=mongodb+srv://username:password@cluster.mongodb.net/database-name?retryWrites=true&w=majority

# Payload CMS
PAYLOAD_SECRET=your-random-secret-key-here-min-32-characters

# Application URL
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Cron Job Security
CRON_SECRET=your-random-cron-secret-key-here
```

#### Optional Variables

```env
# GitHub API (for enhanced rate limits)
GITHUB_TOKEN=ghp_your_github_personal_access_token

# Airtable Import (if using)
AIRTABLE_API_KEY=your_airtable_api_key
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_TABLE_ID=your_table_id
AIRTABLE_VIEW_ID=your_view_id

# Lumenloop Sync (optional)
LUMENLOOP_PATH=/path/to/lumenloop/repo
```

#### Generating Secrets

Generate secure random strings for secrets:

```bash
# For PAYLOAD_SECRET (minimum 32 characters)
openssl rand -base64 32

# For CRON_SECRET
openssl rand -base64 32
```

### Step 5: Set Up Cloudflare R2 Storage

Media files cannot be stored on Vercel's read-only filesystem. This project uses **Cloudflare R2** (S3-compatible storage) for media uploads.

#### Why Cloudflare R2?

- ✅ **FREE**: 10GB storage + unlimited egress bandwidth
- ✅ **Fast**: Global CDN delivery
- ✅ **S3-Compatible**: Works with Payload CMS S3 adapter
- ✅ **Reliable**: Production-ready storage solution

#### Setup Steps

1. **Create Cloudflare Account** (if you don't have one):
   - Go to https://dash.cloudflare.com/sign-up
   - Sign up and verify your email

2. **Create R2 Bucket**:
   - In Cloudflare dashboard, click **R2** in sidebar
   - Click **Create bucket**
   - Name: `stellarlight-media` (or any name)
   - Location: **Automatic** (recommended)
   - Click **Create bucket**

3. **Generate API Credentials**:
   - In R2 dashboard, click **Manage R2 API Tokens**
   - Click **Create API Token**
   - Token name: `stellarlight-uploads`
   - Permissions: **Object Read & Write**
   - Specify bucket: Select your bucket
   - Click **Create API Token**
   - **SAVE THESE VALUES** (shown only once):
     - Access Key ID
     - Secret Access Key
     - Endpoint (e.g., `https://abc123.r2.cloudflarestorage.com`)

4. **Add Environment Variables to Vercel**:
   - Go to Vercel project → **Settings** → **Environment Variables**
   - Add these 5 variables (for all environments):
     - `R2_ACCESS_KEY_ID` = Your Access Key ID
     - `R2_SECRET_ACCESS_KEY` = Your Secret Access Key
     - `R2_ENDPOINT` = Your endpoint URL
     - `R2_BUCKET` = Your bucket name (e.g., `stellarlight-media`)
     - `R2_REGION` = `auto`

5. **Redeploy**:
   - After adding environment variables, trigger a new deployment
   - The R2 storage adapter will automatically enable

### Step 6: Configure Vercel Cron Jobs

Vercel Cron Jobs are configured in `vercel.json`.

#### ⚠️ Important: Vercel Plan Limitations

**Hobby Plan (Free)**: Limited to **daily cron jobs** (once per day maximum)

**Current Configuration (Hobby-compatible)**:
- **GitHub Refresh**: Daily at 2:00 AM UTC (`0 2 * * *`)
- **RSS Sync**: Daily at 4:00 AM UTC (`0 4 * * *`)

**Pro Plan**: Allows multiple runs per day (unlimited cron frequency)

#### Setting Up Cron Jobs

1. Set the `CRON_SECRET` environment variable in Vercel
2. Vercel will automatically send requests with `Authorization: Bearer ${CRON_SECRET}`
3. The cron endpoints verify this secret for security

**Note**: In Vercel, you can also use the built-in `VERCEL_CRON_SECRET` which is automatically set. The cron routes support both `CRON_SECRET` and `VERCEL_CRON_SECRET`.

### Step 7: Verify Deployment

1. Visit your deployed site
2. Navigate to `/admin` to access the admin panel
3. Create your first admin user
4. Test key functionality:
   - Create a test project
   - Upload media
   - Test RSS feed sync
   - Verify GitHub stats refresh

### Post-Deployment Checklist

- [ ] Admin panel is accessible
- [ ] Database connections are working
- [ ] Projects can be created and updated
- [ ] Media uploads work
- [ ] RSS feeds can be synced
- [ ] GitHub stats are refreshing
- [ ] Cron jobs are running (check Vercel logs)
- [ ] Frontend pages load correctly
- [ ] Environment variables are set correctly

### Troubleshooting Deployment

#### Build Failures

**Error: Module not found**
- Ensure all dependencies are in `package.json`
- Run `pnpm install` locally to verify

**Error: Payload config issues**
- Verify `PAYLOAD_SECRET` is set
- Check `MONGODB_URI` is correct
- Ensure `NEXT_PUBLIC_APP_URL` matches your domain

#### Runtime Errors

**Database Connection Issues**

1. **Verify MongoDB Connection String Format**
   - Your `MONGODB_URI` should look like:
     ```
     mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
     ```
   - For MongoDB Atlas, ensure the connection string includes SSL parameters

2. **Check MongoDB Atlas IP Whitelist**
   - Go to MongoDB Atlas → Network Access
   - Add `0.0.0.0/0` to allow all IPs (or add Vercel's IP ranges)
   - Wait a few minutes for changes to propagate

3. **Verify Database User Permissions**
   - Ensure your database user has read/write permissions
   - Check that the user can access the correct database

**Cron Jobs Not Running**
- Check Vercel Cron configuration in dashboard
- Verify `CRON_SECRET` is set
- Check Vercel function logs for errors
- Ensure cron routes are accessible (not blocked by middleware)

**GitHub API Rate Limits**
- Add `GITHUB_TOKEN` environment variable
- Check GitHub API rate limit status
- Reduce cron job frequency if needed

**R2 Storage Issues**

If you see "useUploadHandlers must be used within UploadHandlersProvider":

1. **Verify R2 storage is set up**:
   - Go to Cloudflare dashboard → R2
   - Confirm your bucket exists
   - Verify API token was created

2. **Verify environment variables are set**:
   - Go to Vercel → **Settings** → **Environment Variables**
   - Check all 5 R2 variables exist and are set for all environments

3. **Redeploy after adding variables**:
   - Go to **Deployments** tab
   - Click the three dots on latest deployment → **Redeploy**

## Admin Guide

### Accessing the Admin Panel

1. Navigate to `/admin` on your deployed site (e.g., `https://yourdomain.com/admin`)
2. Log in with your admin credentials
3. **First-time setup**: If no admin user exists, you'll be prompted to create one during the first visit

### Collections Overview

#### Projects

The core collection - all projects in the Stellar ecosystem directory.

**Status Options**:
- **Draft**: Projects submitted by users or imported but not yet approved (❌ Not visible on frontend)
- **Development**: Active projects currently in development (✅ Visible on frontend)
- **Pre-Release**: Projects preparing for launch (✅ Visible on frontend)
- **Live**: Publicly available and operational projects (✅ Visible on frontend)

**Verification Levels**:
- **Unverified**: Default for user submissions
- **Verified (SDF)**: Verified by Stellar Development Foundation
- **Verified (Community)**: Verified by community members

**Key Features**:
- GitHub integration for automatic stats (stars, issues, last commit)
- Stats are cached for 6 hours
- Automatically refreshed daily via cron job
- Link to entities/organizations

#### Entities

Organizations, companies, or teams that build multiple projects.

**Key Features**:
- Link multiple projects to an entity
- Add domains associated with the entity
- Manage entity links (website, GitHub, Twitter)
- When viewing an entity on the frontend, all associated projects are displayed

#### Blog

Manage blog posts and articles. Supports:
- Manual creation in admin panel
- RSS feed auto-import
- Featured posts
- Categories and tags
- Markdown content

#### RSS Feeds

Configure RSS feeds to automatically import blog posts.

**Key Features**:
- Enable/disable feeds individually
- Auto-publish option for trusted feeds
- Default category and tags
- Manual sync via admin panel button
- Automatic daily sync at 4:00 AM UTC

### Common Workflows

#### Approving User-Submitted Projects

1. Navigate to **Projects** collection
2. Filter by **Status: Draft** to see pending submissions
3. Review the project (name, description, website URL, GitHub repos)
4. Edit the project:
   - Update status to **Development**, **Pre-Release**, or **Live**
   - Add verification level if applicable
   - Upload project logo if needed
   - Associate with an entity if applicable
5. Save - The project will now appear on the frontend

#### Managing RSS Feeds

**Adding a New RSS Feed**:
1. Navigate to **RSS Feeds** collection
2. Click **Create New**
3. Fill in: Name, Feed URL, Category, Tags, Auto Publish, Enabled
4. Save

**Syncing a Feed**:
1. Go to **RSS Feeds** collection
2. Find the feed and click **Edit**
3. Scroll to bottom and click **"Sync RSS Feed"** button
4. Check **Sync Jobs** collection for results

### Automated Systems

#### Cron Jobs

The system runs automated tasks on a schedule:

- **GitHub Refresh** (Daily at 2:00 AM UTC): Refreshes GitHub statistics for all projects with GitHub repos
- **RSS Sync** (Daily at 4:00 AM UTC): Syncs all enabled RSS feeds and imports new blog posts

**Verification**:
- Check Vercel Dashboard → Cron Jobs to see execution history
- Ensure `CRON_SECRET` is set in environment variables

### Troubleshooting

#### Projects Not Appearing on Frontend

- Check project status is **Development**, **Pre-Release**, or **Live** (not Draft)
- Verify project slug is unique
- Check transparency logs for any errors

#### GitHub Stats Not Showing

- Verify project has GitHub repos configured
- Check `GITHUB_TOKEN` is set (optional but recommended)
- Verify repos are public (private repos won't work without token)
- Check Signals collection for cached data
- Wait for cron job to run or trigger manually

#### RSS Sync Not Working

- Verify RSS feed URL is accessible
- Check feed is enabled
- Review Sync Jobs collection for error messages
- Verify feed URL is valid RSS format

#### Media Upload Issues

- Verify Cloudflare R2 is configured
- Check R2 environment variables are set in Vercel
- Ensure file size is reasonable (< 10MB recommended)
- Verify file format is supported (JPG, PNG, GIF, WebP, SVG)

## Data Import

### Airtable CSV Import

Import projects from the Airtable CSV file into your production database with images uploaded to R2 storage.

#### Prerequisites

1. **CSV file in repository**: The `scripts/airtable_import.csv` file must be committed to your repository
2. **R2 Storage configured**: Production environment must have R2 credentials set
3. **CRON_SECRET set**: The import endpoint is protected by the same secret as your cron jobs

#### Running the Import

Use curl or any HTTP client to call the import endpoint:

```bash
curl -X POST https://yourdomain.com/api/import/airtable-csv \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

#### What the Import Does

1. Reads the CSV file from `scripts/airtable_import.csv`
2. Downloads images from Airtable URLs
3. Uploads images to R2 via Payload Media collection
4. Creates projects with proper category mapping
5. Skips existing projects (by slug) to avoid duplicates

#### Import Statistics

The endpoint returns a JSON response with statistics:

```json
{
  "success": true,
  "stats": {
    "created": 234,
    "skipped": 0,
    "errors": 0,
    "total": 234
  },
  "message": "Import completed: 234 created, 0 skipped, 0 errors"
}
```

#### Category Mapping

The import automatically maps Airtable categories to your schema:

| Airtable Category | Your Schema |
|-------------------|-------------|
| AMM, DEX, DAO & Governance, Lending & Borrowing | Protocol/Contract |
| Block Explorer, Indexing, Oracle, RPC & Nodes | Infrastructure |
| Bridge | Partner Integration |
| Wallet, Gaming, NFT, Domain Service, Content & News, Education, Sustainability | User-Facing App |
| Stablecoin, Collateralized Stablecoin, RWA | Asset |
| Payments | Anchor |
| Dev Tools, IDE, Data & Onchain Tools | Tooling |

#### Notes

- The import is **idempotent** - you can run it multiple times safely
- Existing projects (by slug) will be skipped
- Images will be re-uploaded if a project doesn't have a logo
- Large imports may take several minutes to complete

## Documentation

- [Collections Explanation](./COLLECTIONS_EXPLANATION.md) - Detailed information about all collections

## Features in Detail

### Project Directory

- **Search**: Full-text search across project names and descriptions
- **Filtering**: Filter by category, status, and verification level
- **Pagination**: Load more projects without page navigation
- **Detail Pages**: Comprehensive project information with GitHub stats

### Entity Management

- **Organization Pages**: Dedicated pages for each entity
- **Project Association**: Link multiple projects to entities
- **Logo Support**: Custom logos for entities
- **Description**: Rich descriptions for organizations

### Community Picks

- **Featured Projects**: Handpicked projects with X (Twitter) integration
- **Carousel Display**: Interactive carousel with navigation
- **Social Integration**: Direct links to project X profiles

### GitHub Integration

- **Automatic Stats**: Fetches stars, issues, and activity
- **Caching**: 6-hour cache to reduce API calls
- **Rate Limit Handling**: Graceful handling of API limits
- **Multi-Repo Support**: Aggregates stats from multiple repositories

### Transparency

- **Public Audit Trail**: All changes are logged publicly
- **Change History**: View complete history of modifications
- **Actor Tracking**: See who made changes (Admin, User, System)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT

## Support

For questions or issues:
- Check the documentation files in the repository
- Review [Payload CMS documentation](https://payloadcms.com/docs)
- Check [Next.js documentation](https://nextjs.org/docs)
