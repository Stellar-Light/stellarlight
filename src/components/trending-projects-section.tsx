import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import Image from "next/image";
import { Star, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function TrendingProjectsSection() {
	const payload = await getPayloadSafe();
	if (!payload) return null;

	let repos: Array<{
		id: string;
		name: string;
		slug: string;
		totalStars: number;
		repoCount: number;
		category: string;
		logoUrl: string | null;
	}> = [];

	try {
		// Star counts come from the enriched `repos` collection (keyed by
		// projectSlug) — the legacy `signals` cache this used is no longer
		// populated, so it returned nothing and the whole section vanished.
		// biome-ignore lint/suspicious/noExplicitAny: Payload Where/doc types are awkward
		const projectsResult = await payload.find({
			collection: "projects",
			where: { status: { in: ["Development", "Pre-Release", "Live"] } },
			limit: 300,
			depth: 1,
			select: { embedding: false },
		} as any);

		const projectSlugs = projectsResult.docs.map((p: any) => p.slug);
		const starsBySlug = new Map<string, { stars: number; count: number }>();
		if (projectSlugs.length > 0) {
			const reposResult = await payload.find({
				collection: "repos",
				where: { projectSlug: { in: projectSlugs } },
				limit: 5000,
				depth: 0,
				select: { projectSlug: true, stars: true },
			});
			for (const r of reposResult.docs as any[]) {
				if (!r.projectSlug) continue;
				const e = starsBySlug.get(r.projectSlug) ?? { stars: 0, count: 0 };
				e.stars += r.stars ?? 0;
				e.count += 1;
				starsBySlug.set(r.projectSlug, e);
			}
		}

		repos = projectsResult.docs
			.map((project: any) => {
				const agg = starsBySlug.get(project.slug);
				const totalStars = agg?.stars ?? 0;
				if (totalStars === 0) return null;

				let logoUrl: string | null = null;
				if (project.logo && typeof project.logo === "object") {
					if (project.logo.url) {
						logoUrl = project.logo.url;
					} else if (project.logo.filename) {
						logoUrl = `/media/${project.logo.filename}`;
					}
				}

				return {
					id: project.id,
					name: project.name,
					slug: project.slug,
					totalStars,
					repoCount: agg?.count ?? 0,
					category: project.category,
					logoUrl,
				};
			})
			.filter(Boolean) as typeof repos;

		repos.sort((a, b) => b.totalStars - a.totalStars);
		repos = repos.slice(0, 8);
	} catch {
		return null;
	}

	if (repos.length === 0) return null;

	return (
		<section className="mb-16">
			<div className="flex items-center justify-between mb-10">
				<div>
					<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-foreground">
						Top Repositories
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

			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				{repos.map((repo, idx) => (
					<Link
						key={repo.id}
						href={`/project/${repo.slug}`}
						className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card hover:bg-card/80 hover:border-primary/30 transition-all duration-150 hover:shadow-sm hover:-translate-y-0.5"
					>
						{/* Project logo or rank fallback */}
						<div className="flex-shrink-0">
							{repo.logoUrl ? (
								<Image
									src={repo.logoUrl}
									alt={repo.name}
									width={40}
									height={40}
									className="rounded-lg object-cover w-10 h-10 border border-border/50"
								/>
							) : (
								<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#FDDA24]/20 to-[#FDDA24]/10 border border-[#FDDA24]/20 text-lg font-bold text-[#FDDA24]">
									{idx + 1}
								</div>
							)}
						</div>

						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2 mb-1">
								<p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
									{repo.name}
								</p>
								<Badge
									variant="outline"
									className="text-xs px-2 py-0.5 flex-shrink-0"
								>
									{repo.category}
								</Badge>
							</div>
							<div className="flex items-center gap-3 text-sm text-muted-foreground">
								<span className="flex items-center gap-1">
									<Star className="w-3.5 h-3.5 text-[#FDDA24]" />
									{repo.totalStars.toLocaleString()}
								</span>
								<span>
									{repo.repoCount}{" "}
									{repo.repoCount === 1 ? "repo" : "repos"}
								</span>
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
					<div
						key={i}
						className="h-[72px] rounded-xl bg-[#262626] animate-pulse"
					/>
				))}
			</div>
		</section>
	);
}