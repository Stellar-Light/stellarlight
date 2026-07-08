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
			/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
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
					(a: any) => a?.label === "Distributed Asset Value",
				) as any;

				if (distributedAsset?.value && distributedAsset.value > 0) {
					tvl = distributedAsset.value;
				}
			}

			// Extract top 5 issuers — value is in bridged_token_value_dollar.val
			const issuerStats = network?.issuer_stats || [];
			const totalAssets = network?.asset_count || 0;

			const sorted = [...issuerStats]
				.sort(
					(a: any, b: any) =>
						(b.bridged_token_value_dollar?.val || 0) -
						(a.bridged_token_value_dollar?.val || 0),
				)
				.slice(0, 5);

			// Normalize issuer names. rwa.xyz splits some issuers into multiple
			// rows (e.g. "Franklin Templeton Trust" + "Franklin Templeton Benji
			// Investments" are the same brand). Consolidating gives us a true
			// top-N that matches what the rwa.xyz UI shows.
			//
			// Exact-match map first, then fuzzy substring match as fallback so
			// new variants are caught automatically without a code change.
			const EXACT_NAME_MAP: Record<string, string> = {
				"Circle International": "Circle",
				"Ondo USDY": "Ondo Finance",
				Ondo: "Ondo Finance",
				// Issuers that have non-zero bridged value in rwa.xyz's data
				// but are excluded from their public top-N display. They're
				// usually fund-level entities (registered but not actively
				// distributed yet). We mirror rwa.xyz's display choices so
				// our card matches what users see on the source.
				"Societe Generale - FORGE": null as any,
				"Realiz Digital Assets Fund": null as any,
			};
			const FUZZY_CANONICAL: Array<{ match: string; name: string }> = [
				{ match: "franklin templeton", name: "Franklin Templeton" },
				{ match: "spiko", name: "Spiko" },
				{ match: "wisdomtree", name: "WisdomTree" },
				{ match: "ondo", name: "Ondo Finance" },
				{ match: "circle", name: "Circle" },
				{ match: "redswan", name: "RedSwan Digital" },
				{ match: "realiz", name: "Realiz" },
			];

			function canonicalName(raw: string): string | null {
				if (raw in EXACT_NAME_MAP) return EXACT_NAME_MAP[raw];
				const lower = raw.toLowerCase();
				for (const { match, name } of FUZZY_CANONICAL) {
					if (lower.includes(match)) return name;
				}
				return raw;
			}

			// Aggregate by canonical name — sum value, sum asset count
			const agg = new Map<string, RWAIssuer>();
			for (const issuer of issuerStats as Array<{
				name?: string;
				bridged_token_value_dollar?: { val?: number };
				asset_count?: number;
			}>) {
				const name = canonicalName(issuer.name || "Unknown");
				if (name === null) continue; // excluded
				const value = issuer.bridged_token_value_dollar?.val || 0;
				const assetCount = issuer.asset_count || 0;
				const existing = agg.get(name);
				if (existing) {
					existing.value += value;
					existing.assetCount += assetCount;
				} else {
					agg.set(name, { name, value, assetCount });
				}
			}

			const topIssuers: RWAIssuer[] = Array.from(agg.values())
				.sort((a, b) => b.value - a.value)
				.slice(0, 5);

			if (tvl > 0) {
				cachedData = { tvl, topIssuers, totalAssets, timestamp: Date.now() };
				return NextResponse.json({
					tvl,
					topIssuers,
					totalAssets,
					cached: false,
				});
			}
		} else {
			const billionMatch = html.match(/\$(\d+\.?\d*)\s*B/);
			if (billionMatch?.[1]) {
				const tvl = parseFloat(billionMatch[1]) * 1_000_000_000;
				if (tvl > 0) {
					cachedData = {
						tvl,
						topIssuers: [],
						totalAssets: 0,
						timestamp: Date.now(),
					};
					return NextResponse.json({
						tvl,
						topIssuers: [],
						totalAssets: 0,
						cached: false,
					});
				}
			}
		}

		return NextResponse.json({
			tvl: FALLBACK_TVL,
			topIssuers: FALLBACK_ISSUERS,
			totalAssets: 50,
			cached: false,
			fallback: true,
		});
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
		return NextResponse.json({
			tvl: FALLBACK_TVL,
			topIssuers: FALLBACK_ISSUERS,
			totalAssets: 50,
			cached: true,
			fallback: true,
		});
	}
}
