import { ArrowRight, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getPayloadSafe } from "@/lib/payload-client";

export default async function TrendingProjectsSection() {
	const payload = await getPayloadSafe();
	if (!payload) return null;

	let repos: Array<{
		id: string;
		name: string;
		slug: string;
		totalStars: number;
		repoCount: number;
		score: number;
		commits90d: number;
		proven: boolean;
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
		// Rank by the SAME score /api/repos/search ranks by (repoScore: traction,
		// velocity-adjusted freshness, code depth, inherited authority), gated to
		// repos that are verified Stellar and not archived. Raw stars alone put
		// Keybase, the generic x402 repo and Aztec's Noir at the top of a
		// "Stellar" list; that is not what a visitor came for.
		const bySlug = new Map<
			string,
			{
				stars: number;
				count: number;
				score: number;
				commits90d: number;
				lastCommitAt: string | null;
				/** some repo scanned with Stellar code evidence */
				proven: boolean;
				scanned: number;
				/** scanned repos whose stellarProof came back "none" */
				none: number;
			}
		>();
		if (projectSlugs.length > 0) {
			const reposResult = await payload.find({
				collection: "repos",
				where: {
					and: [
						{ projectSlug: { in: projectSlugs } },
						{ tier: { not_equals: "archive" } },
						{ unverifiedStellar: { not_equals: true } },
					],
				},
				limit: 5000,
				depth: 0,
				select: {
					projectSlug: true,
					stars: true,
					repoScore: true,
					lastCommitAt: true,
					activitySignals: true,
					codeScanState: true,
					stellarProof: true,
				},
			} as any);
			for (const r of reposResult.docs as any[]) {
				if (!r.projectSlug) continue;
				const e = bySlug.get(r.projectSlug) ?? {
					stars: 0,
					count: 0,
					score: 0,
					commits90d: 0,
					lastCommitAt: null,
					proven: false,
					scanned: 0,
					none: 0,
				};
				if (r.codeScanState === "scanned") {
					e.scanned += 1;
					if (r.stellarProof && r.stellarProof !== "none") e.proven = true;
					else e.none += 1;
				}
				e.stars += r.stars ?? 0;
				e.count += 1;
				e.score = Math.max(e.score, Number(r.repoScore ?? 0));
				e.commits90d += Number(r.activitySignals?.commits90d ?? 0);
				if (
					r.lastCommitAt &&
					(!e.lastCommitAt || r.lastCommitAt > e.lastCommitAt)
				)
					e.lastCommitAt = r.lastCommitAt;
				bySlug.set(r.projectSlug, e);
			}
		}

		const staleCutoff = Date.now() - 180 * 86_400_000;
		repos = projectsResult.docs
			.map((project: any) => {
				const agg = bySlug.get(project.slug);
				const totalStars = agg?.stars ?? 0;
				if (!agg || agg.score <= 0) return null;
				// scanned and found no Stellar code in any repo (keybase/client,
				// noir-lang/noir, coinbase/x402): linked from a project, not Stellar (sls-047)
				if (agg.scanned > 0 && !agg.proven && agg.none === agg.scanned)
					return null;
				// a "top" repo has moved in the last six months
				if (!agg.lastCommitAt || Date.parse(agg.lastCommitAt) < staleCutoff)
					return null;

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
					repoCount: agg.count,
					score: agg.score,
					proven: agg.proven,
					commits90d: agg.commits90d,
					category: project.category,
					logoUrl,
				};
			})
			.filter(Boolean) as typeof repos;

		// showcase order: repoScore (which already carries inherited authority such as
		// hackathon wins / SCF) plus log-scaled stars and recent commits, so a 1-star
		// hackathon winner does not outrank the SDKs people actually build with
		const showcase = (r: {
			score: number;
			totalStars: number;
			commits90d: number;
		}) =>
			r.score +
			12 * Math.log10(r.totalStars + 1) +
			6 * Math.log10(r.commits90d + 1);
		// code-verified Stellar repos lead; unscanned ones follow on score
		repos.sort(
			(a, b) =>
				Number(b.proven) - Number(a.proven) || showcase(b) - showcase(a),
		);
		repos = repos.slice(0, 8);
	} catch {
		return null;
	}

	if (repos.length === 0) return null;

	return (
		<section className="mb-16">
			<div className="flex items-center justify-between mb-10">
				<div>
					<h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2 text-foreground">
						Top Repositories
					</h2>
					<p className="text-muted-foreground">
						Ranked by activity, code depth and traction, not raw stars. Active
						in the last six months.
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
						className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card hover:border-white/25 hover:bg-white/[0.02] transition-colors duration-150"
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
								<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04] border border-border text-base font-semibold text-neutral-300 tabular-nums">
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
									<Star className="w-3.5 h-3.5 text-neutral-400" />
									{repo.totalStars.toLocaleString()}
								</span>
								<span>
									{repo.repoCount} {repo.repoCount === 1 ? "repo" : "repos"}
								</span>
								{repo.commits90d > 0 && (
									<span className="tabular-nums">
										{repo.commits90d.toLocaleString()} commits / 90d
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
					<div
						key={i}
						className="h-[72px] rounded-xl bg-[#262626] animate-pulse"
					/>
				))}
			</div>
		</section>
	);
}
