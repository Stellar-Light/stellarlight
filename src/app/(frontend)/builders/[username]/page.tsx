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
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ago,
	agoSentence,
	builderCodeActivity,
	type CodeActivity,
} from "@/lib/builder-code";
import {
	buildsForRepos,
	getHackathonBuildsIndex,
	type IndexedBuild,
} from "@/lib/hackathon-builds";
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
	// SCF grants on the projects this person is connected to, and hackathon
	// projects (DoraHacks buidls) whose GitHub link is one of their repos
	let scf: Array<{
		slug: string;
		name: string;
		totalAwarded: number;
		rounds: number[];
	}> = [];
	let hackBuilds: IndexedBuild[] = [];
	try {
		const payload = await getPayloadSafe();
		if (payload) {
			code = (await builderCodeActivity(payload, [builder as any])).get(
				String(builder.github_username).toLowerCase(),
			);
			// Only projects the person OWNS: repos they own that belong to the
			// project, or the project's GitHub org is them. Contributing to a
			// project's repo (or naming it on Passport) is not receiving its grant.
			const login = String(builder.github_username).toLowerCase();
			const owned = new Set<string>();
			for (const r of code?.repos ?? [])
				if (r.via === "owner" && r.projectSlug) owned.add(r.projectSlug);
			if (code) {
				const org = await payload.find({
					collection: "projects",
					where: {
						"github.orgLogin": { equals: String(builder.github_username) },
					},
					limit: 100,
					depth: 0,
					select: { slug: true },
				} as any);
				for (const d of org.docs as any[])
					if (d.slug) owned.add(String(d.slug));
			}
			void login;
			const slugs = [...owned];
			if (slugs.length) {
				const pr = await payload.find({
					collection: "projects",
					where: {
						and: [{ slug: { in: slugs } }, { "scf.awarded": { equals: true } }],
					},
					limit: 200,
					depth: 0,
					select: { name: true, slug: true, scf: true },
				} as any);
				scf = (pr.docs as any[])
					.map((d) => ({
						slug: String(d.slug),
						name: String(d.name),
						totalAwarded: Number(d.scf?.totalAwarded ?? 0),
						rounds: ((d.scf?.awardedRounds ?? []) as unknown[])
							.map(Number)
							.filter((n) => Number.isFinite(n)),
					}))
					.sort((a, b) => b.totalAwarded - a.totalAwarded);
			}
			try {
				const idx = await getHackathonBuildsIndex();
				hackBuilds = buildsForRepos(
					idx,
					code?.repos.map((r) => r.fullName) ?? [],
					[String(builder.github_username)],
				).sort((a, b) =>
					(b.hackathon.endedAt ?? "").localeCompare(a.hackathon.endedAt ?? ""),
				);
			} catch {}
		}
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
				</div>

				{/* Activity strip — OUTSIDE the profile row so it never competes with
				    the name/role column (the old nested card squeezed and wrapped
				    whenever a role title ran long). Equal-width cells, one baseline,
				    short values. Real numbers from the repos we index; Passport's
				    30d figures only when Passport has them. Nothing = no strip. */}
				{(() => {
					const tiles: Array<{ v: string; l: string; passport?: true }> = [];
					if (code && code.repos.length > 0) {
						tiles.push({
							v: String(code.repos.length),
							l: code.repos.length === 1 ? "Stellar repo" : "Stellar repos",
						});
						if (code.commits90d > 0)
							tiles.push({
								v: code.commits90d.toLocaleString(),
								l: "Commits · own · 90d",
							});
						if (code.contributedCommits12m > 0)
							tiles.push({
								v: code.contributedCommits12m.toLocaleString(),
								l: "Commits · others · 12mo",
							});
						if (code.lastCommitAt)
							tiles.push({ v: ago(code.lastCommitAt) ?? "", l: "Last commit" });
					}
					if (builder.stats?.totalCommits30d)
						tiles.push({
							v: String(builder.stats.totalCommits30d),
							l: "Commits · 30d",
							passport: true,
						});
					if (builder.stats?.activeDays30d)
						tiles.push({
							v: String(builder.stats.activeDays30d),
							l: "Active days · 30d",
							passport: true,
						});
					if (!tiles.length) return null;
					const hasPassport = tiles.some((t) => t.passport);
					return (
						<div className="mt-6 border-t border-border pt-5">
							<div className="stagger-in grid grid-cols-2 gap-y-5 sm:grid-cols-3 md:flex md:divide-x md:divide-border">
								{tiles.map((t) => (
									<div
										key={t.l}
										className="md:flex-1 md:px-5 first:md:pl-0 last:md:pr-0"
									>
										<div className="text-xl font-semibold tabular-nums leading-none text-foreground">
											{t.v}
										</div>
										<div className="mt-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
											{t.l}
										</div>
									</div>
								))}
							</div>
							{hasPassport && (
								<p className="mt-3 text-[11px] text-muted-foreground/60">
									30-day figures from Stellar Passport
								</p>
							)}
						</div>
					);
				})()}
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
			{code &&
				(code.repos.length > 0 ||
					code.projects.size > 0 ||
					code.contributesTo.size > 0) && (
					<Card className="mb-8">
						<CardHeader>
							<CardTitle>On Stellar</CardTitle>
							<p className="text-sm text-muted-foreground">
								From the Stellar repos we index: {code.repos.length}{" "}
								{code.repos.length === 1 ? "repo" : "repos"}
								{code.stars > 0 ? `, ${code.stars.toLocaleString()} stars` : ""}
								{code.commits90d > 0
									? `, ${code.commits90d.toLocaleString()} commits on their own repos in the last 90 days`
									: ""}
								{code.lastCommitAt
									? `, last commit ${agoSentence(code.lastCommitAt)}`
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
							{code.contributesTo.size > 0 && (
								<div className="flex flex-wrap items-center gap-2">
									<span className="text-sm text-muted-foreground">
										Contributes to
									</span>
									{[...code.contributesTo.entries()].map(([slug, name]) => (
										<Link
											key={slug}
											href={`/project/${slug}`}
											className="rounded-md border border-border/60 px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:border-white/25 transition-colors"
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

			{/* Nothing indexed for this person: say so plainly rather than render a blank page */}
			{(!code ||
				(code.repos.length === 0 &&
					code.projects.size === 0 &&
					code.contributesTo.size === 0)) &&
				hackBuilds.length === 0 && (
					<Card className="mb-8">
						<CardContent className="py-6 text-sm text-muted-foreground">
							No public code from{" "}
							{builder.display_name || builder.github_username} in the Stellar
							repos we index yet, and no hackathon submissions matched their
							GitHub.
							{builder.role_title || builder.bio
								? " Not everyone here ships code: this profile comes from Stellar Passport."
								: " This profile comes from Stellar Passport."}
						</CardContent>
					</Card>
				)}

			{/* Funding + hackathons: from data we already hold about their projects and repos */}
			{(scf.length > 0 || hackBuilds.length > 0) && (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
					{scf.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">
									Stellar Community Fund
								</CardTitle>
								<p className="text-xs text-muted-foreground">
									Awards to projects this person owns on GitHub, per our SCF
									records. Contributing to a funded project is not counted.
								</p>
							</CardHeader>
							<CardContent className="space-y-2">
								{scf.map((g) => (
									<div
										key={g.slug}
										className="flex items-center justify-between gap-3 text-sm"
									>
										<Link
											href={`/project/${g.slug}`}
											className="text-foreground hover:underline underline-offset-2 truncate"
										>
											{g.name}
										</Link>
										<span className="text-muted-foreground tabular-nums whitespace-nowrap">
											{g.totalAwarded > 0
												? `$${g.totalAwarded.toLocaleString()}`
												: "awarded"}
											{g.rounds.length
												? ` · round${g.rounds.length > 1 ? "s" : ""} ${g.rounds.join(", ")}`
												: ""}
										</span>
									</div>
								))}
							</CardContent>
						</Card>
					)}
					{hackBuilds.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Hackathon projects</CardTitle>
								<p className="text-xs text-muted-foreground">
									DoraHacks submissions whose repository is one of theirs.
								</p>
							</CardHeader>
							<CardContent className="space-y-2">
								{hackBuilds.slice(0, 8).map((b) => (
									<div key={b.id} className="text-sm">
										<a
											href={b.url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-foreground hover:underline underline-offset-2"
										>
											{b.name}
										</a>
										<span className="text-muted-foreground">
											{" "}
											· {b.hackathon.title}
											{b.hackathonPlacement
												? ` · ${b.hackathonPlacement}`
												: b.isWinner
													? " · winner"
													: ""}
											{b.award ? ` · ${b.award}` : ""}
										</span>
									</div>
								))}
								{hackBuilds.length > 8 && (
									<p className="text-xs text-muted-foreground">
										+{hackBuilds.length - 8} more
									</p>
								)}
							</CardContent>
						</Card>
					)}
				</div>
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

			{/* Passport wallet: a passkey smart account Stellar Passport creates for the
			    profile, NOT the person's own wallet, so say exactly that and keep it quiet. */}
			{builder.stellar_address && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Stellar Passport wallet</CardTitle>
						<p className="text-xs text-muted-foreground">
							Passkey smart account created by Stellar Passport for this
							profile; not a personal wallet, not for payments.
						</p>
					</CardHeader>
					<CardContent>
						<code className="bg-muted px-2 py-1 rounded text-xs break-all text-muted-foreground">
							{builder.stellar_address}
						</code>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
