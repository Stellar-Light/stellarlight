"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useStellarTVL } from "@/hooks/useStellarTVL";

export default function StellarTVLDisplay() {
	const { data: tvl, isLoading } = useStellarTVL();

	if (isLoading) {
		return (
			<div className="flex items-center gap-2">
				<span className="text-sm text-muted-foreground">Stellar TVL:</span>
				<Skeleton className="h-6 w-24" />
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<span className="text-sm text-muted-foreground">Stellar TVL:</span>
			<span className="text-lg font-semibold text-foreground">
				${(tvl || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
			</span>
		</div>
	);
}
