import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ProjectCard from "@/components/project-card";
import {
	ArrowLeft,
	ExternalLink,
	Globe,
	Github,
	Twitter,
	Building2,
	Code,
} from "lucide-react";

type Params = Promise<{
	slug: string;
}>;

// Force dynamic rendering to prevent build-time MongoDB connection errors
export const dynamic = "force-dynamic";

export default async function EntityDetailPage({
	params,
}: {
	params: Params;
}) {
	const { slug } = await params;
	const payload = await getPayloadSafe();

	if (!payload) {
		notFound();
	}

	let result;
	try {
		result = await payload.find({
			collection: "entities",
			where: {
				slug: {
					equals: slug,
				},
			},
			limit: 1,
			depth: 2, // Populate projects and their relationships
		});
	} catch (error) {
		console.error("Error fetching entity:", error);
		notFound();
	}

	if (result.docs.length === 0) {
		notFound();
	}

	const entity = result.docs[0];

	// Get associated projects - filter to only show live/active projects
	const associatedProjects = (entity.projects || [])
		.filter((project: any) => {
			// Handle both populated and unpopulated project references
			if (typeof project === "string") {
				return false; // Skip if not populated
			}
			return project.status && ["Development", "Pre-Release", "Live"].includes(project.status);
		})
		.map((project: any) => project);


	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-6 py-16 pt-28">
				{/* Back Button */}
				<Link
					href="/entities"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-200 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-200" />
					<span className="text-sm font-medium">Back to Entities</span>
				</Link>

				{/* Hero Section */}
				<div className="mb-12">
					<div className="flex flex-col md:flex-row items-start md:items-center gap-8 mb-8">
						<div className="relative flex-shrink-0">
							<div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FDDA24]/20 via-transparent to-transparent blur-xl opacity-50" />
							<div className="relative w-[140px] h-[140px] rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-2xl border border-border/50">
								<Building2 className="w-16 h-16 text-primary" />
							</div>
						</div>
						<div className="flex-1 space-y-6">
							<div>
								<h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-4 bg-gradient-to-r from-foreground via-foreground to-[#FDDA24] bg-clip-text text-transparent">
									{entity.name}
								</h1>
								{entity.domains && entity.domains.length > 0 && (
									<p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl">
										{entity.domains.map((d: any) => d.domain).join(", ")}
									</p>
								)}
							</div>

							{/* Project Count Badge */}
							<div className="flex flex-wrap items-center gap-3">
								<Badge
									variant="secondary"
									className="text-sm px-4 py-1.5 font-semibold border border-border/50 shadow-sm"
								>
									<Code className="w-3.5 h-3.5 mr-1.5" />
									{associatedProjects.length}{" "}
									{associatedProjects.length === 1 ? "Project" : "Projects"}
								</Badge>
							</div>
						</div>
					</div>
				</div>

				{/* Links & Resources */}
				{entity.links && Object.values(entity.links).some(Boolean) && (
					<Card className="mb-8 border border-border/50 bg-gradient-to-br from-card via-card to-card/80 shadow-lg">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">Links & Resources</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex flex-wrap gap-3">
								{entity.links.website && (
									<Button
										asChild
										variant="outline"
										className="gap-2 border-border/50 hover:border-primary/50 transition-colors"
									>
										<a
											href={entity.links.website}
											target="_blank"
											rel="noopener noreferrer"
										>
											<Globe className="w-4 h-4" />
											Website
											<ExternalLink className="w-3 h-3" />
										</a>
									</Button>
								)}
								{entity.links.github && (
									<Button
										asChild
										variant="outline"
										className="gap-2 border-border/50 hover:border-primary/50 transition-colors"
									>
										<a
											href={entity.links.github}
											target="_blank"
											rel="noopener noreferrer"
										>
											<Github className="w-4 h-4" />
											GitHub
											<ExternalLink className="w-3 h-3" />
										</a>
									</Button>
								)}
								{entity.links.twitter && (
									<Button
										asChild
										variant="outline"
										className="gap-2 border-border/50 hover:border-primary/50 transition-colors"
									>
										<a
											href={entity.links.twitter}
											target="_blank"
											rel="noopener noreferrer"
										>
											<Twitter className="w-4 h-4" />
											Twitter
											<ExternalLink className="w-3 h-3" />
										</a>
									</Button>
								)}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Domains */}
				{entity.domains && entity.domains.length > 0 && (
					<Card className="mb-8 border border-border/50 bg-gradient-to-br from-card via-card to-card/80 shadow-lg">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">Domains</CardTitle>
							<CardDescription>
								Associated domains for this organization
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex flex-wrap gap-2.5">
								{entity.domains.map((domain: any, idx: number) => (
									<Badge
										key={idx}
										variant="outline"
										className="text-sm px-4 py-2 font-medium border-border/50 hover:border-primary/50 transition-colors"
									>
										{domain.domain}
									</Badge>
								))}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Associated Projects */}
				<div className="mb-8">
					<div className="mb-6">
						<h2 className="text-3xl font-bold tracking-tight mb-2">
							Associated Projects
						</h2>
						<p className="text-muted-foreground">
							{associatedProjects.length === 0
								? "No active projects associated with this entity yet."
								: `Projects being developed or maintained by ${entity.name}.`}
						</p>
					</div>

					{associatedProjects.length === 0 ? (
						<Card className="border border-border/50 bg-gradient-to-br from-card via-card to-card/80 shadow-lg">
							<CardContent className="p-12 text-center">
								<Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
								<p className="text-lg text-muted-foreground mb-2">
									No projects linked yet
								</p>
								<p className="text-sm text-muted-foreground/70">
									Projects associated with this entity will appear here once they are added.
								</p>
							</CardContent>
						</Card>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
							{associatedProjects.map((project: any) => (
								<ProjectCard key={project.id} project={project} />
							))}
						</div>
					)}
				</div>
			</main>
		</div>
	);
}

