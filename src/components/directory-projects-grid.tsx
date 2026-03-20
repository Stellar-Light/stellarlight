import { getPayloadSafe } from "@/lib/payload-client";
import ProjectCard from "@/components/project-card";
import ProjectCardSkeleton from "@/components/project-card-skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DirectoryProjectsGridProps {
	searchQuery?: string;
	categoryFilter?: string;
	sortOption?: string;
	page: number;
	limit: number;
}

/** Map sort option to Payload sort string */
function getPayloadSort(sortOption: string): string {
	switch (sortOption) {
		case "featured":
			return "-featured,name";
		case "name-asc":
			return "name";
		case "name-desc":
			return "-name";
		case "newest":
			return "-lastVerifiedAt";
		default:
			return "-featured,name";
	}
}

export default async function DirectoryProjectsGrid({
	searchQuery,
	categoryFilter,
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

			if (categoryFilter && categoryFilter !== "all") {
				baseWhere.category = { equals: categoryFilter };
			}

			if (searchQuery) {
				// Two-pass search: exact name matches first, then description/org matches
				// This ensures "Blend" appears before projects that mention Blend in descriptions
				const nameWhere = {
					...baseWhere,
					name: { contains: searchQuery },
				};

				const descWhere = {
					...baseWhere,
					and: [
						{
							name: { not_equals: "" }, // placeholder to combine with or
							or: [
								{ shortDescription: { contains: searchQuery } },
								{ "github.orgLogin": { contains: searchQuery } },
							],
						},
						{
							// Exclude projects already matched by name
							name: { not_contains: searchQuery },
						},
					],
				};

				const sort = getPayloadSort(sortOption);

				// Fetch both sets (overfetch to handle pagination correctly)
				const [nameResults, descResults] = await Promise.all([
					payload.find({ collection: "projects", where: nameWhere, limit: 0, depth: 1, sort }),
					payload.find({ collection: "projects", where: descWhere, limit: 0, depth: 1, sort }),
				]);

				// Merge: name matches first, then description matches
				const allDocs = [...nameResults.docs, ...descResults.docs];
				const totalDocs = allDocs.length;
				const totalPages = Math.ceil(totalDocs / limit);
				const start = (page - 1) * limit;
				const paginatedDocs = allDocs.slice(start, start + limit);

				result = {
					docs: paginatedDocs,
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
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
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
				<div className="flex items-center justify-center gap-2 sm:gap-4">
					{page > 1 ? (
						<Button
							asChild
							variant="outline"
							className="shadow-sm hover:shadow-md h-10 px-3 sm:h-12 sm:px-8"
						>
							<Link
								href={`/directory?${new URLSearchParams({
									...(searchQuery ? { q: searchQuery } : {}),
									...(categoryFilter && categoryFilter !== "all" ? { category: categoryFilter } : {}),
									...(sortOption && sortOption !== "featured" ? { sort: sortOption } : {}),
									page: String(page - 1),
								}).toString()}`}
							>
								<ChevronLeft className="h-4 w-4 sm:mr-2" />
								<span className="hidden sm:inline">Previous</span>
							</Link>
						</Button>
					) : (
						<Button
							variant="outline"
							disabled
							className="shadow-sm h-10 px-3 sm:h-12 sm:px-8"
						>
							<ChevronLeft className="h-4 w-4 sm:mr-2" />
							<span className="hidden sm:inline">Previous</span>
						</Button>
					)}
					<div className="flex items-center gap-2 px-4 py-2.5 sm:px-6 sm:py-3 rounded-lg bg-muted/50 border-2">
						<span className="text-xs sm:text-sm font-semibold">
							Page <span className="text-primary">{page}</span> of{" "}
							<span className="text-primary">{result.totalPages}</span>
						</span>
					</div>
					{page < result.totalPages ? (
						<Button
							asChild
							variant="outline"
							className="shadow-sm hover:shadow-md h-10 px-3 sm:h-12 sm:px-8"
						>
							<Link
								href={`/directory?${new URLSearchParams({
									...(searchQuery ? { q: searchQuery } : {}),
									...(categoryFilter && categoryFilter !== "all" ? { category: categoryFilter } : {}),
									...(sortOption && sortOption !== "featured" ? { sort: sortOption } : {}),
									page: String(page + 1),
								}).toString()}`}
							>
								<span className="hidden sm:inline">Next</span>
								<ChevronRight className="h-4 w-4 sm:ml-2" />
							</Link>
						</Button>
					) : (
						<Button
							variant="outline"
							disabled
							className="shadow-sm h-10 px-3 sm:h-12 sm:px-8"
						>
							<span className="hidden sm:inline">Next</span>
							<ChevronRight className="h-4 w-4 sm:ml-2" />
						</Button>
					)}
				</div>
			)}
		</>
	);
}

export function DirectoryProjectsGridSkeleton() {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
			{Array.from({ length: 6 }).map((_, i) => (
				<ProjectCardSkeleton key={i} />
			))}
		</div>
	);
}

