import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { DollarSign, Zap, PlusCircle } from "lucide-react";

const changeTypeConfig: Record<string, { icon: typeof DollarSign; label: string; color: string }> = {
	"scf-funding": { icon: DollarSign, label: "SCF Funding", color: "text-green-400" },
	"status-change": { icon: Zap, label: "Status Update", color: "text-blue-400" },
	"new-project": { icon: PlusCircle, label: "New Project", color: "text-purple-400" },
};

interface ChangelogFeedProps {
	page?: number;
	/** If set, only show changelog entries for this project slug */
	projectSlug?: string;
	limit?: number;
}

export default async function ChangelogFeed({
	page = 1,
	projectSlug,
	limit = 20,
}: ChangelogFeedProps) {
	const payload = await getPayloadSafe();
	if (!payload) return null;

	let posts: any[] = [];
	let totalPages = 1;

	try {
		const where: any = {
			status: { equals: "published" },
			contentType: { equals: "changelog" },
		};
		if (projectSlug) {
			where["changelogData.projectSlug"] = { equals: projectSlug };
		}

		const result = await payload.find({
			collection: "blog",
			where,
			limit,
			page,
			sort: "-publishedAt",
			depth: 0,
		});
		posts = result.docs;
		totalPages = result.totalPages;
	} catch {
		return null;
	}

	if (posts.length === 0) {
		return (
			<div className="text-center py-16">
				<p className="text-muted-foreground">
					No changelog entries yet. Activity will appear here as projects update.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-1">
			{posts.map((post: any) => {
				const data = post.changelogData || {};
				const config = changeTypeConfig[data.changeType] || changeTypeConfig["new-project"];
				const Icon = config.icon;
				const date = post.publishedAt
					? new Date(post.publishedAt).toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
							year: "numeric",
						})
					: "";

				return (
					<div
						key={post.id}
						className="flex items-start gap-4 p-4 rounded-xl hover:bg-white/[0.02] transition-colors"
					>
						{/* Icon */}
						<div className={`mt-0.5 p-2 rounded-lg bg-white/5 ${config.color}`}>
							<Icon className="w-4 h-4" />
						</div>

						{/* Content */}
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium text-foreground">
								{post.title}
							</p>
							<div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
								<span>{date}</span>
								{data.projectSlug && (
									<>
										<span>·</span>
										<Link
											href={`/project/${data.projectSlug}`}
											className="hover:text-foreground transition-colors"
										>
											{data.projectName || data.projectSlug}
										</Link>
									</>
								)}
							</div>
						</div>

						{/* Amount badge for SCF */}
						{data.changeType === "scf-funding" && data.numericValue && (
							<span className="text-sm font-medium text-green-400 whitespace-nowrap">
								${data.numericValue.toLocaleString()}
							</span>
						)}
					</div>
				);
			})}

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-2 pt-4">
					<span className="text-xs text-muted-foreground">
						Page {page} of {totalPages}
					</span>
				</div>
			)}
		</div>
	);
}

export function ChangelogFeedSkeleton() {
	return (
		<div className="space-y-1">
			{Array.from({ length: 5 }).map((_, i) => (
				<div key={i} className="flex items-start gap-4 p-4">
					<div className="w-8 h-8 rounded-lg bg-white/5 animate-pulse" />
					<div className="flex-1 space-y-2">
						<div className="h-4 w-3/4 bg-white/5 rounded animate-pulse" />
						<div className="h-3 w-1/3 bg-white/5 rounded animate-pulse" />
					</div>
				</div>
			))}
		</div>
	);
}
