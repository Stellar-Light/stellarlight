import { ArrowUpRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import ecData from "@/data/electric-capital-stellar.json";

interface ECStats {
	source: string;
	sourceUrl: string;
	ecosystem: string;
	asOf: string;
	refreshedAt: string;
	mad: {
		total: number;
		exclusive: number;
		multichain: number;
		thirtyDaysAgo: number;
		ninetyDaysAgo: number;
		oneYearAgo: number;
		allTimePeak: number;
		allTimePeakDay: string | null;
	};
	commits28d: { total: number; thirtyDaysAgo: number };
	tenure: { fullTime: number; partTime: number; oneTime: number };
	experience: {
		lessThan1Year: number;
		oneToTwoYears: number;
		twoYearsPlus: number;
	};
}

function deltaPct(current: number, previous: number): number {
	if (!previous) return 0;
	return Math.round(((current - previous) / previous) * 100);
}

function DeltaBadge({ pct }: { pct: number }) {
	if (pct === 0) {
		return (
			<span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
				<Minus className="w-3 h-3" />
				0%
			</span>
		);
	}
	const positive = pct > 0;
	const Icon = positive ? TrendingUp : TrendingDown;
	return (
		<span
			className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? "text-emerald-400" : "text-rose-400"}`}
		>
			<Icon className="w-3 h-3" />
			{positive ? "+" : ""}
			{pct}%
		</span>
	);
}

function StatCard({
	label,
	value,
	sub,
	delta,
}: {
	label: string;
	value: string;
	sub?: React.ReactNode;
	delta?: number;
}) {
	return (
		<div className="rounded-xl border border-border/50 bg-card p-4">
			<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
				{label}
			</div>
			<div className="flex items-baseline gap-2 mb-1">
				<div className="text-2xl font-bold text-foreground tabular-nums tracking-tight">
					{value}
				</div>
				{typeof delta === "number" && <DeltaBadge pct={delta} />}
			</div>
			{sub && <div className="text-xs text-muted-foreground">{sub}</div>}
		</div>
	);
}

export function EcosystemDevStats() {
	const d = ecData as ECStats;

	const madDelta30 = deltaPct(d.mad.total, d.mad.thirtyDaysAgo);
	const madDelta1y = deltaPct(d.mad.total, d.mad.oneYearAgo);
	const commitsDelta30 = deltaPct(d.commits28d.total, d.commits28d.thirtyDaysAgo);

	const formatDate = (iso: string) => {
		try {
			return new Date(iso).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
		} catch {
			return iso;
		}
	};

	return (
		<section className="mb-8">
			<div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
				<h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
					Ecosystem developer activity
				</h2>
				<a
					href={d.sourceUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
				>
					{d.source}
					<ArrowUpRight className="w-3 h-3" />
				</a>
			</div>

			<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
				<StatCard
					label="Monthly active devs"
					value={d.mad.total.toLocaleString()}
					sub={
						<>
							{d.mad.exclusive.toLocaleString()} exclusive ·{" "}
							{d.mad.multichain.toLocaleString()} multichain
						</>
					}
					delta={madDelta30}
				/>
				<StatCard
					label="Commits (28d)"
					value={d.commits28d.total.toLocaleString()}
					sub={<>vs {d.commits28d.thirtyDaysAgo.toLocaleString()} 30d ago</>}
					delta={commitsDelta30}
				/>
				<StatCard
					label="Full-time devs"
					value={d.tenure.fullTime.toLocaleString()}
					sub={
						<>
							{d.tenure.partTime.toLocaleString()} part-time ·{" "}
							{d.tenure.oneTime.toLocaleString()} one-time
						</>
					}
				/>
				<StatCard
					label="YoY MAD growth"
					value={`${madDelta1y >= 0 ? "+" : ""}${madDelta1y}%`}
					sub={
						<>
							{d.mad.total.toLocaleString()} now ·{" "}
							{d.mad.oneYearAgo.toLocaleString()} a year ago
						</>
					}
				/>
			</div>

			<div className="text-[11px] text-muted-foreground/70">
				As of {formatDate(d.asOf)} · Snapshot refreshed{" "}
				{formatDate(d.refreshedAt)}
			</div>
		</section>
	);
}
