import { getPayload } from "payload";
import configPromise from "@/payload.config";
import Link from "next/link";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Search,
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	Building2,
	ArrowRight,
	Globe,
	Code,
} from "lucide-react";

type SearchParams = Promise<{
	q?: string;
	page?: string;
}>;

export default async function EntitiesPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const params = await searchParams;
	const payload = await getPayload({ config: configPromise });

	const searchQuery = params.q;
	const page = parseInt(params.page || "1", 10);
	const limit = 24;

	// Build where clause
	const where: Record<string, unknown> = {};

	if (searchQuery) {
		where.or = [
			{
				name: {
					contains: searchQuery,
				},
			},
		];
	}

	const result = await payload.find({
		collection: "entities",
		where,
		limit,
		page,
		sort: "name",
		populate: ["projects"],
	});

	return (
		<div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
			<div className="container mx-auto px-6 py-16">
				{/* Header */}
				<div className="mb-12 space-y-6">
					<div className="flex items-center gap-4">
						<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 via-primary/20 to-primary/10 shadow-lg shadow-primary/10">
							<Building2 className="h-8 w-8 text-primary" />
						</div>
						<div>
							<h1 className="text-5xl font-bold tracking-tight sm:text-6xl mb-3">
								Entities & Organizations
							</h1>
							<p className="text-xl text-muted-foreground max-w-2xl">
								Discover organizations, companies, and teams building innovative
								solutions in the Stellar ecosystem
							</p>
						</div>
					</div>
				</div>

				{/* Search Bar */}
				<div className="mb-12">
					<form method="get" className="flex gap-3">
						<div className="relative flex-1 group">
							<Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
							<Input
								type="search"
								name="q"
								placeholder="Search entities by name..."
								defaultValue={searchQuery || ""}
								className="h-14 pl-14 pr-6 text-base border-2 focus:border-primary/50 shadow-sm"
							/>
						</div>
						<Button
							type="submit"
							size="lg"
							className="px-8 h-14 shadow-lg shadow-primary/10 hover:shadow-xl hover:shadow-primary/20"
						>
							Search
						</Button>
					</form>
				</div>

				{/* Results */}
				{result.docs.length === 0 ? (
					<Card className="border-2 shadow-lg">
						<CardContent className="py-24 text-center">
							<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
								<Search className="h-8 w-8 text-muted-foreground" />
							</div>
							<p className="text-xl font-semibold mb-2">No entities found</p>
							<p className="text-muted-foreground">
								Try adjusting your search terms
							</p>
						</CardContent>
					</Card>
				) : (
					<>
						<div className="mb-8 flex items-center justify-between">
							<div className="text-sm text-muted-foreground">
								Showing{" "}
								<span className="font-bold text-foreground text-base">
									{result.docs.length}
								</span>{" "}
								of{" "}
								<span className="font-bold text-foreground text-base">
									{result.totalDocs}
								</span>{" "}
								entities
							</div>
						</div>

						<div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 mb-16">
							{result.docs.map((entity) => (
								<Card
									key={entity.id}
									className="h-full border-2 overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-2 hover:border-primary/30 group"
								>
									<div className="relative">
										<div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
										<CardHeader className="relative space-y-4 pb-4">
											<div className="flex items-start gap-4">
												<div className="flex-shrink-0">
													<div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/10 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
														<Building2 className="h-8 w-8 text-primary" />
													</div>
												</div>
												<div className="flex-1 min-w-0">
													<CardTitle className="text-2xl font-bold line-clamp-2 group-hover:text-primary transition-colors mb-2">
														{entity.name}
													</CardTitle>
													{entity.domains && entity.domains.length > 0 && (
														<div className="flex items-center gap-2 text-sm text-muted-foreground">
															<Globe className="h-4 w-4" />
															<span className="truncate">
																{entity.domains
																	.map((d: { domain: string }) => d.domain)
																	.slice(0, 2)
																	.join(", ")}
																{entity.domains.length > 2 &&
																	" +" + (entity.domains.length - 2)}
															</span>
														</div>
													)}
												</div>
											</div>
										</CardHeader>
										<CardContent className="relative space-y-5 pt-0">
											{entity.links?.website && (
												<a
													href={entity.links.website}
													target="_blank"
													rel="noopener noreferrer"
													className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-sm transition-colors border border-primary/20 hover:border-primary/30"
												>
													<ExternalLink className="h-4 w-4" />
													Visit Website
												</a>
											)}

											{entity.projects &&
												Array.isArray(entity.projects) &&
												entity.projects.length > 0 && (
													<div className="space-y-3 pt-4 border-t">
														<div className="flex items-center justify-between">
															<div className="flex items-center gap-2">
																<Code className="h-4 w-4 text-muted-foreground" />
																<span className="text-sm font-bold text-muted-foreground">
																	{entity.projects.length}{" "}
																	{entity.projects.length === 1
																		? "Project"
																		: "Projects"}
																</span>
															</div>
														</div>
														<div className="flex flex-wrap gap-2">
															{entity.projects
																.slice(0, 4)
																.map(
																	(project: {
																		id: string;
																		name: string;
																		slug: string;
																	}) => (
																		<Link
																			key={project.id}
																			href={`/project/${project.slug}`}
																		>
																			<Badge
																				variant="outline"
																				className="cursor-pointer hover:bg-primary/10 hover:border-primary/50 hover:text-primary transition-all border-2 px-3 py-1.5 text-xs font-medium"
																			>
																				{project.name}
																			</Badge>
																		</Link>
																	),
																)}
															{entity.projects.length > 4 && (
																<Badge
																	variant="outline"
																	className="bg-muted/50 border-2 px-3 py-1.5 text-xs font-medium"
																>
																	+{entity.projects.length - 4} more
																</Badge>
															)}
														</div>
														{entity.projects.length > 0 && (
															<div className="pt-2">
																<Link
																	href={`/project/${entity.projects[0].slug}`}
																	className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
																>
																	View All Projects
																	<ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
																</Link>
															</div>
														)}
													</div>
												)}
											{(!entity.projects || entity.projects.length === 0) && (
												<div className="pt-2">
													<p className="text-sm text-muted-foreground italic">
														No projects linked yet
													</p>
												</div>
											)}
										</CardContent>
									</div>
								</Card>
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
			</div>
		</div>
	);
}
