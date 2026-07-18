import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getUsageStats, getUsageUaSplit } from "@/lib/api-usage";
import { getPayloadSafe } from "@/lib/payload-client";

// Recomputed at most every 5 minutes — 30 daily-window counts per render is
// fine on M0 behind ISR, not fine on every request.
export const revalidate = 300;

export const metadata: Metadata = {
	title: "Usage & Analytics | Stellar Light",
	description:
		"Live, public usage and ecosystem analytics for the StellarLight data layer — API consumption over time, by endpoint and by consumer type, plus the maintained dataset's key figures.",
};

const BUCKET_LABELS: Record<string, string> = {
	claude: "Claude (agents)",
	codex: "Codex (agents)",
	cursor: "Cursor (agents)",
	agent: "Other AI agents",
	browser: "Browsers (people)",
	curl: "curl / scripts",
	bot: "Crawlers/bots",
	probe: "Monitoring probes",
	other: "Other",
};

function fmt(n: number | null | undefined): string {
	if (n == null) return "—";
	return n.toLocaleString("en-US");
}

function fmtUSD(n: number | null | undefined): string {
	if (n == null) return "—";
	if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
	return `$${n}`;
}

/** Borderless stat — muted label, big tabular number, optional sub line. */
function Stat({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<div>
			<div className="text-xs text-muted-foreground mb-1.5">{label}</div>
			<div className="text-3xl font-bold text-foreground tabular-nums tracking-tight leading-none">
				{value}
			</div>
			{sub && <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>}
		</div>
	);
}

interface DayPoint {
	date: string; // YYYY-MM-DD
	count: number;
}

/** Daily API-call counts for the last `days` days (UTC buckets). */
async function getDailySeries(days: number): Promise<DayPoint[] | null> {
	const payload = await getPayloadSafe();
	if (!payload) return null;
	try {
		const now = new Date();
		const dayMs = 24 * 60 * 60 * 1000;
		const starts: Date[] = [];
		for (let i = days - 1; i >= 0; i--) {
			const d = new Date(now.getTime() - i * dayMs);
			starts.push(
				new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())),
			);
		}
		const counts = await Promise.all(
			starts.map((s) =>
				payload.count({
					collection: "api-usage",
					where: {
						and: [
							{ createdAt: { greater_than_equal: s.toISOString() } },
							{
								createdAt: {
									less_than: new Date(s.getTime() + dayMs).toISOString(),
								},
							},
						],
					},
				}),
			),
		);
		return starts.map((s, i) => ({
			date: s.toISOString().slice(0, 10),
			count: counts[i].totalDocs,
		}));
	} catch {
		return null;
	}
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

/** The big area chart — server-rendered SVG, per-day native hover tooltips. */
function UsageChart({ series }: { series: DayPoint[] }) {
	const W = 900;
	const H = 240;
	const PAD_TOP = 24;
	const PAD_BOTTOM = 28;
	const plotH = H - PAD_TOP - PAD_BOTTOM;
	const max = Math.max(1, ...series.map((p) => p.count));
	const maxIdx = series.findIndex((p) => p.count === max);
	const step = W / Math.max(1, series.length - 1);
	const pts: Array<[number, number]> = series.map((p, i) => [
		i * step,
		PAD_TOP + plotH - (p.count / max) * plotH,
	]);
	const line = smoothPath(pts);
	const area = `${line} L ${W},${H - PAD_BOTTOM} L 0,${H - PAD_BOTTOM} Z`;
	const tickEvery = 7; // sparse date ticks
	const monthDay = (iso: string) => {
		const d = new Date(`${iso}T00:00:00Z`);
		return d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			timeZone: "UTC",
		});
	};

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full h-auto"
			role="img"
			aria-label={`Daily API calls, last ${series.length} days. Peak ${fmt(max)} on ${monthDay(series[maxIdx]?.date ?? "")}.`}
		>
			<title>Daily API calls</title>
			<defs>
				<linearGradient id="usage-fill" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
					<stop offset="100%" stopColor="currentColor" stopOpacity="0" />
				</linearGradient>
			</defs>
			<line
				x1="0"
				y1={H - PAD_BOTTOM}
				x2={W}
				y2={H - PAD_BOTTOM}
				stroke="currentColor"
				strokeOpacity="0.12"
			/>
			<path d={area} fill="url(#usage-fill)" className="text-foreground" />
			<path
				d={line}
				fill="none"
				stroke="currentColor"
				strokeOpacity="0.75"
				strokeWidth="2"
				className="text-foreground"
			/>
			{maxIdx >= 0 && (
				<g className="text-foreground">
					<circle
						cx={pts[maxIdx][0]}
						cy={pts[maxIdx][1]}
						r="3.5"
						fill="currentColor"
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
			{series.map((p, i) => (
				<rect
					key={`h-${p.date}`}
					x={i * step - step / 2}
					y={0}
					width={step}
					height={H - PAD_BOTTOM}
					fill="transparent"
				>
					<title>{`${monthDay(p.date)} — ${fmt(p.count)} calls`}</title>
				</rect>
			))}
		</svg>
	);
}

