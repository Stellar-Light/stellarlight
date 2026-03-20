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
			const where: any = {
				status: {
					in: ["Development", "Pre-Release", "Live"],
				},
			};

			if (searchQuery) {
				where.or = [
					{
						name: {
							contains: searchQuery,
						},
					},
					{
						shortDescription: {
							contains: searchQuery,
						},
					},
					{
						"github.orgLogin": {
							contains: searchQuery,
						},
					},
				];
			}

			if (categoryFilter && categoryFilter !== "all") {
				where.category = { equals: categoryFilter };
			}

			result = await payload.find({
				collection: "projects",
				where,
				limit,
				page,
				sort: getPayloadSort(sortOption),
				depth: 1,
			});
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

