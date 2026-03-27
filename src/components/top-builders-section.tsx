import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { Star, ArrowRight } from "lucide-react";

export default async function TopBuildersSection() {
	const payload = await getPayloadSafe();
	if (!payload) return null;

	let builders: Array<{
		id: string;
		name: string;
		slug: string;
		totalStars: number;
		lastActivityAt: string | null;
		repoCount: number;
	}> = [];

	try {
		// Fetch signals with project data, sorted by totalStars
		// Note: totalStars may also be stored per-repo as stargazerCount
		const signalsResult = await payload.find({
			collection: "signals",
			sort: "-github.totalStars",
			limit: 20,
			depth: 1,
		});

		builders = signalsResult.docs
			.map((signal: any) => {
				const project = signal.project;
				if (!project || typeof project === "string") return null;
				if (!["Development", "Pre-Release", "Live"].includes(project.status)) return null;
				// Calculate totalStars from repos if the top-level field is missing
				const repoStars = (signal.github?.repos || []).reduce(
					(sum: number, r: any) => sum + (r.stargazerCount || 0),
					0,
				);
				const totalStars = signal.github?.totalStars || repoStars;
				if (totalStars === 0) return null;
				return {
					id: project.id,
					name: project.name,
					slug: project.slug,
					totalStars,
					lastActivityAt: signal.github?.lastActivityAt ?? null,
					repoCount: signal.github?.repos?.length ?? 0,
				};
			})
			.filter(Boolean) as typeof builders;

		// Sort client-side since totalStars may have been computed from repos
		builders.sort((a, b) => b.totalStars - a.totalStars);
		builders = builders.slice(0, 6);
	} catch {
		return null;
	}

	if (builders.length === 0) return null;

	return (
		<section className="mb-16">
			<div className="flex items-center justify-between mb-10">
				<div>
					<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-foreground">
						Top Builders
					</h2>
					<p className="text-muted-foreground">
						Most starred projects in the ecosystem
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

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{builders.map((builder, idx) => (
					<Link
						key={builder.id}
						href={`/project/${builder.slug}`}
						className="group flex items-center gap-4 p-5 rounded-xl border border-border/50 bg-card hover:bg-card/80 hover:border-primary/30 transition-all duration-150 hover:shadow-sm hover:-translate-y-0.5"
					>
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#FDDA24]/20 to-[#FDDA24]/10 border border-[#FDDA24]/20 text-lg font-bold text-[#FDDA24] flex-shrink-0">
							{idx + 1}
						</div>
						<div className="flex-1 min-w-0">
							<p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
								{builder.name}
							</p>
							<div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
								<span className="flex items-center gap-1">
									<Star className="w-3.5 h-3.5 text-[#FDDA24]" />
									{builder.totalStars.toLocaleString()}
								</span>
								<span>{builder.repoCount} {builder.repoCount === 1 ? "repo" : "repos"}</span>
							</div>
						</div>
						<ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
					</Link>
				))}
			</div>
		</section>
	);
}

export function TopBuildersSkeleton() {
	return (
		<section className="mb-16">
			<div className="mb-10">
				<div className="h-10 w-40 bg-[#262626] rounded animate-pulse mb-2" />
				<div className="h-4 w-64 bg-[#262626] rounded animate-pulse" />
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="h-[76px] rounded-xl bg-[#262626] animate-pulse" />
				))}
			</div>
		</section>
	);
}
