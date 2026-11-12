"use client";

import { useQuery } from "@tanstack/react-query";

/** What /api/defillama/protocol/{project slug} serves: a fund token's own
 * figure (Benji), a manual source (WisdomTree), or the project's own row as
 * its API row serves it (#1912: never a name match). null = not read: no
 * figure published, or a source this deployment does not read. A failed read
 * is a 503, which hides the card (re-check 2026-11-05). */
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
	/** Date of the reading the figure comes from. */
	asOf?: string | null;
	/** The row's figure is more than 14 days old (tvlStale). */
	stale?: boolean | null;
	/** Why a linked row holds no figure, dated (tvlUnavailable). */
	unavailable?: string | null;
	sourceUrl?: string | null; // the page that shows the figure
	method?: string | null; // how the figure is counted, when it is not one protocol's TVL
}

export function useProtocolTVL(projectSlug: string | null) {
	return useQuery<ProtocolTVLData | null>({
		queryKey: ["/api/defillama/protocol", projectSlug],
		queryFn: async () => {
			if (!projectSlug) return null;
			const res = await fetch(
				`/api/defillama/protocol/${encodeURIComponent(projectSlug)}`,
			);
			if (!res.ok) return null;
			const data = await res.json();
			if (!data.found) return null;
			return data as ProtocolTVLData;
		},
		enabled: !!projectSlug,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}
