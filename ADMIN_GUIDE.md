# Stellar Light - Complete Admin Guide

This comprehensive guide covers everything you need to know to manage the Stellar Light ecosystem directory.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Collections Overview](#collections-overview)
3. [Common Workflows](#common-workflows)
4. [Automated Systems](#automated-systems)
5. [Media Management](#media-management)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

---

## Getting Started

### Accessing the Admin Panel

1. Navigate to `/admin` on your deployed site (e.g., `https://yourdomain.com/admin`)
2. Log in with your admin credentials
3. **First-time setup**: If no admin user exists, you'll be prompted to create one during the first visit

### Admin Panel Overview

The admin panel is built with **Payload CMS** and provides a user-friendly interface for managing all content. The left sidebar contains all collections and system features.

---

## Collections Overview

### 👥 Users

**Purpose**: Manage admin users who can access the admin panel

**Key Features**:
- Only existing admins can create/update/delete users
- Email is used for login
- Passwords are securely hashed
- All users have admin-level access

**When to Use**:
- Adding new team members
- Removing access for former team members
- Resetting passwords (delete and recreate, or use Payload's password reset)

---

### 🚀 Projects

**Purpose**: The core collection - all projects in the Stellar ecosystem directory

**Status Options**:
- **Draft**: Projects submitted by users or imported but not yet approved
  - ❌ **Not visible on frontend**
  - Use this for projects that need review or are incomplete
- **Development**: Active projects currently in development
  - ✅ **Visible on frontend**
  - Use for projects that are actively being built
- **Pre-Release**: Projects preparing for launch
  - ✅ **Visible on frontend**
  - Use for projects nearing public release
- **Live**: Publicly available and operational projects
  - ✅ **Visible on frontend**
  - Use for projects that are publicly available

**Verification Levels**:
- **Unverified**: Default for user submissions
- **Verified (SDF)**: Verified by Stellar Development Foundation
- **Verified (Community)**: Verified by community members

**Key Fields**:
- **Name**: Project name (required)
- **Slug**: URL-friendly identifier (auto-generated from name)
- **Short Description**: Brief description shown on cards
- **Category**: Project category (Protocol/Contract, Wallet, DEX, etc.)
- **Status**: Draft, Development, Pre-Release, or Live
- **Logo**: Project logo image
- **Links**: Website, GitHub, Docs, Twitter, Discord
- **GitHub**: Repository information for automatic stats
- **Types**: Project types (Wallet, Anchor, Bridge, SDK, etc.)
- **On-Chain Info**: Asset codes, issuers, contract addresses
- **Entities**: Link to organizations/entities

**GitHub Integration**:
- Add GitHub repositories to automatically fetch stats (stars, issues, last commit)
- Stats are cached for 6 hours
- Automatically refreshed daily via cron job
- Stats appear on project detail pages

**Important**: Only projects with status **Development**, **Pre-Release**, or **Live** appear on the frontend.

---

### 🏢 Entities

**Purpose**: Organizations, companies, or groups that work on multiple projects

**Key Features**:
- Link multiple projects to an entity
- Add domains associated with the entity
- Manage entity links (website, GitHub, Twitter)
- When viewing an entity on the frontend, all associated projects are displayed

**Common Use Cases**:
- Stellar Development Foundation (SDF)
- Companies building multiple Stellar projects
- DAOs or organizations
- Development teams

**How It Works**:
1. Create an entity with name, slug, and description
2. Add associated domains (optional)
3. Link projects to the entity (can be done from Projects or Entities)
4. View on frontend at `/entities/[entity-slug]`

---

### 📝 Blog

**Purpose**: Manage blog posts and articles

**Sources**:
- **Manual**: Created directly in the admin panel
- **RSS Feed**: Automatically imported from configured RSS feeds

**Status Options**:
- **Draft**: Not visible on frontend
- **Published**: Visible on frontend

**Key Fields**:
- **Title**: Post title
- **Slug**: URL-friendly identifier
- **Excerpt**: Short summary
- **Author**: Author name
- **Published Date**: When the post was published
- **Category**: Announcement, Tutorial, News, Technical, etc.
- **Tags**: For filtering and organization
- **Featured Image**: Main image for the post
- **Content**: Rich text content (Lexical editor)
- **Featured**: Whether to show in highlights carousel

**RSS Integration**:
- Posts imported from RSS feeds are marked with `rssFeed` and `rssItemId`
- External URL links to original post
- Can be edited after import

---

### 📡 RSS Feeds

**Purpose**: Configure RSS feeds to automatically import blog posts

**Key Fields**:
- **Name**: Display name for the feed
- **Feed URL**: The RSS feed URL to sync
- **Enabled**: Toggle to enable/disable syncing
- **Auto Publish**: If enabled, imported posts are automatically published; otherwise, they're created as drafts
- **Category**: Default category for imported posts
- **Tags**: Default tags for imported posts

**Syncing**:
- **Manual**: Use the "Sync RSS Feed" button in the admin panel (see Jobs section)
- **Automatic**: Runs daily at 4:00 AM UTC via Vercel Cron
- **API**: POST to `/api/sync/rss` (requires admin authentication)

**Best Practices**:
- Enable "Auto Publish" only for trusted feeds
- Review imported posts regularly
- Use categories and tags to organize content
- Disable feeds that are no longer active

---

### 🖼️ Media

**Purpose**: Upload and manage images, logos, and other media files

**Storage**: Files are stored in **Cloudflare R2** (cloud storage)

**Usage**:
- Project logos
- Blog featured images
- Entity logos
- Any other images needed for the site

**Features**:
- Automatic image optimization
- Focal point selection
- Multiple size variants
- Alt text for accessibility

**Upload Limits**:
- Files larger than 4.5MB may need special handling
- Supported formats: JPG, PNG, GIF, WebP, SVG

**Note**: Media uploads require Cloudflare R2 to be configured. See DEPLOYMENT.md for setup.

---

### 📊 Signals

**Purpose**: Cache GitHub statistics for projects

**Auto-Generated**: Created automatically when GitHub data is fetched

**Cache Duration**: 6 hours

**How It Works**:
1. When a project page loads, it checks for cached GitHub data
2. If cache is fresh (< 6 hours), uses cached data
3. If cache is stale or missing, fetches fresh data from GitHub API
4. Fresh data is cached for future use

**Manual Refresh**:
- Use the refresh parameter: `/api/projects/[id]/github?refresh=true`
- Or wait for the daily cron job to refresh all projects

**You typically don't need to manage this collection directly** - it's handled automatically.

---

### 📋 Transparency Logs

**Purpose**: Complete audit log of all changes to projects

**Auto-Generated**: Created automatically when projects are created, updated, or deleted

**Information Tracked**:
- **Action Type**: Create, Update, SyncImport, Intake
- **Actor Type**: System, User, Admin
- **Timestamp**: When the change occurred
- **Before/After Diffs**: What changed
- **Target**: Which project was affected

**Use Cases**:
- Audit trail for accountability
- Debugging issues
- Understanding project history
- Tracking who made what changes

**Viewing Logs**:
- Each project has a "Transparency Log" section on its detail page
- Shows the 10 most recent changes
- Full history available in the admin panel

---

## Common Workflows

### ✅ Approving User-Submitted Projects

**Step-by-Step**:

1. **Navigate to Projects** collection in admin panel
2. **Filter by Status: Draft** to see pending submissions
3. **Review the project**:
   - Check name, description, and category
   - Verify website URL works
   - Review GitHub repository links if provided
   - Check if project is legitimate and appropriate
4. **Edit the project**:
   - Update status to **Development**, **Pre-Release**, or **Live**
   - Add or update verification level if applicable
   - Upload project logo if needed
   - Associate with an entity if applicable
   - Add any missing information (types, on-chain info, etc.)
5. **Save** - The project will now appear on the frontend

**Tips**:
- Always verify the website URL
- Check if GitHub repos are correct
- Add appropriate project types
- Link to entities when relevant

---

### 🔄 Managing RSS Feeds

**Adding a New RSS Feed**:

1. Navigate to **RSS Feeds** collection
2. Click **Create New**
3. Fill in the form:
   - **Name**: Descriptive name (e.g., "Stellar Blog")
   - **Feed URL**: The RSS feed URL
   - **Category**: Default category for posts
   - **Tags**: Default tags (comma-separated)
   - **Auto Publish**: Enable if you trust the feed
   - **Enabled**: Enable to start syncing
4. **Save**

**Syncing a Feed**:

1. Go to **RSS Feeds** collection
2. Find the feed you want to sync
3. Click **Edit**
4. Scroll to the bottom and click **"Sync RSS Feed"** button
5. Wait for the sync to complete
6. Check **Sync Jobs** collection for results

**Monitoring Syncs**:

- Check **Sync Jobs** collection to see sync status
- Review any errors in the job logs
- Failed syncs will show error messages

**Automatic Syncing**:
- All enabled feeds sync automatically daily at 4:00 AM UTC
- No manual intervention needed

---

### 🔗 Associating Projects with Entities

**From Entities Collection**:

1. Navigate to **Entities** collection
2. Create or edit an entity
3. In the **Projects** field, select projects to associate
4. Multiple projects can be linked to one entity
5. Save

**From Projects Collection**:

1. Navigate to **Projects** collection
2. Edit a project
3. In the sidebar, find the **Entities** field
4. Select one or more entities to link
5. Save

**Viewing on Frontend**:
- Navigate to `/entities/[entity-slug]` to see all associated projects
- Only projects with status Development, Pre-Release, or Live are shown

---

### 📝 Creating Blog Posts

**Manual Creation**:

1. Navigate to **Blog** collection
2. Click **Create New**
3. Fill in:
   - **Title**: Post title
   - **Slug**: Auto-generated, but can be edited
   - **Excerpt**: Short summary
   - **Author**: Author name
   - **Published Date**: When to publish
   - **Category**: Select appropriate category
   - **Tags**: Add relevant tags
   - **Featured Image**: Upload or select image
   - **Content**: Write your post using the rich text editor
   - **Featured**: Check if you want it in the highlights carousel
   - **Status**: Set to "Published" to make it visible
4. **Save**

**Rich Text Editor**:
- Full formatting options (bold, italic, headings, lists, etc.)
- Link insertion
- Image embedding
- Code blocks

---

### 🖼️ Uploading Media

1. Navigate to **Media** collection
2. Click **Upload** or drag and drop files
3. Fill in **Alt Text** (required for accessibility)
4. **Save**

**Using Media**:
- When editing projects, blog posts, or entities, click the media field
- Select from uploaded media or upload new
- Images are automatically optimized

**Best Practices**:
- Use descriptive alt text
- Optimize images before upload when possible
- Use appropriate image sizes (logos don't need to be huge)

---

## Automated Systems

### 🤖 Cron Jobs

The system runs automated tasks on a schedule:

**GitHub Refresh** (Daily at 2:00 AM UTC):
- Refreshes GitHub statistics for all projects with GitHub repos
- Caches data in Signals collection
- No manual intervention needed

**RSS Sync** (Daily at 4:00 AM UTC):
- Syncs all enabled RSS feeds
- Imports new blog posts
- Auto-publishes if feed is configured to do so

**Verification**:
- Check Vercel Dashboard → Cron Jobs to see execution history
- Check logs if jobs aren't running
- Ensure `CRON_SECRET` is set in environment variables

---

### 🔄 Automatic GitHub Stats

**How It Works**:

1. **Daily Cron Job** (2:00 AM UTC):
   - Fetches fresh GitHub data for all projects
   - Caches in Signals collection
   - Updates stars, issues, last commit dates

2. **On Project Page Load**:
   - Checks for cached data (< 6 hours old)
   - Uses cache if available (fast)
   - Fetches fresh if cache is stale (slower, but ensures accuracy)

3. **Manual Refresh**:
   - Use `?refresh=true` parameter on GitHub API endpoint
   - Or wait for next cron run

**What Gets Cached**:
- Total stars across all repos
- Total open issues
- Last activity date
- Individual repo stats (stars, issues, last commit)

**Requirements**:
- `GITHUB_TOKEN` environment variable (optional, but recommended for higher rate limits)
- Projects must have GitHub repos configured

---

### 📡 RSS Feed Auto-Import

**How It Works**:

1. **Daily Cron Job** (4:00 AM UTC):
   - Checks all enabled RSS feeds
   - Fetches new posts
   - Imports to Blog collection
   - Auto-publishes if configured

2. **Manual Sync**:
   - Use "Sync RSS Feed" button in admin panel
   - Or use API endpoint

3. **Deduplication**:
   - Posts are identified by `rssItemId` (usually the post URL)
   - Duplicate posts are skipped
   - Already-imported posts won't be re-imported

**Configuration**:
- Enable/disable feeds individually
- Set default category and tags
- Choose auto-publish behavior
- Each feed can have different settings

---

## Media Management

### Cloudflare R2 Storage

**Current Setup**: Media files are stored in **Cloudflare R2** (cloud storage)

**Why Cloud Storage?**:
- Vercel's filesystem is read-only
- Files need to persist across deployments
- R2 provides fast, reliable storage

**Features**:
- Automatic CDN delivery
- Free tier: 10GB storage + unlimited bandwidth
- Fast global access

**Setup** (if not already done):
- See DEPLOYMENT.md for Cloudflare R2 setup instructions
- Requires R2 bucket and API credentials
- Environment variables must be set in Vercel

**Upload Process**:
1. Upload in admin panel
2. File goes to Cloudflare R2
3. Metadata stored in MongoDB
4. Public URL generated automatically
5. File served via CDN

---

## Troubleshooting

### Projects Not Appearing on Frontend

**Check**:
1. ✅ Project status is **Development**, **Pre-Release**, or **Live** (not Draft)
2. ✅ Project slug is unique
3. ✅ No JavaScript errors in browser console
4. ✅ Check transparency logs for any errors

**Solution**:
- Change status from Draft to one of the visible statuses
- Ensure slug doesn't conflict with another project

---

### GitHub Stats Not Showing

**Check**:
1. ✅ Project has GitHub repos configured
2. ✅ `GITHUB_TOKEN` is set (optional but recommended)
3. ✅ Repos are public (private repos won't work without token)
4. ✅ Check Signals collection for cached data
5. ✅ Check Vercel logs for cron job execution

**Solutions**:
- Add GitHub repos to the project
- Set `GITHUB_TOKEN` environment variable
- Wait for cron job to run (or trigger manually)
- Use refresh parameter: `/api/projects/[id]/github?refresh=true`

**Rate Limits**:
- Without token: 60 requests/hour
- With token: 5,000 requests/hour
- Stats are cached for 6 hours to reduce API calls

---

### RSS Sync Not Working

**Check**:
1. ✅ RSS feed URL is accessible
2. ✅ Feed is enabled
3. ✅ Check Sync Jobs collection for error messages
4. ✅ Verify network connectivity
5. ✅ Check if feed URL is valid RSS format

**Solutions**:
- Test RSS feed URL in browser
- Check Sync Jobs collection for specific errors
- Verify feed is enabled
- Check Vercel logs for cron job errors

**Common Issues**:
- Invalid RSS format
- Feed requires authentication
- Network timeouts
- Rate limiting

---

### Media Upload Issues

**Check**:
1. ✅ Cloudflare R2 is configured (see DEPLOYMENT.md)
2. ✅ R2 environment variables are set in Vercel
3. ✅ File size is reasonable (< 10MB recommended)
4. ✅ File format is supported (JPG, PNG, GIF, WebP, SVG)

**Solutions**:
- Verify R2 setup in DEPLOYMENT.md
- Check R2 environment variables in Vercel
- Compress images before upload
- Try a different file format

**Error Messages**:
- "Upload failed": Check R2 configuration
- "File too large": Compress or resize image
- "Invalid format": Use supported format

---

### Cron Jobs Not Running

**Check**:
1. ✅ `CRON_SECRET` is set in Vercel environment variables
2. ✅ Cron jobs are configured in `vercel.json`
3. ✅ Check Vercel Dashboard → Cron Jobs for execution history
4. ✅ Review Vercel logs for errors

**Solutions**:
- Set `CRON_SECRET` in Vercel
- Verify cron configuration in `vercel.json`
- Check Vercel Cron Jobs dashboard
- Review execution logs for errors

**Note**: Hobby plan is limited to daily cron jobs. Upgrade to Pro for more frequent runs.

---

## Best Practices

### Project Management

✅ **Do**:
- Review all user submissions before approving
- Keep project information up-to-date
- Use appropriate status levels
- Verify important projects with verification levels
- Add GitHub repos for automatic stats
- Link projects to entities when relevant
- Use descriptive project descriptions

❌ **Don't**:
- Approve projects without reviewing
- Leave projects in Draft status indefinitely
- Skip verification for important projects
- Forget to add logos and images

---

### Content Management

✅ **Do**:
- Regularly sync RSS feeds
- Review auto-imported blog posts
- Use appropriate categories and tags
- Write clear, descriptive content
- Add featured images to blog posts
- Keep content fresh and updated

❌ **Don't**:
- Enable auto-publish for untrusted feeds
- Skip reviewing imported content
- Use vague categories or tags
- Leave old/outdated content published

---

### Security

✅ **Do**:
- Use strong passwords for admin accounts
- Limit admin access to trusted individuals
- Regularly review transparency logs
- Keep environment variables secure
- Monitor for suspicious activity

❌ **Don't**:
- Share admin credentials
- Use weak passwords
- Ignore transparency log warnings
- Expose environment variables

---

### Performance

✅ **Do**:
- Let GitHub stats cache (6 hours)
- Sync RSS feeds periodically (not too frequently)
- Optimize images before upload
- Use appropriate image sizes
- Monitor cron job execution

❌ **Don't**:
- Manually refresh GitHub stats too often
- Sync RSS feeds every few minutes
- Upload huge uncompressed images
- Ignore cron job failures

---

## API Endpoints (Admin Only)

All API endpoints require admin authentication via Payload CMS session cookies.

**RSS Sync**:
- `POST /api/sync/rss` - Sync all enabled RSS feeds
- `POST /api/sync/rss/[id]` - Sync a specific RSS feed

**Lumenloop Sync**:
- `POST /api/sync/lumenloop` - Sync from Lumenloop database

**GitHub Stats**:
- `GET /api/projects/[id]/github` - Fetch GitHub stats (uses cache if available)
- `GET /api/projects/[id]/github?refresh=true` - Force refresh GitHub stats

**Project Intake**:
- `POST /api/intake` - Public endpoint for user project submissions

---

## Quick Reference

### Status Meanings

| Status | Visible on Frontend? | When to Use |
|--------|---------------------|-------------|
| Draft | ❌ No | User submissions, incomplete projects |
| Development | ✅ Yes | Active development projects |
| Pre-Release | ✅ Yes | Projects preparing for launch |
| Live | ✅ Yes | Publicly available projects |

### Verification Levels

| Level | Meaning |
|-------|---------|
| Unverified | Default for user submissions |
| Verified (SDF) | Verified by Stellar Development Foundation |
| Verified (Community) | Verified by community members |

### Cron Job Schedule

| Job | Schedule | Purpose |
|-----|----------|---------|
| GitHub Refresh | Daily 2:00 AM UTC | Update GitHub stats for all projects |
| RSS Sync | Daily 4:00 AM UTC | Import new blog posts from RSS feeds |

---

## Getting Help

**Resources**:
1. **Transparency Logs**: Check for error details and change history
2. **Sync Jobs**: Review sync job logs for RSS/import issues
3. **Vercel Logs**: Check deployment and cron job logs
4. **DEPLOYMENT.md**: Environment variable and deployment configuration
5. **COLLECTIONS_EXPLANATION.md**: Detailed collection schema documentation

**Common Issues**:
- See [Troubleshooting](#troubleshooting) section above
- Check Vercel dashboard for deployment status
- Review environment variables are set correctly
- Verify cron jobs are running

---

## Summary

This admin panel gives you complete control over the Stellar Light ecosystem directory. Key points to remember:

- **Projects**: Only Development, Pre-Release, or Live status appear on frontend
- **GitHub Stats**: Automatically cached and refreshed daily
- **RSS Feeds**: Auto-import blog posts daily
- **Media**: Stored in Cloudflare R2 for persistence
- **Transparency**: All changes are logged automatically
- **Cron Jobs**: Run automatically, no manual intervention needed

For deployment and technical setup, see **DEPLOYMENT.md**.
