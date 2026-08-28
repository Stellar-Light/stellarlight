"use client";

/**
 * Interactive charts for /quality, bklit-style: measured container width,
 * pointer-following tooltips, hover states that dim the rest. Same
 * conventions as sankey-client.tsx.
 *
 * Form choices are the dataviz method's, not chart-shopping:
 * - StageBreakdown: the miss stages are MUTUALLY EXCLUSIVE first-fail
 *   classes, not a sequential narrowing, so a funnel (or a radar) would
 *   draw a mechanism the data does not have. One segmented bar + a row per
 *   stage says exactly what it is.
 * - StateHeatmap: failure-mode x finding-state IS a grid, so it gets the
 *   grid form, with a sequential ramp and a level legend.
 * - QualityScatter: prominence and evidence are two continuous dimensions
 *   per row; the top-right region (prominent, weak) IS the curation queue.
 */

import { Fragment, useEffect, useRef, useState } from "react";

/** The validated sequential ramp (light -> dark), from the page's palette. */
const RAMP = ["#FFF3B8", "#FDDA24", "#CFAE1C", "#9C8318", "#6B5A12"];
const ACCENT = "#FDDA24";

function useMeasuredWidth(initial = 720) {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(initial);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const measure = () => setWidth(Math.max(el.clientWidth, 300));
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return { ref, width };
}

function Tip({
	x,
	y,
	w,
	children,
}: {
	x: number;
	y: number;
	w: number;
	children: React.ReactNode;
}) {
	return (
		<div
			className="pointer-events-none absolute z-10 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-md"
			style={{
				left: Math.min(x + 12, w - 210),
				top: Math.max(y - 44, 0),
				maxWidth: 230,
			}}
		>
			{children}
		</div>
	);
}

// ── Miss stages ────────────────────────────────────────────────────────────

export interface MissStage {
	stage: string;
	label: string;
	owner: string;
	note: string;
	count: number;
	share: number;
	examples: string[];
}

export function StageBreakdown({
	stages,
	sampled,
}: {
	stages: MissStage[];
	sampled: number;
}) {
	const { ref, width } = useMeasuredWidth();
	const [hover, setHover] = useState<string | null>(null);
	const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
	const nonEmpty = stages.filter((s) => s.count > 0);
	const active = stages.find((s) => s.stage === hover) ?? null;

	return (
		<div
			ref={ref}
			className="relative flex flex-col gap-4"
			onMouseLeave={() => setHover(null)}
			onMouseMove={(e) => {
				const box = ref.current?.getBoundingClientRect();
				if (box) setMouse({ x: e.clientX - box.left, y: e.clientY - box.top });
			}}
		>
			{/* one bar, whole population, 2px gaps between segments */}
			<div
				className="flex h-8 w-full overflow-hidden rounded-[4px]"
				role="img"
				aria-label={stages.map((s) => `${s.stage} ${s.count}`).join(", ")}
			>
				{nonEmpty.map((s, i) => (
					<button
						key={s.stage}
						type="button"
						aria-label={`${s.stage}: ${s.count} of ${sampled}`}
						className="h-full transition-opacity duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground"
						style={{
							width: `${(s.count / Math.max(sampled, 1)) * 100}%`,
							background: RAMP[Math.min(i + 1, RAMP.length - 1)],
							opacity: hover === null || hover === s.stage ? 1 : 0.25,
							marginLeft: i === 0 ? 0 : 2,
							minWidth: 6,
						}}
						onMouseEnter={() => setHover(s.stage)}
						onFocus={() => setHover(s.stage)}
						onBlur={() => setHover(null)}
					/>
				))}
			</div>
			{/* one row per stage: what it means, who owns it, real slugs on hover */}
			<div className="flex flex-col gap-1">
				{stages.map((s) => (
					<div
						key={s.stage}
						className="flex items-baseline gap-3 rounded px-2 py-1 -mx-2 transition-colors"
						style={{
							background:
								hover === s.stage
									? "color-mix(in srgb, currentColor 6%, transparent)"
									: undefined,
						}}
						onMouseEnter={() => setHover(s.stage)}
					>
						<span
							className="inline-block h-2.5 w-2.5 rounded-[2px] shrink-0 translate-y-px"
							style={{
								background:
									s.count > 0
										? RAMP[
												Math.min(
													nonEmpty.findIndex((x) => x.stage === s.stage) + 1,
													RAMP.length - 1,
												)
											]
										: "transparent",
								border: s.count === 0 ? "1px solid currentColor" : undefined,
								opacity: s.count === 0 ? 0.25 : 1,
							}}
						/>
						<span className="text-xs font-medium text-foreground capitalize w-20 shrink-0">
							{s.stage}
						</span>
						<span className="text-xs tabular-nums text-foreground w-14 shrink-0">
							{s.count}
							<span className="text-muted-foreground"> · {s.share}%</span>
						</span>
						<span className="text-[11px] text-muted-foreground truncate">
							{s.label} · owner: {s.owner}
						</span>
					</div>
				))}
			</div>
			{active && mouse && (
				<Tip x={mouse.x} y={mouse.y} w={width}>
					<div className="text-foreground capitalize">
						{active.stage} · {active.count} of {sampled}
					</div>
					<div className="text-muted-foreground">{active.note}</div>
					{active.examples.length > 0 && (
						<div className="text-muted-foreground mt-1 tabular-nums">
							e.g. {active.examples.slice(0, 4).join(", ")}
						</div>
					)}
				</Tip>
			)}
		</div>
	);
}

