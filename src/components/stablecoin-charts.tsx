"use client";

/**
 * The four analytics panels from the explorer this page replaces: total
 * holders, market share by token, active addresses by token, and the issuer
 * leaderboard — under one 14D/30D/90D/1Y range control (30D by default).
 *
 * Lines use curveMonotoneX, not the kit's default curveNatural: a natural
 * spline overshoots between sharply different points, and on these series it
 * drew strokes above and below the plot area (measured 2026-09-02 — paths at
 * y=-15 in a 300px panel). Monotone stays inside the data's own range.
 *
 * Two of these panels were rebuilt 2026-09-02 to fix three separate reading
 * defects (see PR #1243): a measurement gap was drawn as a collapse to 0
 * (fixed in the chart kit — `Line`/`Area` now break the path at a gap
 * instead of anchoring it to a fake point, see `series-path-utils.ts`);
 * nothing was labelled (added a legend + up to 4 direct end-labels + a
 * formatted y-axis on both multi-series panels); and the two multi-series
 * panels were the wrong chart form for their data (market share is a 100%
 * stacked area).
 *
 * Follow-up the same day: "Holders by Token" first shipped as a split panel
 * (dominant ticker alone, the rest on their own linear axis) to solve the
 * order-of-magnitude problem — but that broke comparison, since a reader
 * can only ever hover one half at a time. It is back to ONE chart on a log
 * y-axis instead (see y-axis-scales.ts / y-domain-utils.ts /
 * time-series-chart-shell.tsx for the kit-level log-scale support this
 * needed). Also added: an honest "not enough measured days yet" state per
 * panel, instead of drawing a couple of dates as if they were a trend.
 *
 * Palette is theirs verbatim (#262626 cards on #2F2F2F borders, #F5F5F5
 * titles, #999999 descriptions) so this block sits in the page exactly as it
 * did there.
 */

import { curveMonotoneX } from "@visx/curve";
import { useMemo, useState } from "react";
import { Area, AreaChart } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { Line, LineChart } from "@/components/charts/line-chart";
import { SeriesEndLabel } from "@/components/charts/series-end-label";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { IssuerLogo } from "@/components/stablecoin-logos";
import {
	capSeriesWithOther,
	colorFor,
	type IssuerLeader,
	measuredDayCount,
	type SeriesRow,
	stackedBands,
	TIMEFRAMES,
	type Timeframe,
	tickersIn,
	toShare,
	windowed,
} from "@/lib/stablecoin-series";

interface Props {
	/** One row per day: { _date, TICKER: value }. */
	marketCapByToken: SeriesRow[];
	holdersByToken: SeriesRow[];
	/** Total measured market cap per day; each row also carries `assets`, the
	 *  number of assets counted that day. */
	totalMarketCap: SeriesRow[];
	issuers: IssuerLeader[];
	onIssuerClick?: (issuer: IssuerLeader) => void;
}

const CHART_MARGIN = { top: 10, right: 16, bottom: 44, left: 56 };
// Wider right gutter for panels that draw SeriesEndLabel tags past the last
// point — the chart's own <svg> clips at its width, so the tag needs real
// room inside it rather than overflowing into nothing.
const LABELED_MARGIN = { ...CHART_MARGIN, right: 52 };
const CARD =
	"bg-[#262626] border border-[#2F2F2F] rounded-xl shadow-sm h-full flex flex-col";

/** Top N series drawn + labelled on a multi-series panel; the rest fold into
 * a real "Other" sum. Matches the house cap of "5 or 6 top series plus an
 * explicit Other" — see Defect 2 (PR #1243). */
const TOP_N = 5;

/**
 * A window needs at least this many REAL measured days before it is drawn
 * as a chart — below it, a couple of dots dressed up as a trend is worse
 * than saying plainly there isn't enough history yet. A judgment call, not
 * a measured constant: 2 is explicitly too few (a straight line between two
 * points implies a rate of change that one gap can't support), so this
 * gives a bit of margin above that rather than sitting right on the edge.
 */
const MIN_MEASURED_DAYS = 5;

const fmtValue = (v: number) =>
	v >= 1e9
		? `${(v / 1e9).toFixed(1)}B`
		: v >= 1e6
			? `${(v / 1e6).toFixed(1)}M`
			: v >= 1e3
				? `${(v / 1e3).toFixed(1)}K`
				: v.toFixed(0);

const fmtPct = (v: number) => `${v.toFixed(v >= 10 ? 1 : 2)}%`;

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
	titleBadge,
	children,
}: {
	title: string;
	description: string;
	/** Small pill next to the title — used for "Log scale", which must be
	 * impossible to miss: a reader who doesn't see it misreads every gap
	 * between gridlines as an equal step, not a ×10. */
	titleBadge?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className={CARD}>
			<div className="p-6 pb-3">
				<div className="flex items-center gap-2">
					<h3 className="text-[#F5F5F5] text-base font-semibold tracking-tight">
						{title}
					</h3>
					{titleBadge}
				</div>
				<p className="text-[#999999] text-xs mt-1">{description}</p>
			</div>
			<div className="px-6 pb-4 flex-1">{children}</div>
		</div>
	);
}

