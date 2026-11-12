import { type NextRequest, NextResponse } from "next/server";
import { RWA_REGISTRY } from "@/data/rwa-registry";
import { apiError } from "@/lib/api-error";
import { horizonAssetSupply, horizonAssetUrl } from "@/lib/horizon-supply";
import { getPayloadSafe } from "@/lib/payload-client";
import { RESOLVABLE_PROJECT_STATUSES } from "@/lib/project-status";
import {
	llamaPageFor,
	llamaPageSlugOf,
	parseDate,
	tvlStaleOf,
	tvlUnavailableOf,
} from "@/lib/status-checks";

type Params = Promise<{ slug: string }>;

// Fund tokens whose Stellar figure is their supply at a fixed share price,
// read from Horizon for the issuer the RWA registry verified from the entity
// outward. Benji (2026-11-07): Franklin's stellar.toml says "1 BENJI token
// corresponds to 1 share of the fund" (FOBXX), and the fund's summary
// prospectus (SEC Form 497K, sec.gov/Archives/edgar/data/0001786958/
// 000165558926001138/c497k.htm) says it seeks a stable $1.00 share price.
// rwa.xyz's asset API, read here before, moved off its public v4 path.
const BENJI = RWA_REGISTRY.find(
	(r) =>
		r.id === "BENJI-GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
);
const SUPPLY_PRICED: Record<
	string,
	{
		code: string;
		issuer: string;
		unitPriceUSD: number;
		name: string;
		category: string;
		/** How the figure is counted: token supply, not the fund's reported
		 * shares outstanding (SEC N-MFP3 for 2026-10-31 reported 833.6M FOBXX
		 * shares across all chains while Stellar held 1.15B BENJI a week later). */
		method: string;
	}
> =
	BENJI?.code && BENJI.issuer
		? {
				benji: {
					code: BENJI.code,
					issuer: BENJI.issuer,
					unitPriceUSD: 1,
					method: "Stellar token supply at $1.00 per share",
					name: "Benji (Franklin Templeton FOBXX)",
					category: "RWA",
				},
			}
		: {};

// One Horizon read per asset per 5 minutes, so a page view is not a call.
const supplyCache: Record<
	string,
	{ at: number; value: { supply: number; readAt: string } }
> = {};
const SUPPLY_CACHE_TTL = 5 * 60 * 1000;
async function cachedSupply(code: string, issuer: string) {
	const hit = supplyCache[`${code}-${issuer}`];
	if (hit && Date.now() - hit.at < SUPPLY_CACHE_TTL) return hit.value;
	const value = await horizonAssetSupply(code, issuer);
	supplyCache[`${code}-${issuer}`] = { at: Date.now(), value };
	return value;
}

// Projects with no figure source here: named with their source page.
// Review 2026-11-04: a figure typed in here in March 2026 (WisdomTree
// 20,000,000) was served as current with no date; none is served now.
const MANUAL_TVL_OVERRIDES: Record<
	string,
	{
		name: string;
		category: string;
		url: string;
	}
> = {
	wisdomtree: {
		name: "WisdomTree",
		category: "RWA",
		url: "https://www.wisdomtree.com/investments/digital-funds",
	},
};

/** A stored number, or null: never 0 for unread. */
const num = (v: unknown): number | null =>
	typeof v === "number" && Number.isFinite(v) ? v : null;

/** The Stellar series of a DefiLlama page, oldest first; null when it could
 * not be read (the card then shows no chart, and the row's figure stands). */
