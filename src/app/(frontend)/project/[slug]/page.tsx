import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectLogo } from "@/components/project-logo";
import EntityCard from "@/components/entity-card";
import {
	ArrowLeft,
	ExternalLink,
	Globe,
	Github,
	FileText,
	X,
	MessageCircle,
	Calendar,
	Activity,
	AlertCircle,
	Star,
	Clock,
	CheckCircle2,
} from "lucide-react";

type Params = Promise<{
	slug: string;
}>;

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stellarlight.io";

// Force dynamic rendering to prevent build-time MongoDB connection errors
export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { slug } = await params;
	const payload = await getPayloadSafe();

	if (!payload) {
		return {
			title: "Project Not Found",
		};
	}

	let result;
	try {
		result = await payload.find({
			collection: "projects",
			where: {
				and: [
					{
						slug: {
							equals: slug,
						},
					},
					{
						status: {
							in: ["Development", "Pre-Release", "Live"],
						},
					},
				],
			},
			limit: 1,
			depth: 1,
		});
	} catch {
		return {
			title: "Project Not Found",
		};
	}

	if (result.docs.length === 0) {
		return {
			title: "Project Not Found",
		};
	}

	const project = result.docs[0];

	// Get logo/image URL
	let imageUrl = "/opengraph.png";
	if (project.logo) {
		if (typeof project.logo === "object" && project.logo.url) {
			imageUrl = project.logo.url;
		} else if (
			typeof project.logo === "object" &&
			project.logo.filename
		) {
			imageUrl = `${appUrl}/media/${project.logo.filename}`;
		}
	}

	const description =
		project.shortDescription ||
		`${project.name} - ${project.status} project on Stellar blockchain`;

	const categoryTags = project.category ? String(project.category) : "";

	return {
		title: project.name,
		description,
		keywords: [
			project.name,
			"Stellar",
			"Stellar blockchain",
			project.status,
			categoryTags,
		].filter(Boolean),
		openGraph: {
			title: project.name,
			description,
			type: "website",
			images: [
				{
					url: imageUrl.startsWith("http")
						? imageUrl
						: `${appUrl}${imageUrl}`,
					width: 1200,
					height: 630,
					alt: project.name,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: project.name,
			description,
			images: [
				imageUrl.startsWith("http")
					? imageUrl
					: `${appUrl}${imageUrl}`,
			],
		},
	};
}

export default async function ProjectDetailPage({
	params,
}: {
	params: Params;
}) {
	const { slug } = await params;
	const payload = await getPayloadSafe();

	if (!payload) {
		notFound();
	}

	let result;
	try {
		result = await payload.find({
		collection: "projects",
		where: {
			and: [
				{
					slug: {
						equals: slug,
					},
				},
				{
					status: {
						in: ["Development", "Pre-Release", "Live"],
					},
				},
			],
		},
		limit: 1,
		depth: 1,
	});
		} catch (error) {
		notFound();
	}

	if (result.docs.length === 0) {
		notFound();
	}

	const project = result.docs[0];

	// Fetch GitHub data directly (no HTTP call needed in server component)
	let gh: {
		lastActivityAt: string | null;
		openIssuesTotal: number;
		totalStars: number;
		repos: Array<{
			owner: string;
			name: string;
			url: string;
			lastCommitAt: string | null;
			openIssues: number;
			stargazerCount: number;
			error?: string;
			skipped?: boolean;
		}>;
	} | null = null;

	if (project.github?.repos && project.github.repos.length > 0) {
		try {
			// Import the GitHub fetching logic directly instead of HTTP call
			const { fetchRepoInfo } = await import("@/lib/github");
			const projectId = String(project.id);
			const repos = project.github.repos || [];

			// Check for cached data first
			const cachedResult = await payload.find({
				collection: "signals",
				where: { project: { equals: projectId } },
				limit: 1,
			});

			const cached = cachedResult.docs[0];
			const reposKey = JSON.stringify(
				repos.map((r: any) => `${r.owner}/${r.name}`).sort(),
			);
			const cachedReposKey = cached?.github?.repos
				? JSON.stringify(
						cached.github.repos
							.map((r: any) => `${r.owner}/${r.name}`)
							.sort(),
					)
				: null;

			const reposChanged = reposKey !== cachedReposKey;
			// Also invalidate cache if it contains authentication errors (401, etc.)
			const hasAuthErrors = cached?.github?.repos?.some((r: any) => r.error && (r.error.includes("401") || r.error.includes("Unauthorized")));
			// Invalidate if totalStars is missing, null, or undefined (indicates incomplete data)
			const hasInvalidStars = (cached?.github as any)?.totalStars == null; // null or undefined
			const fresh =
				cached?.fetchedAt &&
				Date.now() - new Date(cached.fetchedAt).getTime() <
					6 * 60 * 60 * 1000 && // 6h
				!reposChanged && // Also invalidate if repos changed
				!hasAuthErrors && // Invalidate if cache contains auth errors
				!hasInvalidStars; // Invalidate if cache has invalid/missing stars data

			if (cached && fresh && cached.github) {
				const cachedGh = cached.github as any;
				gh = {
					lastActivityAt: cachedGh.lastActivityAt ?? null,
					openIssuesTotal: cachedGh.openIssuesTotal ?? 0,
					totalStars: cachedGh.totalStars ?? 0,
					repos: cachedGh.repos ?? [],
				};
			} else {
				// Fetch live data
				const results = await Promise.allSettled(
					repos.map((r: any) => fetchRepoInfo(r.owner, r.name)),
				);

				const enriched = repos.map((r: any, i: number) => {
					const v = results[i];

					if (v.status === "fulfilled") {
						return {
							owner: r.owner,
							name: r.name,
							url: v.value.url,
							lastCommitAt: v.value.lastCommitAt,
							openIssues: v.value.openIssues,
							stargazerCount: v.value.stargazerCount ?? 0,
						};
					}

					const errorMessage = String((v as PromiseRejectedResult).reason);
					const isPrivate = errorMessage.includes("Private repository");
					return {
						owner: r.owner,
						name: r.name,
						url: `https://github.com/${r.owner}/${r.name}`,
						lastCommitAt: null,
						openIssues: 0,
						stargazerCount: 0,
						error: errorMessage,
						skipped: isPrivate,
					};
				});

				const lastTs = Math.max(
					...enriched.map((x) =>
						x.lastCommitAt ? new Date(x.lastCommitAt).getTime() : 0,
					),
				);

				const totalStars = enriched.reduce((s, x) => s + (x.stargazerCount || 0), 0);
				const openIssuesTotal = enriched.reduce((s, x) => s + (x.openIssues || 0), 0);
				
				gh = {
					lastActivityAt: lastTs > 0 ? new Date(lastTs).toISOString() : null,
					openIssuesTotal,
					totalStars,
					repos: enriched,
				};

				// Update cache
				if (cached) {
					await payload.update({
						collection: "signals",
						id: cached.id,
						data: {
							fetchedAt: new Date().toISOString(),
							github: gh,
						},
					});
				} else {
					await payload.create({
						collection: "signals",
						data: {
							project: projectId,
							fetchedAt: new Date().toISOString(),
							github: gh,
						},
					});
				}
			}
		} catch (error) {
			// Silently handle GitHub fetch errors
		}
	}

	// Find entities that have this project
	let linkedEntities: any[] = [];
	try {
		const entitiesResult = await payload.find({
			collection: "entities",
			where: {
				projects: {
					contains: String(project.id),
				},
			},
			depth: 1,
		});
		linkedEntities = entitiesResult.docs;
	} catch {
		// Silently handle entities fetch errors
	}

	// Fetch transparency logs
	let logsResult: { docs: any[] } = { docs: [] };
	try {
		logsResult = await payload.find({
			collection: "transparency-logs",
			where: {
				and: [
					{
						targetCollection: {
							equals: "projects",
						},
					},
					{
						targetId: {
							equals: project.id.toString(),
						},
					},
				],
			},
			limit: 10,
			sort: "-timestamp",
		});
	} catch {
		// Silently handle transparency logs fetch errors
	}

	const linkIcons = {
		website: Globe,
		github: Github,
		docs: FileText,
		twitter: X,
		discord: MessageCircle,
	};

	const formatDate = (dateString: string | null | undefined): string => {
		if (!dateString) return "—";
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return "Today";
		if (diffDays === 1) return "Yesterday";
		if (diffDays < 7) return `${diffDays} days ago`;
		if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
		if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;

		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	const formatDateLong = (dateString: string | null | undefined): string => {
		if (!dateString) return "—";
		const date = new Date(dateString);
		return date.toLocaleDateString("en-US", {
			month: "long",
			day: "numeric",
			year: "numeric",
		});
	};

	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-16 pt-28">
				{/* Back Button */}
				<Link
					href="/directory"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Directory</span>
				</Link>

				{/* Hero Section - Card with Flex Layout */}
				<Card className="mb-12 border border-border/50 bg-card shadow-sm">
					<CardContent className="p-8">
						<div className="flex flex-col gap-6">
							{/* First Row - Logo and Title/Tags */}
							<div className="flex flex-col md:flex-row items-start gap-4">
								{/* Logo */}
								{project.logo ? (
									<div className="relative flex-shrink-0">
										<div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FDDA24]/20 via-transparent to-transparent blur-xl opacity-50" />
										<ProjectLogo
											logo={project.logo}
											name={project.name}
											size={140}
											className="relative w-[140px] h-[140px] rounded-2xl shadow-2xl border border-border/50"
										/>
									</div>
								) : (
									<div className="relative w-[140px] h-[140px] rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-2xl border border-border/50 flex-shrink-0">
										<Activity className="w-16 h-16 text-primary" />
									</div>
								)}

								{/* Title and Tags */}
								<div className="flex flex-col gap-4 items-start flex-1 min-w-0">
									{/* Title */}
									<h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground text-left">
										{project.name}
									</h1>

									{/* Status and Verification Tags */}
									<div className="flex flex-wrap items-center gap-3">
										<Badge 
											variant="outline" 
											className="text-sm px-4 py-1.5 font-semibold border-border/50 shadow-sm flex items-center gap-1.5"
										>
											{project.status === "Live" && (
												<span className="w-2 h-2 rounded-full bg-green-500"></span>
											)}
											{project.status === "Pre-Release" && (
												<span className="w-2 h-2 rounded-full bg-blue-500"></span>
											)}
											{project.status === "Development" && (
												<span className="w-2 h-2 rounded-full bg-yellow-500"></span>
											)}
											{project.status}
										</Badge>
										{project.verificationLevel !== "Unverified" && (
											<Badge
												className="bg-gradient-to-r from-[#FDDA24]/20 to-[#FDDA24]/10 text-[#FDDA24] border-[#FDDA24]/30 text-sm px-4 py-1.5 font-semibold shadow-sm"
											>
												<CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
												{project.verificationLevel}
											</Badge>
										)}
									</div>

									{/* Category Tags */}
									<div className="flex flex-wrap items-center gap-3">
										<Badge 
											variant="secondary" 
											className="text-sm px-4 py-1.5 font-semibold border border-border/50 shadow-sm"
										>
											{project.category}
										</Badge>
										{project.types && project.types.length > 0 && (
											project.types.slice(0, 3).map((type: string, idx: number) => (
												<Badge
													key={idx}
													variant="outline"
													className="text-sm px-4 py-1.5 font-semibold border-border/50 shadow-sm"
												>
													{type}
												</Badge>
											))
										)}
									</div>
								</div>
							</div>

							{/* Second Row - About the Project Section */}
							<div className="space-y-4 pt-4 border-t border-border/50">
								<h2 className="text-xl font-bold text-foreground">About {project.name}</h2>
								{project.shortDescription ? (
									<p className="text-base text-muted-foreground leading-relaxed">
										{project.shortDescription}
									</p>
								) : (
									<p className="text-base text-muted-foreground italic">
										No description available.
									</p>
								)}
								{project.links?.website && (
									<Button
										asChild
										className="mt-4"
									>
										<a
											href={project.links.website}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-2"
										>
											Visit {project.name}
											<ExternalLink className="w-4 h-4" />
										</a>
									</Button>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Links & Resources */}
				{project.links && Object.values(project.links).some(Boolean) && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">Links & Resources</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								{Object.entries(project.links).flatMap(([key, url]) => {
									if (!url) return [];
									const Icon =
										linkIcons[key as keyof typeof linkIcons] || ExternalLink;
									// Extract first valid URL from fields that may contain multiple pasted URLs
									const decoded = decodeURIComponent(String(url));
									const urls = decoded.split(/[\s,;|]+/).filter(u => u.startsWith('http'));
									if (urls.length === 0) urls.push(String(url));
									// Only show the first URL
									return [urls[0]].map((singleUrl, idx) => (
										<a
											key={`${key}-${idx}`}
											href={singleUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-background hover:border-primary/50 transition-all duration-150 hover:shadow-sm hover:-translate-y-0.5 overflow-hidden"
										>
											<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 group-hover:border-primary/40 group-hover:bg-primary/20 transition-all duration-150 flex-shrink-0">
												<Icon className="h-6 w-6 text-primary" />
											</div>
											<div className="flex-1 min-w-0">
												<span className="block capitalize font-semibold text-foreground group-hover:text-primary transition-colors truncate">
													{key}
												</span>
												<span className="block text-xs text-muted-foreground truncate">
													{singleUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
												</span>
											</div>
											<ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
										</a>
									));
								})}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Built By - Linked Entities */}
				{linkedEntities.length > 0 && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">Built By</CardTitle>
							<CardDescription>
								{linkedEntities.length === 1 ? "Organization" : "Organizations"} behind this project
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className={`grid gap-4 ${linkedEntities.length === 1 ? "grid-cols-1 max-w-sm" : "grid-cols-1 md:grid-cols-2"}`}>
								{linkedEntities.map((entity) => (
									<EntityCard key={entity.id} entity={entity} />
								))}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Project Stats - GitHub Stats */}
				{project.github?.repos && project.github.repos.length > 0 && (
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
						<Card className="border border-border/50 bg-card shadow-sm hover:shadow-sm transition-all duration-150 hover:-translate-y-1">
							<CardContent className="p-6">
								<div className="flex items-center justify-between mb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 border border-blue-500/20">
											<Activity className="w-5 h-5 text-blue-400" />
										</div>
										<div>
											<p className="text-sm font-medium text-muted-foreground">Last Activity</p>
											<p className="text-2xl font-bold text-foreground mt-1">
												{gh ? formatDate(gh.lastActivityAt) : "—"}
											</p>
										</div>
									</div>
								</div>
								{gh?.lastActivityAt && (
									<p className="text-xs text-muted-foreground">
										{formatDateLong(gh.lastActivityAt)}
									</p>
								)}
							</CardContent>
						</Card>

						<Card className="border border-border/50 bg-card shadow-sm hover:shadow-sm transition-all duration-150 hover:-translate-y-1">
							<CardContent className="p-6">
								<div className="flex items-center justify-between mb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 rounded-lg bg-gradient-to-br from-orange-500/20 to-orange-500/10 border border-orange-500/20">
											<AlertCircle className="w-5 h-5 text-orange-400" />
										</div>
										<div>
											<p className="text-sm font-medium text-muted-foreground">Open Issues</p>
											<p className="text-2xl font-bold text-foreground mt-1">
												{gh?.openIssuesTotal ?? 0}
											</p>
										</div>
									</div>
								</div>
								<p className="text-xs text-muted-foreground">
									Across {gh?.repos?.length || project.github?.repos?.length || 0} {gh?.repos?.length === 1 || project.github?.repos?.length === 1 ? 'repository' : 'repositories'}
								</p>
							</CardContent>
						</Card>

						<Card className="border border-border/50 bg-card shadow-sm hover:shadow-sm transition-all duration-150 hover:-translate-y-1">
							<CardContent className="p-6">
								<div className="flex items-center justify-between mb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 rounded-lg bg-gradient-to-br from-[#FDDA24]/20 to-[#FDDA24]/10 border border-[#FDDA24]/20">
											<Star className="w-5 h-5 text-[#FDDA24]" />
										</div>
										<div>
											<p className="text-sm font-medium text-muted-foreground">Total Stars</p>
											<p className="text-2xl font-bold text-foreground mt-1">
												{gh?.totalStars != null ? gh.totalStars.toLocaleString() : 0}
											</p>
										</div>
									</div>
								</div>
								<p className="text-xs text-muted-foreground">
									GitHub community engagement
								</p>
							</CardContent>
						</Card>
					</div>
				)}

				{/* Repositories */}
				{project.github?.repos && project.github.repos.length > 0 && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">Repositories</CardTitle>
							<CardDescription>
								{project.github.repos.length} {project.github.repos.length === 1 ? 'repository' : 'repositories'} linked to this project
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{(gh?.repos || project.github.repos.map((r: any) => ({
									owner: r.owner,
									name: r.name,
									url: `https://github.com/${r.owner}/${r.name}`,
									lastCommitAt: null,
									openIssues: 0,
									stargazerCount: 0,
									error: undefined,
									skipped: false,
								}))).slice(0, 10).map((r: any) => (
									<a
										key={`${r.owner}/${r.name}`}
										href={r.url}
										target="_blank"
										rel="noreferrer"
										className="group flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/30 hover:bg-background hover:border-primary/50 transition-all duration-150 hover:shadow-sm overflow-hidden"
									>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-3 mb-2">
												<Github className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
												<span className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
													{r.owner}/{r.name}
												</span>
											</div>
											<div className="flex items-center gap-4 text-sm text-muted-foreground pl-8 flex-wrap">
												{r.error ? (
													<span className="text-orange-400 font-medium">
														{r.error}
													</span>
												) : (
													<>
														{r.lastCommitAt && (
															<span className="flex items-center gap-1.5">
																<Clock className="w-3.5 h-3.5" />
																{formatDate(r.lastCommitAt)}
															</span>
														)}
														{r.stargazerCount > 0 && (
															<span className="flex items-center gap-1.5">
																<Star className="w-3.5 h-3.5" />
																{r.stargazerCount.toLocaleString()}
															</span>
														)}
														{r.openIssues > 0 && (
															<span className="flex items-center gap-1.5">
																<AlertCircle className="w-3.5 h-3.5" />
																{r.openIssues} issue{r.openIssues !== 1 ? 's' : ''}
															</span>
														)}
													</>
												)}
											</div>
										</div>
										<ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors ml-4 flex-shrink-0" />
									</a>
								))}
							</div>
						</CardContent>
					</Card>
				)}

				{/* On-Chain Information */}
				{project.onchain &&
					(project.onchain.assetCode ||
						project.onchain.issuer ||
						(project.onchain.contracts &&
							project.onchain.contracts.length > 0)) && (
						<Card className="mb-8 border border-border/50 bg-card shadow-sm">
							<CardHeader className="pb-4">
								<CardTitle className="text-xl font-bold">On-Chain Information</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="space-y-5">
									{project.onchain.assetCode && (
										<div>
											<div className="text-sm font-semibold mb-2.5 text-muted-foreground">Asset Code</div>
											<code className="block p-4 rounded-xl bg-background/50 font-mono text-sm border border-border/50 hover:border-primary/30 transition-colors">
												{project.onchain.assetCode}
											</code>
										</div>
									)}
									{project.onchain.issuer && (
										<div>
											<div className="text-sm font-semibold mb-2.5 text-muted-foreground">Issuer</div>
											<code className="block p-4 rounded-xl bg-background/50 font-mono text-sm border border-border/50 hover:border-primary/30 transition-colors break-all">
												{project.onchain.issuer}
											</code>
										</div>
									)}
									{project.onchain.contracts &&
										project.onchain.contracts.length > 0 &&
										project.onchain.contracts.map(
											(contract: { address?: string | null }, idx: number) => (
												<div key={idx}>
													<div className="text-sm font-semibold mb-2.5 text-muted-foreground">
														Contract {idx + 1}
													</div>
													<code className="block p-4 rounded-xl bg-background/50 font-mono text-sm border border-border/50 hover:border-primary/30 transition-colors break-all">
														{contract.address || "Unknown"}
													</code>
												</div>
											),
										)}
								</div>
							</CardContent>
						</Card>
					)}

				{/* Transparency Log - Only show in debug mode */}
				{process.env.NODE_ENV === "development" && (
					<Card className="border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">Transparency Log</CardTitle>
							<CardDescription>
								Recent changes to this project entry for accountability and trust
							</CardDescription>
						</CardHeader>
						<CardContent>
							{logsResult.docs.length === 0 ? (
								<div className="text-center py-12">
									<Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
									<p className="text-muted-foreground italic">
										No transparency logs yet
									</p>
								</div>
							) : (
								<div className="space-y-2">
									{logsResult.docs.map((log, idx) => (
										<div
											key={log.id}
											className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/30 hover:bg-background/50 hover:border-primary/30 transition-all duration-150 group"
										>
											<div className="flex items-center gap-4">
												<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 group-hover:border-primary/40 transition-colors">
													<Calendar className="h-5 w-5 text-primary" />
												</div>
												<div>
													<span className="font-semibold text-foreground block">
														{log.action}
													</span>
													<span className="text-sm text-muted-foreground">
														by {log.actorType}
													</span>
												</div>
											</div>
											<span className="text-sm text-muted-foreground font-medium">
												{log.timestamp
													? formatDateLong(log.timestamp)
													: "Unknown date"}
											</span>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				)}
			</main>
		</div>
	);
}
