import Link from "next/link";
import Image from "next/image";
import { ArrowRight, GitBranch, Code2 } from "lucide-react";
import { fetchAllBuilders, type PassportBuilder } from "@/lib/integrations/stellar-passport";

export default async function TopBuildersSection() {
	let builders: PassportBuilder[] = [];

	try {
		const all = await fetchAllBuilders();
		// Show builders with activity first, then by project count, cap at 6
		builders = all
			.filter((b) => b.github_username)
			.sort((a, b) => {
				const aScore = (a.stats?.totalCommits30d ?? 0) * 2 + (a.projects?.length ?? 0);
				const bScore = (b.stats?.totalCommits30d ?? 0) * 2 + (b.projects?.length ?? 0);
				return bScore - aScore;
			})
			.slice(0, 6);
	} catch {
		return null;
	}

	if (builders.length === 0) return null;

	return (
		<section className="mb-16">
			<div className="flex items-center justify-between mb-10">
				<div>
					<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-foreground">
						Top Builders
					</h2>
					<p className="text-muted-foreground">
						Active developers in the Stellar ecosystem
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

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{builders.map((builder) => (
					<Link
						key={builder.github_username}
						href={`/builders`}
						className="group flex items-center gap-4 p-5 rounded-xl border border-border/50 bg-card hover:bg-card/80 hover:border-primary/30 transition-all duration-150 hover:shadow-sm hover:-translate-y-0.5"
					>
						{/* Avatar */}
						<div className="flex-shrink-0">
							{builder.avatar_url ? (
								<Image
									src={builder.avatar_url}
									alt={builder.display_name}
									width={40}
									height={40}
									className="rounded-full"
								/>
							) : (
								<div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
									{builder.display_name.charAt(0).toUpperCase()}
								</div>
							)}
						</div>

						<div className="flex-1 min-w-0">
							<p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
								{builder.display_name}
							</p>
							<div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
								{(builder.stats?.totalCommits30d ?? 0) > 0 && (
									<span className="flex items-center gap-1">
										<GitBranch className="w-3.5 h-3.5" />
										{builder.stats!.totalCommits30d}
									</span>
								)}
								{builder.projects && builder.projects.length > 0 && (
									<span className="flex items-center gap-1">
										<Code2 className="w-3.5 h-3.5" />
										{builder.projects.length} project{builder.projects.length !== 1 ? "s" : ""}
									</span>
								)}
								{builder.role_title && (builder.stats?.totalCommits30d ?? 0) === 0 && (
									<span className="truncate text-xs">{builder.role_title}</span>
								)}
							</div>
						</div>

						<ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
					</Link>
				))}
			</div>

			{/* Mobile "View All" link */}
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

export function TopBuildersSkeleton() {
	return (
		<section className="mb-16">
			<div className="mb-10">
				<div className="h-10 w-40 bg-[#262626] rounded animate-pulse mb-2" />
				<div className="h-4 w-64 bg-[#262626] rounded animate-pulse" />
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="h-[76px] rounded-xl bg-[#262626] animate-pulse" />
				))}
			</div>
		</section>
	);
}