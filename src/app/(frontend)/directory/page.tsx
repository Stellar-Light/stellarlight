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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Search,
	ChevronLeft,
	ChevronRight,
	Sparkles,
	ArrowRight,
	Calendar,
} from "lucide-react";

type SearchParams = Promise<{
	q?: string;
	page?: string;
}>;

export default async function DirectoryPage({
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
	const where: Record<string, unknown> = {
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

	const result = await payload.find({
		collection: "projects",
		where,
		limit,
		page,
		sort: "-lastVerifiedAt",
		depth: 1, // Populate relationships including logo
	});

	const formatRelativeTime = (
		date: string | Date | null | undefined,
	): string => {
		if (!date) return "Never";
		const d = new Date(date);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays < 1) return "Today";
		if (diffDays === 1) return "Yesterday";
		if (diffDays < 7) return `${diffDays} days ago`;
		if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
		if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
		return `${Math.floor(diffDays / 365)} years ago`;
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "Live":
				return "bg-green-500/10 text-green-400 border-green-500/20";
			case "Pre-Release":
				return "bg-blue-500/10 text-blue-400 border-blue-500/20";
			case "Development":
				return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
			default:
				return "";
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
			<div className="container mx-auto px-6 py-16">
				{/* Header */}
				<div className="mb-12 space-y-6">
					<div className="flex items-center gap-4">
						<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 via-primary/20 to-primary/10 shadow-lg shadow-primary/10">
							<Sparkles className="h-8 w-8 text-primary" />
						</div>
						<div>
							<h1 className="text-5xl font-bold tracking-tight sm:text-6xl mb-3">
								Projects Directory
							</h1>
							<p className="text-xl text-muted-foreground max-w-2xl">
								Discover tools, applications, and services powering the Stellar
								ecosystem
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
								placeholder="Search projects by name or description..."
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
							<p className="text-xl font-semibold mb-2">No projects found</p>
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
								projects
							</div>
						</div>

						<div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 mb-16">
							{result.docs.map((project) => (
								<Link
									key={project.id}
									href={`/project/${project.slug}`}
									className="group block"
								>
									<Card className="h-full border-2 overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-2 hover:border-primary/30">
										<div className="relative">
											<div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
											<CardHeader className="relative space-y-4 pb-4">
												<div className="flex items-start justify-between gap-3">
													<div className="flex-1 min-w-0">
														<CardTitle className="text-2xl font-bold line-clamp-2 group-hover:text-primary transition-colors mb-2">
															{project.name}
														</CardTitle>
													</div>
													<div className="flex-shrink-0">
														<div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
															<Sparkles className="h-6 w-6 text-primary" />
														</div>
													</div>
												</div>
												{project.shortDescription && (
													<CardDescription className="line-clamp-3 text-base leading-relaxed text-muted-foreground">
														{project.shortDescription}
													</CardDescription>
												)}
											</CardHeader>
											<CardContent className="space-y-4 pt-0">
												<div className="flex flex-wrap gap-2">
													<Badge
														variant="secondary"
														className="font-semibold px-3 py-1.5 text-xs"
													>
														{project.category}
													</Badge>
													<Badge
														variant="outline"
														className={`font-semibold px-3 py-1.5 text-xs border-2 ${getStatusColor(project.status)}`}
													>
														{project.status}
													</Badge>
													{project.verificationLevel !== "Unverified" && (
														<Badge
															variant="default"
															className="bg-primary/15 text-primary border-primary/30 font-semibold px-3 py-1.5 text-xs border-2"
														>
															✓ {project.verificationLevel}
														</Badge>
													)}
												</div>
												{project.lastVerifiedAt && (
													<div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
														<Calendar className="h-3.5 w-3.5" />
														<span>
															Verified{" "}
															{formatRelativeTime(project.lastVerifiedAt)}
														</span>
													</div>
												)}
												<div className="pt-2">
													<div className="flex items-center gap-2 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
														View Details
														<ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
													</div>
												</div>
											</CardContent>
										</div>
									</Card>
								</Link>
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
