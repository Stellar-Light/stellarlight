"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { Area } from "@/components/charts/area";
import { AreaChart } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProtocolTVL } from "@/hooks/useProtocolTVL";

function formatTVL(value: number): string {
	if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
	if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
	if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
	return `$${value.toFixed(2)}`;
}

function ChangeIndicator({ value }: { value: number }) {
	const isPositive = value >= 0;
	return (
		<span
			className={`flex items-center gap-1 text-sm font-medium ${isPositive ? "text-green-400" : "text-red-400"}`}
		>
			{isPositive ? (
				<TrendingUp className="w-3.5 h-3.5" />
			) : (
				<TrendingDown className="w-3.5 h-3.5" />
			)}
			{isPositive ? "+" : ""}
			{value.toFixed(2)}%
		</span>
	);
}

export function ProjectTVLChart({ projectName }: { projectName: string }) {
	const { data, isLoading } = useProtocolTVL(projectName);

	if (isLoading || !data) return null;

	const chartData = data.historicalTVL.map((entry) => ({
		date: new Date(entry.date),
		tvl: entry.tvl,
	}));

	return (
		<Card className="mb-8 border border-border/50 bg-card shadow-sm">
			<CardHeader className="pb-4">
				<CardTitle className="text-xl font-bold">Total Value Locked</CardTitle>
			</CardHeader>
			<CardContent>
				{/* Stats Row */}
				<div
					className={`grid grid-cols-1 ${chartData.length > 0 ? "sm:grid-cols-3" : "sm:grid-cols-1 max-w-sm"} gap-4 mb-6`}
				>
					<div className="rounded-lg bg-background/50 border border-border/50 p-4">
						<p className="text-sm text-muted-foreground mb-1">
							Current TVL on Stellar
						</p>
						<p className="text-2xl font-bold text-foreground">
							{formatTVL(data.currentTVL)}
						</p>
					</div>
					{chartData.length > 0 && (
						<>
							<div className="rounded-lg bg-background/50 border border-border/50 p-4">
								<p className="text-sm text-muted-foreground mb-1">24h Change</p>
								<ChangeIndicator value={data.change1d} />
							</div>
							<div className="rounded-lg bg-background/50 border border-border/50 p-4">
								<p className="text-sm text-muted-foreground mb-1">7d Change</p>
								<ChangeIndicator value={data.change7d} />
							</div>
						</>
					)}
				</div>

				{/* Chart */}
				{chartData.length > 0 && (
					<div className="w-full">
						<AreaChart
							data={chartData}
							xDataKey="date"
							aspectRatio="3 / 1"
							animationDuration={800}
							margin={{ top: 10, right: 10, bottom: 30, left: 10 }}
						>
							<Grid horizontal />
							<XAxis />
							<Area
								dataKey="tvl"
								fill="var(--chart-line-primary)"
								fillOpacity={0.15}
								strokeWidth={2}
							/>
							<ChartTooltip
								rows={(point) => [
									{
										color: "var(--chart-line-primary)",
										label: "TVL",
										value: formatTVL(point.tvl as number),
									},
								]}
							/>
						</AreaChart>
					</div>
				)}

				<p className="text-xs text-muted-foreground mt-3">
					{data.historicalTVL.length > 0 ? (
						<>
							Data from{" "}
							<a
								href={`https://defillama.com/protocol/${data.slug}`}
								target="_blank"
								rel="noopener noreferrer"
								className="underline hover:text-foreground transition-colors"
							>
								DeFi Llama
							</a>{" "}
							· Stellar chain only
						</>
					) : data.sourceUrl ? (
						<>
							Data from{" "}
							<a
								href={data.sourceUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="underline hover:text-foreground transition-colors"
							>
								rwa.xyz
							</a>{" "}
							· Stellar chain only
						</>
					) : (
						"TVL based on publicly reported AUM"
					)}
				</p>
			</CardContent>
		</Card>
	);
}
