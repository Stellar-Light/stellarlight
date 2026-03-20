import { Suspense } from "react";
import { DirectoryFilters } from "@/components/directory-filters";
import DirectoryProjectsGrid, { DirectoryProjectsGridSkeleton } from "@/components/directory-projects-grid";

type SearchParams = Promise<{
	q?: string;
	page?: string;
	category?: string;
	sort?: string;
}>;

// Force dynamic rendering to prevent build-time MongoDB connection errors
export const dynamic = "force-dynamic";

export default async function DirectoryPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const params = await searchParams;

	const searchQuery = params.q;
	const categoryFilter = params.category;
	const sortOption = params.sort || "featured";
	const page = parseInt(params.page || "1", 10);
	const limit = 24;

	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 pt-24">
				{/* Header */}
				<div className="mb-8">
					<h2 className="text-3xl font-medium tracking-tight mb-6">
						Projects Directory
					</h2>
				</div>

				{/* Search and Filter */}
				<div className="mb-8">
					<DirectoryFilters />
				</div>

				{/* Projects Grid */}
				<Suspense fallback={<DirectoryProjectsGridSkeleton />}>
					<DirectoryProjectsGrid
						searchQuery={searchQuery}
						categoryFilter={categoryFilter}
						sortOption={sortOption}
						page={page}
						limit={limit}
					/>
				</Suspense>
			</main>
		</div>
	);
}
