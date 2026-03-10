"use client";

import { useEffect, useState } from "react";

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const ORDERBOOK_URL = `https://horizon.stellar.org/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=USDC&buying_asset_issuer=${USDC_ISSUER}&limit=1`;
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface PriceData {
	price: number;
	bid: number;
	ask: number;
}

async function fetchXLMPrice(): Promise<PriceData | null> {
	try {
		const res = await fetch(ORDERBOOK_URL);
		if (!res.ok) return null;
		const data = await res.json();

		const bid = parseFloat(data.bids?.[0]?.price || "0");
		const ask = parseFloat(data.asks?.[0]?.price || "0");

		if (bid === 0 && ask === 0) return null;

		return { price: (bid + ask) / 2, bid, ask };
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
		fetchXLMPrice().then(setPriceData);
		const interval = setInterval(() => {
			fetchXLMPrice().then(setPriceData);
		}, POLL_INTERVAL);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="absolute top-20 right-4 z-40 group">
			<div className="bg-background/95 backdrop-blur-sm border border-border/60 rounded-full px-3 py-1.5 shadow-sm hover:shadow-md transition-all cursor-default">
				<div className="flex items-center gap-2">
					<div className={`w-1.5 h-1.5 rounded-full ${priceData ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`} />
					<div className="flex items-baseline gap-1.5">
						<span className="text-xs text-muted-foreground/80">XLM</span>
						<span className="text-xs font-medium text-foreground">
							{priceData ? `$${xlmPrice.toFixed(4)}` : "..."}
						</span>
					</div>
				</div>
			</div>

			<div className="absolute top-full right-0 mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
				<div className="bg-card border border-border rounded-lg px-4 py-3 shadow-xl min-w-[200px]">
					<div className="space-y-1.5">
						<div className="flex justify-between items-baseline">
							<span className="text-xs text-muted-foreground">Bid</span>
							<span className="text-sm font-semibold text-foreground">
								{priceData ? `$${priceData.bid.toFixed(4)}` : "–"}
							</span>
						</div>
						<div className="flex justify-between items-baseline">
							<span className="text-xs text-muted-foreground">Ask</span>
							<span className="text-sm font-semibold text-foreground">
								{priceData ? `$${priceData.ask.toFixed(4)}` : "–"}
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
