import { ArrowUpRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import ecData from "@/data/electric-capital-stellar.json";
import { EcosystemMadChart } from "@/components/ecosystem-mad-chart";
import { EcosystemGeoCards } from "@/components/ecosystem-geo-cards";
import { EcosystemShareableCard } from "@/components/ecosystem-shareable-card";

/** Electric Capital lightning-bolt mark, recreated inline so we don't ship
 *  an external image. The brand color is their cyan. */
function ElectricCapitalLogo({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 100 100"
			xmlns="http://www.w3.org/2000/svg"
			aria-label="Electric Capital"
			className={className}
		>
			<rect width="100" height="100" rx="10" fill="#00BFE9" />
			<path
				d="M55 12 L24 56 H44 L37 88 L74 40 H52 L62 12 Z"
				fill="#FFFFFF"
			/>
		</svg>
	);
}

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
	series365d?: Array<{ date: string; mad: number }>;
	geo?: {
		totalActive28d: number;
		located: number;
		unknown: number;
		topCountries: Array<{ country: string; devs: number }>;
	};
	peers?: Array<{
		id: number;
		name: string;
		current: number;
		series: Array<{ date: string; mad: number }>;
	}>;
}

/** Per-chain colors + render order for the comparison chart.
 *  Peers come first so Stellar's gold line/fill renders on top of them. */
const CHAIN_STYLE: Record<string, { color: string; label: string }> = {
	stellar: { color: "#FDDA24", label: "Stellar" },
	ethereum: { color: "#8A92B2", label: "Ethereum" },
	solana: { color: "#9945FF", label: "Solana" },
	bitcoin: { color: "#F7931A", label: "Bitcoin" },
	polygon: { color: "#8247E5", label: "Polygon" },
	near: { color: "#9CA3AF", label: "NEAR" },
	cardano: { color: "#3B82F6", label: "Cardano" },
};

function peerKey(name: string): string {
	return name.toLowerCase();
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

	// Merge Stellar series + each peer's series into one row-per-date dataset.
	// Each row: { date, stellar, ethereum, solana, ... }
	const stellarPoints = d.series365d ?? [];
	const mergedByDate = new Map<string, Record<string, number | Date>>();
	for (const p of stellarPoints) {
		mergedByDate.set(p.date, { date: new Date(p.date), stellar: p.mad });
	}
	for (const peer of d.peers ?? []) {
		const k = peerKey(peer.name);
		for (const pt of peer.series) {
			const row = mergedByDate.get(pt.date) ?? { date: new Date(pt.date) };
			row[k] = pt.mad;
			mergedByDate.set(pt.date, row);
		}
	}
	const series = Array.from(mergedByDate.values()).sort(
		(a, b) => (a.date as Date).getTime() - (b.date as Date).getTime(),
	);

	// Chart: just Stellar's monthly active devs over the last year. We pulled
	// peer L1 data into the JSON snapshot (it's still queryable via the JSON
	// export, and the PNG card's footer surfaces Stellar's rank among L1s)
	// but rendering multiple chains overlaid in the chart didn't read well
	// at this size, so we keep the on-page chart focused on Stellar.
	const chains = [
		{
			key: "stellar",
			label: "Active devs",
			color: CHAIN_STYLE.stellar.color,
			strokeWidth: 2.5,
			filled: true,
		},
	];

	// Rank info — used by the off-screen PNG card's footer, not on-page.
	const rankedChains = [
		{ name: "Stellar", current: d.mad.total },
		...(d.peers ?? []).map((p) => ({ name: p.name, current: p.current })),
	].sort((a, b) => b.current - a.current);
	const stellarRank = rankedChains.findIndex((e) => e.name === "Stellar") + 1;

	return (
		<section className="mb-8">
			{/* Off-screen export-only render — captured by the PNG button. */}
			<EcosystemShareableCard
				data={series}
				chains={chains}
				stats={{
					activeDevs: d.mad.total,
					commits28d: d.commits28d.total,
					yoyPct: madDelta1y,
					fullTimeDevs: d.tenure.fullTime,
				}}
				asOf={d.asOf}
				stellarRank={stellarRank}
				totalRanked={rankedChains.length}
			/>
			<div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
				<h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
					Ecosystem developer activity
				</h2>
				<a
					href={d.sourceUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
				>
					<ElectricCapitalLogo className="w-4 h-4 rounded-sm" />
					{d.source}
					<ArrowUpRight className="w-3 h-3" />
				</a>
			</div>

			<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
				<StatCard
					label="Active devs (28d)"
					value={d.mad.total.toLocaleString()}
					sub={
						<>
							{d.mad.exclusive.toLocaleString()} Stellar-only ·{" "}
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
					label="Active devs YoY"
					value={`${madDelta1y >= 0 ? "+" : ""}${madDelta1y}%`}
					sub={
						<>
							{d.mad.total.toLocaleString()} now ·{" "}
							{d.mad.oneYearAgo.toLocaleString()} a year ago
						</>
					}
				/>
			</div>

			{series.length > 1 && (
				<div className="rounded-xl border border-border/50 bg-card p-4 mb-2">
					<div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
							Monthly active devs over the last year
						</div>
						<div className="text-[11px] text-muted-foreground/70 tabular-nums">
							{(series[0].date as Date).toLocaleDateString("en-US", {
								month: "short",
								year: "numeric",
							})}{" "}
							→{" "}
							{(series[series.length - 1].date as Date).toLocaleDateString(
								"en-US",
								{ month: "short", year: "numeric" },
							)}
						</div>
					</div>
					<EcosystemMadChart data={series} chains={chains} />
					<div className="text-[11px] text-muted-foreground/60 mt-1">
						“Active dev” = at least one commit to a Stellar ecosystem repo in the trailing 28 days. Hover for daily values.
					</div>
				</div>
			)}

			{d.geo && d.geo.topCountries.length > 0 && (
				<EcosystemGeoCards
					topCountries={d.geo.topCountries}
					located={d.geo.located}
					totalActive={d.geo.totalActive28d}
				/>
			)}

			<div className="text-[11px] text-muted-foreground/70">
				As of {formatDate(d.asOf)} · Snapshot refreshed{" "}
				{formatDate(d.refreshedAt)}
			</div>
		</section>
	);
}
