import {
	ArrowLeft,
	Briefcase,
	Code2,
	ExternalLink,
	GitBranch,
	Github,
	Globe,
	MapPin,
	Twitter,
	Users,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	ago,
	builderCodeActivity,
	type CodeActivity,
} from "@/lib/builder-code";
import {
	fetchAllBuilders,
	type PassportBuilder,
} from "@/lib/integrations/stellar-passport";
import { getPayloadSafe } from "@/lib/payload-client";

// One source of truth: the Payload `builders` mirror (synced from Stellar
// Passport daily by /api/sync/builders). The list used to hit the live
// Passport demo host while /builders/[username] read the mirror, so a name
// on the list could 404 when clicked. Live Passport is only a fallback for
// an empty mirror. ISR, not force-dynamic: the mirror moves once a day.
export const revalidate = 300;

export const metadata: Metadata = {
	title: "Builders | Stellar Light",
	description:
		"Discover talented builders and developers in the Stellar ecosystem",
};

export default async function BuildersPage() {
	let builders: PassportBuilder[] = [];
	const activity = new Map<string, CodeActivity>();
	let syncedAt: string | null = null;

	const payload = await getPayloadSafe();
	if (payload) {
		try {
			const mirror = await payload.find({
				collection: "builders",
				where: { visibility: { not_equals: "hidden" } },
				limit: 1000,
				depth: 0,
			});
			builders = mirror.docs as unknown as PassportBuilder[];
			for (const d of mirror.docs as any[])
				if (d.last_synced && (!syncedAt || d.last_synced > syncedAt))
					syncedAt = d.last_synced;
		} catch (error) {
			console.error("builders mirror read failed:", error);
		}
	}
	if (builders.length === 0) {
		try {
			builders = await fetchAllBuilders();
		} catch (error) {
			console.error("Failed to fetch builders:", error);
		}
	}

	// Filter out builders without a github username
	builders = builders.filter((b) => b.github_username);

	// What each builder has actually shipped in the Stellar repos we index
	// (owned, Passport-declared, contributor pass); see src/lib/builder-code.ts
	if (payload && builders.length) {
		try {
			for (const [k, v] of await builderCodeActivity(payload, builders as any))
				activity.set(k, v);
		} catch (error) {
			console.error("builders repo activity failed:", error);
		}
	}
	const act = (b: PassportBuilder) =>
		activity.get(String(b.github_username).toLowerCase());

	// Featured first; then everyone with recent activity (Passport 30d commits
	// or a commit in our repo index in the last 90 days), most active first;
	// then the rest, most recently active first.
	const recentCut = Date.now() - 90 * 86_400_000;
	const heat = (b: PassportBuilder) =>
		(b.stats?.totalCommits30d ?? 0) * 3 + (act(b)?.commits90d ?? 0);
	const isRecent = (b: PassportBuilder) =>
		heat(b) > 0 || Date.parse(act(b)?.lastCommitAt ?? "") > recentCut;
	const featuredBuilders = builders.filter((b) => b.is_featured);
	const activeBuilders = builders
		.filter((b) => !b.is_featured && isRecent(b))
		.sort(
			(a, b) =>
				heat(b) - heat(a) ||
				Date.parse(act(b)?.lastCommitAt ?? "0") -
					Date.parse(act(a)?.lastCommitAt ?? "0"),
		);
	const otherBuilders = builders
		.filter((b) => !b.is_featured && !isRecent(b))
		.sort(
			(a, b) =>
				Date.parse(act(b)?.lastCommitAt ?? "0") -
				Date.parse(act(a)?.lastCommitAt ?? "0"),
		);

	return (
		<div className="min-h-screen relative">
			<main className="max-w-7xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Home</span>
				</Link>

				<div className="mb-10">
					<p className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-2">
						Directory
					</p>
					<h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-2">
						Builders
					</h1>
					<p className="text-muted-foreground">
						{builders.length} developers building on Stellar. Profiles from
						Stellar Passport, code activity from the{" "}
						{activity.size ? "repos we index" : "repos we index (loading)"}.
						{syncedAt
							? ` Profiles synced ${new Date(syncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
							: ""}
					</p>
				</div>

				{/* Featured Builders */}
				{featuredBuilders.length > 0 && (
					<section className="mb-12">
						<h2 className="text-2xl font-bold mb-6">Featured</h2>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
							{featuredBuilders.map((builder) => (
								<BuilderRow
									key={builder.github_username}
									builder={builder}
									activity={act(builder)}
									featured
								/>
							))}
						</div>
					</section>
				)}

				{/* Active Builders */}
				{activeBuilders.length > 0 && (
					<section className="mb-12">
						<div className="flex items-center gap-3 mb-6">
							<h2 className="text-2xl font-bold">Active in the last 90 days</h2>
							<Badge variant="outline" className="tabular-nums">
								{activeBuilders.length}
							</Badge>
						</div>
						<div className="space-y-3">
							{activeBuilders.map((builder) => (
								<BuilderRow
									key={builder.github_username}
									builder={builder}
									activity={act(builder)}
								/>
							))}
						</div>
					</section>
				)}

				{/* All Other Builders */}
				<section>
					<h2 className="text-2xl font-bold mb-6">
						{activeBuilders.length
							? `Everyone else (${otherBuilders.length})`
							: `All Builders (${otherBuilders.length})`}
					</h2>

					{otherBuilders.length > 0 ? (
						<div className="space-y-3">
							{otherBuilders.map((builder) => (
								<BuilderRow
									key={builder.github_username}
									builder={builder}
									activity={act(builder)}
								/>
							))}
						</div>
					) : builders.length === 0 ? (
						<Card className="border border-border/50 bg-card">
							<CardContent className="py-16 text-center">
								<Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
								<p className="text-muted-foreground">
									The builder directory is empty right now. Profiles come from
									Stellar Passport; if you have one, it will appear after the
									next sync.
								</p>
							</CardContent>
						</Card>
					) : null}
				</section>

				{/* CTA */}
				<div className="mt-16 text-center py-12 px-8 rounded-2xl border border-border bg-card">
					<h3 className="text-2xl font-semibold mb-3">
						Are you building on Stellar?
					</h3>
					<p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
						Create your Stellar Passport profile to showcase your work and
						connect with the community
					</p>
					<Button asChild size="lg">
						<a
							href="https://demo.stellarpassport.xyz"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2"
						>
							Create Your Profile
							<ExternalLink className="w-4 h-4" />
						</a>
					</Button>
				</div>
			</main>
		</div>
	);
}

function BuilderRow({
	builder,
	activity,
	featured = false,
}: {
	builder: PassportBuilder;
	activity?: CodeActivity;
	featured?: boolean;
}) {
	const twitterUrl = builder.twitter_handle
		? `https://twitter.com/${builder.twitter_handle.replace("@", "").replace("https://x.com/", "").replace("https://twitter.com/", "")}`
		: null;

	return (
		<Card
			className={`relative border ${featured ? "border-white/20 bg-card" : "border-border/50 bg-card"} hover:border-white/25 hover:bg-white/[0.02] transition-colors duration-150`}
		>
			{/* whole card opens the profile; the social icons below stay their own targets */}
			<Link
				href={`/builders/${builder.github_username}`}
				className="absolute inset-0 rounded-xl"
				aria-label={`${builder.display_name}'s profile`}
			/>
			<CardContent className="p-5">
				<div className="flex items-center gap-4">
					{/* Avatar */}
					<div className="flex-shrink-0">
						{builder.avatar_url ? (
							<Image
								src={builder.avatar_url}
								alt={builder.display_name}
								width={48}
								height={48}
								className="rounded-full"
							/>
						) : (
							<div className="w-12 h-12 bg-white/[0.06] border border-border rounded-full flex items-center justify-center text-neutral-300 text-lg font-semibold">
								{builder.display_name.charAt(0).toUpperCase()}
							</div>
						)}
					</div>

					{/* Info */}
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<h3 className="font-semibold text-foreground truncate">
								{builder.display_name}
							</h3>
							{featured && (
								<Badge variant="outline" className="text-xs text-neutral-300">
									Featured
								</Badge>
							)}
						</div>
						<div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
							{builder.role_title && (
								<span className="flex items-center gap-1 truncate">
									<Briefcase className="w-3 h-3" />
									{builder.role_title}
								</span>
							)}
							{builder.location && (
								<span className="flex items-center gap-1">
									<MapPin className="w-3 h-3" />
									{builder.location}
								</span>
							)}
							{(builder.stats?.totalCommits30d ?? 0) > 0 && (
								<span className="flex items-center gap-1">
									<GitBranch className="w-3 h-3" />
									{builder.stats!.totalCommits30d} commits / 30d
								</span>
							)}
							{builder.projects && builder.projects.length > 0 && (
								<span className="flex items-center gap-1">
									<Code2 className="w-3 h-3" />
									{builder.projects.length} project
									{builder.projects.length !== 1 ? "s" : ""}
								</span>
							)}
							{activity && activity.repos.length > 0 && (
								<span className="flex items-center gap-1 tabular-nums">
									<GitBranch className="w-3 h-3" />
									{activity.repos.length} Stellar{" "}
									{activity.repos.length === 1 ? "repo" : "repos"}
									{activity.stars > 0
										? `, ${activity.stars.toLocaleString()} stars`
										: ""}
									{activity.lastCommitAt
										? `, last commit ${ago(activity.lastCommitAt)}`
										: ""}
								</span>
							)}
						</div>
						{activity && activity.projects.size > 0 && (
							<div className="relative z-10 mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
								<span className="text-muted-foreground">builds</span>
								{[...activity.projects.entries()]
									.slice(0, 4)
									.map(([slug, name]) => (
										<Link
											key={slug}
											href={`/project/${slug}`}
											className="rounded-md border border-border bg-white/[0.03] px-1.5 py-0.5 text-foreground/90 hover:border-white/25 transition-colors"
										>
											{name}
										</Link>
									))}
								{activity.projects.size > 4 && (
									<span className="text-muted-foreground">
										+{activity.projects.size - 4} more
									</span>
								)}
							</div>
						)}
					</div>

					{/* Social links */}
					<div className="relative z-10 flex items-center gap-2 flex-shrink-0">
						{builder.github_username && (
							<a
								href={`https://github.com/${builder.github_username}`}
								target="_blank"
								rel="noopener noreferrer"
								className="text-muted-foreground hover:text-foreground transition-colors p-1"
							>
								<Github className="w-4 h-4" />
							</a>
						)}
						{builder.website_url && (
							<a
								href={builder.website_url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-muted-foreground hover:text-foreground transition-colors p-1"
							>
								<Globe className="w-4 h-4" />
							</a>
						)}
						{twitterUrl && (
							<a
								href={twitterUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-muted-foreground hover:text-foreground transition-colors p-1"
							>
								<Twitter className="w-4 h-4" />
							</a>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
