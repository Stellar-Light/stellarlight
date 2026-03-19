"use client";

import { useQuery } from "@tanstack/react-query";

export interface DeFiProtocol {
	name: string;
	tvl: number;
	category: string;
	logo: string;
}

const DEFI_CATEGORIES = [
	"Dexes", "Dexs", "Lending", "Liquid Staking", "CDP",
	"Yield", "DEX Aggregator", "Derivatives", "Yield Aggregator",
	"Liquidity manager",
];

export function useDeFiProtocols() {
	return useQuery<{ topProtocols: DeFiProtocol[]; totalProtocols: number }>({
		queryKey: ["/api/defillama/stellar-protocols"],
		queryFn: async () => {
			const response = await fetch("https://api.llama.fi/protocols");
			const protocols = await response.json();

			const stellarProtocols = protocols
				.filter((p: any) =>
					(p.chains || []).includes("Stellar") &&
					DEFI_CATEGORIES.includes(p.category)
				)
				.map((p: any) => ({
					name: p.name,
					tvl: p.chainTvls?.Stellar || 0,
					category: p.category,
					logo: p.logo || "",
				}))
				.filter((p: DeFiProtocol) => p.tvl > 0)
				.sort((a: DeFiProtocol, b: DeFiProtocol) => b.tvl - a.tvl);

			return {
				topProtocols: stellarProtocols.slice(0, 5),
				totalProtocols: stellarProtocols.length,
			};
		},
		staleTime: 5 * 60 * 1000,
	});
}
