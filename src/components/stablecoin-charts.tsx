"use client";

/**
 * The four analytics panels from the explorer this page replaces: total
 * holders, market share by token, active addresses by token, and the issuer
 * leaderboard — under one 14D/30D/90D/1Y range control.
 *
 * Palette is theirs verbatim (#262626 cards on #2F2F2F borders, #F5F5F5
 * titles, #999999 descriptions) so this block sits in the page exactly as it
 * did there.
 */

import { useMemo, useState } from "react";
import { Grid } from "@/components/charts/grid";
import { Line, LineChart } from "@/components/charts/line-chart";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import {
	colorFor,
	type IssuerLeader,
	type SeriesRow,
	TIMEFRAMES,
	type Timeframe,
	tickersIn,
	windowed,
} from "@/lib/stablecoin-series";

interface Props {
	/** One row per day: { _date, TICKER: value }. */
	marketCapByToken: SeriesRow[];
	holdersByToken: SeriesRow[];
	totalHolders: SeriesRow[];
	issuers: IssuerLeader[];
	onIssuerClick?: (issuer: IssuerLeader) => void;
}

const CHART_MARGIN = { top: 10, right: 16, bottom: 44, left: 56 };
const CARD =
	"bg-[#262626] border border-[#2F2F2F] rounded-xl shadow-sm h-full flex flex-col";

const fmtValue = (v: number) =>
	v >= 1e9
		? `${(v / 1e9).toFixed(1)}B`
		: v >= 1e6
			? `${(v / 1e6).toFixed(1)}M`
			: v >= 1e3
				? `${(v / 1e3).toFixed(1)}K`
				: v.toFixed(0);

const fmtCurrency = (v: number) =>
	v >= 1e9
		? `$${(v / 1e9).toFixed(2)}B`
		: v >= 1e6
			? `$${(v / 1e6).toFixed(2)}M`
			: v >= 1e3
				? `$${(v / 1e3).toFixed(2)}K`
				: `$${v.toFixed(2)}`;

function Panel({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div className={CARD}>
			<div className="p-6 pb-3">
				<h3 className="text-[#F5F5F5] text-base font-semibold tracking-tight">
					{title}
				</h3>
				<p className="text-[#999999] text-xs mt-1">{description}</p>
			</div>
			<div className="px-6 pb-4 flex-1">{children}</div>
		</div>
	);
}

/** A series shorter than two points cannot be drawn as a line — say so. */
function TooShort() {
	return (
		<div className="h-[300px] flex items-center justify-center text-xs text-[#999999]">
			Collecting data...
		</div>
	);
}

