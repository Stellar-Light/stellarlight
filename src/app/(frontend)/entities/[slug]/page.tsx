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
import { EntityLogo } from "@/components/entity-logo";
import {
	ArrowLeft,
	ExternalLink,
	Globe,
	Github,
	X,
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
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-16 pt-28">
				{/* Back Button */}
				<Link
					href="/entities"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-200 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-200" />
					<span className="text-sm font-medium">Back to Entities</span>
				</Link>

				{/* Hero Section - Card with Flex Layout */}
				<Card className="mb-12 border border-border/50 bg-card shadow-lg">
					<CardContent className="p-8">
						<div className="flex flex-col gap-6">
							{/* First Row - Logo and Title/Tags */}
							<div className="flex flex-col md:flex-row items-start gap-4">
								{/* Logo */}
								{entity.logo ? (
									<div className="relative flex-shrink-0">
										<div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FDDA24]/20 via-transparent to-transparent blur-xl opacity-50" />
										<EntityLogo
											logo={entity.logo}
											name={entity.name}
											size={140}
											className="relative w-[140px] h-[140px] rounded-2xl shadow-2xl border border-border/50"
											showFallbackIcon={false}
										/>
									</div>
								) : (
									<div className="relative w-[140px] h-[140px] rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-2xl border border-border/50 flex-shrink-0">
										<Building2 className="w-16 h-16 text-primary" />
									</div>
								)}

								{/* Title and Tags */}
								<div className="flex flex-col gap-4 items-start flex-1 min-w-0">
									{/* Title */}
									<h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground text-left">
										{entity.name}
									</h1>

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

							{/* Second Row - About the Entity Section */}
							<div className="space-y-4 pt-4 border-t border-border/50">
								<h2 className="text-xl font-bold text-foreground">About {entity.name}</h2>
								{entity.description ? (
									<p className="text-base text-muted-foreground leading-relaxed">
										{entity.description}
									</p>
								) : (
									<p className="text-base text-muted-foreground italic">
										No description available.
									</p>
								)}
								{entity.links?.website && (
									<Button
										asChild
										className="mt-4"
									>
										<a
											href={entity.links.website}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-2"
										>
											Visit {entity.name}
											<ExternalLink className="w-4 h-4" />
										</a>
									</Button>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Links & Resources */}
				{entity.links && Object.values(entity.links).some(Boolean) && (
					<Card className="mb-8 border border-border/50 bg-card shadow-lg">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">Links & Resources</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								{entity.links.website && (
									<a
										href={entity.links.website}
										target="_blank"
										rel="noopener noreferrer"
										className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-background hover:border-primary/50 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
									>
										<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 group-hover:border-primary/40 group-hover:bg-primary/20 transition-all duration-200">
											<Globe className="h-6 w-6 text-primary" />
										</div>
										<div className="flex-1">
											<span className="block capitalize font-semibold text-foreground group-hover:text-primary transition-colors">
												Website
											</span>
											<span className="text-xs text-muted-foreground truncate">
												{entity.links.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
											</span>
										</div>
										<ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
									</a>
								)}
								{entity.links.github && (
									<a
										href={entity.links.github}
										target="_blank"
										rel="noopener noreferrer"
										className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-background hover:border-primary/50 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
									>
										<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 group-hover:border-primary/40 group-hover:bg-primary/20 transition-all duration-200">
											<Github className="h-6 w-6 text-primary" />
										</div>
										<div className="flex-1">
											<span className="block capitalize font-semibold text-foreground group-hover:text-primary transition-colors">
												GitHub
											</span>
											<span className="text-xs text-muted-foreground truncate">
												{entity.links.github.replace(/^https?:\/\//, '').replace(/\/$/, '')}
											</span>
										</div>
										<ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
									</a>
								)}
								{entity.links.twitter && (
									<a
										href={entity.links.twitter}
										target="_blank"
										rel="noopener noreferrer"
										className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-background hover:border-primary/50 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
									>
										<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 group-hover:border-primary/40 group-hover:bg-primary/20 transition-all duration-200">
											<X className="h-6 w-6 text-primary" />
										</div>
										<div className="flex-1">
											<span className="block capitalize font-semibold text-foreground group-hover:text-primary transition-colors">
												X (Twitter)
											</span>
											<span className="text-xs text-muted-foreground truncate">
												{entity.links.twitter.replace(/^https?:\/\//, '').replace(/\/$/, '')}
											</span>
										</div>
										<ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
									</a>
								)}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Domains */}
				{entity.domains && entity.domains.length > 0 && (
					<Card className="mb-8 border border-border/50 bg-card shadow-lg">
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
						<Card className="border border-border/50 bg-card shadow-lg">
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

