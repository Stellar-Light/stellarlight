/**
 * Quality-page chart primitives. Server-rendered SVG — no client JS, no chart
 * library. Hover tooltips are native <title> elements, which work everywhere
 * including keyboard/screen-reader paths.
 *
 * Palette: the app's chart tokens (globals.css) plus one ORDINAL ramp for
 * ordered categories (provenance tiers, age bands), validated against the
 * dark chart surface with the dataviz six-checks — single hue, monotone
 * lightness, adjacent ΔL ≥ 0.06, light end clears the surface at 2.57:1.
 * Do not hand-edit these hexes; re-run the validator if they must change.
 */
export const RAMP = ["#FFF3B8", "#FDDA24", "#CFAE1C", "#9C8318", "#6B5A12"];
const INK = "#FDDA24"; // --chart-line-primary
const MUTED = "#525252"; // --chart-line-secondary

const nf = new Intl.NumberFormat("en-US");

/** Horizontal bars — magnitude across named categories, one series.
 * Value labels sit outside the bar so a short bar is still readable. */
export function BarList({
	rows,
	unit,
	color = INK,
}: {
	rows: Array<{ label: string; value: number; note?: string }>;
	unit?: string;
	color?: string;
}) {
	const max = Math.max(...rows.map((r) => r.value), 1);
	return (
		<div className="flex flex-col gap-2">
			{rows.map((r) => (
				<div
					key={r.label}
					className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3"
				>
					<span
						className="text-xs text-muted-foreground truncate"
						title={r.label}
					>
						{r.label}
					</span>
					<div className="h-2.5 rounded-[3px] bg-muted/40 overflow-hidden">
						<div
							className="h-full rounded-[3px]"
							style={{
								width: `${Math.max((r.value / max) * 100, r.value > 0 ? 1.5 : 0)}%`,
								backgroundColor: color,
							}}
							title={`${r.label}: ${nf.format(r.value)}${unit ? ` ${unit}` : ""}${r.note ? ` — ${r.note}` : ""}`}
						/>
					</div>
					<span className="text-xs font-medium text-foreground tabular-nums text-right">
						{nf.format(r.value)}
					</span>
				</div>
			))}
		</div>
	);
}

/** Two-series stacked bars (open vs cleared) — the same category compared on
 * two states. Legend required (2 series); a 2px surface gap separates fills. */
