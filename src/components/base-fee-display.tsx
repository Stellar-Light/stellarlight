"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface PriceData {
	price: number;
	volume24h: number;
	marketCap: number;
}

function formatCompact(value: number): string {
	if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
	if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
	if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
	return `$${value.toFixed(0)}`;
}

async function fetchXLMData(): Promise<PriceData | null> {
	try {
		const res = await fetch("/api/xlm-price");
		if (!res.ok) return null;
		const data = await res.json();
		if (!data?.price) return null;

		return {
			price: data.price,
			volume24h: data.volume24h || 0,
			marketCap: data.marketCap || 0,
		};
	} catch {
		return null;
	}
}

export default function BaseFeeDisplay() {
	const [priceData, setPriceData] = useState<PriceData | null>(null);

	const baseFeeStroops = 100;
	const baseFeeXLM = baseFeeStroops / 10_000_000;
	const xlmPrice = priceData?.price ?? 0;
	const baseFeeUSD = baseFeeXLM * xlmPrice;

	useEffect(() => {
		fetchXLMData().then(setPriceData);
		const interval = setInterval(() => {
			fetchXLMData().then(setPriceData);
		}, POLL_INTERVAL);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="absolute top-20 right-4 z-40 group">
			<div className="bg-background/95 backdrop-blur-sm border border-border/60 rounded-full px-3 py-1.5 shadow-sm hover:shadow-md transition-all cursor-default">
				<div className="flex items-center gap-2">
					<div
						className={`w-1.5 h-1.5 rounded-full ${priceData ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`}
					/>
					<div className="flex items-baseline gap-1.5">
						<span className="text-xs text-muted-foreground/80">XLM</span>
						<span className="text-xs font-medium text-foreground">
							{priceData ? `$${xlmPrice.toFixed(4)}` : "..."}
						</span>
					</div>
				</div>
			</div>

			<div className="absolute top-full right-0 mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
				<div className="bg-card border border-border rounded-lg px-4 py-3 shadow-xl min-w-[220px]">
					<div className="space-y-1.5">
						<div className="flex justify-between items-baseline">
							<span className="text-xs text-muted-foreground">Market Cap</span>
							<span className="text-sm font-semibold text-foreground">
								{priceData ? formatCompact(priceData.marketCap) : "–"}
							</span>
						</div>
						<div className="flex justify-between items-baseline">
							<span className="text-xs text-muted-foreground">24h Volume</span>
							<span className="text-sm font-semibold text-foreground">
								{priceData ? formatCompact(priceData.volume24h) : "–"}
							</span>
						</div>
						<div className="flex justify-between items-baseline pt-1.5 border-t border-border/50">
							<span className="text-xs text-muted-foreground">Base Fee</span>
							<span className="text-sm font-semibold text-foreground">
								{baseFeeStroops.toLocaleString()} stroops
							</span>
						</div>
						<div className="flex justify-between items-baseline">
							<span className="text-xs text-muted-foreground">Fee (XLM)</span>
							<span className="text-sm font-semibold text-foreground">
								{baseFeeXLM.toFixed(7)}
							</span>
						</div>
						<div className="flex justify-between items-baseline">
							<span className="text-xs text-muted-foreground">Fee (USD)</span>
							<span className="text-sm font-semibold text-primary">
								{priceData ? `$${baseFeeUSD.toFixed(8)}` : "–"}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
