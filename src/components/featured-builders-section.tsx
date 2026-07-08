import { ArrowRight, Calendar, GitBranch, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getPayloadSafe } from "@/lib/payload-client";

export default async function FeaturedBuildersSection() {
	const payload = await getPayloadSafe();
	if (!payload) return null;

	let builders = [];

	try {
		// Fetch featured builders or most active builders
		const buildersResult = await payload.find({
			collection: "builders",
			where: {
				visibility: {
					equals: "public",
				},
			},
			sort: "-stats.totalCommits30d",
			limit: 6,
		});

		builders = buildersResult.docs.filter(
			(builder: any) =>
				builder.stats?.totalCommits30d > 0 || builder.is_featured,
		);

		// If we don't have enough active builders, get some recent ones
		if (builders.length < 6) {
			const additionalBuilders = await payload.find({
				collection: "builders",
				where: {
					visibility: {
						equals: "public",
					},
				},
				sort: "-createdAt",
				limit: 6 - builders.length,
			});

			builders = [...builders, ...additionalBuilders.docs];
		}

		builders = builders.slice(0, 6);
	} catch (error) {
		console.error("Error fetching builders:", error);
		return null;
	}

	if (builders.length === 0) return null;

	return (
		<section className="mb-16">
			<div className="flex items-center justify-between mb-10">
				<div>
					<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-foreground">
						Featured Builders
					</h2>
					<p className="text-muted-foreground">
						Meet the talented developers building on Stellar
					</p>
				</div>
				<Link
					href="/builders"
					className="hidden sm:flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
				>
					View All Builders
					<ArrowRight className="w-4 h-4" />
				</Link>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{builders.map((builder: any) => (
					<Link
						key={builder.id}
						href={`/builders/${builder.github_username}`}
						className="group"
					>
						<Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
							<CardContent className="p-6">
								<div className="flex items-start space-x-4">
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
											<div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-lg font-bold">
												{builder.display_name.charAt(0).toUpperCase()}
											</div>
										)}
									</div>

									{/* Content */}
									<div className="flex-1 min-w-0">
										<h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
											{builder.display_name}
										</h3>

										{builder.role_title && (
											<p className="text-sm text-muted-foreground truncate mt-1">
												{builder.role_title}
											</p>
										)}

										{/* Stats */}
										<div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
											{builder.stats?.totalCommits30d > 0 && (
												<span className="flex items-center gap-1">
													<GitBranch className="w-3 h-3" />
													{builder.stats.totalCommits30d} commits
												</span>
											)}
											{builder.projects && builder.projects.length > 0 && (
												<span className="flex items-center gap-1">
													<Users className="w-3 h-3" />
													{builder.projects.length} projects
												</span>
											)}
										</div>

										{/* Bio preview */}
										{builder.bio && (
											<p className="text-xs text-muted-foreground mt-2 line-clamp-2">
												{builder.bio}
											</p>
										)}
									</div>
								</div>
							</CardContent>
						</Card>
					</Link>
				))}
			</div>

			{/* Mobile view all link */}
			<Link
				href="/builders"
				className="sm:hidden flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mt-6"
			>
				View All Builders
				<ArrowRight className="w-4 h-4" />
			</Link>
		</section>
	);
}

export function FeaturedBuildersSkeleton() {
	return (
		<section className="mb-16">
			<div className="mb-10">
				<div className="h-10 w-48 bg-muted rounded animate-pulse mb-2" />
				<div className="h-4 w-80 bg-muted rounded animate-pulse" />
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
				))}
			</div>
		</section>
	);
}
