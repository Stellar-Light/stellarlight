"use client";

/**
 * The two /quality trend charts, on the house bklit kit (the same vendored
 * components every other chart on the site uses) instead of hand-rolled SVG:
 * ComposedChart with stacked SeriesBar columns + a Line overlay, the kit's
 * crosshair tooltip, axes and grid.
 */

import { ComposedChart } from "@/components/charts/composed-chart";
import { Grid } from "@/components/charts/grid";
import { Line } from "@/components/charts/line";
import { SeriesBar } from "@/components/charts/series-bar";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";

const VIOLET = "#a78bfa";
const VIOLET_DEEP = "#7c3aed";
const VIOLET_BRIGHT = "#c4b5fd";
const RED = "#f87171";
const AMBER = "#fbbf24";

function Legend({
	items,
}: {
	items: Array<{ color: string; label: string; line?: boolean }>;
}) {
	return (
		<div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
			{items.map((i) => (
				<span
					key={i.label}
					className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
				>
					<span
						className={
							i.line
								? "inline-block h-[2px] w-4 rounded"
								: "inline-block h-2 w-2 rounded-[2px]"
						}
						style={{ background: i.color }}
					/>
					{i.label}
				</span>
			))}
		</div>
	);
}

// ── Daily eval trend ───────────────────────────────────────────────────────

export interface TrendRow {
	date: string;
	batteryPass: number | null;
	batteryFail: number | null;
	batteryErrors?: number | null;
	openMaps: number | null;
}

export function TrendComposed({ rows }: { rows: TrendRow[] }) {
	const data = rows.map((r) => ({
		date: r.date,
		pass: r.batteryPass ?? 0,
		fail: r.batteryFail ?? 0,
		errors: r.batteryErrors ?? 0,
		openMaps: r.openMaps ?? 0,
	}));
	return (
		<div>
			<ComposedChart
				data={data as unknown as Record<string, unknown>[]}
				xDataKey="date"
				aspectRatio="4 / 1"
				margin={{ top: 8, right: 8, bottom: 24, left: 28 }}
				stacked
				stackGap={2}
				barSize={22}
				maxBarSize={36}
			>
				<Grid horizontal vertical={false} />
				<YAxis />
				<XAxis />
				<SeriesBar dataKey="pass" fill={VIOLET} radius={3} />
				<SeriesBar dataKey="fail" fill={RED} radius={3} />
				<SeriesBar dataKey="errors" fill={AMBER} radius={3} />
				<Line
					dataKey="openMaps"
					stroke={VIOLET_BRIGHT}
					strokeWidth={2}
					animate={false}
				/>
				<ChartTooltip
					showCrosshair
					showDatePill
					rows={(p) => [
						{
							color: VIOLET,
							label: "battery pass",
							value: (p.pass as number) ?? 0,
						},
						{
							color: RED,
							label: "battery fail",
							value: (p.fail as number) ?? 0,
						},
						{
							color: AMBER,
							label: "battery errors",
							value: (p.errors as number) ?? 0,
						},
						{
							color: VIOLET_BRIGHT,
							label: "open maps",
							value: (p.openMaps as number) ?? 0,
						},
					]}
				/>
			</ComposedChart>
			<Legend
				items={[
					{ color: VIOLET, label: "battery pass" },
					{ color: RED, label: "battery fail" },
					{ color: AMBER, label: "battery errors" },
					{
						color: VIOLET_BRIGHT,
						label: "open maps ratchet (line, lower is better)",
						line: true,
					},
				]}
			/>
		</div>
	);
}

// ── Library growth ─────────────────────────────────────────────────────────

export interface LibraryEntry {
	date: string; // yyyy-mm-dd
	label: string;
	kind: "lesson" | "audit" | "receipt";
}

/** Weekly stacked columns by document kind under a cumulative line that only
 * rises. Weekly buckets keep quiet days from reading as a dead surface; the
 * line IS the community-facing claim: the record accumulates. */
export function LibraryComposed({ entries }: { entries: LibraryEntry[] }) {
	const valid = entries
		.filter((e) => /^\d{4}-\d{2}-\d{2}/.test(e.date))
		.sort((a, b) => a.date.localeCompare(b.date));
	if (valid.length === 0) return null;
	const mondayOf = (iso: string) => {
		const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
		return d.toISOString().slice(0, 10);
	};
	const weeks: string[] = [];
	{
		const end = mondayOf(new Date().toISOString().slice(0, 10));
		let w = mondayOf(valid[0].date);
		while (w <= end) {
			weeks.push(w);
			const d = new Date(`${w}T00:00:00Z`);
			d.setUTCDate(d.getUTCDate() + 7);
			w = d.toISOString().slice(0, 10);
		}
	}
	let running = 0;
	const data = weeks.map((w) => {
		const docs = valid.filter((e) => mondayOf(e.date) === w);
		running += docs.length;
		return {
			date: w,
			lessons: docs.filter((e) => e.kind === "lesson").length,
			audits: docs.filter((e) => e.kind === "audit").length,
			receipts: docs.filter((e) => e.kind === "receipt").length,
			cumulative: running,
		};
	});
	return (
		<div>
			<ComposedChart
				data={data as unknown as Record<string, unknown>[]}
				xDataKey="date"
				aspectRatio="4 / 1"
				margin={{ top: 8, right: 8, bottom: 24, left: 28 }}
				stacked
				stackGap={2}
				barSize={18}
				maxBarSize={30}
			>
				<Grid horizontal vertical={false} />
				<YAxis />
				<XAxis />
				<SeriesBar dataKey="lessons" fill={VIOLET} radius={3} />
				<SeriesBar dataKey="audits" fill={VIOLET_DEEP} radius={3} />
				<SeriesBar dataKey="receipts" fill={VIOLET_BRIGHT} radius={3} />
				<Line
					dataKey="cumulative"
					stroke={VIOLET_BRIGHT}
					strokeWidth={2}
					animate={false}
				/>
				<ChartTooltip
					showCrosshair
					showDatePill
					rows={(p) => [
						{
							color: VIOLET,
							label: "lessons",
							value: (p.lessons as number) ?? 0,
						},
						{
							color: VIOLET_DEEP,
							label: "audits",
							value: (p.audits as number) ?? 0,
						},
						{
							color: VIOLET_BRIGHT,
							label: "receipts",
							value: (p.receipts as number) ?? 0,
						},
						{
							color: VIOLET_BRIGHT,
							label: "total by then",
							value: (p.cumulative as number) ?? 0,
						},
					]}
				/>
			</ComposedChart>
			<Legend
				items={[
					{ color: VIOLET, label: "lessons" },
					{ color: VIOLET_DEEP, label: "audits" },
					{ color: VIOLET_BRIGHT, label: "receipts" },
					{
						color: VIOLET_BRIGHT,
						label: `cumulative total (${running})`,
						line: true,
					},
				]}
			/>
		</div>
	);
}