export function StablecoinCharts({
	marketCapByToken,
	holdersByToken,
	totalHolders,
	issuers,
	onIssuerClick,
}: Props) {
	const [timeframe, setTimeframe] = useState<Timeframe>("14D");

	const mcap = useMemo(
		() => windowed(marketCapByToken, timeframe),
		[marketCapByToken, timeframe],
	);
	const holders = useMemo(
		() => windowed(holdersByToken, timeframe),
		[holdersByToken, timeframe],
	);
	const totals = useMemo(
		() => windowed(totalHolders, timeframe),
		[totalHolders, timeframe],
	);

	const mcapTickers = useMemo(() => tickersIn(mcap).slice(0, 16), [mcap]);
	const holderTickers = useMemo(
		() => tickersIn(holders).slice(0, 16),
		[holders],
	);

	/** Top rows of a hovered point, biggest first — the explorer capped at 8. */
	const topRows = (
		point: Record<string, unknown>,
		tickers: string[],
		format: (n: number) => string,
	) =>
		tickers
			.map((k) => ({ key: k, value: (point[k] as number) || 0 }))
			.filter((e) => e.value > 0)
			.sort((a, b) => b.value - a.value)
			.slice(0, 8)
			.map((e) => ({
				color: colorFor(e.key),
				label: e.key,
				value: format(e.value),
			}));

	return (
		<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
			<div className="col-span-full flex justify-end">
				<div className="inline-flex h-9 items-center rounded-lg bg-[#262626] border border-[#2F2F2F] p-1">
					{TIMEFRAMES.map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setTimeframe(t)}
							className={`px-3 h-7 rounded-md text-sm transition-colors ${
								timeframe === t
									? "bg-white/10 text-[#F5F5F5]"
									: "text-[#A3A3A3] hover:text-[#F5F5F5]"
							}`}
						>
							{t}
						</button>
					))}
				</div>
			</div>

			<div className="col-span-full lg:col-span-6">
				<Panel
					title="Total Stablecoin Holders"
					description="Aggregate unique wallet addresses over time"
				>
					{totals.length < 2 ? (
						<TooShort />
					) : (
						<LineChart
							data={totals as Record<string, unknown>[]}
							xDataKey="_date"
							margin={CHART_MARGIN}
							animationDuration={900}
							className="h-[300px]"
							aspectRatio="unset"
						>
							<Grid horizontal strokeOpacity={0.2} />
							<Line
								dataKey="total"
								stroke="hsl(200, 75%, 60%)"
								strokeWidth={2}
								fadeEdges={false}
							/>
							<XAxis numTicks={5} />
							<ChartTooltip
								showDatePill
								rows={(p) => [
									{
										color: "hsl(200, 75%, 60%)",
										label: "Total Holders",
										value: fmtValue(p.total as number),
									},
								]}
							/>
						</LineChart>
					)}
				</Panel>
			</div>

			<div className="col-span-full lg:col-span-6">
				<Panel
					title="Stablecoin Market Share by Token"
					description="Market share breakdown by individual asset"
				>
					{mcap.length < 2 ? (
						<TooShort />
					) : (
						<LineChart
							data={mcap as Record<string, unknown>[]}
							xDataKey="_date"
							margin={CHART_MARGIN}
							animationDuration={900}
							className="h-[300px]"
							aspectRatio="unset"
						>
							<Grid horizontal strokeOpacity={0.2} />
							{mcapTickers.map((k) => (
								<Line
									key={k}
									dataKey={k}
									stroke={colorFor(k)}
									strokeWidth={2}
									fadeEdges={false}
								/>
							))}
							<XAxis numTicks={5} />
							<ChartTooltip
								showDatePill
								rows={(p) => topRows(p, mcapTickers, fmtCurrency)}
							/>
						</LineChart>
					)}
				</Panel>
			</div>

			<div className="col-span-full lg:col-span-6">
				<Panel
					title="Stablecoin Active Addresses by Token"
					description="Unique wallet counts over time"
				>
					{holders.length < 2 ? (
						<TooShort />
					) : (
						<LineChart
							data={holders as Record<string, unknown>[]}
							xDataKey="_date"
							margin={CHART_MARGIN}
							animationDuration={900}
							className="h-[300px]"
							aspectRatio="unset"
						>
							<Grid horizontal strokeOpacity={0.2} />
							{holderTickers.map((k) => (
								<Line
									key={k}
									dataKey={k}
									stroke={colorFor(k)}
									strokeWidth={2}
									fadeEdges={false}
								/>
							))}
							<XAxis numTicks={5} />
							<ChartTooltip
								showDatePill
								rows={(p) => topRows(p, holderTickers, fmtValue)}
							/>
						</LineChart>
					)}
				</Panel>
			</div>

			<div className="col-span-full lg:col-span-6">
				<Panel
					title="Top Issuers"
					description="Leading stablecoin issuers by market cap"
				>
					<div className="h-[300px] overflow-auto">
						<div className="space-y-2">
							{issuers.slice(0, 8).map((issuer) => (
								<button
									type="button"
									key={issuer.company}
									onClick={() => onIssuerClick?.(issuer)}
									className="w-full text-left flex items-center gap-3 p-3 rounded-lg bg-[#1F1F1F] transition-colors hover:bg-[#2A2A2A] cursor-pointer"
								>
									<div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center">
										<span className="text-[#999999] text-xs font-medium">
											{issuer.company.charAt(0)}
										</span>
									</div>
									<div className="flex-1 min-w-0">
										<div className="text-[#F5F5F5] font-medium text-sm truncate">
											{issuer.company}
										</div>
										<div className="text-[#999999] text-xs mt-0.5 truncate">
											{issuer.tokens.join(", ")}
										</div>
									</div>
									<div className="flex-shrink-0 text-right">
										<div className="text-[#F5F5F5] text-sm font-semibold tabular-nums">
											{fmtCurrency(issuer.totalMarketCapUSD)}
										</div>
										{issuer.hasEstimate && (
											<div className="text-[#999999] text-[10px] mt-0.5">
												includes an estimate
											</div>
										)}
									</div>
								</button>
							))}
						</div>
					</div>
				</Panel>
			</div>
		</div>
	);
}
