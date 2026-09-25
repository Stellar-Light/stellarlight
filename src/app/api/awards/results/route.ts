/**
 * GET /api/awards/results[?round=<slug>], aggregate tally.
 *
 * Ballots are anonymous: written by the relay to its own account under random
 * ids. The tally reads that one account (one Horizon call) and the record
 * (address → first ballot), preferring the record wherever it holds an id, * it alone knows a voter's FIRST ballot, and it alone survives a testnet
 * reset. A relay ballot the record does not name is counted anonymously and
 * reported. `source` says which side carried the round.
 *
 * PRIVACY: the payload is AGGREGATE ONLY, per-category counts and a turnout
 * figure. No address→choice mapping is ever serialized here, and nothing is
 * served while voting is open. `ballotsDigest` is a sha256 of the first-ballot
 * record: it pins that record without disclosing any of it. null means the
 * record could not be read, see liveTally.
 *
 * Cached ~30s per round in-memory.
 */
import { type NextRequest, NextResponse } from "next/server";
import { type RoundTally, roundOpenState } from "@/lib/awards/ballot";
import { liveTally, type TallySource } from "@/lib/awards/publish";
import { loadRoundResult } from "@/lib/awards/round";
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
		afterClose: number;
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

	const read = await loadRoundResult(req.nextUrl.searchParams.get("round"));
	if (!read.ok) {
		return NextResponse.json(
			{
				error: "round_unavailable",
				message:
					"The round could not be read right now. Nothing was changed. Try again in a moment.",
			},
			{
				status: 503,
				headers: { ...rateLimitHeaders(limit), "Retry-After": "2" },
			},
		);
	}
	const loaded = read.loaded;
	if (!loaded) {
		return NextResponse.json(
			{ error: "no award round exists" },
			{ status: 404, headers: rateLimitHeaders(limit) },
		);
	}

	// No running totals while voting is open. The page only renders results
	// on a closed round, so nobody would notice this endpoint answering, but
	// polled every 30s against Horizon it made each incoming ballot attributable
	// in near-real-time, and a live count changes how the undecided vote.
	if (roundOpenState(loaded.round).open) {
		return NextResponse.json(
			{
				error: "voting_open",
				message: "Results are published when voting closes.",
				closesAt: loaded.round.closesAt ?? null,
			},
			{ status: 403, headers: rateLimitHeaders(limit) },
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
				afterClose: cached.afterClose,
				...cached.tally,
				cachedAt: new Date(cached.at).toISOString(),
			},
			{ headers: rateLimitHeaders(limit) },
		);
	}

	const { tally, source, digest, afterClose } = await liveTally(loaded);

	// A null digest means the first-ballot record could not be READ. Under
	// one-ballot-per-voter that is not a cosmetic gap: the mirror is the only
	// thing that knows a voter's first ballot, so without it every revoter is
	// counted on their LATEST pick, and after a testnet reset the answer is a
	// confident turnout of zero. Both render as an ordinary `source: "chain"`
	// tally. The publish lane already refuses to commit in this state; serving
	// it here as though it were the result is the same mistake, in public.
	if (!digest) {
		return NextResponse.json(
			{
				error: "tally_unavailable",
				message:
					"The ballot record could not be read, so the tally cannot be computed correctly right now. This is temporary. Please retry.",
			},
			{
				status: 503,
				headers: { ...rateLimitHeaders(limit), "Retry-After": "2" },
			},
		);
	}

	const at = Date.now();
	cache.set(loaded.round.slug, { at, tally, source, digest, afterClose });

	return NextResponse.json(
		{
			round: loaded.round.slug,
			status: loaded.round.status,
			closesAt: loaded.round.closesAt ?? null,
			source,
			ballotsDigest: digest,
			afterClose,
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
