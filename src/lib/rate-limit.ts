/**
 * Lightweight in-memory IP rate limiter for the Stellar Scout public
 * endpoints — specifically the embedding-cost-bearing /api/research.
 *
 * Single-instance only. Each serverless function cold-start resets the
 * counters, so this is **not** a perfect distributed limiter — it's a
 * floor against runaway loops (broken agent retry loops, accidental
 * infinite recursion in user code, etc.).
 *
 * If real abuse shows up: swap the in-memory Map for @upstash/ratelimit
 * + Upstash Redis. The interface stays the same.
 */

import type { NextRequest } from "next/server";

interface Bucket {
	count: number;
	resetAt: number;
}

const BUCKETS = new Map<string, Bucket>();
const SWEEP_AFTER = 5 * 60 * 1000; // periodic cleanup of expired buckets

function sweepExpired(now: number) {
	if (BUCKETS.size < 1000) return; // skip until the map grows
	for (const [k, b] of BUCKETS) {
		if (b.resetAt < now) BUCKETS.delete(k);
	}
}

function getClientIp(req: NextRequest): string {
	const xff = req.headers.get("x-forwarded-for");
	if (xff) return xff.split(",")[0].trim();
	return (
		req.headers.get("x-real-ip") ||
		req.headers.get("cf-connecting-ip") ||
		"unknown"
	);
}

export interface RateLimitResult {
	allowed: boolean;
	limit: number;
	remaining: number;
	resetAt: number;
}

/**
 * Allow `limit` requests per `windowMs` per (endpoint, client-IP) pair.
 *
 * Returns headers-friendly metadata so callers can surface
 * `X-RateLimit-Remaining` and `Retry-After` to clients.
 */
export function rateLimit(
	req: NextRequest,
	opts: { endpoint: string; limit: number; windowMs: number },
): RateLimitResult {
	const { endpoint, limit, windowMs } = opts;
	const ip = getClientIp(req);
	const key = `${endpoint}:${ip}`;
	const now = Date.now();
	sweepExpired(now - SWEEP_AFTER);

	const existing = BUCKETS.get(key);
	if (!existing || existing.resetAt < now) {
		const fresh: Bucket = { count: 1, resetAt: now + windowMs };
		BUCKETS.set(key, fresh);
		return {
			allowed: true,
			limit,
			remaining: limit - 1,
			resetAt: fresh.resetAt,
		};
	}

	if (existing.count >= limit) {
		return {
			allowed: false,
			limit,
			remaining: 0,
			resetAt: existing.resetAt,
		};
	}

	existing.count += 1;
	return {
		allowed: true,
		limit,
		remaining: Math.max(0, limit - existing.count),
		resetAt: existing.resetAt,
	};
}

/** Convert a RateLimitResult into the standard X-RateLimit headers. */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
	return {
		"X-RateLimit-Limit": String(r.limit),
		"X-RateLimit-Remaining": String(r.remaining),
		"X-RateLimit-Reset": String(Math.ceil(r.resetAt / 1000)),
	};
}
