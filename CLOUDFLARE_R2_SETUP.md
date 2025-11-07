# Cloudflare R2 Setup Guide

## Why R2?

- ✅ **FREE**: 10GB storage, unlimited egress
- ✅ **S3-compatible**: Standard API, works with Payload
- ✅ **Fast**: Global CDN
- ✅ **Easy**: 15 minute setup
- ✅ **Already have the package**: `@payloadcms/plugin-cloud-storage` installed

## Setup Steps

### Step 1: Create Cloudflare Account

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up (free account)
3. Verify email

### Step 2: Create R2 Bucket

1. In Cloudflare dashboard, click **R2** in sidebar
2. Click **Create bucket**
3. Name: `stellarlight-media` (or any name)
4. Location: Automatic
5. Click **Create bucket**

### Step 3: Get API Credentials

1. In R2 dashboard, click **Manage R2 API Tokens**
2. Click **Create API token**
3. Token name: `stellarlight-upload`
4. Permissions: **Object Read & Write**
5. Click **Create API Token**
6. **SAVE THESE VALUES** (shown only once):
   - Access Key ID
   - Secret Access Key
   - Endpoint (e.g., `https://abc123.r2.cloudflarestorage.com`)

### Step 4: Add Environment Variables

Add to Vercel (and `.env.local` for local dev):

```bash
# Cloudflare R2
R2_ACCESS_KEY_ID=your_access_key_here
R2_SECRET_ACCESS_KEY=your_secret_key_here
R2_ENDPOINT=https://abc123.r2.cloudflarestorage.com
R2_BUCKET=stellarlight-media
R2_REGION=auto
```

### Step 5: Install S3 Adapter

```bash
cd stellarlight
pnpm add @aws-sdk/client-s3 @aws-sdk/lib-storage
```

### Step 6: Configure Payload

Update `src/payload.config.ts`:

```typescript
import { s3Storage } from '@payloadcms/plugin-cloud-storage/s3'

export default buildConfig({
  // ... existing config
  plugins: [
    payloadCloudPlugin(),
    s3Storage({
      collections: {
        media: true, // Enable for media collection
      },
      bucket: process.env.R2_BUCKET,
      config: {
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
        region: process.env.R2_REGION || 'auto',
        endpoint: process.env.R2_ENDPOINT,
        forcePathStyle: true, // Required for R2
      },
    }),
  ],
})
```

### Step 7: Deploy

```bash
git add .
git commit -m "feat: add cloudflare r2 storage for media uploads"
git push
```

### Step 8: Test

1. Wait for Vercel deployment
2. Go to `/admin`
3. Navigate to Media collection
4. Upload a test image
5. Verify it appears in Cloudflare R2 dashboard

## Environment Variables Reference

| Variable | Value | Where to Find |
|----------|-------|---------------|
| `R2_ACCESS_KEY_ID` | Access key | Cloudflare R2 → API tokens |
| `R2_SECRET_ACCESS_KEY` | Secret key | Cloudflare R2 → API tokens |
| `R2_ENDPOINT` | `https://...r2.cloudflarestorage.com` | Cloudflare R2 → API tokens |
| `R2_BUCKET` | `stellarlight-media` | Name you chose for bucket |
| `R2_REGION` | `auto` | Always use `auto` for R2 |

## Local Development

```bash
# Pull environment variables from Vercel
vercel env pull

# Or manually add to .env.local
```

## Free Tier Limits

- **Storage**: 10 GB/month
- **Class A operations**: 1 million/month (PUT, POST, LIST)
- **Class B operations**: 10 million/month (GET, HEAD)
- **Egress**: **UNLIMITED** (this is huge - AWS charges for this!)

## Pricing After Free Tier

- **Storage**: $0.015/GB/month
- **Class A**: $4.50/million requests
- **Class B**: $0.36/million requests
- **Egress**: **FREE** (vs AWS which charges $0.09/GB!)

## Troubleshooting

### "SignatureDoesNotMatch" error

- Check endpoint URL is correct
- Verify access keys have no extra spaces
- Ensure `forcePathStyle: true` is set

### Files upload but return 404

- Check bucket name matches
- Verify R2 bucket is in same Cloudflare account
- Check bucket permissions

### Uploads work locally but not on Vercel

- Verify environment variables are set in Vercel
- Check they're set for all environments (Production, Preview, Development)
- Redeploy after adding environment variables

## Comparison vs Vercel Blob

| Feature | Vercel Blob | Cloudflare R2 |
|---------|-------------|---------------|
| Setup | Failed | Works |
| Free storage | 1 GB | 10 GB |
| Free bandwidth | 100 GB | Unlimited |
| Payload integration | Broken | Works |
| Cost after free | Higher | Lower |
| **Winner** | ❌ | ✅ |

## Ready to Implement?

Let me know and I'll:
1. Add the S3 SDK packages
2. Update payload.config.ts
3. Create migration script if needed
4. Test and deploy

Or would you prefer to keep current setup (admin works, media doesn't persist)?

