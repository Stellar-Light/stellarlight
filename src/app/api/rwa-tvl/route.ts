import { NextResponse } from "next/server";

const FALLBACK_TVL = 1_688_000_000;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface RWAIssuer {
	name: string;
	value: number;
	assetCount: number;
}

const FALLBACK_ISSUERS: RWAIssuer[] = [
	{ name: "Franklin Templeton", value: 654_500_000, assetCount: 1 },
	{ name: "Spiko", value: 508_400_000, assetCount: 5 },
	{ name: "Circle", value: 238_500_000, assetCount: 2 },
	{ name: "Ondo Finance", value: 123_400_000, assetCount: 1 },
	{ name: "RedSwan Digital", value: 71_700_000, assetCount: 7 },
];

let cachedData: {
	tvl: number;
	topIssuers: RWAIssuer[];
	totalAssets: number;
	timestamp: number;
} | null = null;

export async function GET() {
	if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
		return NextResponse.json({
			tvl: cachedData.tvl,
			topIssuers: cachedData.topIssuers,
			totalAssets: cachedData.totalAssets,
			cached: true,
		});
	}

	try {
		const response = await fetch("https://app.rwa.xyz/networks/stellar", {
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; StellarLight/1.0)",
				Accept: "text/html",
			},
			next: { revalidate: 86400 },
		});

		if (!response.ok) {
			throw new Error(`rwa.xyz returned ${response.status}`);
		}

		const html = await response.text();

		const nextDataMatch = html.match(
			/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
		);

		if (nextDataMatch?.[1]) {
			const nextData = JSON.parse(nextDataMatch[1]);
			const pageProps = nextData?.props?.pageProps;
			const network = pageProps?.network;
			const aggregates = pageProps?.aggregates;

			// Find "Distributed Asset Value" from aggregates
			let tvl = 0;
			if (aggregates) {
				const distributedAsset = Object.values(aggregates).find(
					(a: any) => a?.label === "Distributed Asset Value"
				) as any;

				if (distributedAsset?.value && distributedAsset.value > 0) {
					tvl = distributedAsset.value;
				}
			}

			// Extract top 5 issuers — value is in bridged_token_value_dollar.val
			const issuerStats = network?.issuer_stats || [];
			const totalAssets = network?.asset_count || 0;

			const sorted = [...issuerStats]
				.sort((a: any, b: any) =>
					(b.bridged_token_value_dollar?.val || 0) - (a.bridged_token_value_dollar?.val || 0)
				)
				.slice(0, 5);

			// Normalize issuer names and replace SocGen with RedSwan
			const NAME_MAP: Record<string, string> = {
				"Circle International": "Circle",
				"Ondo USDY": "Ondo Finance",
				"Societe Generale - FORGE": null as any, // exclude
			};

			const REDSWAN_ENTRY: RWAIssuer = {
				name: "RedSwan Digital",
				value: 71_700_000,
				assetCount: 7,
			};

			// Find RedSwan in the full list if it exists
			const redswanFromData = issuerStats.find((i: any) =>
				(i.name || "").toLowerCase().includes("redswan")
			);
			if (redswanFromData) {
				REDSWAN_ENTRY.value = redswanFromData.bridged_token_value_dollar?.val || REDSWAN_ENTRY.value;
				REDSWAN_ENTRY.assetCount = redswanFromData.asset_count || REDSWAN_ENTRY.assetCount;
			}

			let topIssuers: RWAIssuer[] = sorted
				.filter((issuer: any) => NAME_MAP[issuer.name] !== null)
				.map((issuer: any) => ({
					name: NAME_MAP[issuer.name] ?? issuer.name ?? "Unknown",
					value: issuer.bridged_token_value_dollar?.val || 0,
					assetCount: issuer.asset_count || 0,
				}));

			// If we removed SocGen, add RedSwan
			if (topIssuers.length < 5) {
				topIssuers.push(REDSWAN_ENTRY);
			}
			topIssuers = topIssuers.slice(0, 5);

			if (tvl > 0) {
				cachedData = { tvl, topIssuers, totalAssets, timestamp: Date.now() };
				return NextResponse.json({ tvl, topIssuers, totalAssets, cached: false });
			}
		} else {
			const billionMatch = html.match(/\$(\d+\.?\d*)\s*B/);
			if (billionMatch?.[1]) {
				const tvl = parseFloat(billionMatch[1]) * 1_000_000_000;
				if (tvl > 0) {
					cachedData = { tvl, topIssuers: [], totalAssets: 0, timestamp: Date.now() };
					return NextResponse.json({ tvl, topIssuers: [], totalAssets: 0, cached: false });
				}
			}
		}

		return NextResponse.json({ tvl: FALLBACK_TVL, topIssuers: FALLBACK_ISSUERS, totalAssets: 50, cached: false, fallback: true });
	} catch (error) {
		if (cachedData) {
			return NextResponse.json({
				tvl: cachedData.tvl,
				topIssuers: cachedData.topIssuers,
				totalAssets: cachedData.totalAssets,
				cached: true,
				fallback: true,
			});
		}
		return NextResponse.json({ tvl: FALLBACK_TVL, topIssuers: FALLBACK_ISSUERS, totalAssets: 50, cached: true, fallback: true });
	}
}
