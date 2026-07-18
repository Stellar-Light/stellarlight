"use client";

/**
 * Daily API-calls line chart for /analytics — a client component so hover
 * actually works. The previous server-rendered SVG relied on native <title>
 * tooltips, which need a ~1s still hover, never fire on touch, and proved
 * unreliable across browsers. A pointer-tracked crosshair + tooltip replaces
 * them; the visuals (glow line, peak label, sparse ticks) are unchanged.
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

export function UsageChart({ series }: { series: DayPoint[] }) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [hover, setHover] = useState<number | null>(null);
	const plotH = H - PAD_TOP - PAD_BOTTOM;
	const max = Math.max(1, ...series.map((p) => p.count));
	const maxIdx = series.findIndex((p) => p.count === max);
	const step = W / Math.max(1, series.length - 1);
	const pts: Array<[number, number]> = series.map((p, i) => [
		i * step,
		PAD_TOP + plotH - (p.count / max) * plotH,
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
				aria-label={`Daily API calls, last ${series.length} days. Peak ${fmt(max)} on ${monthDay(series[maxIdx]?.date ?? "")}.`}
			>
				<title>Daily API calls</title>
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
				{maxIdx >= 0 && hover !== maxIdx && (
					<g className="text-foreground">
						<circle
							cx={pts[maxIdx][0]}
							cy={pts[maxIdx][1]}
							r="3.5"
							fill={LINE_COLOR}
						/>
						<text
							x={Math.min(Math.max(pts[maxIdx][0], 30), W - 60)}
							y={Math.max(pts[maxIdx][1] - 10, 12)}
							textAnchor="middle"
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
					i % tickEvery === 0 || i === series.length - 1 ? (
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
					<div className="rounded-lg border border-border bg-background/95 px-2.5 py-1.5 shadow-lg whitespace-nowrap text-left">
						<div className="text-[11px] text-muted-foreground">
							{monthDay(h.p.date)}
						</div>
						<div className="text-xs font-medium text-foreground tabular-nums">
							{fmt(h.p.count)} calls
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