/** A window with too few real measured days to be an honest trend — say so
 * plainly instead of drawing a line between two dots (or a naked single
 * one). `height` matches whatever chart this replaces so the panel doesn't
 * jump size depending on which state it's in. */
function ThinData({
	measuredDays,
	height = 300,
}: {
	measuredDays: number;
	height?: number;
}) {
	return (
		<div
			className="flex items-center justify-center text-xs text-[#999999] text-center px-6"
			style={{ height }}
		>
			{measuredDays === 0
				? "No measurements in this window yet."
				: `Only ${measuredDays} measured day${measuredDays === 1 ? "" : "s"} in this window — not enough yet for an honest trend.`}
		</div>
	);
}

/** Colour-swatch key for every multi-series panel — house rule: ≥2 series
 * always gets a legend, so identity is never carried by colour alone. */
function Legend({ items }: { items: Array<{ color: string; label: string }> }) {
	return (
		<div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1">
			{items.map((i) => (
				<span
					className="inline-flex items-center gap-1.5 text-[11px] text-[#999999]"
					key={i.label}
				>
					<span
						className="inline-block h-2 w-2 rounded-[2px]"
						style={{ background: i.color }}
					/>
					{i.label}
				</span>
			))}
		</div>
	);
}

function LogScaleBadge() {
	return (
		<span
			className="text-[9px] uppercase tracking-wide text-[#999999] border border-[#3A3A3A] rounded px-1.5 py-0.5 leading-none"
			title="Y-axis is logarithmic: equal gaps between gridlines are equal MULTIPLES (×10), not equal amounts."
		>
			Log scale
		</span>
	);
}

