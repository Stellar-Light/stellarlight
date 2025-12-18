"use client";

import { ExternalLink } from "lucide-react";
import NumberTicker from "@/components/fancy/text/basic-number-ticker";
import { useStellarTVL } from "@/hooks/useStellarTVL";

export default function TVLStats() {
	const { data: stellarTVL = 0, isLoading } = useStellarTVL();
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
			<a
				href="https://defillama.com/chain/Stellar"
				target="_blank"
				rel="noopener noreferrer"
				className="block hover:opacity-80 transition-opacity cursor-pointer"
			>
				<div>
					<div className="flex items-center gap-2 mb-1">
						<p className="text-sm text-muted-foreground">DeFi TVL</p>
						<ExternalLink className="w-3 h-3 text-muted-foreground" />
					</div>
					<p className="text-2xl font-semibold text-foreground">
						{isLoading ? (
							<span className="text-muted-foreground">Loading...</span>
						) : (
							<>
								$
								<NumberTicker
									from={0}
									target={getTVLValue(stellarTVL)}
									autoStart={true}
									transition={{ duration: 2, type: "tween", ease: "easeInOut" }}
								/>
								{getTVLSuffix(stellarTVL)}
							</>
						)}
					</p>
				</div>
			</a>

			<a
				href="https://app.rwa.xyz/networks/stellar"
				target="_blank"
				rel="noopener noreferrer"
				className="block border-l border-border pl-6 hover:opacity-80 transition-opacity cursor-pointer"
			>
				<div>
					<div className="flex items-center gap-2 mb-1">
						<p className="text-sm text-muted-foreground">RWA TVL</p>
						<ExternalLink className="w-3 h-3 text-muted-foreground" />
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
			</a>
		</div>
	);
}

