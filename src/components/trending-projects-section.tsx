import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { TrendingUp, Star, ArrowRight, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function TrendingProjectsSection() {
	const payload = await getPayloadSafe();
	if (!payload) return null;

	let trending: Array<{
		id: string;
		name: string;
		slug: string;
		totalStars: number;
		lastActivityAt: string | null;
		openIssuesTotal: number;
		category: string;
	}> = [];

	try {
		// Try to find projects with recent GitHub activity (last 7 days)
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

		let signalsResult = await payload.find({
			collection: "signals",
			where: {
				"github.lastActivityAt": {
					greater_than: sevenDaysAgo.toISOString(),
				},
			},
			sort: "-github.lastActivityAt",
			limit: 8,
			depth: 1,
		});

		// Fallback: if no recent activity, show most recently updated signals
		if (signalsResult.docs.length === 0) {
			signalsResult = await payload.find({
				collection: "signals",
				sort: "-updatedAt",
				limit: 8,
				depth: 1,
			});
		}

		trending = signalsResult.docs
			.map((signal: any) => {
				const project = signal.project;
				if (!project || typeof project === "string") return null;
				if (!["Development", "Pre-Release", "Live"].includes(project.status)) return null;
				const repoStars = (signal.github?.repos || []).reduce(
					(sum: number, r: any) => sum + (r.stargazerCount || 0),
					0,
				);
				return {
					id: project.id,
					name: project.name,
					slug: project.slug,
					totalStars: signal.github?.totalStars || repoStars,
					lastActivityAt: signal.github?.lastActivityAt ?? null,
					openIssuesTotal: signal.github?.openIssuesTotal ?? 0,
					category: project.category,
				};
			})
			.filter(Boolean) as typeof trending;
	} catch {
		return null;
	}

	if (trending.length === 0) return null;

	const formatRelativeDate = (dateString: string | null): string => {
		if (!dateString) return "";
		const diffMs = Date.now() - new Date(dateString).getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		if (diffDays === 0) return "Today";
		if (diffDays === 1) return "Yesterday";
		if (diffDays < 7) return `${diffDays}d ago`;
		return `${Math.floor(diffDays / 7)}w ago`;
	};

	return (
		<section className="mb-16">
			<div className="flex items-center justify-between mb-10">
				<div>
					<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-foreground">
						Trending Projects
					</h2>
					<p className="text-muted-foreground">
						Most active projects this week
					</p>
				</div>
				<Link
					href="/leaderboard"
					className="hidden sm:flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
				>
					View Leaderboard
					<ArrowRight className="w-4 h-4" />
				</Link>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				{trending.map((project) => (
					<Link
						key={project.id}
						href={`/project/${project.slug}`}
						className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card hover:bg-card/80 hover:border-primary/30 transition-all duration-150 hover:shadow-sm hover:-translate-y-0.5"
					>
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-500/20 to-green-500/10 border border-green-500/20 flex-shrink-0">
							<TrendingUp className="w-5 h-5 text-green-400" />
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2 mb-1">
								<p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
									{project.name}
								</p>
								<Badge variant="outline" className="text-xs px-2 py-0.5 flex-shrink-0">
									{project.category}
								</Badge>
							</div>
							<div className="flex items-center gap-3 text-sm text-muted-foreground">
								<span className="flex items-center gap-1">
									<Star className="w-3.5 h-3.5 text-[#FDDA24]" />
									{project.totalStars.toLocaleString()}
								</span>
								{project.lastActivityAt && (
									<span className="flex items-center gap-1">
										<Activity className="w-3.5 h-3.5" />
										{formatRelativeDate(project.lastActivityAt)}
									</span>
								)}
							</div>
						</div>
						<ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
					</Link>
				))}
			</div>
		</section>
	);
}

export function TrendingProjectsSkeleton() {
	return (
		<section className="mb-16">
			<div className="mb-10">
				<div className="h-10 w-52 bg-[#262626] rounded animate-pulse mb-2" />
				<div className="h-4 w-56 bg-[#262626] rounded animate-pulse" />
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				{Array.from({ length: 8 }).map((_, i) => (
					<div key={i} className="h-[72px] rounded-xl bg-[#262626] animate-pulse" />
				))}
			</div>
		</section>
	);
}
