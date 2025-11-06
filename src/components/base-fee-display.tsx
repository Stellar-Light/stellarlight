"use client";

export default function BaseFeeDisplay() {
	// For now, using static values
	// In production, fetch from Stellar Horizon API
	const baseFeeStroops = 100;
	const baseFeeXLM = baseFeeStroops / 10_000_000;
	const xlmPrice = 0.11; // Placeholder
	const baseFeeUSD = baseFeeXLM * xlmPrice;

	return (
		<div className="absolute top-20 right-4 z-40 group">
			<div className="bg-background/95 backdrop-blur-sm border border-border/60 rounded-full px-3 py-1.5 shadow-sm hover:shadow-md transition-all cursor-default">
				<div className="flex items-center gap-2">
					<div className="w-1.5 h-1.5 rounded-full bg-green-500" />
					<div className="flex items-baseline gap-1.5">
						<span className="text-xs text-muted-foreground/80">Fee</span>
						<span className="text-xs font-medium text-foreground">
							${baseFeeUSD.toFixed(6)}
						</span>
					</div>
				</div>
			</div>

			<div className="absolute top-full right-0 mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
				<div className="bg-card border border-border rounded-lg px-4 py-3 shadow-xl min-w-[200px]">
					<div className="space-y-1.5">
						<div className="flex justify-between items-baseline">
							<span className="text-xs text-muted-foreground">Stroops</span>
							<span className="text-sm font-semibold text-foreground">
								{baseFeeStroops.toLocaleString()}
							</span>
						</div>
						<div className="flex justify-between items-baseline">
							<span className="text-xs text-muted-foreground">XLM</span>
							<span className="text-sm font-semibold text-foreground">
								{baseFeeXLM.toFixed(7)}
							</span>
						</div>
						<div className="flex justify-between items-baseline pt-1 border-t border-border/50">
							<span className="text-xs text-muted-foreground">USD</span>
							<span className="text-sm font-semibold text-primary">
								${baseFeeUSD.toFixed(6)}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

