"use client";

import { useQuery } from "@tanstack/react-query";

const FALLBACK_TVL = 1_688_000_000;

interface RWAIssuer {
	name: string;
	value: number;
	assetCount: number;
}

interface RWAData {
	tvl: number;
	topIssuers: RWAIssuer[];
	totalAssets: number;
}

export function useRWATVL() {
	return useQuery<RWAData>({
		queryKey: ["/api/rwa-tvl"],
		queryFn: async () => {
			const response = await fetch("/api/rwa-tvl");
			if (!response.ok) {
				return { tvl: FALLBACK_TVL, topIssuers: [], totalAssets: 0 };
			}
			const data = await response.json();
			return {
				tvl: data.tvl || FALLBACK_TVL,
				topIssuers: data.topIssuers || [],
				totalAssets: data.totalAssets || 0,
			};
		},
		staleTime: 60 * 60 * 1000, // 1 hour client-side cache
	});
}
