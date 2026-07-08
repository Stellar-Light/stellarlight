import { type NextRequest, NextResponse } from "next/server";

type Params = Promise<{ slug: string }>;

// RWA.xyz asset IDs for projects tracked there instead of DeFi Llama
const RWA_XYZ_ASSETS: Record<
	string,
	{
		assetId: string;
		name: string;
		category: string;
		fallbackTVL: number; // used when no API key is set
	}
> = {
	benji: {
		assetId: "BENJI", // FOBXX fund, BENJI token on rwa.xyz
		name: "Benji (Franklin Templeton FOBXX)",
		category: "RWA",
		fallbackTVL: 625_861_896,
	},
};

// Manual TVL overrides for projects not on DeFi Llama or rwa.xyz
const MANUAL_TVL_OVERRIDES: Record<
	string,
	{
		name: string;
		currentTVL: number;
		category: string;
		url: string;
	}
> = {
	wisdomtree: {
		name: "WisdomTree",
		currentTVL: 20_000_000,
		category: "RWA",
		url: "https://www.wisdomtree.com/investments/digital-funds",
	},
};

// Cache for rwa.xyz data (1 hour)
const rwaCache: Record<string, { data: any; timestamp: number }> = {};
const RWA_CACHE_TTL = 60 * 60 * 1000;

/**
 * Fetch asset data from rwa.xyz API (requires RWA_XYZ_API_KEY env var).
 * Returns historical TVL timeseries and current value.
 */
async function fetchRwaXyzAsset(assetId: string): Promise<{
	currentTVL: number;
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
		let currentTVL = 0;

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
	const { slug } = await params;

	try {
		const lowerSlug = slug.toLowerCase();

		// 1. Check rwa.xyz assets first (Franklin Templeton, etc.)
		const rwaAsset = RWA_XYZ_ASSETS[lowerSlug];
		if (rwaAsset) {
			const rwaData = await fetchRwaXyzAsset(rwaAsset.assetId);

			return NextResponse.json({
				found: true,
				name: rwaAsset.name,
				slug: lowerSlug,
				logo: null,
				category: rwaAsset.category,
				currentTVL: rwaData?.currentTVL || rwaAsset.fallbackTVL,
				change1d: 0,
				change7d: 0,
				historicalTVL: rwaData?.historicalTVL || [],
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
				currentTVL: manual.currentTVL,
				change1d: 0,
				change7d: 0,
				historicalTVL: [],
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
		if (!detailRes.ok) {
			return NextResponse.json({ found: false }, { status: 404 });
		}

		const detail = await detailRes.json();

		// Extract Stellar chain historical TVL
		const stellarTvlHistory = detail.chainTvls?.Stellar?.tvl || [];
		const historicalTVL = stellarTvlHistory.map((entry: any) => ({
			date: entry.date * 1000, // Convert unix seconds to ms
			tvl: entry.totalLiquidityUSD,
		}));

		// Current TVL on Stellar
		const currentTVL =
			match.chainTvls?.Stellar || detail.currentChainTvls?.Stellar || 0;

		return NextResponse.json({
			found: true,
			name: match.name,
			slug: match.slug,
			logo: match.logo,
			category: match.category,
			currentTVL,
			change1d: match.change_1d || 0,
			change7d: match.change_7d || 0,
			historicalTVL,
		});
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to fetch protocol data" },
			{ status: 500 },
		);
	}
}
