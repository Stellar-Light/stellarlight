import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProjectCard from "@/components/project-card";
import { DirectoryFilters } from "@/components/directory-filters";

type SearchParams = Promise<{
	q?: string;
	page?: string;
	category?: string;
}>;

// Force dynamic rendering to prevent build-time MongoDB connection errors
export const dynamic = "force-dynamic";

export default async function DirectoryPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const params = await searchParams;
	const payload = await getPayloadSafe();

	const searchQuery = params.q;
	const categoryFilter = params.category;
	const page = parseInt(params.page || "1", 10);
	const limit = 24;

	let result = { docs: [], totalDocs: 0, totalPages: 0, page: 1, hasNextPage: false, hasPrevPage: false };

	if (payload) {
		try {
			// Build where clause
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
				depth: 1, // Populate relationships including logo
			});
		} catch (error) {
			console.error("Error fetching projects:", error);
			// Continue with empty result
		}
	}

	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-6 py-12 pt-24">
				{/* Header */}
				<div className="mb-8">
					<h2 className="text-3xl font-medium tracking-tight mb-6">
						Projects Directory
						<span className="ml-3 text-lg text-muted-foreground">
							{result.totalDocs}
						</span>
					</h2>
				</div>

				{/* Search and Filter */}
				<div className="mb-8">
					<DirectoryFilters />
				</div>

				{/* Projects Grid */}
				{result.docs.length === 0 ? (
					<div className="text-center py-16">
						<p className="text-lg text-muted-foreground">
							No projects found. {searchQuery ? "Try adjusting your search terms." : "Projects will appear here once approved."}
						</p>
					</div>
				) : (
					<>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
							{result.docs.map((project, index) => (
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
				)}
			</main>
		</div>
	);
}
