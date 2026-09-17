/**
 * GET /api/awards/results[?round=<slug>] — aggregate tally.
 *
 * For every whitelisted address, reads its testnet account data entries
 * from Horizon, decodes the `i3.<round>.<category>` votes, and aggregates.
 * While the chain exists it is the source of truth — anyone can recompute
 * the same numbers from public Horizon.
 *
 * Testnet is reset 2–4× a year, and a reset clears every ledger entry and
 * all history: at the first reset after a round, every account reads
 * unfunded and the chain tally is zero. When the chain shows NO votes, the
 * tally is rebuilt from the `award-ballots` mirror through the same
 * tallyRound (lib/awards/publish.ts — shared with the publish lane, so the
 * committed results file cannot disagree with this page), and `source` says
 * which one you got.
 *
 * PRIVACY: the payload is AGGREGATE ONLY — per-category counts and a
 * turnout figure. No address→choice mapping is ever serialized here.
 * `ballotsDigest` is a sha256 of the first-ballot record: it pins that record
 * without disclosing any of it (only someone already holding the record can
 * check it). null means the record could not be read — see liveTally.
 *
 * Cached ~30s per round in-memory (Horizon is hit up to ~98 times per
 * recompute; the cache keeps a refreshing results view cheap).
 */

import { type NextRequest, NextResponse } from "next/server";
import type { RoundTally } from "@/lib/awards/ballot";
import { liveTally, type TallySource } from "@/lib/awards/publish";
import { loadRound } from "@/lib/awards/round";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30_000;

const cache = new Map<
	string,
	{
		at: number;
		tally: RoundTally;
		source: TallySource;
		digest: string | null;
	}
>();

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
				source: cached.source,
				ballotsDigest: cached.digest,
				...cached.tally,
				cachedAt: new Date(cached.at).toISOString(),
			},
			{ headers: rateLimitHeaders(limit) },
		);
	}

	const { tally, source, digest } = await liveTally(loaded);

	// A null digest means the first-ballot record could not be READ. Under
	// one-ballot-per-voter that is not a cosmetic gap: the mirror is the only
	// thing that knows a voter's first ballot, so without it every revoter is
	// counted on their LATEST pick — and after a testnet reset the answer is a
	// confident turnout of zero. Both render as an ordinary `source: "chain"`
	// tally. The publish lane already refuses to commit in this state; serving
	// it here as though it were the result is the same mistake, in public.
	if (!digest) {
		return NextResponse.json(
			{
				error: "tally_unavailable",
				message:
					"The ballot record could not be read, so the tally cannot be computed correctly right now. This is temporary — please retry.",
			},
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}

	const at = Date.now();
	cache.set(loaded.round.slug, { at, tally, source, digest });

	return NextResponse.json(
		{
			round: loaded.round.slug,
			status: loaded.round.status,
			closesAt: loaded.round.closesAt ?? null,
			source,
			ballotsDigest: digest,
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