// ── Failure-mode x state heatmap ───────────────────────────────────────────

export interface ModeRow {
	mode: string;
	surface: string;
	open: number;
	cleared: number;
	verified: number;
}

export function StateHeatmap({ rows }: { rows: ModeRow[] }) {
	const { ref, width } = useMeasuredWidth();
	const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
	const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
	const COLS = ["open", "cleared", "verified"] as const;
	const max = Math.max(...rows.flatMap((r) => COLS.map((c) => r[c])), 1);
	// log-ish steps so 250 cleared does not flatten every other cell to level 0
	const level = (v: number) =>
		v === 0
			? -1
			: Math.min(
					Math.floor((Math.log(v + 1) / Math.log(max + 1)) * RAMP.length),
					RAMP.length - 1,
				);
	const cell = hover ? rows[hover.r] : null;

	return (
		<div
			ref={ref}
			className="relative"
			onMouseLeave={() => setHover(null)}
			onMouseMove={(e) => {
				const box = ref.current?.getBoundingClientRect();
				if (box) setMouse({ x: e.clientX - box.left, y: e.clientY - box.top });
			}}
		>
			<div
				className="grid gap-[3px] items-center"
				style={{ gridTemplateColumns: "minmax(120px, 1fr) repeat(3, 56px)" }}
			>
				<span />
				{COLS.map((c) => (
					<span
						key={c}
						className="text-[10px] text-muted-foreground text-center capitalize"
					>
						{c}
					</span>
				))}
				{rows.map((r, ri) => (
					<Fragment key={r.mode}>
						<span
							className="text-[11px] text-muted-foreground truncate pr-2"
							title={r.mode}
						>
							{r.mode}
						</span>
						{COLS.map((c, ci) => {
							const v = r[c];
							const lv = level(v);
							const hovered = hover?.r === ri && hover?.c === ci;
							return (
								<div
									key={c}
									className="h-7 rounded-[3px] transition-transform duration-100 cursor-default"
									style={{
										background: lv < 0 ? "transparent" : RAMP[lv],
										border:
											lv < 0
												? "1px solid color-mix(in srgb, currentColor 12%, transparent)"
												: undefined,
										transform: hovered ? "scale(1.08)" : undefined,
										opacity: hover && !hovered && hover.r !== ri ? 0.45 : 1,
									}}
									onMouseEnter={() => setHover({ r: ri, c: ci })}
								/>
							);
						})}
					</Fragment>
				))}
			</div>
			{/* level legend, bklit-style */}
			<div className="flex items-center gap-1 mt-3 text-[10px] text-muted-foreground">
				<span>fewer</span>
				{RAMP.map((c) => (
					<span
						key={c}
						className="inline-block h-2.5 w-2.5 rounded-[2px]"
						style={{ background: c }}
					/>
				))}
				<span>more</span>
				<span className="ml-3">empty cell = zero</span>
			</div>
			{cell && hover && mouse && (
				<Tip x={mouse.x} y={mouse.y} w={width}>
					<div className="text-foreground">{cell.mode}</div>
					<div className="text-muted-foreground tabular-nums">
						{COLS[hover.c]}: {cell[COLS[hover.c]]} · surface {cell.surface}
					</div>
				</Tip>
			)}
		</div>
	);
}

