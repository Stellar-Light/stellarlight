# Production: Intermittent Failures - MongoDB Atlas M0 Connection Pool Exhaustion

## Summary

Production is experiencing intermittent failures with a **1.8% error rate** on Vercel Functions, primarily caused by MongoDB Atlas M0 free tier limitations hitting connection pool exhaustion during traffic spikes.

---

## Evidence

### Vercel Observability Metrics
- 1.8% error rate on serverless functions (~7-8 failures per 400 requests)
- Peak traffic: ~400 requests/minute
- CPU spikes up to 25 seconds during errors
- Data transfer: 29MB outgoing / 8MB incoming (healthy)

### Server Logs
```
MongoServerSelectionError: SSL/TLS alert internal error
Node.js process exited with exit status: 1
500 errors on /api/users/me and /admin endpoints
```

### Failure Pattern
- Intermittent (not consistent)
- Correlates with traffic spikes
- Affects both frontend and admin panel

---

## Root Cause

### MongoDB Atlas M0 Free Tier Bottlenecks

| Limitation | Impact |
|------------|--------|
| 100 connections max (shared) | Pool exhaustion during traffic spikes |
| 512 MB storage | Limited capacity |
| Shared CPU/RAM | No guaranteed resources |
| Throttled I/O | Network bandwidth limits |
| SSL/TLS overhead | Extra latency on every connection |

### Serverless Amplification Effect
- Each Vercel function cold start creates new MongoDB connections
- Connections persist for 5-10 minutes after function execution
- Peak traffic: `400 req/min × 10-20 concurrent functions = 50-100 active connections`
- Result: M0 limit (100 shared) reached → failures

---

## Impact

- **User Experience:** 1.8% of requests fail (poor reliability)
- **Admin Access:** Occasional 500 errors when accessing admin panel
- **Business Risk:** Unpredictable failures during traffic spikes
- **Growth Blocker:** Cannot scale beyond current traffic levels

---

## Solution Options

### Option 1: MongoDB Flex Cluster (Recommended) ⭐

**Best for:** Current scale, pay-per-use billing, minimal changes

**Pros:**
- ✅ **Easiest migration:** Zero code changes, zero downtime
- ✅ **Cost-effective:** $0.011/hr (~$10-15/month for current traffic)
- ✅ **Hard cap:** Never exceeds $30/month
- ✅ **5 GB storage** (10x more than M0)
- ✅ **Burst capacity** for traffic spikes
- ✅ **85-90% error reduction** expected

**Cons:**
- ⚠️ Still shared resources (not dedicated)
- ⚠️ May need further optimization if traffic grows 5x

| | |
|---|---|
| **Cost** | $10-15/month (capped at $30) |
| **Effort** | Low (1 hour) |
| **Risk** | Very Low |

**Implementation:**
1. MongoDB Atlas → Edit Cluster → Select "Flex"
2. Deploy (zero downtime)
3. Monitor for 48 hours

---

### Option 2: MongoDB M10 Dedicated Cluster

**Best for:** Guaranteed performance, high traffic growth plans

**Pros:**
- ✅ **Dedicated resources:** 2GB RAM + 2 vCPUs
- ✅ **Zero code changes** required
- ✅ **99.9% error reduction** (rock-solid)
- ✅ **Handles 10,000+ req/min** easily
- ✅ **Auto-scaling** available

**Cons:**
- ⚠️ **6x more expensive** than Flex (~$57/month)
- ⚠️ Overkill for current 400 req/min traffic

| | |
|---|---|
| **Cost** | ~$57/month |
| **Effort** | Low (1 hour) |
| **Risk** | Very Low |

**When to choose:** If Flex doesn't reduce errors below 0.5%, or planning rapid growth.

---

### Option 3: Vercel Postgres + Drizzle ORM

**Best for:** Long-term serverless optimization, Vercel ecosystem

**Pros:**
- ✅ **Serverless-native:** No connection pool issues
- ✅ **Built-in with Vercel:** Tight integration
- ✅ **Better performance** for serverless
- ✅ **Automatic scaling**
- ✅ **Type-safe queries** with Drizzle

**Cons:**
- ⚠️ **Migration required:** Payload CMS → custom DB layer
- ⚠️ **High effort:** 2-3 weeks of development
- ⚠️ Lose Payload CMS admin UI (would need custom admin)
- ⚠️ **Breaking change** to architecture

| | |
|---|---|
| **Cost** | $20/month (Vercel Postgres Starter) |
| **Effort** | High (40-60 hours) |
| **Risk** | Medium (requires migration) |

