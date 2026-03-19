import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import EntityCard from "@/components/entity-card";

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
	const payload = await getPayloadSafe();

	const searchQuery = params.q;
	const page = parseInt(params.page || "1", 10);
	const limit = 24;

	let result: any = { docs: [], totalDocs: 0, totalPages: 0, page: 1, hasNextPage: false, hasPrevPage: false };

	if (payload) {
		try {
	// Build where clause
			const where: any = {};

	if (searchQuery) {
		where.or = [
			{
				name: {
					contains: searchQuery,
				},
			},
		];
	}

			result = await payload.find({
		collection: "entities",
		where,
		limit,
		page,
		sort: "name",
		depth: 1, // Populate relationships including projects
	});
		} catch (error) {
			// Continue with empty result
		}
	}

	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 pt-24">
				{/* Header */}
				<div className="mb-8">
					<h2 className="text-3xl font-medium tracking-tight mb-6">
						Entities & Organizations
						<span className="ml-3 text-lg text-muted-foreground">
							{result.totalDocs}
						</span>
					</h2>
				</div>

				{/* Search */}
				<div className="mb-8">
					<form method="get" action="/entities" className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
						<div className="relative w-full md:max-w-[560px]">
							<Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
							<input
								type="text"
								name="q"
								placeholder="Search entities..."
								defaultValue={searchQuery || ""}
								className="w-full h-11 pl-12 pr-4 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border transition-all duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
							/>
						</div>
					</form>
				</div>

				{/* Entities Grid */}
				{result.docs.length === 0 ? (
					<div className="text-center py-16">
						<p className="text-lg text-muted-foreground">
							No entities found. {searchQuery ? "Try adjusting your search terms." : "Entities will appear here once added."}
						</p>
					</div>
				) : (
					<>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
							{result.docs.map((entity: any) => (
								<EntityCard key={entity.id} entity={entity} />
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
											href={`/entities?${new URLSearchParams({
												...(searchQuery ? { q: searchQuery } : {}),
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
											href={`/entities?${new URLSearchParams({
												...(searchQuery ? { q: searchQuery } : {}),
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
