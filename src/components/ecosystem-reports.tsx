import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ExternalLink } from "lucide-react";

interface ReportSection {
	title: string;
	source: string;
	viewAllHref: string;
}

const sections: ReportSection[] = [
	{
		title: "Stablecoin Reports",
		source: "stablecoin-report",
		viewAllHref: "/blog?source=stablecoin-report",
	},
	{
		title: "RWA Updates",
		source: "rwa-report",
		viewAllHref: "/blog?source=rwa-report",
	},
	{
		title: "Community",
		source: "medium",
		viewAllHref: "/blog?source=medium",
	},
];

async function ReportRow({ section }: { section: ReportSection }) {
	const payload = await getPayloadSafe();
	if (!payload) return null;

	let posts: any[] = [];
	try {
		const result = await payload.find({
			collection: "blog",
			where: {
				status: { equals: "published" },
				source: { equals: section.source },
			},
			limit: 4,
			sort: "-publishedAt",
			depth: 1,
		});
		posts = result.docs;
	} catch {
		return null;
	}

	if (posts.length === 0) return null;

	return (
		<div className="mb-10">
			<div className="flex items-center justify-between mb-4">
				<h3 className="text-lg font-semibold text-foreground">
					{section.title}
				</h3>
				<Link
					href={section.viewAllHref}
					className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
				>
					View all <ArrowRight className="w-3.5 h-3.5" />
				</Link>
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				{posts.map((post: any) => {
					let imageUrl: string | null = null;
					let isExternal = false;
					if (post.rssImageUrl) {
						imageUrl = post.rssImageUrl;
						isExternal = true;
					} else if (
						post.featuredImage &&
						typeof post.featuredImage === "object"
					) {
						if (post.featuredImage.url) {
							imageUrl = post.featuredImage.url;
							isExternal = imageUrl?.startsWith("http") ?? false;
						} else if (post.featuredImage.filename) {
							imageUrl = `/media/${post.featuredImage.filename}`;
						}
					}

					return (
						<Link
							key={post.id}
							href={`/blog/${post.slug}`}
							className="group block"
						>
							<div className="rounded-xl bg-card border border-border hover:border-white/20 transition-all duration-150 overflow-hidden h-full flex flex-col">
								{imageUrl ? (
									<div className="relative w-full h-28 overflow-hidden">
										{isExternal ? (
											<img
												src={imageUrl}
												alt={post.title}
												className="absolute inset-0 w-full h-full object-cover"
											/>
										) : (
											<Image
												src={imageUrl}
												alt={post.title}
												fill
												className="object-cover"
											/>
										)}
									</div>
								) : (
									<div className="w-full h-28 bg-gradient-to-br from-white/5 to-transparent" />
								)}
								<div className="p-3 flex-1 flex flex-col">
									<h4 className="text-sm font-medium text-foreground line-clamp-2 mb-1 group-hover:text-white transition-colors">
										{post.title}
									</h4>
									<div className="mt-auto flex items-center gap-1 text-xs text-muted-foreground">
										{post.publishedAt && (
											<span>
												{new Date(
													post.publishedAt,
												).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
												})}
											</span>
										)}
										{post.isRSSExternal && (
											<ExternalLink className="w-3 h-3 ml-auto" />
										)}
									</div>
								</div>
							</div>
						</Link>
					);
				})}
			</div>
		</div>
	);
}

export default async function EcosystemReports() {
	return (
		<div className="mb-12">
			{sections.map((section) => (
				<ReportRow key={section.source} section={section} />
			))}
		</div>
	);
}

export function EcosystemReportsSkeleton() {
	return (
		<div className="mb-12 space-y-10">
			{[1, 2].map((i) => (
				<div key={i}>
					<div className="h-5 w-40 bg-white/5 rounded mb-4 animate-pulse" />
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
						{[1, 2, 3, 4].map((j) => (
							<div
								key={j}
								className="rounded-xl bg-card border border-border h-48 animate-pulse"
							/>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
