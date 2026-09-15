import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DirectoryFilters } from "@/components/directory-filters";
import DirectoryProjectsGrid, {
	DirectoryProjectsGridSkeleton,
} from "@/components/directory-projects-grid";
import { DIRECTORY_CATEGORIES } from "@/lib/directory-categories";

export const metadata: Metadata = {
	title: "Stellar Projects Directory",
	description:
		"Browse every project building on Stellar: DeFi protocols, wallets, anchors, payments, RWAs and developer tools, each with its GitHub activity, on-chain footprint, SCF funding and a live or inactive status you can check.",
	alternates: { canonical: "/directory" },
};

type SearchParams = Promise<{
	q?: string;
	page?: string;
	type?: string;
	scf?: string;
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
	const typeFilter = params.type;
	const scfFilter = params.scf;
	const sortOption = params.sort || "featured";
	const page = parseInt(params.page || "1", 10);
	const limit = 24;

	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 pt-24">
				{/* Header */}
				<div className="mb-8">
					{/* h1, not h2: this page had no h1 at all, so its strongest
					    heading was invisible to a crawler ranking it for
					    "stellar projects directory". */}
					<h1 className="text-3xl font-medium tracking-tight mb-6">
						Every project building on Stellar
					</h1>
				</div>

				{/* Search and Filter */}
				<div className="mb-8">
					<DirectoryFilters />
				</div>

				{/* Category links. The filter control writes ?type=, which is a
				    poor ranking target and a URL nobody shares; these are the
				    same slices as real pages, and they are how a crawler finds
				    them at all. */}
				<nav className="mb-10 flex flex-wrap gap-2" aria-label="Categories">
					{DIRECTORY_CATEGORIES.map((c) => (
						<Link
							key={c.slug}
							href={`/directory/${c.slug}`}
							className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
						>
							{c.heading}
						</Link>
					))}
				</nav>

				{/* Projects Grid — key forces skeleton to show immediately on param change */}
				<Suspense
					key={`${searchQuery}-${typeFilter}-${scfFilter}-${sortOption}-${page}`}
					fallback={<DirectoryProjectsGridSkeleton />}
				>
					<DirectoryProjectsGrid
						searchQuery={searchQuery}
						typeFilter={typeFilter}
						scfFilter={scfFilter}
						sortOption={sortOption}
						page={page}
						limit={limit}
					/>
				</Suspense>
			</main>
		</div>
	);
}
