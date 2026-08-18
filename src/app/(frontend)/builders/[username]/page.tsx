import {
	Activity,
	Briefcase,
	Calendar,
	Code2,
	ExternalLink,
	GitFork,
	Github,
	Globe,
	MapPin,
	MessageCircle,
	Star,
	Twitter,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ago,
	builderCodeActivity,
	type CodeActivity,
} from "@/lib/builder-code";
import { getPayloadSafe } from "@/lib/payload-client";

type Params = Promise<{ username: string }>;

async function getBuilder(username: string) {
	const payload = await getPayloadSafe();
	if (!payload) return null;

	// GitHub logins are case-insensitive; URLs get typed in lowercase
	const result = await payload.find({
		collection: "builders",
		where: { github_username: { like: username } },
		limit: 5,
	});
	const docs = result.docs;
	return (
		docs.find(
			(d) => String(d.github_username).toLowerCase() === username.toLowerCase(),
		) ??
		docs[0] ??
		null
	);
}

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { username } = await params;
	const builder = await getBuilder(username);

	if (!builder) {
		return {
			title: "Builder Not Found",
		};
	}

	return {
		title: `${builder.display_name} | Stellar Builders`,
		description:
			builder.bio ||
			`Check out ${builder.display_name}'s profile and projects on Stellar`,
	};
}

