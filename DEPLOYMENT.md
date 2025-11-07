# Deployment Guide - Stellar Light

This guide will help you deploy Stellar Light to Vercel.

## Prerequisites

- Vercel account
- MongoDB database (MongoDB Atlas recommended)
- GitHub repository
- Environment variables configured
- Node.js 18.20.2+ or 20.9.0+ (automatically handled by Vercel)

## Step 1: Prepare Your Repository

1. Ensure all code is committed and pushed to your GitHub repository
2. Verify the project builds successfully:
   ```bash
   pnpm install
   pnpm build
   ```

## Step 2: Set Up MongoDB

1. Create a MongoDB Atlas account (or use another MongoDB provider)
2. Create a new cluster
3. Create a database user with read/write permissions
4. Get your connection string (MongoDB URI)
   - Format: `mongodb+srv://username:password@cluster.mongodb.net/database-name?retryWrites=true&w=majority`

## Step 3: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `stellarlight` (if your project is in a subdirectory)
   - **Build Command**: `pnpm build`
   - **Output Directory**: `.next`
   - **Install Command**: `pnpm install`

### Option B: Deploy via Vercel CLI

```bash
npm i -g vercel
cd stellarlight
vercel
```

Follow the prompts to link your project.

## Step 4: Configure Environment Variables

In your Vercel project settings, add the following environment variables:

### Required Variables

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

### Optional Variables

```env
# GitHub API (for enhanced rate limits)
GITHUB_TOKEN=ghp_your_github_personal_access_token

# Lumenloop Sync (optional)
LUMENLOOP_PATH=/path/to/lumenloop/repo
```

### Generating Secrets

Generate secure random strings for secrets:

```bash
# For PAYLOAD_SECRET (minimum 32 characters)
openssl rand -base64 32

# For CRON_SECRET
openssl rand -base64 32
```

## Step 5: Configure Vercel Cron Jobs

Vercel Cron Jobs are configured in `vercel.json`. 

### ⚠️ Important: Vercel Plan Limitations

**Hobby Plan (Free)**: Limited to **daily cron jobs** (once per day maximum)

**Current Configuration (Hobby-compatible)**:
- **GitHub Refresh**: Daily at 2:00 AM UTC (`0 2 * * *`)
- **RSS Sync**: Daily at 4:00 AM UTC (`0 4 * * *`)

**Pro Plan**: Allows multiple runs per day (unlimited cron frequency)

### Upgrading to More Frequent Cron Jobs

If you upgrade to Vercel Pro plan, you can update `vercel.json` to run more frequently:

```json
{
  "crons": [
    {
      "path": "/api/cron/github-refresh",
      "schedule": "0 */6 * * *"  // Every 6 hours (4 times per day)
    },
    {
      "path": "/api/cron/rss-sync",
      "schedule": "0 */4 * * *"   // Every 4 hours (6 times per day)
    }
  ]
}
```

**Recommended schedules for Pro plan**:
- GitHub Refresh: `0 */6 * * *` (every 6 hours) - balances freshness with API rate limits
- RSS Sync: `0 */4 * * *` (every 4 hours) - keeps blog content fresh

### Setting Up Cron Jobs

1. Set the `CRON_SECRET` environment variable in Vercel
2. Vercel will automatically send requests with `Authorization: Bearer ${CRON_SECRET}`
3. The cron endpoints verify this secret for security

**Note**: In Vercel, you can also use the built-in `VERCEL_CRON_SECRET` which is automatically set. The cron routes support both `CRON_SECRET` and `VERCEL_CRON_SECRET`.

## Step 6: Verify Deployment

1. Visit your deployed site
2. Navigate to `/admin` to access the admin panel
3. Create your first admin user
4. Test key functionality:
   - Create a test project
   - Upload media
   - Test RSS feed sync
   - Verify GitHub stats refresh

## Step 7: Post-Deployment Checklist

- [ ] Admin panel is accessible
- [ ] Database connections are working
- [ ] Projects can be created and updated
- [ ] Media uploads work
- [ ] RSS feeds can be synced
- [ ] GitHub stats are refreshing
- [ ] Cron jobs are running (check Vercel logs)
- [ ] Frontend pages load correctly
- [ ] Environment variables are set correctly

## Troubleshooting

### Build Failures

**Error: Module not found**
- Ensure all dependencies are in `package.json`
- Run `pnpm install` locally to verify

**Error: Payload config issues**
- Verify `PAYLOAD_SECRET` is set
- Check `MONGODB_URI` is correct
- Ensure `NEXT_PUBLIC_APP_URL` matches your domain

### Runtime Errors

**Database Connection Issues**

The most common MongoDB connection error is an SSL/TLS error. Here's how to fix it:

1. **Verify MongoDB Connection String Format**
   - Your `MONGODB_URI` should look like:
     ```
     mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
     ```
   - For MongoDB Atlas, ensure the connection string includes SSL parameters
   - The connection string should NOT include `ssl=true` explicitly (MongoDB Atlas handles this automatically)

