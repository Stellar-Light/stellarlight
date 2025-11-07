# Deployment Guide - Stellar Light

This guide will help you deploy Stellar Light to Vercel.

## Prerequisites

- Vercel account
- MongoDB database (MongoDB Atlas recommended)
- GitHub repository
- Environment variables configured

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

Vercel Cron Jobs are configured in `vercel.json`. The cron jobs will automatically run:

- **GitHub Refresh**: Every 6 hours (`/api/cron/github-refresh`)
- **RSS Sync**: Every 4 hours (`/api/cron/rss-sync`)

### Important: Set CRON_SECRET

Vercel will automatically add an `Authorization` header to cron requests. You need to:

1. Set the `CRON_SECRET` environment variable in Vercel
2. Vercel will send requests with `Authorization: Bearer ${CRON_SECRET}`
3. The cron endpoints verify this secret

**Note**: In Vercel, you can also use the built-in `VERCEL_CRON_SECRET` which is automatically set. Update the cron route files to use `VERCEL_CRON_SECRET` if you prefer.

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
- Verify `MONGODB_URI` is correct
- Check MongoDB Atlas IP whitelist (allow all IPs: `0.0.0.0/0`)
- Verify database user has correct permissions

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

