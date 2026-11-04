import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

type Params = Promise<{ slug: string }>;

// RWA.xyz asset IDs for projects tracked there instead of DeFi Llama
const RWA_XYZ_ASSETS: Record<
	string,
	{
		assetId: string;
		name: string;
		category: string;
	}
> = {
	benji: {
		assetId: "BENJI", // FOBXX fund, BENJI token on rwa.xyz
		name: "Benji (Franklin Templeton FOBXX)",
		category: "RWA",
	},
};

// Projects on neither DeFi Llama nor rwa.xyz: named with their source page.
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

/** A number DefiLlama or rwa.xyz served, or null: never 0 for unread. */
const num = (v: unknown): number | null =>
	typeof v === "number" && Number.isFinite(v) ? v : null;
/** The date of a series' last point (ms epoch), or null. */
const lastPointAsOf = (series: { date: number }[] | null | undefined) => {
	const last = series?.at(-1)?.date;
	return typeof last === "number" ? new Date(last).toISOString() : null;
};

// Cache for rwa.xyz data (1 hour)
const rwaCache: Record<string, { data: any; timestamp: number }> = {};
const RWA_CACHE_TTL = 60 * 60 * 1000;

/**
 * Fetch asset data from rwa.xyz API (requires RWA_XYZ_API_KEY env var).
 * Returns historical TVL timeseries and current value.
 */
async function fetchRwaXyzAsset(assetId: string): Promise<{
	currentTVL: number | null;
	historicalTVL: { date: number; tvl: number }[];
} | null> {
	const apiKey = process.env.RWA_XYZ_API_KEY;
	if (!apiKey) return null;

	const cacheKey = assetId;
	const cached = rwaCache[cacheKey];
	if (cached && Date.now() - cached.timestamp < RWA_CACHE_TTL) {
		return cached.data;
	}

	try {
		// Fetch asset timeseries from rwa.xyz
		const res = await fetch(
			`https://api.rwa.xyz/v4/assets/${assetId}/timeseries?metric=market_cap&interval=day&chain=stellar`,
			{
				headers: {
					Authorization: `Bearer ${apiKey}`,
					Accept: "application/json",
				},
			},
		);

		if (!res.ok) {
			console.warn(`rwa.xyz API error for ${assetId}: ${res.status}`);
			return null;
		}

		const json = await res.json();
		const timeseries = json.data || json.timeseries || json;

		// Parse timeseries into our format
		const historicalTVL: { date: number; tvl: number }[] = [];
		let currentTVL: number | null = null;

		if (Array.isArray(timeseries)) {
			for (const point of timeseries) {
				const date = new Date(point.date || point.timestamp).getTime();
				const tvl = point.value || point.market_cap || point.tvl || 0;
				if (date && tvl) {
					historicalTVL.push({ date, tvl });
				}
			}
			if (historicalTVL.length > 0) {
				currentTVL = historicalTVL[historicalTVL.length - 1].tvl;
			}
		}

		const result = { currentTVL, historicalTVL };
		rwaCache[cacheKey] = { data: result, timestamp: Date.now() };
		return result;
	} catch (e) {
		console.warn(`rwa.xyz fetch failed for ${assetId}:`, e);
		return null;
	}
}

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

		// 1. Check rwa.xyz assets first (Franklin Templeton, etc.)
		const rwaAsset = RWA_XYZ_ASSETS[lowerSlug];
		if (rwaAsset) {
			const rwaData = await fetchRwaXyzAsset(rwaAsset.assetId);

			// Review 2026-11-04: with no API key or a failed read this served
			// 625,861,896, hard-coded in March 2026, as the current figure.
			return NextResponse.json({
				found: true,
				name: rwaAsset.name,
				slug: lowerSlug,
				logo: null,
				category: rwaAsset.category,
				currentTVL: rwaData?.currentTVL ?? null,
				change1d: null,
				change7d: null,
				historicalTVL: rwaData?.historicalTVL ?? null,
				asOf: lastPointAsOf(rwaData?.historicalTVL),
				sourceUrl: `https://app.rwa.xyz/assets/${rwaAsset.assetId}`,
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
		if (!detailRes.ok) {
			return apiError({
				status: 503,
				error: "DefiLlama protocol read failed",
				advisory:
					"The protocol is listed on DefiLlama, but its detail read failed. This is an outage, NOT a claim the protocol is gone or holds nothing. Retry after Retry-After.",
				retryAfterSeconds: 60,
				startedAt,
			});
		}

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
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to fetch protocol data" },
			{ status: 500 },
		);
	}
}
