import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface RWAIssuer {
	name: string;
	value: number;
	assetCount: number;
}

// The last reading this instance took from rwa.xyz, and when (asOf).
let cachedData: {
	tvl: number;
	// null = not read (the headline-only parse), never "none"
	topIssuers: RWAIssuer[] | null;
	totalAssets: number | null;
	asOf: string;
	timestamp: number;
} | null = null;

const served = (d: NonNullable<typeof cachedData>, cached: boolean) =>
	NextResponse.json({
		tvl: d.tvl,
		topIssuers: d.topIssuers,
		totalAssets: d.totalAssets,
		asOf: d.asOf,
		cached,
	});

const remember = (
	tvl: number,
	topIssuers: RWAIssuer[] | null,
	totalAssets: number | null,
) => {
	cachedData = {
		tvl,
		topIssuers,
		totalAssets,
		asOf: new Date().toISOString(),
		timestamp: Date.now(),
	};
	return cachedData;
};

export async function GET() {
	const startedAt = Date.now();
	if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
		return served(cachedData, true);
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
			const totalAssets =
				typeof network?.asset_count === "number" ? network.asset_count : null;

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
				// An issuer with no value read is left out, never listed at $0.
				const value = issuer.bridged_token_value_dollar?.val;
				if (typeof value !== "number") continue;
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

			if (tvl > 0) return served(remember(tvl, topIssuers, totalAssets), false);
		} else {
			const billionMatch = html.match(/\$(\d+\.?\d*)\s*B/);
			if (billionMatch?.[1]) {
				const tvl = parseFloat(billionMatch[1]) * 1_000_000_000;
				if (tvl > 0) return served(remember(tvl, null, null), false);
			}
		}

		throw new Error("rwa.xyz page held no Distributed Asset Value");
	} catch {
		// Review 2026-11-04: a failed read served 1,688,000,000 and five issuer
		// values hard-coded in March 2026 as the current figure. The last real
		// reading is served with its date; with none, this is an outage.
		if (cachedData) return served(cachedData, true);
		return apiError({
			status: 503,
			error: "rwa.xyz read failed",
			advisory:
				"The rwa.xyz page could not be read or held no figure. This is an outage, NOT a claim that Stellar holds no RWA value. Retry after Retry-After.",
			retryAfterSeconds: 60,
			startedAt,
		});
	}
}