export function StablecoinCharts({
	marketCapByToken,
	holdersByToken,
	totalMarketCap,
	issuers,
	onIssuerClick,
}: Props) {
	const [timeframe, setTimeframe] = useState<Timeframe>("30D");

	const mcap = useMemo(
		() => windowed(marketCapByToken, timeframe),
		[marketCapByToken, timeframe],
	);
	const holders = useMemo(
		() => windowed(holdersByToken, timeframe),
		[holdersByToken, timeframe],
	);
	const mcapTotals = useMemo(
		() => windowed(totalMarketCap, timeframe),
		[totalMarketCap, timeframe],
	);

	// Share, not absolute market cap — see toShare(). Bounded 0-100, so every
	// token is legible on the same axis instead of pinned to the baseline.
	const share = useMemo(() => toShare(mcap), [mcap]);
	// Uncapped, for the tooltip — it stays more generous than what the chart
	// draws (see Defect 2's note on the Holders panel, now true here too).
	const allShareTickers = useMemo(() => tickersIn(share), [share]);
	const shareByDate = useMemo(
		() => new Map(share.map((r) => [String(r._date), r])),
		[share],
	);
	const shareMeasuredDays = useMemo(() => measuredDayCount(share), [share]);

	// A part-to-whole series that always sums to 100 is a share chart, not 8
	// overlapping lines (Defect 3) — 100% stacked area, top N + a real
	// "Other" sum so every band stays legible and labelled.
	const { rows: shareCapped, tickers: shareTickers } = useMemo(
		() => capSeriesWithOther(share, TOP_N),
		[share],
	);
	const shareBands = useMemo(
		() => stackedBands(shareCapped, shareTickers),
		[shareCapped, shareTickers],
	);
	// Paint order for the stack: largest cumulative ("Other", the full
	// stack) first/back, smallest (the single biggest ticker's own band)
	// last/front, so each opaque band fully covers the one behind it and
	// only its own slice shows — see stackedBands()'s doc comment.
	const sharePaintOrder = useMemo(
		() => [...shareTickers].reverse(),
		[shareTickers],
	);

	// Holders spans orders of magnitude (USDC's trustline count dwarfs
	// everyone else's). A split panel (dominant ticker alone, the rest on
	// their own linear axis) solved the squashing but broke comparison — the
	// reader could only ever hover one half. Log y-axis instead: everyone
	// stays in ONE chart with ONE shared hover. See y-axis-scales.ts.
	const holdersMeasuredDays = useMemo(
		() => measuredDayCount(holders),
		[holders],
	);
	// The chart draws `holdersCapped` (top N + a real "Other" sum per day),
	// not raw `holders` — a drawn <Line dataKey="Other"> has nowhere to read
	// an "Other" value from unless the row itself carries one.
	const { rows: holdersCapped, tickers: holderTickers } = useMemo(
		() => capSeriesWithOther(holders, TOP_N),
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

	/**
	 * Every series the Holders chart actually draws, in that fixed order —
	 * not sorted or filtered by value like `topRows`. Log-scale non-negotiable:
	 * a drawn series that wasn't measured on the hovered day says so instead
	 * of silently vanishing from the list, which would read as "this token
	 * doesn't exist" rather than "not measured today". `point` is a
	 * `holdersCapped` row (that's what the chart's `data` is), so `Other` is
	 * already the real per-day sum — no need to recompute it here.
	 */
	const holderTooltipRows = (point: Record<string, unknown>) =>
		holderTickers.map((t) => {
			const v = point[t];
			return {
				color: colorFor(t),
				label: t,
				value: typeof v === "number" ? fmtValue(v) : "not measured",
			};
		});

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
					title="Total Stablecoin Market Cap"
					description="Measured supply × peg price, summed across every asset measured that day. The tooltip gives the asset count — a step in the line when that count jumps is our coverage widening, not the market moving."
				>
					{measuredDayCount(mcapTotals) < MIN_MEASURED_DAYS ? (
						<ThinData measuredDays={measuredDayCount(mcapTotals)} />
					) : (
						<LineChart
							data={mcapTotals as Record<string, unknown>[]}
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
								curve={curveMonotoneX}
								fadeEdges={false}
							/>
							<XAxis numTicks={5} />
							<ChartTooltip
								showDatePill
								rows={(p) => [
									{
										color: "hsl(200, 75%, 60%)",
										label: "Total market cap",
										value: `$${fmtValue(p.total as number)}`,
									},
									// Coverage travels with the value: a jump in the
									// total means nothing until you know whether the
									// asset count jumped with it.
									...(typeof p.assets === "number"
										? [
												{
													color: "hsl(200, 20%, 45%)",
													label: "Assets measured",
													value: String(p.assets),
												},
											]
										: []),
								]}
							/>
						</LineChart>
					)}
				</Panel>
			</div>

			<div className="col-span-full lg:col-span-6">
				<Panel
					title="Stablecoin Market Share by Token"
					description={`Share of measured market cap — top ${TOP_N} assets plus Other, stacked to 100%`}
				>
					{shareMeasuredDays < MIN_MEASURED_DAYS ? (
						<ThinData measuredDays={shareMeasuredDays} height={280} />
					) : (
						<div className="flex flex-col">
							<AreaChart
								data={shareBands as Record<string, unknown>[]}
								xDataKey="_date"
								margin={LABELED_MARGIN}
								animationDuration={900}
								className="h-[280px]"
								aspectRatio="unset"
							>
								<Grid horizontal strokeOpacity={0.2} />
								<YAxis formatValue={fmtPct} numTicks={5} />
								{sharePaintOrder.map((t) => (
									<Area
										key={t}
										dataKey={t}
										fill={colorFor(t)}
										stroke={colorFor(t)}
										strokeWidth={1.5}
										fillOpacity={1}
										gradientToOpacity={1}
										curve={curveMonotoneX}
										fadeEdges={false}
										// Bands are opaque and stack by paint order (see
										// stackedBands()'s doc comment): the default
										// hover-dim would fade every band together and
										// let the ones underneath bleed through, which
										// breaks that illusion. The tooltip + crosshair
										// already carry the interactive read-out.
										showHighlight={false}
									/>
								))}
								{shareTickers.slice(0, 4).map((t) => (
									<SeriesEndLabel
										key={t}
										forKey={t}
										label={t}
										color={colorFor(t)}
									/>
								))}
								<XAxis numTicks={5} />
								<ChartTooltip
									showDatePill
									rows={(p) =>
										topRows(
											shareByDate.get(String(p._date)) ?? p,
											allShareTickers,
											fmtPct,
										)
									}
								/>
							</AreaChart>
							<Legend
								items={shareTickers.map((t) => ({
									color: colorFor(t),
									label: t,
								}))}
							/>
						</div>
					)}
				</Panel>
			</div>

			<div className="col-span-full lg:col-span-6">
				<Panel
					title="Holders by Token"
					description="Accounts holding a trustline in each asset — log scale, since the biggest token's count can be 1,000x the smallest"
					titleBadge={<LogScaleBadge />}
				>
					{holdersMeasuredDays < MIN_MEASURED_DAYS ? (
						<ThinData measuredDays={holdersMeasuredDays} />
					) : (
						<div className="flex flex-col">
							<LineChart
								data={holdersCapped as Record<string, unknown>[]}
								xDataKey="_date"
								margin={LABELED_MARGIN}
								animationDuration={900}
								className="h-[300px]"
								aspectRatio="unset"
								yScaleType="log"
							>
								<Grid horizontal strokeOpacity={0.2} />
								<YAxis formatValue={fmtValue} numTicks={5} />
								{holderTickers.map((k) => (
									<Line
										key={k}
										dataKey={k}
										stroke={colorFor(k)}
										strokeWidth={2}
										curve={curveMonotoneX}
										fadeEdges={false}
									/>
								))}
								{holderTickers.slice(0, 4).map((k) => (
									<SeriesEndLabel
										key={k}
										forKey={k}
										label={k}
										color={colorFor(k)}
									/>
								))}
								<XAxis numTicks={5} />
								<ChartTooltip showDatePill rows={holderTooltipRows} />
							</LineChart>
							<Legend
								items={holderTickers.map((t) => ({
									color: colorFor(t),
									label: t,
								}))}
							/>
						</div>
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
									<IssuerLogo company={issuer.company} domain={issuer.domain} />
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
