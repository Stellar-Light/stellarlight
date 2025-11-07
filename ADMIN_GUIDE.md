# Stellar Light Admin Panel Guide

This guide will help you navigate and manage the Stellar Light admin panel effectively.

## Accessing the Admin Panel

1. Navigate to `/admin` on your deployed site (e.g., `https://yourdomain.com/admin`)
2. Log in with your admin credentials
3. If you're setting up for the first time, you'll be prompted to create an admin user

## Collections Overview

### Users
- **Purpose**: Manage admin users who can access the admin panel
- **Access**: Only existing admins can create/update/delete users
- **Key Fields**:
  - Email (used for login)
  - Password (hashed and secure)
  - Roles (currently all users are admins)

### Projects
- **Purpose**: Manage all projects in the ecosystem directory
- **Status Options**:
  - **Draft**: Projects submitted by users or imported but not yet approved. These won't appear on the frontend.
  - **Development**: Active projects in development
  - **Pre-Release**: Projects preparing for launch
  - **Live**: Publicly available projects
- **Verification Levels**:
  - **Unverified**: Default for user submissions
  - **Verified (SDF)**: Verified by Stellar Development Foundation
  - **Verified (Community)**: Verified by community members
- **Key Actions**:
  - Review and approve user-submitted projects (change status from Draft to Live/Development/Pre-Release)
  - Update project information
  - Associate projects with entities
  - Manage GitHub repository links for automatic stats

### Entities
- **Purpose**: Organizations, companies, or groups that work on multiple projects
- **Key Features**:
  - Link multiple projects to an entity
  - Add domains associated with the entity
  - Manage entity links (website, GitHub, Twitter)
- **Usage**: When viewing an entity on the frontend, all associated projects are displayed

### Blog
- **Purpose**: Manage blog posts and articles
- **Sources**:
  - **Manual**: Created directly in the admin panel
  - **RSS Feed**: Automatically imported from configured RSS feeds
- **Status Options**:
  - **Draft**: Not visible on frontend
  - **Published**: Visible on frontend
- **RSS Integration**: Posts imported from RSS feeds are marked with `rssFeed` and `rssItemId` fields

### RSS Feeds
- **Purpose**: Configure RSS feeds to automatically import blog posts
- **Key Fields**:
  - **Name**: Display name for the feed
  - **Feed URL**: The RSS feed URL to sync
  - **Enabled**: Toggle to enable/disable syncing
  - **Auto Publish**: If enabled, imported posts are automatically published; otherwise, they're created as drafts
  - **Category**: Default category for imported posts
  - **Tags**: Default tags for imported posts
- **Syncing**:
  - Use the "Sync RSS Feed" button in the admin panel (see Jobs section)
  - Or use the API endpoint `/api/sync/rss` (requires authentication)

### Media
- **Purpose**: Upload and manage images, logos, and other media files
- **Usage**: Used for project logos, blog featured images, etc.
- **Features**:
  - Automatic image optimization
  - Focal point selection
  - Multiple size variants

### Signals
- **Purpose**: Cache GitHub statistics for projects
- **Auto-Generated**: Created automatically when GitHub data is fetched
- **Cache Duration**: 6 hours
- **Manual Refresh**: Use the refresh button on project detail pages or the GitHub API endpoint

### Transparency Logs
- **Purpose**: Audit log of all changes to projects
- **Auto-Generated**: Created automatically when projects are created, updated, or deleted
- **Information Tracked**:
  - Action type (Create, Update, SyncImport, Intake)
  - Actor type (System, User, Admin)
  - Timestamp
  - Before/after diffs

## Jobs & Scheduled Tasks

### RSS Feed Sync
- **Location**: Admin Panel → System → Sync Jobs
- **Manual Trigger**: 
  - Use the "Sync RSS Feed" button in the admin panel
  - Or POST to `/api/sync/rss` (requires admin authentication)
- **Automatic**: Configure via Vercel Cron Jobs (see DEPLOYMENT.md)

