"use client";

import { ExternalLink } from "lucide-react";
import NumberTicker from "@/components/fancy/text/basic-number-ticker";

interface ChainData {
	name: string;
	tvl: number;
	tokenSymbol: string;
}

export default function TVLStats() {
	// For now, we'll use static values or fetch from API
	// In production, you'd use React Query or similar
	const stellarTVL = 50000000; // Placeholder - in production fetch from API
	const rwaTVL = 608800000;

	const getTVLValue = (value: number) => {
		if (value >= 1_000_000_000) {
			return value / 1_000_000_000;
		}
		if (value >= 1_000_000) {
			return value / 1_000_000;
		}
		return value;
	};

	const getTVLSuffix = (value: number) => {
		if (value >= 1_000_000_000) {
			return "B";
		}
		if (value >= 1_000_000) {
			return "M";
		}
		return "";
	};

	return (
		<div className="flex flex-wrap gap-6 mt-6">
			<div>
				<div className="flex items-center gap-2 mb-1">
					<p className="text-sm text-muted-foreground">DeFi TVL</p>
					<a
						href="https://defillama.com/chain/Stellar"
						target="_blank"
						rel="noopener noreferrer"
						className="text-muted-foreground hover:text-foreground transition-colors"
					>
						<ExternalLink className="w-3 h-3" />
					</a>
				</div>
				<p className="text-2xl font-semibold text-foreground">
					$
					<NumberTicker
						from={0}
						target={getTVLValue(stellarTVL)}
						autoStart={true}
						transition={{ duration: 2, type: "tween", ease: "easeInOut" }}
					/>
					{getTVLSuffix(stellarTVL)}
				</p>
			</div>

			<div className="border-l border-border pl-6">
				<div className="flex items-center gap-2 mb-1">
					<p className="text-sm text-muted-foreground">RWA TVL</p>
					<a
						href="https://app.rwa.xyz/networks/stellar"
						target="_blank"
						rel="noopener noreferrer"
						className="text-muted-foreground hover:text-foreground transition-colors"
					>
						<ExternalLink className="w-3 h-3" />
					</a>
				</div>
				<p className="text-2xl font-semibold text-foreground">
					$
					<NumberTicker
						from={0}
						target={getTVLValue(rwaTVL)}
						autoStart={true}
						transition={{ duration: 2, type: "tween", ease: "easeInOut" }}
					/>
					{getTVLSuffix(rwaTVL)}
				</p>
			</div>
		</div>
	);
}

