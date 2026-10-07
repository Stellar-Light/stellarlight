import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import DirectoryProjectsGrid, {
	DirectoryProjectsGridSkeleton,
} from "@/components/directory-projects-grid";
import {
	categoryBySlug,
	DIRECTORY_CATEGORIES,
} from "@/lib/directory-categories";

type Params = Promise<{ category: string }>;
type SearchParams = Promise<{ page?: string; sort?: string }>;

export const dynamic = "force-dynamic";

/** One static path per category so the routes are known at build time. */
export function generateStaticParams() {
	return DIRECTORY_CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { category } = await params;
	const c = categoryBySlug(category);
	if (!c) return { title: "Category not found" };
	return {
		title: c.heading,
		description: c.description,
		alternates: { canonical: `/directory/${c.slug}` },
	};
}

/**
 * A category slice of the directory with its own URL, title, description and
 * h1 — the thing /directory?type=Wallet could never be, because a query
 * parameter shares all of those with the unfiltered page.
 */
export default async function DirectoryCategoryPage({
	params,
	searchParams,
}: {
	params: Params;
	searchParams: SearchParams;
}) {
	const { category } = await params;
	const c = categoryBySlug(category);
	if (!c) notFound();

	const sp = await searchParams;
	const page = Number.parseInt(sp.page || "1", 10);
	const sortOption = sp.sort || "featured";

	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 pt-24">
				<div className="mb-8">
					<Link
						href="/directory"
						className="text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						← All projects
					</Link>
					<h1 className="text-3xl font-medium tracking-tight mt-4 mb-3">
						{c.heading}
					</h1>
					<p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
						{c.description}
					</p>
				</div>

				<Suspense
					key={`${c.slug}-${sortOption}-${page}`}
					fallback={<DirectoryProjectsGridSkeleton />}
				>
					<DirectoryProjectsGrid
						typeFilter={c.type}
						sortOption={sortOption}
						page={page}
						limit={24}
						basePath={`/directory/${c.slug}`}
						listName={c.heading}
					/>
				</Suspense>

				{/* Sibling categories: real internal links between related slices,
				    which is also how a crawler discovers the rest of them. */}
				<nav className="mt-16 pt-8 border-t border-border/40">
					<h2 className="text-sm font-medium mb-4 text-muted-foreground">
						Browse by category
					</h2>
					<div className="flex flex-wrap gap-2">
						{DIRECTORY_CATEGORIES.filter((o) => o.slug !== c.slug).map((o) => (
							<Link
								key={o.slug}
								href={`/directory/${o.slug}`}
								className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
							>
								{o.heading}
							</Link>
						))}
					</div>
				</nav>
			</main>
		</div>
	);
}
