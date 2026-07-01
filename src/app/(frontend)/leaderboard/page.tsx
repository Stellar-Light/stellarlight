import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Star, GitFork, ExternalLink } from "lucide-react";
import { LeaderboardFilters } from "@/components/leaderboard-filters";
import { EcosystemDevStats } from "@/components/ecosystem-dev-stats";
import { LeaderboardExportButtons } from "@/components/leaderboard-export-buttons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Developer Activity | Stellar Light",
	description:
		"Developer activity rankings and ecosystem metrics for Stellar projects.",
};

type SearchParams = Promise<{
	sort?: string;
	range?: string;
	category?: string;
}>;

const VALID_CATEGORIES = [
	"Infrastructure",
	"Tooling",
	"Partner Integration",
	"User-Facing App",
	"Asset",
	"Protocol/Contract",
	"Anchor",
] as const;

interface LeaderboardEntry {
	id: string;
	name: string;
	slug: string;
	category: string;
	shortDescription: string | null;
	totalStars: number;
	openIssuesTotal: number;
	lastActivityAt: string | null;
	repoCount: number;
	scfAwarded: boolean;
	hasSignals: boolean;
}

function formatDate(dateString: string | null): string {
	if (!dateString) return "—";
	const diffMs = Date.now() - new Date(dateString).getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) return `${diffDays}d ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
	if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
	return `${Math.floor(diffDays / 365)}y ago`;
}

export default async function LeaderboardPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const params = await searchParams;
	const sortBy = params.sort || "activity";
	const range = params.range || "all";
	const categoryFilter =
		params.category && VALID_CATEGORIES.includes(params.category as any)
			? params.category
			: null;

	const payload = await getPayloadSafe();
	let leaderboard: LeaderboardEntry[] = [];

	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload's Where type is awkward; mirrors /api/leaderboard
			const projectWhere: any = {
				status: { in: ["Development", "Pre-Release", "Live"] },
			};
			if (categoryFilter) projectWhere.category = { equals: categoryFilter };

			const projectsResult = await payload.find({
				collection: "projects",
				where: projectWhere,
				limit: 300,
				depth: 0,
				// Drop the voyage-3 embedding vector — pulling it for up to 300
				// projects times the query out on the M0 tier.
				select: { embedding: false },
			});

			// Per-project GitHub stats come from the enriched `repos` collection
			// (keyed by projectSlug, populated by enrich-repos). This mirrors
			// /api/leaderboard — the legacy `signals` cache this page used is no
			// longer populated, which is why every row read back blank.
			const projectSlugs = projectsResult.docs.map(
				(p: { slug: string }) => p.slug,
			);
			const reposBySlug = new Map<
				string,
				Array<{
					stars?: number;
					openIssues?: number;
					lastCommitAt?: string | null;
				}>
			>();
			if (projectSlugs.length > 0) {
				const reposResult = await payload.find({
					collection: "repos",
					where: { projectSlug: { in: projectSlugs } },
					limit: 5000,
					depth: 0,
					// Only the scalar stats we aggregate — NOT the README excerpt,
					// which bloats the fetch as the repos collection grows.
					select: {
						projectSlug: true,
						stars: true,
						openIssues: true,
						lastCommitAt: true,
					},
				});
				for (const r of reposResult.docs as Array<{
					projectSlug?: string;
					stars?: number;
					openIssues?: number;
					lastCommitAt?: string | null;
				}>) {
					if (!r.projectSlug) continue;
					if (!reposBySlug.has(r.projectSlug))
						reposBySlug.set(r.projectSlug, []);
					reposBySlug.get(r.projectSlug)?.push(r);
				}
			}

			leaderboard = (
				projectsResult.docs as Array<{
					id: string;
					name: string;
					slug: string;
					category: string;
					shortDescription?: string | null;
					scf?: { awarded?: boolean };
				}>
			).map((project): LeaderboardEntry => {
				const repos = reposBySlug.get(project.slug) ?? [];
				const totalStars = repos.reduce((s, r) => s + (r.stars ?? 0), 0);
				const openIssuesTotal = repos.reduce(
					(s, r) => s + (r.openIssues ?? 0),
					0,
				);
				let lastActivityAt: string | null = null;
				for (const r of repos) {
					if (
						r.lastCommitAt &&
						(!lastActivityAt ||
							new Date(r.lastCommitAt).getTime() >
								new Date(lastActivityAt).getTime())
					) {
						lastActivityAt = r.lastCommitAt;
					}
				}
				return {
					id: String(project.id),
					name: project.name,
					slug: project.slug,
					category: project.category,
					shortDescription: project.shortDescription ?? null,
					totalStars,
					openIssuesTotal,
					lastActivityAt,
					repoCount: repos.length,
					scfAwarded: !!project.scf?.awarded,
					hasSignals: repos.length > 0 || !!lastActivityAt,
				};
			});

			// Time-range filter — projects with no lastActivityAt only show in
			// "All time".
			if (range !== "all") {
				const cutoff = new Date();
				if (range === "7d") cutoff.setDate(cutoff.getDate() - 7);
				else if (range === "30d") cutoff.setDate(cutoff.getDate() - 30);
				else if (range === "90d") cutoff.setDate(cutoff.getDate() - 90);
				else if (range === "1y") cutoff.setDate(cutoff.getDate() - 365);
				leaderboard = leaderboard.filter(
					(e) =>
						e.lastActivityAt &&
						new Date(e.lastActivityAt).getTime() >= cutoff.getTime(),
				);
			}

			// Sort — projects with no data on the chosen metric sink to the bottom.
			if (sortBy === "activity") {
				leaderboard.sort((a, b) => {
					const ad = a.lastActivityAt
						? new Date(a.lastActivityAt).getTime()
						: 0;
					const bd = b.lastActivityAt
						? new Date(b.lastActivityAt).getTime()
						: 0;
					return bd - ad;
				});
			} else if (sortBy === "stars") {
				leaderboard.sort((a, b) => b.totalStars - a.totalStars);
			} else if (sortBy === "issues") {
				leaderboard.sort((a, b) => b.openIssuesTotal - a.openIssuesTotal);
			}

			leaderboard = leaderboard.slice(0, 50);
		} catch {
			// silent — the empty-state card renders below
		}
	}

	const sortOptions = [
		{ value: "activity", label: "Most recent" },
		{ value: "stars", label: "Most stars" },
		{ value: "issues", label: "Most issues" },
	];

	const rangeOptions = [
		{ value: "7d", label: "Last 7 days" },
		{ value: "30d", label: "Last 30 days" },
		{ value: "90d", label: "Last 90 days" },
		{ value: "1y", label: "Last year" },
		{ value: "all", label: "All time" },
	];

	const categoryOptions = VALID_CATEGORIES.map((c) => ({ value: c, label: c }));

	return (
		<div className="min-h-screen relative">
			<main className="max-w-5xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Home</span>
				</Link>

				<div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
					<div>
						<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
							Developer Activity
						</h1>
						<p className="text-sm text-muted-foreground mt-2">
							Stellar projects ranked by recent developer activity.
						</p>
					</div>
					<LeaderboardExportButtons
						sort={sortBy}
						range={range}
						category={categoryFilter}
						snapshotTargetId="shareable-snapshot"
					/>
				</div>

				<EcosystemDevStats />

				<LeaderboardFilters
					sort={sortBy}
					range={range}
					category={categoryFilter}
					sortOptions={sortOptions}
					rangeOptions={rangeOptions}
					categoryOptions={categoryOptions}
				/>

				{leaderboard.length === 0 ? (
					<Card className="border border-border/50 bg-card">
						<CardContent className="py-16 text-center">
							<GitFork className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
							<p className="text-muted-foreground">
								No projects match these filters.
							</p>
						</CardContent>
					</Card>
				) : (
					<>
					<div className="text-xs text-muted-foreground mb-3">
						{leaderboard.length} project{leaderboard.length === 1 ? "" : "s"}
					</div>
					<Card className="border border-border/50 bg-card shadow-sm overflow-hidden">
						<CardContent className="p-0">
							<div className="overflow-x-auto">
								<table className="w-full" style={{ tableLayout: "fixed" }}>
									<colgroup>
										<col className="w-12 sm:w-14" />
										<col />
										<col className="w-20 sm:w-24" />
										<col className="hidden md:table-column w-20" />
										<col className="hidden md:table-column w-20" />
										<col className="hidden sm:table-column w-28" />
									</colgroup>
									<thead>
										<tr className="border-b border-border/50 text-left">
											<th className="px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
												#
											</th>
											<th className="px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
												Project
											</th>
											<th className="px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
												Stars
											</th>
											<th className="px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right hidden md:table-cell">
												Issues
											</th>
											<th className="px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right hidden md:table-cell">
												Repos
											</th>
											<th className="px-4 sm:px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right hidden sm:table-cell">
												Last commit
											</th>
										</tr>
									</thead>
									<tbody>
										{leaderboard.map((entry, idx) => {
											return (
												<tr
													key={entry.id}
													className="border-b border-border/30 last:border-0 hover:bg-white/[0.02] transition-colors"
												>
													<td className="px-4 sm:px-6 py-3.5 align-middle">
														<span className="text-sm tabular-nums text-muted-foreground">
															{idx + 1}
														</span>
													</td>
													<td className="px-4 sm:px-6 py-3.5">
														<Link
															href={`/project/${entry.slug}`}
															className="group block min-w-0"
														>
															<div className="flex items-center gap-2 min-w-0 mb-0.5">
																<span className="font-medium text-foreground group-hover:text-white transition-colors truncate">
																	{entry.name}
																</span>
																<span className="inline-flex items-center gap-1.5 flex-shrink-0">
																	<span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border/50 whitespace-nowrap">
																		{entry.category}
																	</span>
																	{entry.scfAwarded && (
																		<span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border/50 whitespace-nowrap">
																			SCF
																		</span>
																	)}
																</span>
															</div>
															{entry.shortDescription && (
																<p
																	className="text-xs text-muted-foreground/80 hidden sm:block"
																	style={{
																		display: "-webkit-box",
																		WebkitLineClamp: 1,
																		WebkitBoxOrient: "vertical",
																		overflow: "hidden",
																	}}
																>
																	{entry.shortDescription}
																</p>
															)}
														</Link>
													</td>
													<td className="px-4 sm:px-6 py-3.5 text-right align-middle">
														{entry.hasSignals ? (
															<span className="inline-flex items-center justify-end gap-1 text-sm tabular-nums text-foreground/90">
																<Star className="w-3.5 h-3.5 text-muted-foreground" />
																{entry.totalStars.toLocaleString()}
															</span>
														) : (
															<span className="text-sm tabular-nums text-muted-foreground/50">
																—
															</span>
														)}
													</td>
													<td className="px-4 sm:px-6 py-3.5 text-right align-middle hidden md:table-cell">
														<span className="text-sm tabular-nums text-muted-foreground">
															{entry.hasSignals ? entry.openIssuesTotal : "—"}
														</span>
													</td>
													<td className="px-4 sm:px-6 py-3.5 text-right align-middle hidden md:table-cell">
														<span className="text-sm tabular-nums text-muted-foreground">
															{entry.hasSignals ? entry.repoCount : "—"}
														</span>
													</td>
													<td className="px-4 sm:px-6 py-3.5 text-right align-middle hidden sm:table-cell">
														<span className="text-sm tabular-nums text-muted-foreground">
															{formatDate(entry.lastActivityAt)}
														</span>
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						</CardContent>
					</Card>
					</>
				)}
			</main>
		</div>
	);
}
