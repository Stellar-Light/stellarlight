import { getPayload } from "payload";
import configPromise from "@/payload.config";
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
} from "lucide-react";

type Params = Promise<{
	slug: string;
}>;

export default async function ProjectDetailPage({
	params,
}: {
	params: Params;
}) {
	const { slug } = await params;
	const payload = await getPayload({ config: configPromise });

	const result = await payload.find({
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
		depth: 1, // Populate relationships including logo
	});

	if (result.docs.length === 0) {
		notFound();
	}

	const project = result.docs[0];

	// Fetch GitHub data
	let gh: {
		lastActivityAt: string | null;
		openIssuesTotal: number;
		repos: Array<{
			owner: string;
			name: string;
			url: string;
			lastCommitAt: string | null;
			openIssues: number;
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
			// Silently fail - GitHub data is optional
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
		limit: 5,
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
		return date.toLocaleString("en-US", {
			month: "long",
			day: "numeric",
			year: "numeric",
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
	};

	return (
		<div className="container mx-auto px-6 py-12 max-w-5xl">
			<Button asChild variant="ghost" className="mb-8">
				<Link href="/directory">
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back to Directory
				</Link>
			</Button>

			<div className="mb-8 space-y-6">
				<div className="flex flex-col md:flex-row items-start md:items-center gap-6">
					{project.logo && (
						<ProjectLogo
							logo={project.logo}
							name={project.name}
							size={120}
							className="w-[120px] h-[120px]"
						/>
					)}
					<div className="space-y-4 flex-1">
						<h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
							{project.name}
						</h1>
						<div className="flex flex-wrap gap-3">
							<Badge variant="secondary" className="text-sm px-3 py-1.5">
								{project.category}
							</Badge>
							<Badge variant="outline" className="text-sm px-3 py-1.5">
								{project.status}
							</Badge>
							{project.verificationLevel !== "Unverified" && (
								<Badge
									variant="default"
									className="bg-primary/10 text-primary border-primary/20 text-sm px-3 py-1.5"
								>
									{project.verificationLevel}
								</Badge>
							)}
						</div>
						{linkedEntities.length > 0 && (
							<div className="flex items-center gap-2 p-4 rounded-xl bg-muted/50 border border-border/50">
								<span className="text-sm font-semibold">Organization:</span>
								<span className="text-sm">
									{linkedEntities.map((e) => e.name).join(", ")}
								</span>
							</div>
						)}
					</div>
				</div>
			</div>

			{project.shortDescription && (
				<Card className="mb-8 border-2">
					<CardContent className="pt-6">
						<p className="text-lg leading-relaxed text-muted-foreground">
							{project.shortDescription}
						</p>
					</CardContent>
				</Card>
			)}

			{project.types && project.types.length > 0 && (
				<Card className="mb-8 border-2">
					<CardHeader>
						<CardTitle>Project Types</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap gap-2">
							{project.types.map((type: string, idx: number) => (
								<Badge
									key={idx}
									variant="outline"
									className="text-sm px-3 py-1.5"
								>
									{type}
								</Badge>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{project.links && Object.values(project.links).some(Boolean) && (
				<Card className="mb-8 border-2">
					<CardHeader>
						<CardTitle>Links & Resources</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
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
										className="flex items-center gap-4 p-4 rounded-lg border-2 hover:border-primary/50 hover:bg-accent/50 transition-all group"
									>
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
											<Icon className="h-5 w-5 text-primary" />
										</div>
										<span className="flex-1 capitalize font-medium">{key}</span>
										<ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
									</a>
								);
							})}
						</div>
					</CardContent>
				</Card>
			)}

			{project.onchain &&
				(project.onchain.assetCode ||
					project.onchain.issuer ||
					(project.onchain.contracts &&
						project.onchain.contracts.length > 0)) && (
					<Card className="mb-8 border-2">
						<CardHeader>
							<CardTitle>On-Chain Information</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{project.onchain.assetCode && (
									<div>
										<div className="text-sm font-semibold mb-2">Asset Code</div>
										<code className="block p-3 rounded-lg bg-muted font-mono text-sm border-2">
											{project.onchain.assetCode}
										</code>
									</div>
								)}
								{project.onchain.issuer && (
									<div>
										<div className="text-sm font-semibold mb-2">Issuer</div>
										<code className="block p-3 rounded-lg bg-muted font-mono text-sm border-2 break-all">
											{project.onchain.issuer}
										</code>
									</div>
								)}
								{project.onchain.contracts &&
									project.onchain.contracts.length > 0 &&
									project.onchain.contracts.map(
										(contract: { address: string }, idx: number) => (
											<div key={idx}>
												<div className="text-sm font-semibold mb-2">
													Contract {idx + 1}
												</div>
												<code className="block p-3 rounded-lg bg-muted font-mono text-sm border-2 break-all">
													{contract.address}
												</code>
											</div>
										),
									)}
							</div>
						</CardContent>
					</Card>
				)}

			{gh && (
				<>
					<div className="mt-6 grid gap-4 md:grid-cols-3 mb-8">
						<div className="rounded border p-4">
							<div className="text-sm text-muted-foreground">
								Last Activity
							</div>
							<div className="text-lg">
								{formatDate(gh.lastActivityAt)}
							</div>
						</div>
						<div className="rounded border p-4">
							<div className="text-sm text-muted-foreground">Open Issues</div>
							<div className="text-lg">{gh.openIssuesTotal ?? 0}</div>
						</div>
					</div>

					{gh.repos && gh.repos.length > 0 && (
						<Card className="mb-8 border-2">
							<CardHeader>
								<CardTitle>Repositories</CardTitle>
							</CardHeader>
							<CardContent>
								<ul className="mt-2 divide-y rounded border">
									{gh.repos.slice(0, 10).map((r) => (
										<li
											key={`${r.owner}/${r.name}`}
											className="p-4 flex items-center justify-between"
										>
											<div className="flex-1">
												<a
													className="font-medium hover:underline"
													href={r.url}
													target="_blank"
													rel="noreferrer"
												>
													{r.owner}/{r.name}
												</a>
												<div className="text-sm text-muted-foreground">
													{r.error ? (
														<span className="text-orange-600 dark:text-orange-400">
															{r.error}
														</span>
													) : (
														<>
															Last commit:{" "}
															{r.lastCommitAt
																? formatDate(r.lastCommitAt)
																: "—"}
														</>
													)}
												</div>
											</div>
											<div className="text-sm">
												{r.skipped ? (
													<span className="text-muted-foreground">—</span>
												) : (
													`Open issues: ${r.openIssues ?? 0}`
												)}
											</div>
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					)}
				</>
			)}

			<Card className="border-2">
				<CardHeader>
					<CardTitle>Transparency Log</CardTitle>
					<CardDescription>
						Recent changes to this project entry for accountability
					</CardDescription>
				</CardHeader>
				<CardContent>
					{logsResult.docs.length === 0 ? (
						<p className="text-muted-foreground italic text-center py-8">
							No transparency logs yet.
						</p>
					) : (
						<div className="space-y-3">
							{logsResult.docs.map((log) => (
								<div
									key={log.id}
									className="flex items-center justify-between p-4 rounded-lg border-2 bg-muted/30 hover:bg-muted/50 transition-colors"
								>
									<div className="flex items-center gap-3">
										<Calendar className="h-4 w-4 text-muted-foreground" />
										<div>
											<span className="font-semibold">{log.action}</span>
											<span className="text-muted-foreground ml-2">
												by {log.actorType}
											</span>
										</div>
									</div>
									<span className="text-sm text-muted-foreground">
										{log.timestamp
											? new Date(log.timestamp).toLocaleDateString()
											: "Unknown date"}
									</span>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
