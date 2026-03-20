import { NextRequest, NextResponse } from "next/server";

type Params = Promise<{ slug: string }>;

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

	const filtered = protocols.filter(
		(p: any) => (p.chains || []).includes("Stellar")
	);
	cachedProtocols = filtered;
	cacheTimestamp = now;
	return filtered;
}

export async function GET(request: NextRequest, { params }: { params: Params }) {
	const { slug } = await params;

	try {
		// Find matching protocol by name (fuzzy: "Blend" matches "Blend Pools V2")
		const stellarProtocols = await getStellarProtocols();
		const lowerSlug = slug.toLowerCase();

		// Try exact match first, then startsWith, then includes
		// When multiple match, pick the one with highest TVL
		const exactMatch = stellarProtocols.find(
			(p: any) => p.name.toLowerCase() === lowerSlug || p.slug === lowerSlug
		);
		const startsWithMatches = stellarProtocols
			.filter((p: any) => p.name.toLowerCase().startsWith(lowerSlug) || p.slug.startsWith(lowerSlug))
			.sort((a: any, b: any) => (b.chainTvls?.Stellar || 0) - (a.chainTvls?.Stellar || 0));
		const includesMatches = stellarProtocols
			.filter((p: any) => p.name.toLowerCase().includes(lowerSlug))
			.sort((a: any, b: any) => (b.chainTvls?.Stellar || 0) - (a.chainTvls?.Stellar || 0));

		const match = exactMatch || startsWithMatches[0] || includesMatches[0];

		if (!match) {
			return NextResponse.json({ found: false }, { status: 404 });
		}

		// Fetch detailed protocol data with historical TVL
		const detailRes = await fetch(`https://api.llama.fi/protocol/${match.slug}`);
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
		const currentTVL = match.chainTvls?.Stellar || detail.currentChainTvls?.Stellar || 0;

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
			{ status: 500 }
		);
	}
}
