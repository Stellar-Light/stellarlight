/**
 * Fire-and-forget API usage logging for the Stellar Scout public endpoints.
 *
 * Each route calls `logApiHit({...})` once per request. The write goes
 * through Payload's local API (bypasses REST access controls) and is
 * `void`ed so the response isn't blocked on the DB write.
 *
 * Privacy: query strings truncated to 100 chars, lowercased; user-agent
 * bucketed into coarse categories (claude, codex, cursor, curl, browser,
 * bot, agent, other); no IP, no full UA.
 */

import type { NextRequest } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";

type UaBucket =
	| "claude"
	| "codex"
	| "cursor"
	| "agent"
	| "curl"
	| "browser"
	| "bot"
	| "other";

/** Coarse-bucket a User-Agent string. Order matters — more-specific first. */
export function bucketUserAgent(ua: string | null): UaBucket {
	if (!ua) return "other";
	const s = ua.toLowerCase();
	if (/claude(-code|\.ai)?|anthropic/.test(s)) return "claude";
	if (/codex|openai/.test(s)) return "codex";
	if (/cursor/.test(s)) return "cursor";
	if (/node-fetch|axios|got|undici|httpie|python-requests|ruby/.test(s))
		return "agent";
	if (/curl|wget/.test(s)) return "curl";
	if (/bot|crawler|spider|googlebot|bingbot|slack|twitter/.test(s))
		return "bot";
	if (/mozilla|chrome|safari|firefox|edge/.test(s)) return "browser";
	return "other";
}

interface LogArgs {
	req: NextRequest;
	endpoint: string;
	/** Optional keyword query — will be lowercased + truncated to 100 chars. */
	query?: string | null;
	/** Optional compact filters object — serialized to JSON, truncated to 200 chars. */
	filters?: Record<string, unknown>;
}

/** Log a hit. Always returns immediately — DB write is fire-and-forget. */
export function logApiHit({ req, endpoint, query, filters }: LogArgs): void {
	const ua = req.headers.get("user-agent");
	const scoutVersion = req.headers.get("x-scout-version") || undefined;
	const country =
		req.headers.get("x-vercel-ip-country") ||
		req.headers.get("cf-ipcountry") ||
		undefined;

	const cleanQuery = query
		? query.toLowerCase().slice(0, 100).trim() || undefined
		: undefined;

	const filtersJson = filters
		? JSON.stringify(filters).slice(0, 200)
		: undefined;

	// Fire-and-forget. We don't await this so the API response isn't
	// blocked on a DB write. Errors are swallowed — usage logging
	// failures must never break an endpoint.
	void (async () => {
		try {
			const payload = await getPayloadSafe();
			if (!payload) return;
			await payload.create({
				collection: "api-usage",
				data: {
					endpoint,
					query: cleanQuery,
					uaBucket: bucketUserAgent(ua),
					scoutVersion,
					country,
					filtersJson,
				},
			});
		} catch {
			// silent — never break a request on logging failure
		}
	})();
}

/**
 * Aggregate hit counts for the /api/status endpoint. Returns a small
 * object with total + per-endpoint + last-24h counts. Read access only,
 * runs through Payload's local API so it's fast.
 */
export async function getUsageStats(): Promise<{
	total: number;
	last24h: number;
	last7d: number;
	byEndpoint: Array<{ endpoint: string; count: number }>;
} | null> {
	try {
		const payload = await getPayloadSafe();
		if (!payload) return null;

		const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		const weekAgo = new Date(
			Date.now() - 7 * 24 * 60 * 60 * 1000,
		).toISOString();

		const [total, last24h, last7d] = await Promise.all([
			payload.count({ collection: "api-usage" }),
			payload.count({
				collection: "api-usage",
				where: { createdAt: { greater_than: dayAgo } },
			}),
			payload.count({
				collection: "api-usage",
				where: { createdAt: { greater_than: weekAgo } },
			}),
		]);

		// Per-endpoint counts over the last 7 days, computed DB-side with a
		// $group aggregation. This previously fetched up to 10,000 raw log rows
		// and grouped them in memory, which made /api/status take ~13s once the
		// api-usage log grew large. The aggregation returns one tiny row per
		// endpoint instead of hauling the raw log off the cluster.
		let byEndpoint: Array<{ endpoint: string; count: number }> = [];
		// biome-ignore lint/suspicious/noExplicitAny: raw mongo driver off Payload
		const db = (payload as any).db?.connection?.db;
		const coll = db?.collection("api-usage");
		if (coll) {
			const grouped = (await coll
				.aggregate([
					{ $match: { createdAt: { $gt: new Date(weekAgo) } } },
					{ $group: { _id: "$endpoint", count: { $sum: 1 } } },
					{ $sort: { count: -1 } },
				])
				.toArray()) as Array<{ _id: string; count: number }>;
			byEndpoint = grouped
				.filter((r) => r._id)
				.map((r) => ({ endpoint: r._id, count: r.count }));
		}

		return {
			total: total.totalDocs,
			last24h: last24h.totalDocs,
			last7d: last7d.totalDocs,
			byEndpoint,
		};
	} catch {
		return null;
	}
}
