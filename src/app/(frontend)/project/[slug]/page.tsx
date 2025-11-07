import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import {
	ArrowLeft,
	ExternalLink,
	Globe,
	Github,
	FileText,
	Twitter,
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

// Force dynamic rendering to prevent build-time MongoDB connection errors
export const dynamic = "force-dynamic";

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
		console.error("Error fetching project:", error);
		notFound();
	}

	if (result.docs.length === 0) {
		notFound();
	}

	const project = result.docs[0];

	// Fetch GitHub data
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
			const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
			const ghRes = await fetch(
				`${appUrl}/api/projects/${project.id}/github`,
				{ cache: "no-store" },
			);
			if (ghRes.ok) {
				gh = await ghRes.json();
			}
		} catch (error) {
			console.error("Failed to fetch GitHub data:", error);
		}
	}

	// Find entities that have this project
	const entitiesResult = await payload.find({
		collection: "entities",
		where: {
			projects: {
				contains: project.id,
			},
		},
	});

	const linkedEntities = entitiesResult.docs;

	// Fetch transparency logs
	const logsResult = await payload.find({
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

	const linkIcons = {
		website: Globe,
		github: Github,
		docs: FileText,
		twitter: Twitter,
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
			<main className="max-w-6xl mx-auto px-6 py-16 pt-28">
				{/* Back Button */}
				<Link
					href="/directory"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-200 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-200" />
					<span className="text-sm font-medium">Back to Directory</span>
				</Link>

				{/* Hero Section */}
				<div className="mb-12">
					<div className="flex flex-col md:flex-row items-start md:items-center gap-8 mb-8">
						{project.logo && (
							<div className="relative flex-shrink-0">
								<div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FDDA24]/20 via-transparent to-transparent blur-xl opacity-50" />
								<ProjectLogo
									logo={project.logo}
									name={project.name}
									size={140}
									className="relative w-[140px] h-[140px] rounded-2xl shadow-2xl border border-border/50"
								/>
							</div>
						)}
						<div className="flex-1 space-y-6">
							<div>
								<h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-4 bg-gradient-to-r from-foreground via-foreground to-[#FDDA24] bg-clip-text text-transparent">
									{project.name}
								</h1>
								{project.shortDescription && (
									<p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl">
										{project.shortDescription}
									</p>
								)}
							</div>
							
							{/* Badges */}
							<div className="flex flex-wrap items-center gap-3">
								<Badge 
									variant="secondary" 
									className="text-sm px-4 py-1.5 font-semibold border border-border/50 shadow-sm"
								>
									{project.category}
								</Badge>
								<Badge 
									variant="outline" 
									className="text-sm px-4 py-1.5 font-semibold border-border/50 shadow-sm"
								>
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

							{/* Linked Entities */}
							{linkedEntities.length > 0 && (
								<div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-card via-card/80 to-card border border-border/50 backdrop-blur-sm">
									<span className="text-sm font-semibold text-muted-foreground">Organization:</span>
									<div className="flex flex-wrap gap-2">
										{linkedEntities.map((e, idx) => (
											<span 
												key={e.id}
												className="text-sm font-medium text-foreground px-3 py-1 rounded-lg bg-background/50 border border-border/30"
											>
												{e.name}
											</span>
										))}
									</div>
								</div>
							)}
						</div>
					</div>
				</div>

				{/* GitHub Stats - Beautiful Stat Cards */}
				{gh && (
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
						<Card className="border border-border/50 bg-gradient-to-br from-card via-card to-card/80 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
							<CardContent className="p-6">
								<div className="flex items-center justify-between mb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/10 border border-blue-500/20">
											<Activity className="w-5 h-5 text-blue-400" />
										</div>
										<div>
											<p className="text-sm font-medium text-muted-foreground">Last Activity</p>
											<p className="text-2xl font-bold text-foreground mt-1">
												{formatDate(gh.lastActivityAt)}
											</p>
										</div>
									</div>
								</div>
								{gh.lastActivityAt && (
									<p className="text-xs text-muted-foreground">
										{formatDateLong(gh.lastActivityAt)}
									</p>
								)}
							</CardContent>
						</Card>

						<Card className="border border-border/50 bg-gradient-to-br from-card via-card to-card/80 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
							<CardContent className="p-6">
								<div className="flex items-center justify-between mb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 rounded-lg bg-gradient-to-br from-orange-500/20 to-orange-500/10 border border-orange-500/20">
											<AlertCircle className="w-5 h-5 text-orange-400" />
										</div>
										<div>
											<p className="text-sm font-medium text-muted-foreground">Open Issues</p>
											<p className="text-2xl font-bold text-foreground mt-1">
												{gh.openIssuesTotal ?? 0}
											</p>
										</div>
									</div>
								</div>
								<p className="text-xs text-muted-foreground">
									Across {gh.repos?.length || 0} {gh.repos?.length === 1 ? 'repository' : 'repositories'}
								</p>
							</CardContent>
						</Card>

						<Card className="border border-border/50 bg-gradient-to-br from-card via-card to-card/80 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
							<CardContent className="p-6">
								<div className="flex items-center justify-between mb-4">
									<div className="flex items-center gap-3">
										<div className="p-2.5 rounded-lg bg-gradient-to-br from-[#FDDA24]/20 to-[#FDDA24]/10 border border-[#FDDA24]/20">
											<Star className="w-5 h-5 text-[#FDDA24]" />
										</div>
										<div>
											<p className="text-sm font-medium text-muted-foreground">Total Stars</p>
											<p className="text-2xl font-bold text-foreground mt-1">
												{gh.totalStars?.toLocaleString() ?? 0}
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

				{/* Project Types */}
				{project.types && project.types.length > 0 && (
					<Card className="mb-8 border border-border/50 bg-gradient-to-br from-card via-card to-card/80 shadow-lg">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">Project Types</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex flex-wrap gap-2.5">
								{project.types.map((type: string, idx: number) => (
									<Badge
										key={idx}
										variant="outline"
										className="text-sm px-4 py-2 font-medium border-border/50 hover:border-primary/50 transition-colors"
									>
										{type}
									</Badge>
								))}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Links & Resources */}
				{project.links && Object.values(project.links).some(Boolean) && (
					<Card className="mb-8 border border-border/50 bg-gradient-to-br from-card via-card to-card/80 shadow-lg">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">Links & Resources</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								{Object.entries(project.links).map(([key, url]) => {
									if (!url) return null;
									const Icon =
										linkIcons[key as keyof typeof linkIcons] || ExternalLink;
									return (
										<a
											key={key}
											href={String(url)}
											target="_blank"
											rel="noopener noreferrer"
											className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-background hover:border-primary/50 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
										>
											<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 group-hover:border-primary/40 group-hover:bg-primary/20 transition-all duration-200">
												<Icon className="h-6 w-6 text-primary" />
											</div>
											<div className="flex-1">
												<span className="block capitalize font-semibold text-foreground group-hover:text-primary transition-colors">
													{key}
												</span>
												<span className="text-xs text-muted-foreground truncate">
													{String(url).replace(/^https?:\/\//, '').replace(/\/$/, '')}
												</span>
											</div>
											<ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
										</a>
									);
								})}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Repositories */}
				{gh && gh.repos && gh.repos.length > 0 && (
					<Card className="mb-8 border border-border/50 bg-gradient-to-br from-card via-card to-card/80 shadow-lg">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">Repositories</CardTitle>
							<CardDescription>
								{gh.repos.length} {gh.repos.length === 1 ? 'repository' : 'repositories'} linked to this project
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								{gh.repos.slice(0, 10).map((r) => (
									<a
										key={`${r.owner}/${r.name}`}
										href={r.url}
										target="_blank"
										rel="noreferrer"
										className="group flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/30 hover:bg-background hover:border-primary/50 transition-all duration-200 hover:shadow-md"
									>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-3 mb-2">
												<Github className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
												<span className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
													{r.owner}/{r.name}
												</span>
											</div>
											<div className="flex items-center gap-4 text-sm text-muted-foreground pl-8">
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
						<Card className="mb-8 border border-border/50 bg-gradient-to-br from-card via-card to-card/80 shadow-lg">
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

				{/* Transparency Log */}
				<Card className="border border-border/50 bg-gradient-to-br from-card via-card to-card/80 shadow-lg">
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
										className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/30 hover:bg-background/50 hover:border-primary/30 transition-all duration-200 group"
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
			</main>
		</div>
	);
}