export function SplitBarList({
	rows,
}: {
	rows: Array<{ label: string; open: number; cleared: number }>;
}) {
	const max = Math.max(...rows.map((r) => r.open + r.cleared), 1);
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-4 text-[11px] text-muted-foreground">
				<span className="inline-flex items-center gap-1.5">
					<span
						className="h-2 w-2 rounded-[2px]"
						style={{ backgroundColor: INK }}
					/>
					open
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span
						className="h-2 w-2 rounded-[2px]"
						style={{ backgroundColor: MUTED }}
					/>
					cleared
				</span>
			</div>
			<div className="flex flex-col gap-2">
				{rows.map((r) => (
					<div
						key={r.label}
						className="grid grid-cols-[9rem_1fr_4.5rem] items-center gap-3"
					>
						<span
							className="text-xs text-muted-foreground truncate"
							title={r.label}
						>
							{r.label}
						</span>
						<div className="flex h-2.5 gap-[2px]">
							<div
								className="h-full rounded-l-[3px]"
								style={{
									width: `${(r.open / max) * 100}%`,
									backgroundColor: INK,
								}}
								title={`${r.label}: ${r.open} open`}
							/>
							<div
								className="h-full rounded-r-[3px]"
								style={{
									width: `${(r.cleared / max) * 100}%`,
									backgroundColor: MUTED,
								}}
								title={`${r.label}: ${r.cleared} cleared`}
							/>
						</div>
						<span className="text-xs tabular-nums text-right">
							<span className="font-medium text-foreground">{r.open}</span>
							<span className="text-muted-foreground">
								{" "}
								/ {r.open + r.cleared}
							</span>
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

/** One part-to-whole bar for ORDERED categories — the ordinal ramp, strongest
 * evidence first, with a legend carrying counts (identity never color-alone). */
export function StackedRamp({
	rows,
	total,
}: {
	rows: Array<{ label: string; value: number }>;
	total: number;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex h-3 gap-[2px] rounded-[3px] overflow-hidden">
				{rows.map((r, i) => (
					<div
						key={r.label}
						style={{
							width: `${(r.value / Math.max(total, 1)) * 100}%`,
							backgroundColor: RAMP[Math.min(i, RAMP.length - 1)],
						}}
						title={`${r.label}: ${nf.format(r.value)} rows (${Math.round((r.value / Math.max(total, 1)) * 100)}%)`}
					/>
				))}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1.5">
				{rows.map((r, i) => (
					<span
						key={r.label}
						className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
					>
						<span
							className="h-2 w-2 rounded-[2px] shrink-0"
							style={{ backgroundColor: RAMP[Math.min(i, RAMP.length - 1)] }}
						/>
						{r.label}
						<span className="text-foreground tabular-nums font-medium">
							{nf.format(r.value)}
						</span>
					</span>
				))}
			</div>
		</div>
	);
}

/** Area chart with gradient fill, recessive grid, y-axis extremes and dated
 * endpoints. Renders ONLY with ≥2 real points — one observation is a number,
 * not a line, and pretending otherwise is what made the first version bad. */
export function AreaChart({
	points,
	label,
	goodWhen,
}: {
	points: Array<{ date: string; value: number | null }>;
	label: string;
	goodWhen: "up" | "down";
}) {
	const real = points.filter((p) => p.value != null) as Array<{
		date: string;
		value: number;
	}>;
	const latest = real.at(-1);
	if (real.length < 2) {
		return (
			<div className="flex flex-col gap-1">
				<span className="text-xs text-muted-foreground">{label}</span>
				<span className="text-2xl font-semibold text-foreground tabular-nums leading-tight">
					{latest ? nf.format(latest.value) : "—"}
				</span>
				<span className="text-[11px] text-muted-foreground">
					{latest
						? `first observation ${latest.date} — a line needs a second day`
						: "not measured yet"}
				</span>
			</div>
		);
	}
	const W = 260;
	const H = 64;
	const PAD_L = 4;
	const PAD_B = 14;
	const vals = real.map((p) => p.value);
	const min = Math.min(...vals);
	const max = Math.max(...vals);
	const span = max - min || 1;
	const x = (i: number) => PAD_L + (i / (real.length - 1)) * (W - PAD_L * 2);
	const y = (v: number) => 6 + (1 - (v - min) / span) * (H - PAD_B - 10);
	const line = real
		.map(
			(p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`,
		)
		.join(" ");
	const area = `${line} L${x(real.length - 1).toFixed(1)},${H - PAD_B} L${x(0).toFixed(1)},${H - PAD_B} Z`;
	const first = vals[0];
	const last = vals[vals.length - 1];
	const delta = last - first;
	const better = delta === 0 ? null : delta > 0 === (goodWhen === "up");
	const gid = `g-${label.replace(/\W/g, "")}`;
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-xs text-muted-foreground">{label}</span>
				<span className="text-sm font-semibold text-foreground tabular-nums">
					{nf.format(last)}
					{delta !== 0 && (
						<span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
							{delta > 0 ? "+" : ""}
							{nf.format(delta)} {better ? "better" : "worse"}
						</span>
					)}
				</span>
			</div>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full"
				style={{ height: 64 }}
				role="img"
				aria-label={`${label}: ${real.map((p) => `${p.date} ${p.value}`).join(", ")}`}
			>
				<title>{`${label} — ${real.length} observations, ${real[0].date} to ${real.at(-1)?.date}`}</title>
				<defs>
					<linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={INK} stopOpacity="0.28" />
						<stop offset="100%" stopColor={INK} stopOpacity="0" />
					</linearGradient>
				</defs>
				{/* recessive grid: min and max only — the two numbers a reader needs */}
				<line
					x1={PAD_L}
					y1={y(max)}
					x2={W - PAD_L}
					y2={y(max)}
					stroke="currentColor"
					strokeOpacity="0.12"
					strokeWidth="1"
				/>
				<line
					x1={PAD_L}
					y1={y(min)}
					x2={W - PAD_L}
					y2={y(min)}
					stroke="currentColor"
					strokeOpacity="0.12"
					strokeWidth="1"
				/>
				<path d={area} fill={`url(#${gid})`} />
				<path
					d={line}
					fill="none"
					stroke={INK}
					strokeWidth="1.75"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<circle cx={x(real.length - 1)} cy={y(last)} r="2.75" fill={INK} />
				<text
					x={PAD_L}
					y={H - 3}
					className="fill-muted-foreground"
					style={{ fontSize: 9 }}
				>
					{real[0].date.slice(5)}
				</text>
				<text
					x={W - PAD_L}
					y={H - 3}
					textAnchor="end"
					className="fill-muted-foreground"
					style={{ fontSize: 9 }}
				>
					{real.at(-1)?.date.slice(5)}
				</text>
			</svg>
		</div>
	);
}

/** An inline "what does this number mean" affordance. Native title = works
 * on hover, on focus, and for screen readers, with zero client JS. */
export function Info({ text }: { text: string }) {
	return (
		<span
			title={text}
			tabIndex={0}
			role="note"
			aria-label={text}
			className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-border text-[9px] leading-none text-muted-foreground align-middle cursor-help hover:text-foreground hover:border-muted-foreground transition-colors"
		>
			i
		</span>
	);
}

/** A metric that states its own direction. "87%" alone is unreadable — the
 * reader cannot know whether high is good, so every figure carries an arrow
 * and a plain-language definition. */
export function Metric({
	label,
	value,
	sub,
	goodWhen,
	explain,
}: {
	label: string;
	value: string;
	sub?: string;
	goodWhen?: "higher" | "lower";
	explain?: string;
}) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
				{label}
				{explain && <Info text={explain} />}
			</span>
			<span className="text-2xl font-semibold text-foreground tabular-nums leading-tight">
				{value}
			</span>
			<span className="text-[11px] text-muted-foreground">
				{goodWhen && (
					<span className="text-foreground/70">
						{goodWhen === "higher" ? "↑ higher is better" : "↓ lower is better"}
						{sub ? " · " : ""}
					</span>
				)}
				{sub}
			</span>
		</div>
	);
}

/** The gap matrix — entity × missing field, with real examples. A table,
 * because that is the right form: seven rows of mixed text and counts is not
 * a chart, and an agent reading the same data wants the identifiers. */
export function GapMatrix({
	rows,
}: {
	rows: Array<{
		entity: string;
		field: string;
		missing: number;
		of: number;
		whyItMatters: string;
		closedBy: string;
		examples: string[];
	}>;
}) {
	return (
		<div className="flex flex-col divide-y divide-border">
			{rows.map((r) => {
				const pct = Math.round((r.missing / Math.max(r.of, 1)) * 100);
				return (
					<div
						key={`${r.entity}-${r.field}`}
						className="py-3 first:pt-0 last:pb-0"
					>
						<div className="flex items-baseline justify-between gap-4 mb-1.5">
							<span className="text-xs">
								<span className="text-muted-foreground uppercase tracking-wide">
									{r.entity}
								</span>{" "}
								<span className="text-foreground font-medium">{r.field}</span>
							</span>
							<span className="text-xs tabular-nums shrink-0">
								<span className="text-foreground font-medium">{r.missing}</span>
								<span className="text-muted-foreground">
									{" "}
									/ {r.of} missing ({pct}%)
								</span>
							</span>
						</div>
						<div className="h-1.5 rounded-[2px] bg-muted/40 overflow-hidden mb-2">
							<div
								className="h-full rounded-[2px]"
								style={{
									width: `${Math.max(pct, 1)}%`,
									backgroundColor: "#FDDA24",
								}}
								title={`${r.missing} of ${r.of} sampled ${r.entity}s missing ${r.field}`}
							/>
						</div>
						<p className="text-[11px] text-muted-foreground leading-relaxed">
							{r.whyItMatters}{" "}
							<span className="text-foreground/70">
								Closed by: {r.closedBy}
							</span>
						</p>
						{r.examples.length > 0 && (
							<p className="text-[11px] text-muted-foreground mt-1 truncate">
								<span className="text-foreground/60">e.g.</span>{" "}
								{r.examples.slice(0, 6).join(", ")}
							</p>
						)}
					</div>
				);
			})}
		</div>
	);
}

/** Miss funnel — where a known-item miss dies. Not a decorative funnel: each
 * miss is classified at the FIRST stage that failed, so the stages are
 * mutually exclusive and the widths are real shares of the sample. Ordered by
 * how far the query got, shallowest failure first, with the owning area and
 * real examples on every stage. */
export function MissFunnel({
	stages,
	sampled,
}: {
	stages: Array<{
		stage: string;
		label: string;
		owner: string;
		note: string;
		count: number;
		share: number;
		examples: string[];
	}>;
	sampled: number;
}) {
	const max = Math.max(...stages.map((s) => s.count), 1);
	return (
		<div className="flex flex-col gap-4">
			{stages.map((s, i) => (
				<div key={s.stage} className="flex flex-col gap-1.5">
					<div className="flex items-baseline justify-between gap-4">
						<span className="inline-flex items-baseline gap-2 min-w-0">
							<span className="text-xs font-medium text-foreground capitalize shrink-0">
								{s.stage}
							</span>
							<span className="text-[11px] text-muted-foreground truncate">
								{s.label}
							</span>
						</span>
						<span className="text-xs tabular-nums shrink-0">
							<span className="font-medium text-foreground">{s.count}</span>
							<span className="text-muted-foreground"> · {s.share}%</span>
						</span>
					</div>
					<div className="flex justify-center">
						<div
							className="h-6 rounded-[3px]"
							style={{
								width: `${Math.max((s.count / max) * 100, s.count > 0 ? 6 : 2)}%`,
								backgroundColor: RAMP[Math.min(i, RAMP.length - 1)],
								opacity: s.count === 0 ? 0.25 : 1,
							}}
							title={`${s.stage}: ${s.count} of ${sampled} sampled misses (${s.share}%) — owner: ${s.owner}`}
						/>
					</div>
					<p className="text-[11px] text-muted-foreground leading-relaxed">
						<span className="text-foreground/70">owner: {s.owner}</span> —{" "}
						{s.note}
					</p>
					{s.examples.length > 0 && (
						<p className="text-[11px] text-muted-foreground truncate">
							<span className="text-foreground/60">e.g.</span>{" "}
							{s.examples.slice(0, 6).join(", ")}
						</p>
					)}
				</div>
			))}
		</div>
	);
}