export default async function BuilderProfilePage({
	params,
}: {
	params: Params;
}) {
	const { username } = await params;
	const builder = await getBuilder(username);

	if (!builder) {
		notFound();
	}

	// what this person has shipped in the Stellar repos we index (owned,
	// Passport-declared, contributor pass); the Passport profile alone is thin
	let code: CodeActivity | undefined;
	try {
		const payload = await getPayloadSafe();
		if (payload)
			code = (await builderCodeActivity(payload, [builder as any])).get(
				String(builder.github_username).toLowerCase(),
			);
	} catch {}

	return (
		<div className="container mx-auto px-4 py-8 max-w-6xl">
			{/* Profile Header */}
			<div className="rounded-2xl border border-border bg-card p-8 mb-8">
				<div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-6">
					{/* Avatar */}
					<div className="flex-shrink-0">
						{builder.avatar_url ? (
							<Image
								src={builder.avatar_url}
								alt={builder.display_name}
								width={120}
								height={120}
								className="rounded-full border-4 border-background"
							/>
						) : (
							<div className="w-30 h-30 bg-white/[0.06] border border-border rounded-full flex items-center justify-center text-neutral-300 text-4xl font-semibold">
								{builder.display_name.charAt(0).toUpperCase()}
							</div>
						)}
					</div>

					{/* Profile Info */}
					<div className="flex-1">
						<h1 className="text-3xl font-bold mb-2">{builder.display_name}</h1>

						{builder.role_title && (
							<div className="flex items-center text-muted-foreground mb-2">
								<Briefcase className="w-4 h-4 mr-2" />
								<span>{builder.role_title}</span>
							</div>
						)}

						{builder.location && (
							<div className="flex items-center text-muted-foreground mb-3">
								<MapPin className="w-4 h-4 mr-2" />
								<span>{builder.location}</span>
							</div>
						)}

						{/* Social Links */}
						<div className="flex items-center space-x-4">
							{builder.github_username && (
								<Button variant="outline" size="sm" asChild>
									<a
										href={`https://github.com/${builder.github_username}`}
										target="_blank"
										rel="noopener noreferrer"
									>
										<Github className="w-4 h-4 mr-2" />
										GitHub
									</a>
								</Button>
							)}
							{builder.website_url && (
								<Button variant="outline" size="sm" asChild>
									<a
										href={builder.website_url}
										target="_blank"
										rel="noopener noreferrer"
									>
										<Globe className="w-4 h-4 mr-2" />
										Website
									</a>
								</Button>
							)}
							{builder.twitter_handle && (
								<Button variant="outline" size="sm" asChild>
									<a
										href={`https://twitter.com/${builder.twitter_handle.replace("@", "").replace("https://x.com/", "").replace("https://twitter.com/", "")}`}
										target="_blank"
										rel="noopener noreferrer"
									>
										<Twitter className="w-4 h-4 mr-2" />
										Twitter
									</a>
								</Button>
							)}
							{builder.telegram_handle && (
								<Button variant="outline" size="sm" asChild>
									<a
										href={`https://t.me/${builder.telegram_handle.replace("@", "")}`}
										target="_blank"
										rel="noopener noreferrer"
									>
										<MessageCircle className="w-4 h-4 mr-2" />
										Telegram
									</a>
								</Button>
							)}
						</div>
					</div>

					{/* Stats Card */}
					{builder.stats && (
						<Card className="w-full md:w-auto">
							<CardContent className="p-4">
								<div className="grid grid-cols-2 gap-4 text-center">
									<div>
										<div className="text-2xl font-bold text-primary">
											{builder.stats.totalCommits30d || 0}
										</div>
										<div className="text-xs text-muted-foreground">
											Commits (30d)
										</div>
									</div>
									<div>
										<div className="text-2xl font-bold text-primary">
											{builder.stats.activeDays30d || 0}
										</div>
										<div className="text-xs text-muted-foreground">
											Active Days
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					)}
				</div>
			</div>

			{/* Bio Section */}
			{builder.bio && (
				<Card className="mb-8">
					<CardHeader>
						<CardTitle>About</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground whitespace-pre-wrap">
							{builder.bio}
						</p>
					</CardContent>
				</Card>
			)}

			{/* On Stellar: projects + repos from OUR index (this is what was missing) */}
			{code && (code.repos.length > 0 || code.projects.size > 0) && (
				<Card className="mb-8">
					<CardHeader>
						<CardTitle>On Stellar</CardTitle>
						<p className="text-sm text-muted-foreground">
							From the Stellar repos we index: {code.repos.length}{" "}
							{code.repos.length === 1 ? "repo" : "repos"}
							{code.stars > 0 ? `, ${code.stars.toLocaleString()} stars` : ""}
							{code.commits90d > 0
								? `, ${code.commits90d.toLocaleString()} commits in the last 90 days`
								: ""}
							{code.lastCommitAt
								? `, last commit ${ago(code.lastCommitAt)}`
								: ""}
							.
						</p>
					</CardHeader>
					<CardContent className="space-y-5">
						{code.projects.size > 0 && (
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-sm text-muted-foreground">Builds</span>
								{[...code.projects.entries()].map(([slug, name]) => (
									<Link
										key={slug}
										href={`/project/${slug}`}
										className="rounded-md border border-border bg-white/[0.03] px-2 py-1 text-sm text-foreground/90 hover:border-white/25 transition-colors"
									>
										{name}
									</Link>
								))}
							</div>
						)}
						{code.repos.length > 0 && (
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
											<th className="py-2 pr-4 font-medium">Repository</th>
											<th className="py-2 pr-4 font-medium">Project</th>
											<th className="py-2 pr-4 font-medium text-right">
												Stars
											</th>
											<th className="py-2 pr-4 font-medium text-right">
												90d commits
											</th>
											<th className="py-2 font-medium text-right">
												Last commit
											</th>
										</tr>
									</thead>
									<tbody>
										{code.repos.slice(0, 40).map((r) => (
											<tr
												key={r.fullName}
												className="border-b border-border/50 last:border-0"
											>
												<td className="py-2 pr-4">
													<a
														href={r.url}
														target="_blank"
														rel="noopener noreferrer"
														className="text-foreground hover:underline underline-offset-2"
													>
														{r.fullName}
													</a>
													{r.via !== "owner" && (
														<span className="ml-2 text-xs text-muted-foreground">
															{r.via === "contributor"
																? `contributor${r.myCommits12m ? `, ${r.myCommits12m} commits/12mo` : ""}`
																: "declared on Passport"}
														</span>
													)}
												</td>
												<td className="py-2 pr-4">
													{r.projectSlug && r.projectName ? (
														<Link
															href={`/project/${r.projectSlug}`}
															className="text-foreground/90 hover:underline underline-offset-2"
														>
															{r.projectName}
														</Link>
													) : (
														<span className="text-muted-foreground">-</span>
													)}
												</td>
												<td className="py-2 pr-4 text-right tabular-nums">
													{r.stars.toLocaleString()}
												</td>
												<td className="py-2 pr-4 text-right tabular-nums">
													{r.commits90d ? (
														r.commits90d.toLocaleString()
													) : (
														<span className="text-muted-foreground">-</span>
													)}
												</td>
												<td className="py-2 text-right tabular-nums text-muted-foreground">
													{ago(r.lastCommitAt) ?? "-"}
												</td>
											</tr>
										))}
									</tbody>
								</table>
								{code.repos.length > 40 && (
									<p className="mt-2 text-xs text-muted-foreground">
										Showing 40 of {code.repos.length}.
									</p>
								)}
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{/* Projects Section (declared on Stellar Passport) */}
			{builder.projects && builder.projects.length > 0 && (
				<Card className="mb-8">
					<CardHeader>
						<CardTitle className="flex items-center">
							<Code2 className="w-5 h-5 mr-2" />
							Projects ({builder.projects.length})
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{builder.projects.map((project, index) => (
								<div key={index} className="border rounded-lg p-4">
									<div className="flex items-start justify-between mb-2">
										<div>
											<h3 className="text-lg font-semibold">{project.name}</h3>
											<Badge variant="outline" className="mt-1">
												{project.status}
											</Badge>
										</div>
										<div className="flex items-center space-x-2">
											{project.website_url && (
												<Button variant="ghost" size="sm" asChild>
													<a
														href={project.website_url}
														target="_blank"
														rel="noopener noreferrer"
													>
														<ExternalLink className="w-4 h-4" />
													</a>
												</Button>
											)}
										</div>
									</div>

									{project.short_description && (
										<p className="text-muted-foreground text-sm mb-3">
											{project.short_description}
										</p>
									)}

									{/* Project Links */}
									<div className="flex flex-wrap gap-2">
										{project.demo_url && (
											<Button variant="outline" size="sm" asChild>
												<a
													href={project.demo_url}
													target="_blank"
													rel="noopener noreferrer"
												>
													Demo
												</a>
											</Button>
										)}
										{project.docs_url && (
											<Button variant="outline" size="sm" asChild>
												<a
													href={project.docs_url}
													target="_blank"
													rel="noopener noreferrer"
												>
													Docs
												</a>
											</Button>
										)}
									</div>

									{/* Repositories */}
									{project.repos && project.repos.length > 0 && (
										<div className="mt-4 space-y-2">
											<h4 className="text-sm font-medium">Repositories:</h4>
											{project.repos.map((repo, repoIndex) => (
												<div
													key={repoIndex}
													className="flex items-center justify-between text-sm"
												>
													<a
														href={repo.html_url}
														target="_blank"
														rel="noopener noreferrer"
														className="text-primary hover:underline flex items-center"
													>
														<Github className="w-4 h-4 mr-2" />
														{repo.full_name}
													</a>
													<div className="flex items-center space-x-3 text-muted-foreground">
														{repo.primary_language && (
															<span>{repo.primary_language}</span>
														)}
														<div className="flex items-center space-x-1">
															<Star className="w-3 h-3" />
															<span>{repo.stars}</span>
														</div>
														<div className="flex items-center space-x-1">
															<GitFork className="w-3 h-3" />
															<span>{repo.forks}</span>
														</div>
													</div>
												</div>
											))}
										</div>
									)}
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Contact Section */}
			{builder.stellar_address && (
				<Card>
					<CardHeader>
						<CardTitle>Stellar Address</CardTitle>
					</CardHeader>
					<CardContent>
						<code className="bg-muted px-2 py-1 rounded text-sm break-all">
							{builder.stellar_address}
						</code>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