### GitHub Refresh
- **Purpose**: Refresh GitHub statistics for all projects
- **Manual Trigger**: Run `pnpm cron:github` locally or via Vercel Cron
- **Automatic**: Configure via Vercel Cron Jobs (see DEPLOYMENT.md)

### Lumenloop Sync
- **Purpose**: Import projects from the Lumenloop ecosystem database
- **Manual Trigger**: POST to `/api/sync/lumenloop` (requires admin authentication)
- **Note**: Requires `LUMENLOOP_PATH` environment variable or will clone the repo to `/tmp`

## Workflow: Approving User-Submitted Projects

1. Navigate to **Projects** collection
2. Filter by **Status: Draft** to see pending submissions
3. Review the project details:
   - Check the name, description, and category
   - Verify the website URL
   - Review GitHub repository links if provided
4. **Edit the project**:
   - Update status to **Development**, **Pre-Release**, or **Live**
   - Add or update verification level if applicable
   - Add project logo if needed
   - Associate with an entity if applicable
   - Add any missing information
5. **Save** the project - it will now appear on the frontend

## Workflow: Managing RSS Feeds

1. Navigate to **RSS Feeds** collection
2. **Create a new feed**:
   - Enter feed name and URL
   - Set category and tags (optional)
   - Enable "Auto Publish" if you want posts published immediately
   - Enable the feed
3. **Sync the feed**:
   - Click "Sync RSS Feed" button in the admin panel
   - Or use the API endpoint
4. **Monitor sync jobs**:
   - Check "Sync Jobs" collection to see sync status
   - Review any errors in the job logs

## Workflow: Associating Projects with Entities

1. Navigate to **Entities** collection
2. **Create or edit an entity**:
   - Enter entity name and slug
   - Add associated domains
   - Add links (website, GitHub, Twitter)
3. **Link projects**:
   - In the "Projects" field, select projects to associate
   - Multiple projects can be linked to one entity
4. **View on frontend**: Navigate to `/entities/[entity-slug]` to see all associated projects

## Best Practices

### Project Management
- Always review user submissions before approving
- Keep project information up-to-date
- Use appropriate status levels (Draft for work-in-progress, Live for public projects)
- Verify important projects with appropriate verification levels

### Content Management
- Regularly sync RSS feeds to keep blog content fresh
- Review auto-imported blog posts and adjust as needed
- Use appropriate categories and tags for better organization

### Security
- Keep admin credentials secure
- Regularly review transparency logs for suspicious activity
- Use strong passwords for admin accounts
- Limit admin access to trusted individuals only

### Performance
- GitHub statistics are cached for 6 hours to reduce API calls
- RSS feeds should be synced periodically (not too frequently to avoid rate limits)
- Large media files should be optimized before upload

## Troubleshooting

### Projects not appearing on frontend
- Check project status (must be Development, Pre-Release, or Live)
- Verify the project slug is unique
- Check browser console for errors

### RSS sync not working
- Verify the RSS feed URL is accessible
- Check the "Sync Jobs" collection for error messages
- Ensure the feed is enabled
- Verify network connectivity

### GitHub stats not updating
- Check if `GITHUB_TOKEN` environment variable is set
- Verify the repository URLs are correct
- Check rate limits (GitHub API has rate limits)
- Use the refresh parameter: `/api/projects/[id]/github?refresh=true`

### Media upload issues
- Check file size limits
- Verify file format is supported
- Ensure sufficient storage space

## API Endpoints (Admin Only)

All API endpoints require admin authentication via Payload CMS session cookies.

- `POST /api/sync/rss` - Sync all enabled RSS feeds
- `POST /api/sync/rss/[id]` - Sync a specific RSS feed
- `POST /api/sync/lumenloop` - Sync from Lumenloop database
- `GET /api/projects/[id]/github` - Fetch GitHub stats for a project
- `GET /api/projects/[id]/github?refresh=true` - Force refresh GitHub stats

## Support

For issues or questions:
1. Check the transparency logs for error details
2. Review sync job logs for sync-related issues
3. Check the deployment guide for environment variable configuration
4. Review the codebase documentation in `COLLECTIONS_EXPLANATION.md`

