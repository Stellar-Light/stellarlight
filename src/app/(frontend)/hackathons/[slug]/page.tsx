import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	ArrowLeft,
	Calendar,
	ExternalLink,
	Trophy,
	Activity,
	CheckCircle2,
	XCircle,
	Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

const STATUS_META = {
	Built: {
		label: "Built",
		icon: CheckCircle2,
		classes: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
	},
	"In Progress": {
		label: "In Progress",
		icon: Clock,
		classes: "bg-blue-500/15 text-blue-400 border-blue-500/30",
	},
	Abandoned: {
		label: "Abandoned",
		icon: XCircle,
		classes: "bg-white/5 text-muted-foreground border-border/50",
	},
} as const;

type HackathonStatusKey = keyof typeof STATUS_META;

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { slug } = await params;
	const payload = await getPayloadSafe();
	if (!payload) return { title: "Hackathon Not Found" };

	try {
		const result = await payload.find({
			collection: "hackathons",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
		});
		const h = result.docs[0] as any;
		if (!h) return { title: "Hackathon Not Found" };
		return {
			title: h.name,
			description:
				h.description?.slice(0, 160) ??
				`Stellar hackathon: ${h.name}. See submitted projects and which ones shipped.`,
		};
	} catch {
		return { title: "Hackathon Not Found" };
	}
}

