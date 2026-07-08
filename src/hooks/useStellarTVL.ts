"use client";

import { useQuery } from "@tanstack/react-query";

interface Chain {
	name: string;
	tvl: number;
	tokenSymbol: string;
}

export function useStellarTVL() {
	return useQuery<number>({
		queryKey: ["/api/defillama/stellar-tvl"],
		queryFn: async () => {
			const response = await fetch("https://api.llama.fi/chains");
			const chains: Chain[] = await response.json();
			const stellar = chains.find((c) => c.name === "Stellar");
			return stellar?.tvl || 0;
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}