// ── Prominence vs evidence scatter ─────────────────────────────────────────

export interface ScatterRow {
	slug: string;
	prominence: number;
	factsPresent: number;
	missing: string[];
	status: string | null;
}

export function QualityScatter({
	rows,
	height = 300,
}: {
	rows: ScatterRow[];
	height?: number;
}) {
	const { ref, width } = useMeasuredWidth();
	const [hover, setHover] = useState<number | null>(null);
	const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
	const W = width;
	const H = height;
	const PAD = { l: 34, r: 12, t: 10, b: 26 };
	const maxProm = Math.max(...rows.map((r) => r.prominence), 100);
	const px = (p: number) => PAD.l + (p / maxProm) * (W - PAD.l - PAD.r);
	// deterministic jitter from the slug so the 0-5 bands read as bands, not lines
	const jitter = (slug: string) => {
		let h = 0;
		for (let i = 0; i < slug.length; i++)
			h = (h * 31 + slug.charCodeAt(i)) % 997;
		return (h / 997 - 0.5) * 0.5;
	};
	const py = (f: number, slug: string) =>
		PAD.t + (1 - (f + jitter(slug)) / 5) * (H - PAD.t - PAD.b);
	// the region this chart exists to show: prominent rows with weak evidence
	const QUAD = { promMin: 60, factsMax: 3 };
	const inQuad = (r: ScatterRow) =>
		r.prominence >= QUAD.promMin && r.factsPresent <= QUAD.factsMax;
	const quadCount = rows.filter(inQuad).length;
	const h = hover !== null ? rows[hover] : null;

	return (
		<div
			ref={ref}
			className="relative w-full"
			onMouseLeave={() => setHover(null)}
			onMouseMove={(e) => {
				const box = ref.current?.getBoundingClientRect();
				if (box) setMouse({ x: e.clientX - box.left, y: e.clientY - box.top });
			}}
		>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				width={W}
				height={H}
				className="block"
				role="img"
				aria-label={`Prominence versus evidence for ${rows.length} rows; ${quadCount} prominent rows have 3 or fewer of 5 evidence facts`}
			>
				<title>Prominence vs evidence, one dot per directory row</title>
				{/* work-first region, drawn before the marks */}
				{/* The region covers the WHOLE facts<=3 band: its top edge sits on
				     the midpoint between the 3 and 4 gridlines, so jittered dots at
				     facts=3 land inside the box instead of straddling its border. */}
				<rect
					x={px(QUAD.promMin)}
					y={PAD.t + (1 - (QUAD.factsMax + 0.5) / 5) * (H - PAD.t - PAD.b)}
					width={W - PAD.r - px(QUAD.promMin)}
					height={
						H -
						PAD.b -
						(PAD.t + (1 - (QUAD.factsMax + 0.5) / 5) * (H - PAD.t - PAD.b))
					}
					fill={ACCENT}
					fillOpacity="0.05"
					stroke={ACCENT}
					strokeOpacity="0.25"
					strokeDasharray="3 3"
				/>
				{/* y grid: one line per facts count */}
				{[0, 1, 2, 3, 4, 5].map((f) => (
					<g key={f}>
						<line
							x1={PAD.l}
							x2={W - PAD.r}
							y1={PAD.t + (1 - f / 5) * (H - PAD.t - PAD.b)}
							y2={PAD.t + (1 - f / 5) * (H - PAD.t - PAD.b)}
							stroke="currentColor"
							strokeOpacity="0.07"
						/>
						<text
							x={PAD.l - 8}
							y={PAD.t + (1 - f / 5) * (H - PAD.t - PAD.b)}
							textAnchor="end"
							dominantBaseline="middle"
							className="fill-muted-foreground"
							style={{ fontSize: 9 }}
						>
							{f}/5
						</text>
					</g>
				))}
				{[0, 25, 50, 75, 100].map((p) => (
					<text
						key={p}
						x={px(p)}
						y={H - 8}
						textAnchor="middle"
						className="fill-muted-foreground"
						style={{ fontSize: 9 }}
					>
						{p}
					</text>
				))}
				{rows.map((r, i) => {
					const active = hover === i;
					const urgent = inQuad(r);
					return (
						// biome-ignore lint/a11y/noStaticElementInteractions: hover-first canvas; the queue list below is the keyboard path
						<circle
							key={r.slug}
							cx={px(r.prominence)}
							cy={py(r.factsPresent, r.slug)}
							r={active ? 5 : urgent ? 3.5 : 2.5}
							fill={active || urgent ? ACCENT : "currentColor"}
							fillOpacity={active ? 1 : urgent ? 0.85 : 0.18}
							stroke={active ? "currentColor" : "none"}
							strokeWidth={active ? 1 : 0}
							style={{ cursor: "pointer", transition: "r 100ms" }}
							onMouseEnter={() => setHover(i)}
							onClick={() => {
								window.location.href = `/project/${r.slug}`;
							}}
						/>
					);
				})}
				{/* Label lives in the EMPTY lower part of the region, not on the
				     band where the dots cluster - it was overprinting them. */}
				<text
					x={W - PAD.r - 8}
					y={H - PAD.b - 12}
					textAnchor="end"
					className="fill-muted-foreground"
					style={{ fontSize: 10 }}
				>
					prominent + weak evidence: {quadCount} rows · work these first
				</text>
			</svg>
			<div className="flex justify-between text-[10px] text-muted-foreground mt-1">
				<span>evidence facts held (of 5) ↑</span>
				<span>curated prominence →</span>
			</div>
			{h && mouse && (
				<Tip x={mouse.x} y={mouse.y} w={W}>
					<div className="text-foreground">{h.slug}</div>
					<div className="text-muted-foreground tabular-nums">
						{h.factsPresent}/5 facts · prominence {h.prominence}
						{h.status ? ` · ${h.status}` : ""}
					</div>
					{h.missing.length > 0 && (
						<div className="text-muted-foreground">
							missing {h.missing.join(", ")}
						</div>
					)}
					<div className="text-muted-foreground mt-0.5">
						click to open the row
					</div>
				</Tip>
			)}
		</div>
	);
}

