import { getPayloadSafe } from "@/lib/payload-client";
import CommunityPickCard from "@/components/community-pick-card";
import CommunityPickCardSkeleton from "@/components/community-pick-card-skeleton";

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
				limit: 6,
				sort: "-lastVerifiedAt",
				depth: 1, // Populate relationships including logo and links
			});

			projects = result.docs;
		} catch (error) {
			console.error("Error fetching community picks:", error);
		}
	}

	if (projects.length === 0) {
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

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
				{projects
					.filter((project: any) => project.links?.twitter) // Only show projects with X links
					.map((project: any) => (
						<CommunityPickCard
							key={project.id}
							project={project}
						/>
					))}
			</div>
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
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{Array.from({ length: 3 }).map((_, i) => (
					<CommunityPickCardSkeleton key={i} />
				))}
			</div>
		</section>
	);
}