**Implementation:**
1. Set up Vercel Postgres
2. Design schema in Drizzle
3. Migrate data from MongoDB
4. Rebuild admin panel (or use separate admin service)
5. Update all API endpoints

---

### Option 4: PlanetScale MySQL Serverless

**Best for:** Serverless database with branching, MySQL ecosystem

**Pros:**
- ✅ **Serverless-native:** Designed for serverless functions
- ✅ **Database branching:** Like Git for databases
- ✅ **No connection limits**
- ✅ **Automatic scaling**
- ✅ **Free tier available** (5 GB)

**Cons:**
- ⚠️ **Migration required:** MongoDB → MySQL
- ⚠️ **High effort:** Schema redesign + data migration
- ⚠️ Lose Payload CMS (MongoDB-only)
- ⚠️ **Breaking change** to architecture

| | |
|---|---|
| **Cost** | $0 (Free tier) / $39/month (Pro) |
| **Effort** | High (60-80 hours) |
| **Risk** | High (complete migration) |

**Implementation:**
1. Design MySQL schema
2. Migrate MongoDB data to PlanetScale
3. Rebuild API with Prisma/Drizzle
4. Create custom admin panel

---

### Option 5: Add Caching Layer (Vercel KV / Upstash Redis)

**Best for:** Reducing database load, keeping current MongoDB setup

**Pros:**
- ✅ **Reduces MongoDB hits** by 60-80%
- ✅ **Fast response times** (Redis sub-millisecond)
- ✅ **Works with current setup** (additive, not replacement)
- ✅ **Easy to implement** (cache wrapper)

**Cons:**
- ⚠️ **Additional cost** ($10-20/month)
- ⚠️ **Cache invalidation** complexity
- ⚠️ Doesn't solve connection pool issue entirely
- ⚠️ Still need to upgrade MongoDB eventually

| | |
|---|---|
| **Cost** | $10/month (Vercel KV) or $10/month (Upstash) |
| **Effort** | Medium (8-16 hours) |
| **Risk** | Low |

**Implementation:**
```typescript
// Example: Cache banner data
import { kv } from '@vercel/kv';

export async function getBanner() {
  // Try cache first
  const cached = await kv.get('banner');
  if (cached) return cached;
  
  // Fallback to MongoDB
  const banner = await payload.findGlobal({ slug: 'banner' });
  await kv.set('banner', banner, { ex: 300 }); // 5 min TTL
  return banner;
}
```

**Best used in combination with:** Flex or M10 upgrade

---

### Option 6: Heavy Optimization on M0 (Last Resort)

**Best for:** Temporary fix while planning migration

**Pros:**
- ✅ Free (no additional cost)
- ✅ Buys time to evaluate other options
- ✅ No migration required

**Cons:**
- ⚠️ Limited impact: 30-40% error reduction at best
- ⚠️ Not a long-term solution
- ⚠️ Still hits M0 limits during spikes
- ⚠️ Adds code complexity

| | |
|---|---|
| **Cost** | $0 |
| **Effort** | Medium (8-12 hours) |
| **Risk** | Low (reversible) |

**Implementation:**

**A. Aggressive Connection Pooling**
```typescript
// src/payload.config.ts
db: mongooseAdapter({
  url: process.env.MONGODB_URI || "",
  connectOptions: {
    retryWrites: true,
    w: 'majority',
    maxPoolSize: 3,        // Very aggressive limit
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,  // Fail fast
    socketTimeoutMS: 20000,
  },
}),
```

**B. Payload Instance Caching**
```typescript
// src/lib/payload-client.ts
let cachedPayload: any = null;

export async function getPayloadSafe() {
  if (cachedPayload) return cachedPayload;
  
  try {
    cachedPayload = await getPayload({ config: configPromise });
    return cachedPayload;
  } catch (error) {
    cachedPayload = null;
    return null;
  }
}
```

**C. Route-Level Caching**
```typescript
// src/app/(frontend)/layout.tsx
export const revalidate = 300; // Cache for 5 minutes

// src/components/banner-wrapper.tsx - Add caching
// (similar to Option 5 but without Redis)
```

**Expected:** Error rate 1.8% → 1.0-1.2% (not enough for production)

---

## Comparison Matrix

