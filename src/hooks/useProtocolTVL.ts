"use client";

import { useQuery } from "@tanstack/react-query";

export interface ProtocolTVLData {
	found: boolean;
	name: string;
	slug: string;
	logo: string;
	category: string;
	currentTVL: number;
	change1d: number;
	change7d: number;
	historicalTVL: { date: number; tvl: number }[];
	sourceUrl?: string; // for manual overrides (e.g. rwa.xyz)
}

export function useProtocolTVL(projectName: string | null) {
	return useQuery<ProtocolTVLData | null>({
		queryKey: ["/api/defillama/protocol", projectName],
		queryFn: async () => {
			if (!projectName) return null;
			const res = await fetch(
				`/api/defillama/protocol/${encodeURIComponent(projectName)}`
			);
			if (!res.ok) return null;
			const data = await res.json();
			if (!data.found) return null;
			return data as ProtocolTVLData;
		},
		enabled: !!projectName,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}
