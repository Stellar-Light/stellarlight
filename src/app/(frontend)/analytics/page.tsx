import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getUsageStats, getUsageUaSplit } from "@/lib/api-usage";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Usage & Analytics | Stellar Light",
	description:
		"Live, public usage and ecosystem analytics for the StellarLight data layer — API consumption by endpoint and by consumer type, plus the maintained dataset's key figures.",
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

function Tile({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<div className="rounded-lg border border-border bg-white/[0.02] p-4">
			<div className="text-xs text-muted-foreground mb-1">{label}</div>
			<div className="text-2xl font-bold text-foreground tabular-nums tracking-tight">
				{value}
			</div>
			{sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
		</div>
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
	const [usage, uaSplit, eco] = await Promise.all([
		getUsageStats(),
		getUsageUaSplit(),
		getEcosystemTopline(),
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

				<div className="mb-10">
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
						Usage &amp; Analytics
					</h1>
					<p className="text-sm text-muted-foreground mt-2 max-w-2xl">
						Live, public numbers for this data layer: who is consuming it and
						what it maintains. Everything on this page is served fresh from the
						same database the API reads — the machine-readable versions live at{" "}
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

				{/* API consumption */}
				<h2 className="text-lg font-semibold text-foreground mb-3">
					API consumption
				</h2>
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
					<Tile label="API calls, all time" value={fmt(usage?.total)} />
					<Tile label="Last 7 days" value={fmt(usage?.last7d)} />
					<Tile label="Last 24 hours" value={fmt(usage?.last24h)} />
					<Tile
						label="Endpoints serving traffic (7d)"
						value={fmt((usage?.byEndpoint ?? []).length)}
						sub="Open REST + MCP, no keys"
					/>
				</div>

				<div className="grid md:grid-cols-2 gap-6 mb-12">
					<div className="rounded-lg border border-border bg-white/[0.02] p-4">
						<div className="text-sm font-medium text-foreground mb-3">
							By endpoint (last 7 days)
						</div>
						<div className="space-y-2">
							{(usage?.byEndpoint ?? []).slice(0, 10).map((e) => (
								<div key={e.endpoint} className="text-xs">
									<div className="flex justify-between text-muted-foreground mb-0.5">
										<span className="font-mono">{e.endpoint}</span>
										<span className="tabular-nums">{fmt(e.count)}</span>
									</div>
									<div className="h-1 rounded bg-white/[0.04]">
										<div
											className="h-1 rounded bg-foreground/40"
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

					<div className="rounded-lg border border-border bg-white/[0.02] p-4">
						<div className="text-sm font-medium text-foreground mb-3">
							By consumer type (last 7 days)
						</div>
						<div className="space-y-2">
							{(uaSplit ?? []).map((r) => (
								<div
									key={r.bucket}
									className="flex justify-between text-xs text-muted-foreground"
								>
									<span>{BUCKET_LABELS[r.bucket] ?? r.bucket}</span>
									<span className="tabular-nums">
										{fmt(r.count)}
										{ua7dTotal > 0 && (
											<span className="ml-2 text-foreground/60">
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
						<div className="text-[11px] text-muted-foreground mt-3 border-t border-border pt-2">
							User agents are bucketed coarsely at log time (no IPs, no full UA
							strings), which limits attribution: server-side agent systems —
							including SDF's Raven, which grounds its ecosystem answers on this
							data — send generic clients and appear under "Other", while the
							named agent buckets only catch interactive AI tools. "Monitoring
							probes" is largely our own automated quality checks auditing the
							service daily.
						</div>
					</div>
				</div>

				{/* The maintained dataset */}
				<h2 className="text-lg font-semibold text-foreground mb-3">
					The maintained dataset
				</h2>
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
					<Tile label="Project records" value={fmt(eco?.projects)} />
					<Tile label="Indexed repositories" value={fmt(eco?.repos)} />
					<Tile
						label="Research documents"
						value={fmt(eco?.research)}
						sub="SEPs, CAPs, dev docs, audits, incidents + more"
					/>
					<Tile label="Partners &amp; anchors" value={fmt(eco?.partners)} />
					<Tile
						label="SCF-funded projects"
						value={fmt(eco?.scfFundedProjects)}
					/>
					<Tile
						label="SCF funding tracked"
						value={fmtUSD(eco?.scfTotalUSD)}
						sub="In-house reconstruction — see /api/analyze"
					/>
				</div>

				<div className="text-xs text-muted-foreground border-t border-border pt-4 space-y-1">
					<p>
						Methodology: usage counts come from the API&apos;s own request log
						(append-only; queries truncated, user agents bucketed, no IPs
						stored). Dataset figures are live collection counts. SCF totals are
						an in-house reconstruction — some award amounts are unpublished —
						and can differ from SDF&apos;s submission-based counters; the full
						basis is documented at{" "}
						<a
							href="/api/analyze?dimension=funding"
							className="underline hover:text-foreground"
						>
							/api/analyze
						</a>
						. Every data change ships dated in the{" "}
						<a
							href="/api/changelog"
							className="underline hover:text-foreground"
						>
							public changelog
						</a>
						.
					</p>
				</div>
			</main>
		</div>
	);
}