function formatDate(d?: string | null) {
	if (!d) return "—";
	return new Date(d).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatDateRange(start?: string | null, end?: string | null) {
	if (!start || !end) return "";
	const s = new Date(start);
	const e = new Date(end);
	const sameYear = s.getFullYear() === e.getFullYear();
	const sameMonth = sameYear && s.getMonth() === e.getMonth();
	if (sameMonth) {
		return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${e.getDate()}, ${e.getFullYear()}`;
	}
	if (sameYear) {
		return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${e.getFullYear()}`;
	}
	return `${formatDate(start)} – ${formatDate(end)}`;
}

function getLogoUrl(logo: any): string | null {
	if (!logo || typeof logo !== "object") return null;
	if (logo.url) return logo.url;
	if (logo.filename) return `/media/${logo.filename}`;
	return null;
}

function StatusBadge({ status }: { status: HackathonStatusKey }) {
	const meta = STATUS_META[status];
	if (!meta) return null;
	const Icon = meta.icon;
	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${meta.classes}`}
		>
			<Icon className="w-3 h-3" />
			{meta.label}
		</span>
	);
}

function StatBlock({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<div className="rounded-2xl border border-border/50 bg-card p-5">
			<div className="text-xs uppercase tracking-wide text-muted-foreground/80 mb-2">
				{label}
			</div>
			<div className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
				{value}
			</div>
			{sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
		</div>
	);
}

function ProjectCard({ p }: { p: any }) {
	const logo = getLogoUrl(p.logo);
	const status = p.hackathonStatus as HackathonStatusKey | undefined;

	return (
		<Link
			href={`/project/${p.slug}`}
			className="group block rounded-2xl border border-border/50 hover:border-border bg-card p-5 transition-colors"
		>
			<div className="flex items-start gap-4 mb-3">
				{logo ? (
					<Image
						src={logo}
						alt={p.name}
						width={48}
						height={48}
						className="w-12 h-12 rounded-xl object-cover border border-border/50 flex-shrink-0"
					/>
				) : (
					<div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-border/50 flex items-center justify-center flex-shrink-0">
						<Activity className="w-5 h-5 text-muted-foreground" />
					</div>
				)}
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2 mb-1">
						<h3 className="text-base font-semibold text-foreground group-hover:text-white transition-colors leading-tight truncate">
							{p.name}
						</h3>
						{status && <StatusBadge status={status} />}
					</div>
					<div className="text-xs text-muted-foreground">
						{p.category}
						{p.types && p.types.length > 0 && (
							<>
								<span className="mx-1">·</span>
								{p.types.slice(0, 2).join(", ")}
							</>
						)}
					</div>
				</div>
			</div>
			{p.shortDescription && (
				<p className="text-sm text-muted-foreground line-clamp-2">
					{p.shortDescription}
				</p>
			)}
		</Link>
	);
}

export default async function HackathonDetailPage({
	params,
}: {
	params: Params;
}) {
	const { slug } = await params;
	const payload = await getPayloadSafe();
	if (!payload) notFound();

	const hackResult = await payload.find({
		collection: "hackathons",
		where: { slug: { equals: slug } },
		limit: 1,
		depth: 2,
	});
	const hackathon = hackResult.docs[0] as any;
	if (!hackathon) notFound();

	// Fetch projects linked to this hackathon. Use a direct query (not the join field)
	// so we can apply our standard "show only approved-ish statuses" filter.
	const projectsResult = await payload.find({
		collection: "projects",
		where: {
			hackathon: { equals: hackathon.id },
		},
		limit: 200,
		depth: 1,
		sort: "-relevanceScore",
	});
	const projects = projectsResult.docs as any[];

	const totalProjects = projects.length;
	const byStatus = projects.reduce<Record<string, number>>((acc, p) => {
		const s = p.hackathonStatus ?? "Unknown";
		acc[s] = (acc[s] ?? 0) + 1;
		return acc;
	}, {});
	const builtCount = byStatus["Built"] ?? 0;
	const inProgressCount = byStatus["In Progress"] ?? 0;
	const abandonedCount = byStatus["Abandoned"] ?? 0;
	const trackedCount = builtCount + inProgressCount + abandonedCount;
	const shippedPct =
		trackedCount > 0
			? Math.round(((builtCount + inProgressCount) / trackedCount) * 100)
			: 0;

	const organizer =
		typeof hackathon.organizer === "object" && hackathon.organizer
			? hackathon.organizer
			: null;

	const status = hackathon.status as
		| "upcoming"
		| "active"
		| "completed"
		| undefined;

	return (
		<div className="min-h-screen">
			<main className="max-w-5xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/hackathons"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-8 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">All hackathons</span>
				</Link>

				{/* Hero */}
				<div className="mb-10">
					<div className="flex items-center gap-2 mb-3">
						{status && (
							<Badge
								className={
									status === "active"
										? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
										: status === "upcoming"
											? "bg-blue-500/15 text-blue-400 border-blue-500/30"
											: "bg-white/5 text-muted-foreground border-border/50"
								}
							>
								{status === "active"
									? "Live"
									: status === "upcoming"
										? "Upcoming"
										: "Completed"}
							</Badge>
						)}
						{organizer?.name && (
							<span className="text-xs text-muted-foreground">
								organized by{" "}
								<span className="text-foreground">{organizer.name}</span>
							</span>
						)}
					</div>
					<h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
						{hackathon.name}
					</h1>
					<div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
						<span className="inline-flex items-center gap-1.5">
							<Calendar className="w-4 h-4" />
							{formatDateRange(hackathon.startDate, hackathon.endDate)}
						</span>
						{hackathon.externalUrl && (
							<a
								href={hackathon.externalUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-foreground hover:underline underline-offset-4"
							>
								<ExternalLink className="w-4 h-4" />
								Official site
							</a>
						)}
					</div>
					{hackathon.description && (
						<p className="text-base text-muted-foreground leading-relaxed max-w-3xl">
							{hackathon.description}
						</p>
					)}
				</div>

				{/* Stats banner */}
				{totalProjects > 0 && (
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
						<StatBlock
							label="Submitted projects"
							value={totalProjects.toString()}
						/>
						<StatBlock
							label="Still building"
							value={(builtCount + inProgressCount).toString()}
							sub={`${shippedPct}% of tracked`}
						/>
						<StatBlock
							label="Shipped"
							value={builtCount.toString()}
							sub="status: Built"
						/>
						<StatBlock
							label="Abandoned"
							value={abandonedCount.toString()}
							sub="status: Abandoned"
						/>
					</div>
				)}

				{/* Conversion funnel */}
				{trackedCount > 0 && (
					<div className="mb-12">
						<h2 className="text-xl font-bold text-foreground mb-4">
							Outcomes funnel
						</h2>
						<div className="rounded-2xl border border-border/50 bg-card p-5">
							<FunnelBar
								label="Built (still alive)"
								count={builtCount}
								total={trackedCount}
								color="bg-emerald-500"
							/>
							<FunnelBar
								label="In Progress"
								count={inProgressCount}
								total={trackedCount}
								color="bg-blue-500"
							/>
							<FunnelBar
								label="Abandoned"
								count={abandonedCount}
								total={trackedCount}
								color="bg-white/20"
							/>
						</div>
					</div>
				)}

				{/* Projects gallery */}
				<section className="mb-12">
					<div className="flex items-baseline gap-3 mb-5">
						<h2 className="text-2xl font-bold text-foreground tracking-tight">
							Projects
						</h2>
						{totalProjects > 0 && (
							<span className="text-sm text-muted-foreground">
								{totalProjects} submitted
							</span>
						)}
					</div>

					{totalProjects === 0 ? (
						<div className="rounded-2xl border border-border/50 bg-card p-8 text-center">
							<Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
							<p className="text-sm text-muted-foreground mb-1">
								No projects from this hackathon are tracked yet.
							</p>
							<p className="text-xs text-muted-foreground/60">
								Projects appear here once linked from the main directory.
							</p>
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{projects.map((p) => (
								<ProjectCard key={p.id} p={p} />
							))}
						</div>
					)}
				</section>
			</main>
		</div>
	);
}

function FunnelBar({
	label,
	count,
	total,
	color,
}: {
	label: string;
	count: number;
	total: number;
	color: string;
}) {
	const pct = total > 0 ? Math.round((count / total) * 100) : 0;
	return (
		<div className="mb-3 last:mb-0">
			<div className="flex items-center justify-between text-sm mb-1.5">
				<span className="text-foreground">{label}</span>
				<span className="text-muted-foreground">
					{count} · {pct}%
				</span>
			</div>
			<div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
				<div
					className={`h-full ${color} rounded-full transition-all`}
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}