| Solution | Monthly Cost | Effort | Error Reduction | Migration Risk | Best For |
|----------|--------------|--------|-----------------|----------------|----------|
| Flex ⭐ | $10-15 | 1 hour | 85-90% | Very Low | Current scale |
| M10 | $57 | 1 hour | 95-99% | Very Low | High reliability needs |
| Vercel Postgres | $20 | 40-60 hrs | 95-99% | Medium | Long-term serverless |
| PlanetScale | $0-39 | 60-80 hrs | 95-99% | High | MySQL ecosystem |
| Caching Layer | $10 | 8-16 hrs | 40-60%* | Low | Supplement to DB upgrade |
| M0 Optimization | $0 | 8-12 hrs | 30-40% | Low | Temporary only |

*Caching reduces load but doesn't solve connection pool issue

---

## Recommended Path

### Phase 1: Quick Win (Week 1)
- [ ] Upgrade to MongoDB Flex ($10-15/mo)
  - Easiest, fastest solution
  - 85-90% error reduction
  - Zero downtime, zero code changes
- [ ] Monitor for 7 days

### Phase 2: Evaluate (Week 2)
- **If errors < 0.5%:** Success! Stay on Flex. Consider adding caching layer for further optimization
- **If errors 0.5-1.0%:** Implement M0 optimization techniques from Option 6 OR upgrade to M10 ($57/mo)
- **If errors > 1.0%:** Upgrade to M10 immediately. Plan long-term migration to Vercel Postgres (Option 3)

### Phase 3: Long-term (3-6 months)
- If staying on MongoDB: Upgrade to M10 as traffic grows
- If migrating: Move to Vercel Postgres for serverless optimization
- For performance: Add caching layer (Vercel KV)

---

## Cost Scenarios (Monthly)

### Conservative (Recommended)
| Item | Cost |
|------|------|
| MongoDB Flex | $12 |
| Vercel (current) | $20 |
| R2 Storage | $0 |
| **Total** | **$32/month** |
| Error rate | <0.5% |

### Performance-Optimized
| Item | Cost |
|------|------|
| MongoDB M10 | $57 |
| Vercel KV Cache | $10 |
| Vercel (current) | $20 |
| R2 Storage | $0 |
| **Total** | **$87/month** |
| Error rate | <0.1% |

### Serverless-Native (Future)
| Item | Cost |
|------|------|
| Vercel Postgres | $20 |
| Vercel KV Cache | $10 |
| Vercel (current) | $20 |
| R2 Storage | $0 |
| **Total** | **$50/month** |
| Error rate | <0.1% |
| Admin | Need custom solution |

---

## Implementation Checklist

### Immediate (Week 1)
- [ ] Upgrade MongoDB M0 → Flex
- [ ] Monitor Vercel error rate for 48 hours
- [ ] Check MongoDB Atlas billing after 24 hours
- [ ] Verify admin panel stability

### Short-term (Week 2-4)
- [ ] Evaluate Flex performance vs. targets
- [ ] If needed: Implement connection pool optimization
- [ ] If needed: Add Vercel KV caching layer
- [ ] If needed: Upgrade to M10

### Long-term (3-6 months)
- [ ] Evaluate Vercel Postgres migration
- [ ] Plan admin panel replacement strategy
- [ ] Design new database schema
- [ ] Budget approval for infrastructure changes

---

## Success Criteria

### Primary Goals
- [ ] Error rate < 0.5% for 7 consecutive days
- [ ] No 500 errors on admin panel for 7 days
- [ ] P99 latency < 2 seconds
- [ ] Monthly cost < $30 (for DB only)

### Stretch Goals
- [ ] Error rate < 0.1%
- [ ] P99 latency < 1 second
- [ ] Handle 2,000 req/min without issues

---

## Resources

**MongoDB Atlas:**
- [Flex Cluster Pricing](https://www.mongodb.com/pricing)
- [Flex Documentation](https://www.mongodb.com/docs/atlas/)
- [M10 Dedicated Clusters](https://www.mongodb.com/docs/atlas/cluster-tier/)

**Alternative Databases:**
- [Vercel Postgres](https://vercel.com/storage/postgres)
- [PlanetScale](https://planetscale.com/)
- [Neon Serverless Postgres](https://neon.tech/)

**Caching:**
- [Vercel KV (Redis)](https://vercel.com/storage/kv)
- [Upstash Redis](https://upstash.com/)

**Best Practices:**
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Mongoose Connection Pooling](https://mongoosejs.com/docs/connections.html)

---

## Labels

`priority: high` `type: infrastructure` `area: database` `cost: $10-15/mo` `effort: low`

---

## Timeline

**Target:** 2 weeks

- **Week 1:** Implement Flex upgrade + monitor
- **Week 2:** Evaluate results + iterate if needed
