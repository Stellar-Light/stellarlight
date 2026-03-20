import { Suspense } from "react";
import { EntitiesSearch } from "@/components/entities-search";
import EntitiesGrid, { EntitiesGridSkeleton } from "@/components/entities-grid";

type SearchParams = Promise<{
	q?: string;
	page?: string;
}>;

// Force dynamic rendering to prevent build-time MongoDB connection errors
export const dynamic = "force-dynamic";

export default async function EntitiesPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const params = await searchParams;

	const searchQuery = params.q;
	const page = parseInt(params.page || "1", 10);
	const limit = 24;

	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 pt-24">
				{/* Header */}
				<div className="mb-8">
					<h2 className="text-3xl font-medium tracking-tight mb-6">
						Entities & Organizations
					</h2>
				</div>

				{/* Search */}
				<div className="mb-8">
					<Suspense>
						<EntitiesSearch />
					</Suspense>
				</div>

				{/* Entities Grid */}
				<Suspense key={`${searchQuery}-${page}`} fallback={<EntitiesGridSkeleton />}>
					<EntitiesGrid
						searchQuery={searchQuery}
						page={page}
						limit={limit}
					/>
				</Suspense>
			</main>
		</div>
	);
}
