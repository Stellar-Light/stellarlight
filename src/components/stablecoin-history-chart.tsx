"use client";

/**
 * One dated series from `stablecoin-snapshots`, drawn with the shared chart
 * kit. Used for the two overview totals (market cap, holders) and for a
 * single asset's history on its detail page.
 *
 * The series is genuinely short at first — our own measurement history starts
 * 2026-08-19 — so the sub-two-point case gets an honest "not enough history
 * yet" panel rather than a flat line, which would read as "nothing changed"
 * when the truth is "we have not been watching long enough to say".
 */

import { Area } from "@/components/charts/area";
import { AreaChart } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";

export interface HistoryPoint {
	date: string;
	value: number;
	/** Assets behind this point — shown in the tooltip on the totals charts. */
	assetsCounted?: number;
}

interface Props {
	title: string;
	/** Big current figure, already formatted. */
	headline: string;
	points: HistoryPoint[];
	/** Formats a y value inside the tooltip. */
	format: (n: number) => string;
	/** Sub-line under the headline (e.g. the as-of date). */
	caption?: string;
	/** Noun for the empty state, e.g. "market cap". */
	subject: string;
}

export function StablecoinHistoryChart({
	title,
	headline,
	points,
	format,
	caption,
	subject,
}: Props) {
	const enough = points.length >= 2;

	return (
		<div className="rounded-xl border border-border/50 bg-card p-5">
			<h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
			<p className="text-2xl font-semibold text-foreground mt-1 tabular-nums">
				{headline}
			</p>
			{caption && (
				<p className="text-xs text-muted-foreground mt-1">{caption}</p>
			)}

			{enough ? (
				<div className="w-full mt-4">
					<AreaChart
						data={points as unknown as Record<string, unknown>[]}
						xDataKey="date"
						aspectRatio="3 / 1"
						animationDuration={800}
						margin={{ top: 10, right: 10, bottom: 30, left: 10 }}
					>
						<Grid horizontal />
						<XAxis />
						<Area
							dataKey="value"
							fill="var(--chart-line-primary)"
							fillOpacity={0.15}
							strokeWidth={2}
						/>
						<ChartTooltip
							rows={(point) => {
								const rows = [
									{
										color: "var(--chart-line-primary)",
										label: title,
										value: format(point.value as number),
									},
									{
										color: "transparent",
										label: "Date",
										value: String(point.date),
									},
								];
								if (typeof point.assetsCounted === "number")
									rows.push({
										color: "transparent",
										label: "Assets measured",
										value: String(point.assetsCounted),
									});
								return rows;
							}}
						/>
					</AreaChart>
				</div>
			) : (
				<div className="mt-4 rounded-lg border border-dashed border-border/50 px-4 py-8 text-center">
					<p className="text-sm text-muted-foreground">
						Not enough history to chart {subject} yet.
					</p>
					<p className="text-xs text-muted-foreground/70 mt-1">
						{points.length === 1
							? "One day recorded — a second daily snapshot draws the line."
							: "The series starts once daily snapshots accumulate."}
					</p>
				</div>
			)}
		</div>
	);
}