// ── Coverage bar ───────────────────────────────────────────────────────────

/** A labeled progress track: the fraction IS the message, the intent line
 * says what the denominator means, and there is deliberately no
 * "higher is better" arrow — the intent sentence carries the direction. */
export function CoverageBar({
	label,
	value,
	of,
	intent,
	explain,
}: {
	label: string;
	value: number;
	of: number;
	intent: string;
	explain?: string;
}) {
	const pct = of > 0 ? Math.round((value / of) * 100) : 0;
	return (
		<div className="flex flex-col gap-1.5" title={explain}>
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-xs text-foreground">{label}</span>
				<span className="text-xs tabular-nums text-foreground">
					{value.toLocaleString("en-US")}
					<span className="text-muted-foreground">
						{" "}
						/ {of.toLocaleString("en-US")} · {pct}%
					</span>
				</span>
			</div>
			<div className="h-2 w-full rounded-full bg-[color-mix(in_srgb,currentColor_8%,transparent)] overflow-hidden">
				<div
					className="h-full rounded-full transition-[width] duration-300"
					style={{ width: `${pct}%`, background: ACCENT }}
				/>
			</div>
			<p className="text-[11px] text-muted-foreground leading-relaxed">
				{intent}
			</p>
		</div>
	);
}

// ── Mini histogram ─────────────────────────────────────────────────────────

