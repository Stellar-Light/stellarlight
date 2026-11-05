"use client";

import { useQuery } from "@tanstack/react-query";

interface RWAIssuer {
	name: string;
	value: number;
	assetCount: number;
}

/** null = not read; the card shows it as unknown, never as a number. */
interface RWAData {
	tvl: number | null;
	topIssuers: RWAIssuer[];
	totalAssets: number | null;
	/** When rwa.xyz was read, for a reading served from the route's cache. */
	asOf: string | null;
}

const UNKNOWN: RWAData = {
	tvl: null,
	topIssuers: [],
	totalAssets: null,
	asOf: null,
};

export function useRWATVL() {
	return useQuery<RWAData>({
		queryKey: ["/api/rwa-tvl"],
		queryFn: async () => {
			const response = await fetch("/api/rwa-tvl");
			// Review 2026-11-04: a failed read, or one with no figure, showed
			// 1,688,000,000, a figure hard-coded in March 2026.
			if (!response.ok) return UNKNOWN;
			const data = await response.json();
			return {
				tvl: typeof data.tvl === "number" ? data.tvl : null,
				topIssuers: Array.isArray(data.topIssuers) ? data.topIssuers : [],
				totalAssets:
					typeof data.totalAssets === "number" ? data.totalAssets : null,
				asOf: typeof data.asOf === "string" ? data.asOf : null,
			};
		},
		staleTime: 60 * 60 * 1000, // 1 hour client-side cache
	});
}
