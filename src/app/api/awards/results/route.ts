/**
 * GET /api/awards/results[?round=<slug>] — aggregate tally, read from chain.
 *
 * For every whitelisted address, reads its testnet account data entries
 * from Horizon, decodes the `i3.<round>.<category>` votes, and aggregates.
 * The chain is the source of truth — this endpoint holds no state of its
 * own and anyone could recompute the same numbers from public Horizon.
 *
 * PRIVACY: the payload is AGGREGATE ONLY — per-category counts and a
 * turnout figure. No address→choice mapping is ever serialized here.
 *
 * Cached ~30s per round in-memory (Horizon is hit up to ~98 times per
 * recompute; the cache keeps a refreshing results view cheap).
 */

import { type NextRequest, NextResponse } from "next/server";
import { type RoundTally, tallyRound } from "@/lib/awards/ballot";
import { loadRound } from "@/lib/awards/round";
import { fetchTestnetAccount } from "@/lib/awards/stellar";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30_000;
const HORIZON_CONCURRENCY = 10;

const cache = new Map<string, { at: number; tally: RoundTally }>();

async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const workers = Array.from(
		{ length: Math.min(limit, items.length) },
		async () => {
			while (next < items.length) {
				const i = next++;
				results[i] = await fn(items[i]);
			}
		},
	);
	await Promise.all(workers);
	return results;
}

export async function GET(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/awards/results",
		limit: 60,
		windowMs: 5 * 60 * 1000,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{ error: "rate limit exceeded" },
			{ status: 429, headers: rateLimitHeaders(limit) },
		);
	}

	const loaded = await loadRound(req.nextUrl.searchParams.get("round"));
	if (!loaded) {
		return NextResponse.json(
			{ error: "no award round exists" },
			{ status: 404, headers: rateLimitHeaders(limit) },
		);
	}

	const cached = cache.get(loaded.round.slug);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
		return NextResponse.json(
			{
				round: loaded.round.slug,
				status: loaded.round.status,
				closesAt: loaded.round.closesAt ?? null,
				...cached.tally,
				cachedAt: new Date(cached.at).toISOString(),
			},
			{ headers: rateLimitHeaders(limit) },
		);
	}

	const addresses = [...loaded.whitelist];
	const accounts = await mapLimit(
		addresses,
		HORIZON_CONCURRENCY,
		async (address) => {
			const res = await fetchTestnetAccount(address);
			return {
				address,
				data: res.funded === true ? res.account.data : null,
			};
		},
	);

	const tally = tallyRound(loaded.round, loaded.nominees, accounts);
	const at = Date.now();
	cache.set(loaded.round.slug, { at, tally });

	return NextResponse.json(
		{
			round: loaded.round.slug,
			status: loaded.round.status,
			closesAt: loaded.round.closesAt ?? null,
			...tally,
			cachedAt: new Date(at).toISOString(),
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
