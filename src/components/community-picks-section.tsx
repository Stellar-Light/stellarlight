import { getPayloadSafe } from "@/lib/payload-client";
import CommunityPickCard from "@/components/community-pick-card";
import CommunityPickCardSkeleton from "@/components/community-pick-card-skeleton";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@/components/ui/carousel";

export default async function CommunityPicksSection() {
	const payload = await getPayloadSafe();
	let projects: any[] = [];

	if (payload) {
		try {
			const result = await payload.find({
				collection: "projects",
				where: {
					and: [
						{
							communityPick: {
								equals: true,
							},
						},
						{
							status: {
								in: ["Development", "Pre-Release", "Live"],
							},
						},
					],
				},
				limit: 20, // Increased limit to show more projects
				sort: "-lastVerifiedAt",
				depth: 1, // Populate relationships including logo and links
			});

			projects = result.docs;
		} catch (error) {
			// Silently handle fetch errors
		}
	}

	if (projects.length === 0) {
		return null;
	}

	// Filter is handled by CommunityPickCard component (it returns null if no Twitter link)
	// So we pass all projects and let the card component decide
	const filteredProjects = projects.filter((project: any) => {
		// Pre-filter to avoid rendering cards that will return null
		return project.links?.twitter;
	});

	if (filteredProjects.length === 0) {
		return null;
	}

	return (
		<section className="mb-16">
			<div className="mb-10">
				<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-foreground">
					Community Picks
				</h2>
				<p className="text-muted-foreground">
					Projects handpicked by the community
				</p>
			</div>

			<Carousel
				opts={{
					align: "start",
					loop: true,
				}}
				className="w-full"
			>
				<CarouselContent className="-ml-2 md:-ml-4">
					{filteredProjects.map((project: any) => (
						<CarouselItem
							key={project.id}
							className="pl-2 md:pl-4 basis-full md:basis-1/2"
						>
							<CommunityPickCard project={project} />
						</CarouselItem>
					))}
				</CarouselContent>
				{/* Navigation arrows below the carousel */}
				<div className="flex items-center justify-center gap-10 mt-6">
					<CarouselPrevious className="relative left-0 top-0 translate-x-0 translate-y-0 hidden md:flex bg-card border-border hover:border-white/30" />
					<CarouselNext className="relative right-0 top-0 translate-x-0 translate-y-0 hidden md:flex bg-card border-border hover:border-white/30" />
				</div>
			</Carousel>
		</section>
	);
}

export function CommunityPicksSectionSkeleton() {
	return (
		<section className="mb-16">
			<div className="mb-10">
				<div className="h-10 w-48 bg-[#262626] rounded animate-pulse mb-2" />
				<div className="h-4 w-64 bg-[#262626] rounded animate-pulse" />
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<CommunityPickCardSkeleton key={i} />
				))}
			</div>
		</section>
	);
}

