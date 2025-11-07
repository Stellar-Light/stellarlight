# Media Storage Options for Stellar Light

## Current Status

✅ **Admin panel working** - Vercel Blob disabled
⚠️ **Media uploads** - Fall back to local storage (not persistent on Vercel)

## Storage Options

### Option 1: MongoDB GridFS (Recommended for Demo) ⭐

**Pros:**
- ✅ Already configured (MongoDB is working)
- ✅ No external services needed
- ✅ No tokens to manage
- ✅ Free with MongoDB Atlas
- ✅ Built-in Payload CMS support
- ✅ Self-contained solution

**Cons:**
- ⚠️ Not ideal for very large files (>16MB per file)
- ⚠️ Slightly slower than CDN for serving files
- ⚠️ No built-in image optimization

**Setup Complexity:** ⭐ Very Simple (just configuration)

**Best for:** Demos, small projects, self-contained applications

---

### Option 2: Cloudflare R2 (Recommended for Production)

**Pros:**
- ✅ S3-compatible (standard API)
- ✅ Free tier: 10GB storage, 10M Class A operations/month
- ✅ No egress fees (free bandwidth!)
- ✅ Fast global CDN
- ✅ Well-documented Payload CMS integration
- ✅ More reliable than Vercel Blob with Payload

**Cons:**
- ⚠️ Requires Cloudflare account
- ⚠️ External service to manage

**Setup Complexity:** ⭐⭐ Moderate

**Best for:** Production apps, high traffic, many media files

---

### Option 3: AWS S3

**Pros:**
- ✅ Industry standard
- ✅ Extremely reliable
- ✅ Well-supported by Payload CMS
- ✅ Advanced features (lifecycle policies, versioning, etc.)

**Cons:**
- ⚠️ More expensive than R2
- ⚠️ Egress fees apply
- ⚠️ Complex pricing

**Setup Complexity:** ⭐⭐⭐ Complex

**Best for:** Enterprise production apps

---

### Option 4: Uploadthing

**Pros:**
- ✅ Built specifically for uploads
- ✅ Simple setup
- ✅ Free tier: 2GB storage, 10GB bandwidth
- ✅ Automatic image optimization
- ✅ Good developer experience

**Cons:**
- ⚠️ Another external service
- ⚠️ Less flexible than S3-compatible options

**Setup Complexity:** ⭐⭐ Moderate

**Best for:** Apps focused on user uploads, need image optimization

---

### Option 5: Vercel Blob ❌ (Not Recommended)

**Status:** Failed multiple times

**Issues:**
- ❌ `@payloadcms/storage-vercel-blob` adapter causes runtime errors
- ❌ `useUploadHandlers must be used within UploadHandlersProvider`
- ❌ Import map complications
- ❌ Not worth debugging for demo project

**Tried fixes:**
1. Conditional plugin loading
2. Import map regeneration
3. Token verification
4. Multiple configuration formats

**Conclusion:** The Payload CMS adapter for Vercel Blob appears to have fundamental compatibility issues.

---

## Recommendation

### For Your Demo Project: MongoDB GridFS

Since you want it to "work fully out of the box":

1. **Simplest solution** - No external services
2. **Self-contained** - Everything in MongoDB
3. **Free** - Included with MongoDB Atlas
4. **Reliable** - Native Payload CMS support

### Implementation Steps (MongoDB GridFS)

**Current behavior:**
- Media uploads use Payload's default file storage
- Files stored in `/media` directory (local filesystem)
- On Vercel: Read-only filesystem, uploads fail

**With MongoDB GridFS:**
- Files stored in MongoDB database
- Persistent across deployments
- No external services needed
- Works on Vercel without modifications

**No additional packages needed** - Payload CMS + MongoDB adapter already supports file storage!

### For Production Later: Cloudflare R2

When you move beyond demo:
- S3-compatible API
- Free egress bandwidth
- Better performance than MongoDB for media
- More scalable

---

## Current Configuration

```typescript
// payload.config.ts
db: mongooseAdapter({
  url: process.env.MONGODB_URI || process.env.DATABASE_URI || "",
  connectOptions: {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  },
}),

plugins: [
  payloadCloudPlugin(),
  // No storage plugin - using default file storage
]
```

## Next Steps

1. **Keep current setup** - Admin panel works, MongoDB stores metadata
2. **Accept trade-off** - Media uploads won't persist on Vercel (demo limitation)
3. **OR** Add MongoDB GridFS support (files stored in database)
4. **OR** Add Cloudflare R2 (external CDN storage)

Which would you like to implement?

