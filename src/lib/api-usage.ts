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
	| "probe"
	| "other";

/** Coarse-bucket a User-Agent string. Order matters — more-specific first. */
export function bucketUserAgent(ua: string | null): UaBucket {
	if (!ua) return "other";
	const s = ua.toLowerCase();
	// Our OWN engines/audits/evals — every recurring script sends a
	// stellarlight-* UA. Labeling self-traffic explicitly is what makes the
	// residual `other` bucket meaningful demand: Raven's adapter sends NO
	// User-Agent (verified: kalepail/stellar-raven src/adapters/scout.ts sets
	// only Content-Type), so its hits land in `other` — Engine D admits
	// `other` as real demand and must not find our probes there.
	if (/stellarlight-|golden-eval/.test(s)) return "probe";
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
	/**
	 * Rows returned on this response. Lets Engine D trend zero/thin-result
	 * rates on REAL demand straight from the log, without replaying.
	 */
	resultCount?: number;
	/** Match tier served (projects/search) or retrieval mode (research). */
	matchMode?: string;
}

/** Log a hit. Always returns immediately — DB write is fire-and-forget. */
export function logApiHit({
	req,
	endpoint,
	query,
	filters,
	resultCount,
	matchMode,
}: LogArgs): void {
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
					...(typeof resultCount === "number" ? { resultCount } : {}),
					...(matchMode ? { matchMode } : {}),
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

		// Per-endpoint counts over the last 7 days. Uses Payload's own query —
		// the path that correctly matches the rows (and handles the collection
		// name + createdAt type) — but trimmed with select:{endpoint} +
		// pagination:false so it fetches ONLY the one field it needs and skips
		// the totalDocs count. Previously this pulled up to 10,000 FULL log rows
		// and grouped them in memory, which made /api/status take ~13s as the
		// append-only log grew.
		const sample = await payload.find({
			collection: "api-usage",
			where: { createdAt: { greater_than: weekAgo } },
			limit: 10_000,
			depth: 0,
			pagination: false,
			select: { endpoint: true },
		});
		const byEndpointMap = new Map<string, number>();
		for (const row of sample.docs as Array<{ endpoint?: string }>) {
			if (!row.endpoint) continue;
			byEndpointMap.set(
				row.endpoint,
				(byEndpointMap.get(row.endpoint) ?? 0) + 1,
			);
		}
		const byEndpoint = [...byEndpointMap.entries()]
			.map(([endpoint, count]) => ({ endpoint, count }))
			.sort((a, b) => b.count - a.count);

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

/**
 * Agent-vs-human usage split over the last 7 days, from the same coarse
 * UA buckets logApiHit records. Page-only (the /analytics page) — kept off
 * /api/status so this adds no contract surface.
 */
export async function getUsageUaSplit(): Promise<Array<{
	bucket: string;
	count: number;
}> | null> {
	try {
		const payload = await getPayloadSafe();
		if (!payload) return null;
		const weekAgo = new Date(
			Date.now() - 7 * 24 * 60 * 60 * 1000,
		).toISOString();
		const sample = await payload.find({
			collection: "api-usage",
			where: { createdAt: { greater_than: weekAgo } },
			limit: 10_000,
			depth: 0,
			pagination: false,
			select: { uaBucket: true },
		});
		const map = new Map<string, number>();
		for (const row of sample.docs as Array<{ uaBucket?: string }>) {
			const b = row.uaBucket ?? "other";
			map.set(b, (map.get(b) ?? 0) + 1);
		}
		return [...map.entries()]
			.map(([bucket, count]) => ({ bucket, count }))
			.sort((a, b) => b.count - a.count);
	} catch {
		return null;
	}
}
