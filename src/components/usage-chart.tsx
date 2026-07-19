"use client";

/**
 * Cumulative API-calls chart for /analytics — a client component so hover
 * actually works (native SVG <title> tooltips need a ~1s still hover and
 * never fire on touch). A pointer-tracked crosshair + tooltip shows the
 * running total plus each day's new calls.
 *
 * Cumulative, not daily, on purpose: the chart's job is to show accumulated
 * adoption — a monotonic curve ending at the all-time headline number. Daily
 * counts read at the scale of one day and undersell the usage; they live in
 * the tooltip instead. Axis stays 0-based so the scale is honest.
 */

import { useRef, useState } from "react";

export interface DayPoint {
	date: string; // YYYY-MM-DD
	count: number;
}

/** The single-series accent (bklit's soft violet) — shared with the legend dot. */
export const LINE_COLOR = "#c4b5fd";

const W = 900;
const H = 240;
const PAD_TOP = 24;
const PAD_BOTTOM = 28;

function fmt(n: number): string {
	return n.toLocaleString("en-US");
}

function monthDay(iso: string): string {
	const d = new Date(`${iso}T00:00:00Z`);
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

/** Smooth cubic path through points (1/3-gap control points). */
function smoothPath(pts: Array<[number, number]>): string {
	if (pts.length < 2) return "";
	let d = `M ${pts[0][0]},${pts[0][1]}`;
	for (let i = 1; i < pts.length; i++) {
		const [x0, y0] = pts[i - 1];
		const [x1, y1] = pts[i];
		const dx = (x1 - x0) / 3;
		d += ` C ${x0 + dx},${y0} ${x1 - dx},${y1} ${x1},${y1}`;
	}
	return d;
}

export function UsageChart({
	series,
	baseline = 0,
}: {
	series: DayPoint[];
	/** All-time calls BEFORE the charted window — the curve starts here. */
	baseline?: number;
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [hover, setHover] = useState<number | null>(null);
	const plotH = H - PAD_TOP - PAD_BOTTOM;
	const cum: number[] = [];
	let run = Math.max(0, baseline);
	for (const p of series) {
		run += p.count;
		cum.push(run);
	}
	const max = Math.max(1, cum[cum.length - 1] ?? 1);
	const endIdx = series.length - 1;
	const step = W / Math.max(1, series.length - 1);
	const pts: Array<[number, number]> = cum.map((v, i) => [
		i * step,
		PAD_TOP + plotH - (v / max) * plotH,
	]);
	const line = smoothPath(pts);
	const tickEvery = 7; // sparse date ticks

	function onPointer(e: React.PointerEvent) {
		const rect = wrapRef.current?.getBoundingClientRect();
		if (!rect || series.length === 0 || rect.width === 0) return;
		const x = ((e.clientX - rect.left) / rect.width) * W;
		const i = Math.round(x / step);
		setHover(Math.max(0, Math.min(series.length - 1, i)));
	}

	const h =
		hover != null && pts[hover]
			? { p: series[hover], x: pts[hover][0], y: pts[hover][1] }
			: null;
	// Tooltip sits above the point, or below it when the point is near the top.
	const flip = h != null && h.y < 70;

	return (
		<div
			ref={wrapRef}
			className="relative"
			onPointerMove={onPointer}
			onPointerDown={onPointer}
			onPointerLeave={() => setHover(null)}
		>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="block w-full h-auto"
				role="img"
				aria-label={`Cumulative API calls over the last ${series.length} days, ending at ${fmt(max)} total.`}
			>
				<title>Total API calls</title>
				<line
					x1="0"
					y1={H - PAD_BOTTOM}
					x2={W}
					y2={H - PAD_BOTTOM}
					stroke="currentColor"
					strokeOpacity="0.12"
				/>
				{/* soft glow under-stroke, then the line — the bklit look */}
				<path
					d={line}
					fill="none"
					stroke={LINE_COLOR}
					strokeOpacity="0.25"
					strokeWidth="6"
					strokeLinecap="round"
				/>
				<path
					d={line}
					fill="none"
					stroke={LINE_COLOR}
					strokeOpacity="0.95"
					strokeWidth="2"
					strokeLinecap="round"
				/>
				{h && (
					<g>
						<line
							x1={h.x}
							y1={PAD_TOP - 10}
							x2={h.x}
							y2={H - PAD_BOTTOM}
							stroke="currentColor"
							strokeOpacity="0.15"
						/>
						<circle
							cx={h.x}
							cy={h.y}
							r="4"
							fill={LINE_COLOR}
							stroke="rgba(0,0,0,0.5)"
							strokeWidth="1.5"
						/>
					</g>
				)}
				{endIdx >= 0 && hover !== endIdx && (
					<g className="text-foreground">
						<circle
							cx={pts[endIdx][0]}
							cy={pts[endIdx][1]}
							r="3.5"
							fill={LINE_COLOR}
						/>
						<text
							x={Math.min(pts[endIdx][0], W - 4)}
							y={Math.max(pts[endIdx][1] - 12, 12)}
							textAnchor="end"
							fontSize="12"
							fill="currentColor"
							fillOpacity="0.9"
							className="tabular-nums"
						>
							{fmt(max)}
						</text>
					</g>
				)}
				{series.map((p, i) =>
					// The last date always shows; periodic ticks within 3 days of it
					// are dropped so the two labels can't overlap.
					(i % tickEvery === 0 && i < series.length - 4) ||
					i === series.length - 1 ? (
						<text
							key={p.date}
							x={pts[i][0]}
							y={H - 8}
							textAnchor={
								i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"
							}
							fontSize="11"
							fill="currentColor"
							fillOpacity="0.45"
							className="text-muted-foreground"
						>
							{monthDay(p.date)}
						</text>
					) : null,
				)}
			</svg>
			{h && (
				<div
					className="pointer-events-none absolute z-10"
					style={{
						left: `${Math.min(93, Math.max(7, (h.x / W) * 100))}%`,
						top: `${(h.y / H) * 100}%`,
						transform: flip
							? "translate(-50%, 14px)"
							: "translate(-50%, calc(-100% - 14px))",
					}}
				>
					{/* Fully opaque — a translucent tooltip blends into the line/grid. */}
					<div className="rounded-lg border border-white/20 bg-background px-3 py-2 shadow-xl shadow-black/50 whitespace-nowrap text-left">
						<div className="text-[11px] text-white/60">
							{monthDay(h.p.date)}
						</div>
						<div className="text-sm font-semibold text-white tabular-nums">
							{fmt(hover != null ? cum[hover] : 0)} total
						</div>
						<div className="text-[11px] text-white/60 tabular-nums">
							+{fmt(h.p.count)} that day
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
