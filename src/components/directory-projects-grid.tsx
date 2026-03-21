import { getPayloadSafe } from "@/lib/payload-client";
import { rankedProjectSearch } from "@/lib/search/ranked-project-search";
import ProjectCard from "@/components/project-card";
import ProjectCardSkeleton from "@/components/project-card-skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DirectoryProjectsGridProps {
	searchQuery?: string;
	typeFilter?: string;
	sortOption?: string;
	page: number;
	limit: number;
}

/** Map sort option to Payload sort string */
function getPayloadSort(sortOption: string): string {
	switch (sortOption) {
		case "name-asc":
			return "name";
		case "name-desc":
			return "-name";
		case "newest":
			return "-lastVerifiedAt";
		case "featured":
		default:
			return "name";
	}
}

export default async function DirectoryProjectsGrid({
	searchQuery,
	typeFilter,
	sortOption = "featured",
	page,
	limit,
}: DirectoryProjectsGridProps) {
	const payload = await getPayloadSafe();

	let result: any = { docs: [], totalDocs: 0, totalPages: 0, page: 1, hasNextPage: false, hasPrevPage: false };

	if (payload) {
		try {
			const baseWhere: any = {
				status: {
					in: ["Development", "Pre-Release", "Live"],
				},
			};

			if (typeFilter && typeFilter !== "all") {
				baseWhere.types = { in: [typeFilter] };
			}

			if (searchQuery) {
				result = await rankedProjectSearch(payload, {
					query: searchQuery,
					typeFilter,
					page,
					limit,
					sort: getPayloadSort(sortOption),
				});
			} else if (sortOption === "featured") {
				// Two-pass: featured projects first, then the rest alphabetically
				const featuredWhere = { ...baseWhere, featured: { equals: true } };
				const restWhere = { ...baseWhere, featured: { not_equals: true } };

				const [featuredResults, restResults] = await Promise.all([
					payload.find({ collection: "projects", where: featuredWhere, limit: 0, depth: 1, sort: "name" }),
					payload.find({ collection: "projects", where: restWhere, limit: 0, depth: 1, sort: "name" }),
				]);

				const allDocs = [...featuredResults.docs, ...restResults.docs];
				const totalDocs = allDocs.length;
				const totalPages = Math.ceil(totalDocs / limit);
				const start = (page - 1) * limit;

				result = {
					docs: allDocs.slice(start, start + limit),
					totalDocs,
					totalPages,
					page,
					hasNextPage: page < totalPages,
					hasPrevPage: page > 1,
				};
			} else {
				result = await payload.find({
					collection: "projects",
					where: baseWhere,
					limit,
					page,
					sort: getPayloadSort(sortOption),
					depth: 1,
				});
			}
		} catch (error) {
			// Silently handle fetch errors
		}
	}

	if (result.docs.length === 0) {
		return (
			<div className="text-center py-16">
				<p className="text-lg text-muted-foreground">
					No projects found. {searchQuery ? "Try adjusting your search terms." : "Projects will appear here once approved."}
				</p>
			</div>
		);
	}

	return (
		<>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
				{result.docs.map((project: any) => (
					<ProjectCard
						key={project.id}
						project={project}
						isFeatured={project.featured === true}
					/>
				))}
			</div>

			{/* Pagination */}
			{result.totalPages > 1 && (
				<div className="flex items-center justify-center gap-2">
					{page > 1 ? (
						<Button
							asChild
							variant="ghost"
							size="default"
							className="rounded-lg bg-[#262626] border border-[#2F2F2F] hover:bg-white/5 hover:border-white/20 hover:text-foreground transition-all duration-150"
						>
							<Link
								href={`/directory?${new URLSearchParams({
									...(searchQuery ? { q: searchQuery } : {}),
									...(typeFilter && typeFilter !== "all" ? { type: typeFilter } : {}),
									...(sortOption && sortOption !== "featured" ? { sort: sortOption } : {}),
									page: String(page - 1),
								}).toString()}`}
							>
								<ChevronLeft className="h-3.5 w-3.5" />
								Previous
							</Link>
						</Button>
					) : (
						<Button
							variant="ghost"
							size="default"
							disabled
							className="rounded-lg bg-[#262626] border border-[#2F2F2F] opacity-40"
						>
							<ChevronLeft className="h-3.5 w-3.5" />
							Previous
						</Button>
					)}
					<div className="flex items-center px-4 py-2 rounded-lg bg-[#262626] border border-[#2F2F2F]">
						<span className="text-xs font-medium text-muted-foreground">
							{page} / {result.totalPages}
						</span>
					</div>
					{page < result.totalPages ? (
						<Button
							asChild
							variant="ghost"
							size="default"
							className="rounded-lg bg-[#262626] border border-[#2F2F2F] hover:bg-white/5 hover:border-white/20 hover:text-foreground transition-all duration-150"
						>
							<Link
								href={`/directory?${new URLSearchParams({
									...(searchQuery ? { q: searchQuery } : {}),
									...(typeFilter && typeFilter !== "all" ? { type: typeFilter } : {}),
									...(sortOption && sortOption !== "featured" ? { sort: sortOption } : {}),
									page: String(page + 1),
								}).toString()}`}
							>
								Next
								<ChevronRight className="h-3.5 w-3.5" />
							</Link>
						</Button>
					) : (
						<Button
							variant="ghost"
							size="default"
							disabled
							className="rounded-lg bg-[#262626] border border-[#2F2F2F] opacity-40"
						>
							Next
							<ChevronRight className="h-3.5 w-3.5" />
						</Button>
					)}
				</div>
			)}
		</>
	);
}

export function DirectoryProjectsGridSkeleton() {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
			{Array.from({ length: 6 }).map((_, i) => (
				<ProjectCardSkeleton key={i} />
			))}
		</div>
	);
}
