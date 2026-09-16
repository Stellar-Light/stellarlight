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
 * tally is rebuilt from the `award-ballots` mirror (see lib/awards/mirror.ts)
 * through the same tallyRound, and `source` says which one you got.
 *
 * PRIVACY: the payload is AGGREGATE ONLY — per-category counts and a
 * turnout figure. No address→choice mapping is ever serialized here.
 *
 * Cached ~30s per round in-memory (Horizon is hit up to ~98 times per
 * recompute; the cache keeps a refreshing results view cheap).
 */

import { type NextRequest, NextResponse } from "next/server";
import { type RoundTally, tallyRound } from "@/lib/awards/ballot";
import { mirrorAccountData } from "@/lib/awards/mirror";
import { loadMirroredBallots } from "@/lib/awards/record";
import { loadRound } from "@/lib/awards/round";
import { fetchTestnetAccounts } from "@/lib/awards/stellar";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30_000;
const HORIZON_CONCURRENCY = 10;

type TallySource = "chain" | "mirror";
const cache = new Map<
	string,
	{ at: number; tally: RoundTally; source: TallySource }
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
				...cached.tally,
				cachedAt: new Date(cached.at).toISOString(),
			},
			{ headers: rateLimitHeaders(limit) },
		);
	}

	const addresses = [...loaded.whitelist];
	const probes = await fetchTestnetAccounts(addresses, HORIZON_CONCURRENCY);
	let tally = tallyRound(
		loaded.round,
		loaded.nominees,
		probes.map(({ address, result }) => ({
			address,
			data: result.funded === true ? result.account.data : null,
		})),
	);
	let source: TallySource = "chain";

	// Nothing on-chain for anyone → the mirror is what's left. Whitelist stays
	// the denominator: an address the mirror never saw counts as unvoted, and
	// a mirrored address outside the whitelist is not a voter.
	if (tally.turnout.voted === 0) {
		const mirror = await loadMirroredBallots(loaded.round.slug);
		if (mirror.size > 0) {
			const fromMirror = tallyRound(
				loaded.round,
				loaded.nominees,
				addresses.map((address) => {
					const selections = mirror.get(address);
					return selections
						? mirrorAccountData(loaded.round, { address, selections })
						: { address, data: null };
				}),
			);
			if (fromMirror.turnout.voted > 0) {
				tally = fromMirror;
				source = "mirror";
			}
		}
	}

	const at = Date.now();
	cache.set(loaded.round.slug, { at, tally, source });

	return NextResponse.json(
		{
			round: loaded.round.slug,
			status: loaded.round.status,
			closesAt: loaded.round.closesAt ?? null,
			source,
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