async function getEcosystemTopline() {
	const payload = await getPayloadSafe();
	if (!payload) return null;
	try {
		const [projects, repos, research, partners, funded] = await Promise.all([
			payload.count({ collection: "projects" }),
			payload.count({ collection: "repos" }),
			payload.count({ collection: "research-docs" }),
			payload.count({ collection: "partner-accounts" }),
			payload.find({
				collection: "projects",
				where: { "scf.awarded": { equals: true } },
				limit: 1000,
				depth: 0,
				pagination: false,
				select: { scf: true },
			}),
		]);
		let scfTotalUSD = 0;
		for (const d of funded.docs as Array<{
			scf?: { totalAwarded?: number | null };
		}>) {
			if (typeof d.scf?.totalAwarded === "number")
				scfTotalUSD += d.scf.totalAwarded;
		}
		return {
			projects: projects.totalDocs,
			repos: repos.totalDocs,
			research: research.totalDocs,
			partners: partners.totalDocs,
			scfFundedProjects: funded.docs.length,
			scfTotalUSD,
		};
	} catch {
		return null;
	}
}

export default async function AnalyticsPage() {
	const [usage, uaSplit, eco, series] = await Promise.all([
		getUsageStats(),
		getUsageUaSplit(),
		getEcosystemTopline(),
		getDailySeries(30),
	]);

	const ua7dTotal = (uaSplit ?? []).reduce((s, r) => s + r.count, 0);
	const maxEndpoint = Math.max(
		1,
		...(usage?.byEndpoint ?? []).map((e) => e.count),
	);

	return (
		<div className="min-h-screen relative">
			<main className="max-w-4xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Home</span>
				</Link>

				<div className="mb-12">
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
						Usage &amp; Analytics
					</h1>
					<p className="text-sm text-muted-foreground mt-2 max-w-2xl">
						Live, public numbers for this data layer: who is consuming it and
						what it maintains. Served fresh from the same database the API reads
						— machine-readable at{" "}
						<a href="/api/status" className="underline hover:text-foreground">
							/api/status
						</a>{" "}
						and{" "}
						<a href="/api/analyze" className="underline hover:text-foreground">
							/api/analyze
						</a>
						.
					</p>
				</div>

				{/* Borderless stat row */}
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-8 mb-12">
					<Stat label="API calls · all time" value={fmt(usage?.total)} />
					<Stat label="Last 7 days" value={fmt(usage?.last7d)} />
					<Stat label="Last 24 hours" value={fmt(usage?.last24h)} />
					<Stat
						label="Endpoints serving traffic"
						value={fmt((usage?.byEndpoint ?? []).length)}
						sub="Open REST + MCP, no keys"
					/>
				</div>

				{/* The big chart */}
				{series && series.length > 1 && (
					<div className="mb-14">
						<div className="flex items-baseline justify-between mb-2">
							<h2 className="text-sm font-medium text-foreground">
								Daily API calls
							</h2>
							<span className="text-xs text-muted-foreground">
								Last 30 days
							</span>
						</div>
						<UsageChart series={series} />
					</div>
				)}

				{/* Borderless lists */}
				<div className="grid md:grid-cols-2 gap-x-12 gap-y-10 mb-14">
					<div>
						<h2 className="text-sm font-medium text-foreground mb-4">
							By endpoint{" "}
							<span className="text-muted-foreground font-normal">
								· last 7 days
							</span>
						</h2>
						<div className="space-y-2.5">
							{(usage?.byEndpoint ?? []).slice(0, 10).map((e) => (
								<div key={e.endpoint} className="text-xs">
									<div className="flex justify-between text-muted-foreground mb-1">
										<span className="font-mono">{e.endpoint}</span>
										<span className="tabular-nums text-foreground/80">
											{fmt(e.count)}
										</span>
									</div>
									<div className="h-[3px] rounded bg-white/[0.05]">
										<div
											className="h-[3px] rounded bg-foreground/50"
											style={{
												width: `${Math.max(2, Math.round((e.count / maxEndpoint) * 100))}%`,
											}}
										/>
									</div>
								</div>
							))}
							{(usage?.byEndpoint ?? []).length === 0 && (
								<div className="text-xs text-muted-foreground">
									Usage data unavailable right now.
								</div>
							)}
						</div>
					</div>

					<div>
						<h2 className="text-sm font-medium text-foreground mb-4">
							By consumer type{" "}
							<span className="text-muted-foreground font-normal">
								· last 7 days
							</span>
						</h2>
						<div className="space-y-2.5">
							{(uaSplit ?? []).map((r) => (
								<div
									key={r.bucket}
									className="flex justify-between text-xs text-muted-foreground"
								>
									<span>{BUCKET_LABELS[r.bucket] ?? r.bucket}</span>
									<span className="tabular-nums">
										<span className="text-foreground/80">{fmt(r.count)}</span>
										{ua7dTotal > 0 && (
											<span className="ml-2 inline-block w-9 text-right text-foreground/50">
												{Math.round((r.count / ua7dTotal) * 100)}%
											</span>
										)}
									</span>
								</div>
							))}
							{(uaSplit ?? []).length === 0 && (
								<div className="text-xs text-muted-foreground">
									Split unavailable right now.
								</div>
							)}
						</div>
						<p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
							User agents are bucketed coarsely at log time (no IPs, no full UA
							strings), which limits attribution: server-side agent systems —
							including SDF&apos;s Raven, which grounds its ecosystem answers on
							this data — send generic clients and appear under
							&quot;Other&quot;, while the named agent buckets only catch
							interactive AI tools. &quot;Monitoring probes&quot; is largely our
							own automated quality checks auditing the service daily.
						</p>
					</div>
				</div>

				{/* The maintained dataset */}
				<h2 className="text-sm font-medium text-foreground mb-6">
					The maintained dataset
				</h2>
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-8 mb-14">
					<Stat label="Project records" value={fmt(eco?.projects)} />
					<Stat label="Indexed repositories" value={fmt(eco?.repos)} />
					<Stat
						label="Research documents"
						value={fmt(eco?.research)}
						sub="SEPs, CAPs, dev docs, audits + more"
					/>
					<Stat label="Partners & anchors" value={fmt(eco?.partners)} />
					<Stat
						label="SCF-funded projects"
						value={fmt(eco?.scfFundedProjects)}
					/>
					<Stat
						label="SCF funding tracked"
						value={fmtUSD(eco?.scfTotalUSD)}
						sub="In-house reconstruction — see /api/analyze"
					/>
				</div>

				<div className="text-xs text-muted-foreground border-t border-border pt-4 leading-relaxed">
					Methodology: usage counts come from the API&apos;s own request log
					(append-only; queries truncated, user agents bucketed, no IPs stored).
					Daily series is UTC-bucketed. Dataset figures are live collection
					counts. SCF totals are an in-house reconstruction — some award amounts
					are unpublished — and can differ from SDF&apos;s submission-based
					counters; full basis at{" "}
					<a
						href="/api/analyze?dimension=funding"
						className="underline hover:text-foreground"
					>
						/api/analyze
					</a>
					. Every data change ships dated in the{" "}
					<a href="/api/changelog" className="underline hover:text-foreground">
						public changelog
					</a>
					.
				</div>
			</main>
		</div>
	);
}
