"use client";

import { useQuery } from "@tanstack/react-query";

/** What /api/defillama/protocol/{slug} serves. null = not read: no figure
 * published, or a source this deployment does not read. A failed read is a
 * 503, which hides the card (re-check 2026-11-05). */
export interface ProtocolTVLData {
	found: boolean;
	name: string;
	slug: string;
	logo: string | null;
	category: string;
	currentTVL: number | null;
	change1d: number | null;
	change7d: number | null;
	/** null = no series read; [] = a series with no points */
	historicalTVL: { date: number; tvl: number }[] | null;
	/** Date of the last series point the figures come from. */
	asOf?: string | null;
	sourceUrl?: string; // the figure's own source, when not DefiLlama
	method?: string | null; // how the figure is counted, when it is not a protocol's TVL
}

export function useProtocolTVL(projectName: string | null) {
	return useQuery<ProtocolTVLData | null>({
		queryKey: ["/api/defillama/protocol", projectName],
		queryFn: async () => {
			if (!projectName) return null;
			const res = await fetch(
				`/api/defillama/protocol/${encodeURIComponent(projectName)}`,
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