async function stellarHistory(
	page: string,
): Promise<{ date: number; tvl: number }[] | null> {
	try {
		// A slow page answer must not hold the card: past 8 s the chart is
		// left out and the row's figure stands.
		const res = await fetch(`https://api.llama.fi/protocol/${page}`, {
			signal: AbortSignal.timeout(8000),
		});
		if (!res.ok) return null;
		const detail = await res.json();
		const points: unknown = detail?.chainTvls?.Stellar?.tvl ?? [];
		if (!Array.isArray(points)) return null;
		return points.flatMap((p) =>
			typeof p?.date === "number" && typeof p?.totalLiquidityUSD === "number"
				? [{ date: p.date * 1000, tvl: p.totalLiquidityUSD }]
				: [],
		);
	} catch {
		return null;
	}
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Params },
) {
	const startedAt = Date.now();
	const { slug } = await params;

	try {
		const lowerSlug = slug.toLowerCase();

		// 1. Fund tokens priced from their Horizon supply (Franklin's BENJI).
		// A failed read throws to the 503 below, never a figure.
		const priced = SUPPLY_PRICED[lowerSlug];
		if (priced) {
			const { supply, readAt } = await cachedSupply(priced.code, priced.issuer);
			return NextResponse.json({
				found: true,
				name: priced.name,
				slug: lowerSlug,
				logo: null,
				category: priced.category,
				currentTVL: supply * priced.unitPriceUSD,
				change1d: null,
				change7d: null,
				// Horizon keeps no history: unknown, not an empty series.
				historicalTVL: null,
				asOf: readAt,
				sourceUrl: horizonAssetUrl(priced.code, priced.issuer),
				method: priced.method,
			});
		}

		// 2. Check simple manual overrides (no historical data available)
		const manual = MANUAL_TVL_OVERRIDES[lowerSlug];
		if (manual) {
			return NextResponse.json({
				found: true,
				name: manual.name,
				slug: lowerSlug,
				logo: null,
				category: manual.category,
				currentTVL: null,
				change1d: null,
				change7d: null,
				historicalTVL: null,
				asOf: null,
				sourceUrl: manual.url,
			});
		}

		// 3. A directory project's own row, by its slug: the figure, date,
		// freshness and availability its API row serves (enrich-tvl, LLAMA_MAP),
		// and the Stellar history of the DefiLlama page that shows that figure.
		// Never a name lookup (#1912, 2026-11-11): the project name matched
		// across DefiLlama's Stellar list put Blend's pools on "Lend", Binance's
		// exchange reserves as its TVL and Allbridge Core on Allbridge, and found
		// nothing for Sentora, Spiko or Templar Protocol, whose rows hold one.
		const payload = await getPayloadSafe();
		if (!payload) throw new Error("no database handle");
		const { docs } = await payload.find({
			collection: "projects",
			where: {
				slug: { equals: lowerSlug },
				status: { in: [...RESOLVABLE_PROJECT_STATUSES] },
			},
			limit: 1,
			depth: 0,
			select: {
				name: true,
				slug: true,
				category: true,
				tvlUSD: true,
				tvlAsOf: true,
				tvlUnavailable: true,
				llamaSlugs: true,
				llamaListing: true,
			},
		});
		const row = docs[0];
		const llamaSlugs = Array.isArray(row?.llamaSlugs)
			? row.llamaSlugs.filter((s): s is string => typeof s === "string" && !!s)
			: [];
		// Not linked to DefiLlama: the row serves no figure, and neither does
		// its page.
		if (!row || !llamaSlugs.length)
			return NextResponse.json({ found: false }, { status: 404 });
		const parent = row.llamaListing?.parent;
		const page = llamaPageSlugOf(llamaSlugs, parent);
		return NextResponse.json({
			found: true,
			name: row.name,
			slug: row.slug,
			logo: null,
			category: row.category ?? null,
			currentTVL: num(row.tvlUSD),
			// The row's figure is weekly: a 24h or 7d change of DefiLlama's own
			// series would describe a different reading, so none is served.
			change1d: null,
			change7d: null,
			historicalTVL: page ? await stellarHistory(page) : null,
			asOf: parseDate(row.tvlAsOf),
			stale: tvlStaleOf(row.tvlUSD, row.tvlAsOf),
			unavailable: tvlUnavailableOf(row),
			sourceUrl: llamaPageFor(llamaSlugs, parent),
			method:
				llamaSlugs.length > 1
					? `the sum of ${llamaSlugs.length} DefiLlama protocols: ${llamaSlugs.join(", ")}`
					: null,
		});
	} catch {
		// Every failure here is a read that decides the figure: Horizon for a
		// fund token, or the project store for a directory row. Each is an
		// outage: 503 with Retry-After, never a 500 or a 200 of nulls (re-check
		// 2026-11-05). A failed DefiLlama history read only leaves the chart
		// out (stellarHistory).
		return apiError({
			status: 503,
			error: "TVL source read failed",
			advisory:
				"Horizon or the project store did not answer this read. This is an outage, NOT a claim the protocol is gone or holds nothing. Retry after Retry-After.",
			retryAfterSeconds: 60,
			startedAt,
		});
	}
}
