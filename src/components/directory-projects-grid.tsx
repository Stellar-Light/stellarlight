import { getPayloadSafe } from "@/lib/payload-client";
import ProjectCard from "@/components/project-card";
import ProjectCardSkeleton from "@/components/project-card-skeleton";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DirectoryProjectsGridProps {
	searchQuery?: string;
	categoryFilter?: string;
	page: number;
	limit: number;
}

export default async function DirectoryProjectsGrid({
	searchQuery,
	categoryFilter,
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
				sort: "-lastVerifiedAt",
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
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
				{result.docs.map((project: any, index: number) => (
					<ProjectCard
						key={project.id}
						project={project}
						isFeatured={index === 0 && !project.verificationLevel?.includes("Unverified")}
					/>
				))}
			</div>

			{/* Pagination */}
			{result.totalPages > 1 && (
				<div className="flex items-center justify-center gap-4">
					{page > 1 ? (
						<Button
							asChild
							variant="outline"
							size="lg"
							className="shadow-sm hover:shadow-md"
						>
							<Link
								href={`/directory?${new URLSearchParams({
									...(searchQuery ? { q: searchQuery } : {}),
									...(categoryFilter && categoryFilter !== "all" ? { category: categoryFilter } : {}),
									page: String(page - 1),
								}).toString()}`}
							>
								<ChevronLeft className="mr-2 h-4 w-4" />
								Previous
							</Link>
						</Button>
					) : (
						<Button
							variant="outline"
							size="lg"
							disabled
							className="shadow-sm"
						>
							<ChevronLeft className="mr-2 h-4 w-4" />
							Previous
						</Button>
					)}
					<div className="flex items-center gap-2 px-6 py-3 rounded-lg bg-muted/50 border-2">
						<span className="text-sm font-semibold">
							Page <span className="text-primary">{page}</span> of{" "}
							<span className="text-primary">{result.totalPages}</span>
						</span>
					</div>
					{page < result.totalPages ? (
						<Button
							asChild
							variant="outline"
							size="lg"
							className="shadow-sm hover:shadow-md"
						>
							<Link
								href={`/directory?${new URLSearchParams({
									...(searchQuery ? { q: searchQuery } : {}),
									...(categoryFilter && categoryFilter !== "all" ? { category: categoryFilter } : {}),
									page: String(page + 1),
								}).toString()}`}
							>
								Next
								<ChevronRight className="ml-2 h-4 w-4" />
							</Link>
						</Button>
					) : (
						<Button
							variant="outline"
							size="lg"
							disabled
							className="shadow-sm"
						>
							Next
							<ChevronRight className="ml-2 h-4 w-4" />
						</Button>
					)}
				</div>
			)}
		</>
	);
}

export function DirectoryProjectsGridSkeleton() {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
			{Array.from({ length: 6 }).map((_, i) => (
				<ProjectCardSkeleton key={i} />
			))}
		</div>
	);
}

