"use client";

import { useQuery } from "@tanstack/react-query";

interface Chain {
	name: string;
	tvl: number;
	tokenSymbol: string;
}

export function useStellarTVL() {
	// null = not read: the card shows it as unknown, never as $0.
	return useQuery<number | null>({
		queryKey: ["/api/defillama/stellar-tvl"],
		queryFn: async () => {
			const response = await fetch("https://api.llama.fi/chains");
			// Review 2026-11-04: a failed read or a missing Stellar row read as $0.
			if (!response.ok) return null;
			const chains: Chain[] = await response.json();
			const stellar = chains.find((c) => c.name === "Stellar");
			return typeof stellar?.tvl === "number" ? stellar.tvl : null;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}
