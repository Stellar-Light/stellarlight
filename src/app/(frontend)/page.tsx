import { Suspense } from "react";
import BaseFeeDisplay from "@/components/base-fee-display";
import BlogHighlights, {
	BlogHighlightsSkeleton,
} from "@/components/blog-highlights";
import CarouselSection from "@/components/carousel-section";
import CommunityPicksSection, {
	CommunityPicksSectionSkeleton,
} from "@/components/community-picks-section";
import { DirectoryFilters } from "@/components/directory-filters";
import Typewriter from "@/components/fancy/text/typewriter";
import { FlickeringGrid } from "@/components/flickering-grid";
import HackathonsSection, {
	HackathonsSkeleton,
} from "@/components/hackathons-section";
import ProjectsGrid, { ProjectsGridSkeleton } from "@/components/projects-grid";
import TopBuildersSection, {
	TopBuildersSkeleton,
} from "@/components/top-builders-section";
import TrendingProjectsSection, {
	TrendingProjectsSkeleton,
} from "@/components/trending-projects-section";
import TVLStats from "@/components/tvl-stats";
import { getPayloadSafe } from "@/lib/payload-client";

// Force dynamic rendering to prevent build-time MongoDB connection errors
export const dynamic = "force-dynamic";

export default async function HomePage() {
	const payload = await getPayloadSafe();
	let totalProjects = 0;

	// Fetch total projects count for display
	if (payload) {
		try {
			const result = await payload.find({
				collection: "projects",
				where: {
					status: {
						in: ["Development", "Pre-Release", "Live"],
					},
				},
				limit: 1,
			});
			totalProjects = result.totalDocs;
		} catch (error) {
			// Silently handle fetch errors
		}
	}

	return (
		<div className="min-h-screen relative">
			<BaseFeeDisplay />

			<main className="max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-16">
				{/* Hero Section */}
				<div className="mb-20 flex flex-col lg:flex-row items-center justify-between gap-16 min-h-[600px] relative">
					<div className="flex-1 text-left relative z-20 space-y-8">
						<div className="space-y-6">
							<h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight">
								<div className="text-foreground mb-2">Explore</div>
								<Typewriter
									text={[
										"Stellar",
										"Stablecoins",
										"Lending",
										"AMMs",
										"Wallets",
									]}
									speed={80}
									className="text-[#FDDA24]"
									waitTime={1800}
									deleteSpeed={50}
									cursorChar="_"
									whiteTextWords={["Stellar"]}
								/>
							</h1>
							<p className="text-lg md:text-xl text-muted-foreground max-w-[65ch] leading-relaxed">
								Explore the apps and services built on Stellar. From wallets to
								DeFi protocols, discover the growing ecosystem powering the
								future of finance.
							</p>
						</div>
						<TVLStats />
					</div>
					<div className="flex-shrink-0 relative z-10">
						<div className="relative">
							<FlickeringGrid
								logoSrc="/stellar-xlm-logo.png"
								squareSize={8}
								gridGap={4}
								color="#FDDA24"
								inactiveColor="#525252"
								maxOpacity={1}
								trailRadius={100}
								width={500}
								height={500}
								className="rounded-2xl shadow-2xl shadow-[#FDDA24]/20"
							/>
							<div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FDDA24]/0 via-transparent to-transparent pointer-events-none" />
						</div>
					</div>
				</div>

				<Suspense fallback={null}>
					<CarouselSection />
				</Suspense>

				{/* Highlights Carousel Section */}
				<Suspense fallback={<BlogHighlightsSkeleton />}>
					<BlogHighlights />
				</Suspense>

				{/* Community Picks Section */}
				<Suspense fallback={<CommunityPicksSectionSkeleton />}>
					<CommunityPicksSection />
				</Suspense>

				{/* Top Builders Section */}
				<Suspense fallback={<TopBuildersSkeleton />}>
					<TopBuildersSection />
				</Suspense>

				{/* Top Repositories Section */}
				<Suspense fallback={<TrendingProjectsSkeleton />}>
					<TrendingProjectsSection />
				</Suspense>

				{/* Hackathons Section */}
				<Suspense fallback={<HackathonsSkeleton />}>
					<HackathonsSection />
				</Suspense>

				{/* Projects Section */}
				<section className="mb-16">
					<div className="flex items-center justify-between mb-10">
						<div>
							<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-foreground">
								Explore Projects
							</h2>
							<p className="text-muted-foreground">
								{totalProjects} projects building on Stellar
							</p>
						</div>
					</div>

					{/* Search and Filter */}
					<div className="mb-10">
						<DirectoryFilters />
					</div>

					{/* Projects Grid */}
					<Suspense fallback={<ProjectsGridSkeleton />}>
						<ProjectsGrid limit={12} />
					</Suspense>
				</section>
			</main>
		</div>
	);
}
