# 🚀 Cloudflare R2 Setup Instructions

Your code is **ready for Cloudflare R2!** Follow these steps to get your credentials and enable persistent media storage.

## ✅ What's Already Done

- ✅ AWS SDK installed (`@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `@aws-sdk/s3-request-presigner`)
- ✅ Payload S3 storage adapter installed (`@payloadcms/storage-s3`)
- ✅ Configuration added to `payload.config.ts`
- ✅ Build tested and working
- ✅ Conditional loading (admin works with or without R2)

## 📋 Step-by-Step Setup

### Step 1: Create Cloudflare Account (2 minutes)

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up with your email
3. Verify your email address
4. You'll be redirected to the Cloudflare dashboard

**Cost**: FREE! (Hobby plan includes 10GB storage + unlimited egress)

---

### Step 2: Create R2 Bucket (3 minutes)

1. In Cloudflare dashboard, click **R2** in the left sidebar
   - If you don't see it, look for "Storage & Databases" → **R2**
2. Click **Create bucket**
3. Configure:
   - **Bucket name**: `stellarlight-media` (or any name you prefer)
   - **Location**: Select **Automatic** (recommended)
4. Click **Create bucket**

✅ **Bucket created!**

---

### Step 3: Generate API Credentials (5 minutes)

1. Still in the R2 section, click **Manage R2 API Tokens**
2. Click **Create API token**
3. Configure the token:
   - **Token name**: `stellarlight-uploads`
   - **Permissions**: Select **Object Read & Write**
   - **Specify bucket(s)**: Select your bucket (`stellarlight-media`)
   - **TTL**: Leave as default (no expiration) or set custom
4. Click **Create API Token**

🔑 **Important!** You'll see 3 values - **COPY THEM NOW** (shown only once):

```
Access Key ID: abc123...
Secret Access Key: xyz789...
Endpoint: https://abc123def456.r2.cloudflarestorage.com
```

Keep these safe! You'll need them in the next step.

---

### Step 4: Add Environment Variables to Vercel (5 minutes)

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Add these 5 variables (one at a time):

| Variable Name | Value | Example |
|---------------|-------|---------|
| `R2_ACCESS_KEY_ID` | Your Access Key ID | `abc123...` |
| `R2_SECRET_ACCESS_KEY` | Your Secret Access Key | `xyz789...` |
| `R2_ENDPOINT` | Your endpoint URL | `https://abc123def456.r2.cloudflarestorage.com` |
| `R2_BUCKET` | Your bucket name | `stellarlight-media` |
| `R2_REGION` | Always use `auto` | `auto` |

**For each variable:**
- Click **Add New**
- Enter the **Key** (variable name)
- Enter the **Value**
- Select all environments: ✅ Production ✅ Preview ✅ Development
- Click **Save**

✅ **All variables added!**

---

### Step 5: Deploy to Vercel (2 minutes)

Your code is already committed to git. Just push it:

```bash
git commit -m "feat: add cloudflare r2 storage for media uploads"
git push
```

**Or** trigger a redeploy from Vercel dashboard:
1. Go to **Deployments** tab
2. Click the three dots on latest deployment
3. Click **Redeploy**

⏳ Wait ~2-3 minutes for the build to complete.

---

### Step 6: Test Media Uploads (3 minutes)

1. Visit `https://your-domain.vercel.app/admin`
2. Navigate to **Collections** → **Media**
3. Click **Create New**
4. Upload a test image
5. Fill in the **alt text** field
6. Click **Save**

✅ **Success!** You should see:
- File uploaded successfully
- Image appears in the media library
- URL points to R2 (ends with `.r2.cloudflarestorage.com`)

---

### Step 7: Verify in Cloudflare (1 minute)

1. Go back to Cloudflare dashboard → **R2**
2. Click on your bucket (`stellarlight-media`)
3. You should see your uploaded file!

🎉 **Cloudflare R2 is working!**

---

## 🔍 Local Development (Optional)

To test R2 locally:

```bash
# Pull environment variables from Vercel
vercel env pull

# Start dev server
pnpm dev
```

Or manually create `.env.local`:

```env
R2_ACCESS_KEY_ID=your_access_key_here
R2_SECRET_ACCESS_KEY=your_secret_key_here
R2_ENDPOINT=https://abc123.r2.cloudflarestorage.com
R2_BUCKET=stellarlight-media
R2_REGION=auto
```

---

## 📊 Free Tier Limits

Your free tier includes:

- **Storage**: 10 GB/month
- **Class A operations**: 1 million/month (uploads, lists)
- **Class B operations**: 10 million/month (downloads)
- **Egress**: **UNLIMITED** (this is HUGE - AWS charges for this!)

Perfect for demos and small projects!

---

## 🐛 Troubleshooting

### "SignatureDoesNotMatch" error

❌ **Problem**: Invalid credentials

✅ **Solution**:
- Verify Access Key ID has no spaces
- Verify Secret Access Key has no spaces
- Check endpoint URL is correct
- Regenerate API token if needed

### Uploads succeed but files return 404

❌ **Problem**: Bucket permissions or wrong endpoint

✅ **Solution**:
- Verify bucket name matches `R2_BUCKET` variable
- Check endpoint URL includes `https://`
- Ensure bucket is in same Cloudflare account as API token

### Admin panel doesn't show upload

❌ **Problem**: R2 variables not set

✅ **Solution**:
- Verify all 5 environment variables are set in Vercel
- Check they're enabled for all environments
- Redeploy after adding variables

---

## 💰 Pricing After Free Tier

If you exceed free tier (unlikely for a demo):

- **Storage**: $0.015/GB/month (~$0.15 for 10GB over free tier)
- **Class A**: $4.50/million requests
- **Class B**: $0.36/million requests
- **Egress**: **FREE** (vs AWS: $0.09/GB)

**Comparison**: For 100GB transfer + 50GB storage:
- AWS S3: ~$14/month
- Cloudflare R2: ~$0.75/month

---

## ✅ Success Checklist

After setup, you should have:

- [x] Cloudflare account created
- [x] R2 bucket created
- [x] API token generated
- [x] 5 environment variables added to Vercel
- [x] Code deployed to Vercel
- [x] Test image uploaded successfully
- [x] File visible in Cloudflare R2 dashboard
- [x] Admin panel working
- [x] Media collection functional

---

## 🎉 You're Done!

Media uploads now work and persist across deployments!

**Next steps:**
- Upload project logos
- Add featured images to blog posts
- Upload entity logos
- Everything persists permanently

If you have any issues, check the troubleshooting section above.

