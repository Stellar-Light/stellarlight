import { type NextRequest, NextResponse } from "next/server";
import { RWA_REGISTRY } from "@/data/rwa-registry";
import { apiError } from "@/lib/api-error";
import { horizonAssetSupply, horizonAssetUrl } from "@/lib/horizon-supply";

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
	}
> =
	BENJI?.code && BENJI.issuer
		? {
				benji: {
					code: BENJI.code,
					issuer: BENJI.issuer,
					unitPriceUSD: 1,
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

/** A number DefiLlama served, or null: never 0 for unread. */
const num = (v: unknown): number | null =>
	typeof v === "number" && Number.isFinite(v) ? v : null;
/** The date of a series' last point (ms epoch), or null. */
const lastPointAsOf = (series: { date: number }[] | null | undefined) => {
	const last = series?.at(-1)?.date;
	return typeof last === "number" ? new Date(last).toISOString() : null;
};

// Cache protocol list for 1 hour in-memory
let cachedProtocols: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getStellarProtocols(): Promise<any[]> {
	const now = Date.now();
	if (cachedProtocols && now - cacheTimestamp < CACHE_TTL) {
		return cachedProtocols;
	}

	const res = await fetch("https://api.llama.fi/protocols");
	if (!res.ok) throw new Error("Failed to fetch protocols");
	const protocols = await res.json();

	const filtered = protocols.filter((p: any) =>
		(p.chains || []).includes("Stellar"),
	);
	cachedProtocols = filtered;
	cacheTimestamp = now;
	return filtered;
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

		// 3. Find matching protocol on DeFi Llama
		const stellarProtocols = await getStellarProtocols();

		const exactMatch = stellarProtocols.find(
			(p: any) => p.name.toLowerCase() === lowerSlug || p.slug === lowerSlug,
		);
		const startsWithMatches = stellarProtocols
			.filter(
				(p: any) =>
					p.name.toLowerCase().startsWith(lowerSlug) ||
					p.slug.startsWith(lowerSlug),
			)
			.sort(
				(a: any, b: any) =>
					(b.chainTvls?.Stellar || 0) - (a.chainTvls?.Stellar || 0),
			);
		const includesMatches = stellarProtocols
			.filter((p: any) => p.name.toLowerCase().includes(lowerSlug))
			.sort(
				(a: any, b: any) =>
					(b.chainTvls?.Stellar || 0) - (a.chainTvls?.Stellar || 0),
			);

		const match = exactMatch || startsWithMatches[0] || includesMatches[0];

		if (!match) {
			return NextResponse.json({ found: false }, { status: 404 });
		}

		// Fetch detailed protocol data with historical TVL
		const detailRes = await fetch(
			`https://api.llama.fi/protocol/${match.slug}`,
		);
		// A failed read is not "not found": the protocol matched above.
		if (!detailRes.ok)
			throw new Error(`DefiLlama answered ${detailRes.status}`);

		const detail = await detailRes.json();

		// Extract Stellar chain historical TVL
		const stellarTvlHistory = detail.chainTvls?.Stellar?.tvl || [];
		const historicalTVL = stellarTvlHistory.map((entry: any) => ({
			date: entry.date * 1000, // Convert unix seconds to ms
			tvl: entry.totalLiquidityUSD,
		}));

		// Current TVL on Stellar: null when DefiLlama gives no Stellar figure.
		const currentTVL =
			num(match.chainTvls?.Stellar) ?? num(detail.currentChainTvls?.Stellar);

		return NextResponse.json({
			found: true,
			name: match.name,
			slug: match.slug,
			logo: match.logo,
			category: match.category,
			currentTVL,
			change1d: num(match.change_1d),
			change7d: num(match.change_7d),
			historicalTVL,
			asOf: lastPointAsOf(historicalTVL),
		});
	} catch {
		// Every failure here is an upstream read: Horizon for a fund token, or
		// DefiLlama's protocol list or detail. Each is an outage: 503 with
		// Retry-After, never a 500 or a 200 of nulls (re-check 2026-11-05).
		return apiError({
			status: 503,
			error: "TVL source read failed",
			advisory:
				"Horizon or DefiLlama did not answer this read. This is an outage, NOT a claim the protocol is gone or holds nothing. Retry after Retry-After.",
			retryAfterSeconds: 60,
			startedAt,
		});
	}
}