export function MiniHistogram({
	buckets,
	height = 120,
	unit = "repos",
}: {
	buckets: Array<{ bucket: string; count: number }>;
	height?: number;
	unit?: string;
}) {
	const { ref, width } = useMeasuredWidth(420);
	const [hover, setHover] = useState<number | null>(null);
	const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
	const max = Math.max(...buckets.map((b) => b.count), 1);
	const h = hover !== null ? buckets[hover] : null;
	return (
		<div
			ref={ref}
			className="relative"
			onMouseLeave={() => setHover(null)}
			onMouseMove={(e) => {
				const box = ref.current?.getBoundingClientRect();
				if (box) setMouse({ x: e.clientX - box.left, y: e.clientY - box.top });
			}}
		>
			<div className="flex items-end gap-[3px]" style={{ height }}>
				{buckets.map((b, i) => (
					<div
						key={b.bucket}
						className="flex-1 rounded-t-[3px] transition-opacity duration-100"
						style={{
							// 4px floor so an empty bucket is still a visible, hoverable mark
							height: `${Math.max((b.count / max) * 100, 3)}%`,
							background: b.count === 0 ? "transparent" : ACCENT,
							border:
								b.count === 0
									? "1px dashed color-mix(in srgb, currentColor 20%, transparent)"
									: undefined,
							opacity:
								hover === null || hover === i
									? b.count === 0
										? 0.6
										: 0.85
									: 0.3,
						}}
						onMouseEnter={() => setHover(i)}
					/>
				))}
			</div>
			<div className="flex justify-between text-[10px] text-muted-foreground mt-1">
				<span>{buckets[0]?.bucket}</span>
				<span>{buckets[buckets.length - 1]?.bucket}</span>
			</div>
			{h && mouse && (
				<Tip x={mouse.x} y={mouse.y} w={width}>
					<div className="text-foreground tabular-nums">
						score {h.bucket}: {h.count} {unit}
					</div>
				</Tip>
			)}
		</div>
	);
}

// ── Guard-state strip ──────────────────────────────────────────────────────

/** The whole board as one fingerprint: a segment per guard in board order,
 * colored by state. The verdict's counts say how many; this says WHICH, and
 * hover names each without scrolling to the cards. */
export function GuardStateStrip({
	guards,
}: {
	guards: Array<{
		key: string;
		title: string;
		value: string;
		state: "holding" | "breached" | "stale";
	}>;
}) {
	const { ref, width } = useMeasuredWidth();
	const [hover, setHover] = useState<number | null>(null);
	const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
	const COLOR: Record<string, string> = {
		holding: ACCENT,
		breached: "#f87171",
		stale: "#fbbf24",
	};
	const WORD: Record<string, string> = {
		holding: "at target",
		breached: "below target",
		stale: "needs re-measure",
	};
	const h = hover !== null ? guards[hover] : null;
	return (
		<div
			ref={ref}
			className="relative"
			onMouseLeave={() => setHover(null)}
			onMouseMove={(e) => {
				const box = ref.current?.getBoundingClientRect();
				if (box) setMouse({ x: e.clientX - box.left, y: e.clientY - box.top });
			}}
		>
			<div
				className="flex gap-[3px] h-3"
				role="img"
				aria-label={guards
					.map((g) => `${g.title}: ${WORD[g.state]}`)
					.join("; ")}
			>
				{guards.map((g, i) => (
					<div
						key={g.key}
						className="flex-1 rounded-[2px] transition-opacity duration-100"
						style={{
							background: COLOR[g.state],
							opacity:
								hover === null || hover === i
									? g.state === "holding"
										? 0.75
										: 0.95
									: 0.25,
						}}
						onMouseEnter={() => setHover(i)}
					/>
				))}
			</div>
			{h && mouse && (
				<Tip x={mouse.x} y={mouse.y} w={width}>
					<div className="text-foreground">{h.title}</div>
					<div className="text-muted-foreground">
						{WORD[h.state]} · {h.value}
					</div>
				</Tip>
			)}
		</div>
	);
}