2. **Check MongoDB Atlas IP Whitelist**
   - Go to MongoDB Atlas → Network Access
   - Add `0.0.0.0/0` to allow all IPs (or add Vercel's IP ranges)
   - Wait a few minutes for changes to propagate

3. **Verify Database User Permissions**
   - Ensure your database user has read/write permissions
   - Check that the user can access the correct database

4. **Connection String from MongoDB Atlas**
   - In MongoDB Atlas, go to Database → Connect → Drivers
   - Select "Node.js" and copy the connection string
   - Replace `<password>` with your actual password
   - Replace `<database>` with your database name

5. **If Connection Still Fails**
   - The app will now gracefully handle connection failures and show empty pages instead of crashing
   - Check Vercel function logs for detailed error messages
   - Verify the connection string works locally first

**Cron Jobs Not Running**
- Check Vercel Cron configuration in dashboard
- Verify `CRON_SECRET` is set
- Check Vercel function logs for errors
- Ensure cron routes are accessible (not blocked by middleware)

**GitHub API Rate Limits**
- Add `GITHUB_TOKEN` environment variable
- Check GitHub API rate limit status
- Reduce cron job frequency if needed

### Performance Issues

**Slow Build Times**
- Vercel automatically optimizes builds
- Consider using Vercel's Edge Network
- Optimize images before upload

**Database Performance**
- Use MongoDB Atlas connection pooling
- Add appropriate indexes (Payload CMS handles this automatically)
- Monitor database usage in MongoDB Atlas dashboard

## Environment Variables Reference

| Variable | Required | Description |
|-----------|-----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `DATABASE_URI` | Yes* | Alternative to MONGODB_URI |
| `PAYLOAD_SECRET` | Yes | Secret key for Payload CMS (min 32 chars) |
| `NEXT_PUBLIC_APP_URL` | Yes | Your deployed site URL |
| `CRON_SECRET` | Yes | Secret for securing cron endpoints |
| `GITHUB_TOKEN` | No | GitHub personal access token for API |
| `LUMENLOOP_PATH` | No | Path to Lumenloop repo (for sync) |

*Either `MONGODB_URI` or `DATABASE_URI` is required

## Cron Job Configuration Reference

### Current Schedule (Hobby Plan Compatible)

The cron jobs are configured in `vercel.json` with daily schedules:

- **GitHub Refresh**: `0 2 * * *` (2:00 AM UTC daily)
- **RSS Sync**: `0 4 * * *` (4:00 AM UTC daily)

### Cron Expression Format

Cron expressions use the format: `minute hour day month weekday`

Examples:
- `0 2 * * *` - Daily at 2:00 AM UTC
- `0 */6 * * *` - Every 6 hours (requires Pro plan)
- `0 */4 * * *` - Every 4 hours (requires Pro plan)
- `0 0 * * *` - Daily at midnight UTC
- `0 12 * * *` - Daily at noon UTC

### Changing Cron Schedules

1. Edit `vercel.json` in your repository
2. Update the `schedule` field for the desired cron job
3. Commit and push the changes
4. Vercel will automatically update the cron schedule on the next deployment

**Note**: Remember that Hobby plans are limited to daily cron jobs. If you need more frequent runs, upgrade to Pro plan first.

## Node.js Version Configuration

Your `package.json` specifies Node.js version requirements:

```json
"engines": {
  "node": "^18.20.2 || >=20.9.0",
  "pnpm": "^9 || ^10"
}
```

### Automatic Version Updates

Vercel will automatically use a compatible Node.js version based on your `engines` field. When new major Node.js versions are released that match your specification (e.g., Node.js 21, 22, etc.), Vercel may automatically upgrade your deployment.

**This is normal behavior** and ensures your application stays on supported Node.js versions.

### Pinning a Specific Node.js Version

If you need to pin to a specific Node.js version (e.g., for stability), you can:

1. **Option 1**: Update `package.json` to specify an exact version:
   ```json
   "engines": {
     "node": "20.9.0",
     "pnpm": "^9 || ^10"
   }
   ```

2. **Option 2**: Set the Node.js version in Vercel project settings:
   - Go to Project Settings → General
   - Set "Node.js Version" to your desired version (e.g., 20.x)

**Recommendation**: Keep the current flexible version specification unless you encounter compatibility issues. This ensures you get security updates and bug fixes automatically.

## Security Best Practices

1. **Never commit secrets**: All secrets should be in Vercel environment variables
2. **Use strong secrets**: Generate random strings for `PAYLOAD_SECRET` and `CRON_SECRET`
3. **Limit admin access**: Only trusted users should have admin accounts
4. **Monitor logs**: Regularly check Vercel function logs for suspicious activity
5. **Keep dependencies updated**: Regularly update npm packages for security patches
6. **Use HTTPS**: Vercel automatically provides HTTPS
7. **Database security**: Use MongoDB Atlas IP whitelisting and strong passwords

## Monitoring

### Vercel Dashboard
- Check deployment logs
- Monitor function execution times
- Review error logs
- Check cron job execution history

### MongoDB Atlas
- Monitor database performance
- Check connection metrics
- Review query performance
- Set up alerts for unusual activity

### Application Logs
- Check Payload CMS transparency logs in admin panel
- Review sync job logs in admin panel
- Monitor GitHub API rate limits

## Updating the Deployment

1. Push changes to your GitHub repository
2. Vercel will automatically detect and deploy
3. Monitor the deployment in Vercel dashboard
4. Verify the deployment works correctly
5. Check cron jobs are still running

## Rollback

If a deployment fails:

1. Go to Vercel dashboard
2. Navigate to your project
3. Go to "Deployments" tab
4. Find the last working deployment
5. Click "..." menu → "Promote to Production"

## Support

For issues:
1. Check Vercel deployment logs
2. Review MongoDB Atlas connection status
3. Check environment variables are set correctly
4. Review the admin panel transparency logs
5. Check cron job execution logs in Vercel

