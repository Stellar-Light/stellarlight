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

// Re-check 2026-11-05: the route serves null for a figure it did not read,
// and .toFixed on that null blanked the project page. Unknown reads Unavailable.
const Unavailable = () => (
	<span className="text-muted-foreground">Unavailable</span>
);

/** The source page's host, as the card names it. */
const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
};

function ChangeIndicator({ value }: { value: number | null }) {
	if (value === null)
		return (
			<span className="text-sm font-medium">
				<Unavailable />
			</span>
		);
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

/** The project page's TVL card, keyed by the project's slug: the route
 * serves the project's own row (#1912), so the card and the API row show one
 * figure, one date and one reason, never a protocol matched by name. */
export function ProjectTVLChart({ projectSlug }: { projectSlug: string }) {
	const { data, isLoading } = useProtocolTVL(projectSlug);

	if (isLoading || !data) return null;

	// No history read means no chart, never a crash.
	const history = data.historicalTVL ?? [];
	const chartData = history.map((entry) => ({
		date: new Date(entry.date),
		tvl: entry.tvl,
	}));
	// A project row's weekly figure comes with no 24h or 7d change.
	const changes =
		chartData.length > 0 && (data.change1d !== null || data.change7d !== null);

	return (
		<Card className="mb-8 border border-border/50 bg-card shadow-sm">
			<CardHeader className="pb-4">
				<CardTitle className="text-xl font-bold">Total Value Locked</CardTitle>
			</CardHeader>
			<CardContent>
				{/* Stats Row */}
				<div
					className={`grid grid-cols-1 ${changes ? "sm:grid-cols-3" : "sm:grid-cols-1 max-w-sm"} gap-4 mb-6`}
				>
					<div className="rounded-lg bg-background/50 border border-border/50 p-4">
						<p className="text-sm text-muted-foreground mb-1">TVL on Stellar</p>
						<p className="text-2xl font-bold text-foreground">
							{data.currentTVL !== null ? (
								formatTVL(data.currentTVL)
							) : data.unavailable ? (
								"No figure"
							) : (
								<Unavailable />
							)}
						</p>
						{data.currentTVL !== null && data.asOf && (
							<p className="text-xs text-muted-foreground mt-1">
								as of {data.asOf.slice(0, 10)}
								{data.stale ? ", older than 14 days" : null}
							</p>
						)}
						{data.currentTVL === null && data.unavailable && (
							<p className="text-xs text-muted-foreground mt-1">
								{data.unavailable}
							</p>
						)}
					</div>
					{changes && (
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

				{/* The figure's own source: the page that shows it (a fund token's
				Horizon record, a manual source, or the DefiLlama page that sums
				the row's mapped protocols), and how it is counted when it is not
				one protocol's TVL. No page sums some multi-protocol rows: then
				DefiLlama is named, unlinked. */}
				<p className="text-xs text-muted-foreground mt-3">
					Data from{" "}
					{data.sourceUrl ? (
						<a
							href={data.sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-foreground transition-colors"
						>
							{hostOf(data.sourceUrl)}
						</a>
					) : (
						"DeFi Llama"
					)}{" "}
					· Stellar chain only
					{data.method ? ` · ${data.method}` : null}
				</p>
			</CardContent>
		</Card>
	);
}
