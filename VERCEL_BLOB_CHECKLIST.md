# Vercel Blob Storage Setup Checklist

## ✅ Implementation Verification

This implementation follows **official documentation**:
- ✅ [Vercel Blob Documentation](https://vercel.com/docs/vercel-blob)
- ✅ [Payload CMS Storage Adapters](https://payloadcms.com/docs/upload/storage-adapters)

## 📦 Installed Packages

```json
{
  "@payloadcms/storage-vercel-blob": "^3.63.0",
  "@vercel/blob": "^2.0.0"
}
```

## ⚙️ Configuration

Located in `src/payload.config.ts`:

```typescript
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob';

// Inside buildConfig
plugins: [
  payloadCloudPlugin(),
  vercelBlobStorage({
    enabled: true,
    collections: {
      media: true, // Matches the 'media' collection slug
    },
    token: process.env.BLOB_READ_WRITE_TOKEN,
  }),
]
```

✅ **Configuration matches official Payload CMS documentation**

## 🔧 Setup Steps (IN THIS ORDER)

### Step 1: Create Blob Storage in Vercel

1. Go to your Vercel project dashboard
2. Click **Storage** tab
3. Click **Create Database** → Select **Blob**
4. Name it (e.g., `stellarlight-media`)
5. Click **Create**

**Expected Result**: Vercel creates the Blob store and automatically sets `BLOB_READ_WRITE_TOKEN`

### Step 2: Verify Environment Variable

1. Go to **Settings** → **Environment Variables**
2. Confirm `BLOB_READ_WRITE_TOKEN` exists
3. Should be set for: **Production**, **Preview**, **Development**
4. Value starts with: `vercel_blob_rw_`

### Step 3: 🚨 CRITICAL - Redeploy Your Application

**Why?** The token must be available at build time. If you deployed before creating Blob storage, the build didn't have access to the token.

**How to redeploy:**

Option A - Push a new commit:
```bash
git add .
git commit -m "fix: configure vercel blob storage"
git push
```

Option B - Manual redeploy in Vercel:
1. Go to **Deployments** tab
2. Click three dots on latest deployment
3. Click **Redeploy**

### Step 4: Wait for Build to Complete

1. Watch the build logs
2. Confirm no errors related to `BLOB_READ_WRITE_TOKEN`
3. Build should complete successfully

### Step 5: Test the Admin Panel

1. Visit `https://your-domain.vercel.app/admin`
2. Should load without `useUploadHandlers` error
3. Navigate to **Collections** → **Media**
4. Try uploading a test image
5. Verify upload succeeds

### Step 6: Verify File Storage

1. Go to Vercel dashboard → **Storage** → Your Blob store
2. Click **Browse**
3. You should see your uploaded file
4. Public URL should be accessible

## 🐛 Troubleshooting

### Error: "useUploadHandlers must be used within UploadHandlersProvider"

**Cause**: `BLOB_READ_WRITE_TOKEN` is not available at runtime

**Solution**:
1. ✅ Verify Blob storage is created (Storage tab)
2. ✅ Verify token exists (Settings → Environment Variables)
3. ✅ **Redeploy the application** (this is usually the missing step)
4. ✅ Wait for deployment to complete
5. ✅ Clear browser cache and reload `/admin`

### Error: "Cannot find module '@payloadcms/storage-vercel-blob'"

**Solution**:
```bash
pnpm add @payloadcms/storage-vercel-blob @vercel/blob
```

### Error: Files upload but return 404

**Cause**: Blob storage might be in a different region or token is invalid

**Solution**:
1. Check Blob store region in Vercel dashboard
2. Verify token is correct
3. Check Vercel Blob dashboard for uploaded files
4. Confirm public access is enabled

### Uploads fail for files > 4.5MB

**Cause**: Vercel serverless function limit

**Solution**: Enable client-side uploads in `payload.config.ts`:
```typescript
vercelBlobStorage({
  enabled: true,
  collections: {
    media: true,
  },
  token: process.env.BLOB_READ_WRITE_TOKEN,
  clientUploads: true, // Add this line
})
```

## 📊 Vercel Blob Limits (Hobby Plan)

- **Storage**: 1 GB free
- **Bandwidth**: 100 GB/month free
- **Operations**: Counts for list, upload, head, copy
- **Pricing after free tier**: $0.15/GB storage, $0.40/GB bandwidth

## 🔒 Security Notes

- Token is automatically scoped to your project
- Token should never be committed to git
- Token is automatically injected by Vercel at build/runtime
- Files are stored in Vercel's S3-backed infrastructure
- 99.999999999% (11 nines) durability
- 99.99% availability

## ✅ Final Checklist

Before considering setup complete:

- [ ] Blob storage created in Vercel dashboard
- [ ] `BLOB_READ_WRITE_TOKEN` exists in environment variables
- [ ] Application redeployed AFTER creating Blob storage
- [ ] Build completed successfully
- [ ] `/admin` page loads without errors
- [ ] Test image uploaded successfully
- [ ] Uploaded file visible in Vercel Blob dashboard
- [ ] Uploaded file accessible via public URL
- [ ] MongoDB Atlas connection working (for metadata)
- [ ] Cron jobs configured and tested

## 📚 Additional Resources

- [Vercel Blob Documentation](https://vercel.com/docs/vercel-blob)
- [Payload CMS Storage Adapters](https://payloadcms.com/docs/upload/storage-adapters)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [Vercel Blob Pricing](https://vercel.com/docs/vercel-blob#pricing)

