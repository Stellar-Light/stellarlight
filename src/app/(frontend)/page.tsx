import { getPayload } from "payload";
import configPromise from "@/payload.config";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Search, Sparkles } from "lucide-react";
import Typewriter from "@/components/fancy/text/typewriter";
import CompanyTicker from "@/components/company-ticker";
import TVLStats from "@/components/tvl-stats";
import BaseFeeDisplay from "@/components/base-fee-display";
import ProjectCard from "@/components/project-card";
import BlogHighlightCard from "@/components/blog-highlight-card";
import { Select } from "@/components/ui/select";
import { FlickeringGrid } from "@/components/flickering-grid";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@/components/ui/carousel";

const categories = [
	{ id: "all", label: "All Categories" },
	{ id: "Infrastructure", label: "Infrastructure" },
	{ id: "Tooling", label: "Tooling" },
	{ id: "Partner Integration", label: "Partner Integration" },
	{ id: "User-Facing App", label: "User-Facing App" },
	{ id: "Asset", label: "Asset" },
	{ id: "Protocol/Contract", label: "Protocol/Contract" },
	{ id: "Anchor", label: "Anchor" },
];

export default async function HomePage() {
	const payload = await getPayload({ config: configPromise });

	// Fetch featured blog posts for highlights carousel
	const blogResult = await payload.find({
		collection: "blog",
		where: {
			and: [
				{
					featured: {
						equals: true,
					},
				},
				{
					status: {
						equals: "published",
					},
				},
			],
		},
		limit: 10,
		sort: "-publishedAt",
		depth: 2, // Populate featuredImage relationship
	});

	const featuredPosts = blogResult.docs;

	// Fetch projects (non-draft, approved projects)
	const result = await payload.find({
		collection: "projects",
		where: {
			status: {
				in: ["Development", "Pre-Release", "Live"],
			},
		},
		limit: 12,
		sort: "-lastVerifiedAt",
		depth: 1, // Populate relationships including logo
	});

	const projects = result.docs;

	return (
		<div className="min-h-screen relative">
			<BaseFeeDisplay />

			<main className="max-w-7xl mx-auto px-6 py-16 pt-28">
				{/* Hero Section */}
				<div className="mb-20 flex flex-col lg:flex-row items-center justify-between gap-16 min-h-[600px] relative">
					<div className="flex-1 text-left relative z-10 space-y-8">
						<div className="space-y-6">
							<h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight">
								<div className="text-foreground mb-2">Explore</div>
								<div className="relative">
									<Typewriter
										text={["Stellar", "Stablecoins", "Lending", "AMMs", "Wallets"]}
										speed={80}
										className="text-[#FDDA24]"
										waitTime={1800}
										deleteSpeed={50}
										cursorChar="_"
										whiteTextWords={["Stellar"]}
									/>
									<div className="absolute -bottom-2 left-0 h-1 w-24 bg-gradient-to-r from-[#FDDA24] to-transparent opacity-60" />
								</div>
							</h1>
							<p className="text-lg md:text-xl text-muted-foreground max-w-[65ch] leading-relaxed">
								Explore the apps and services built on Stellar. From wallets to DeFi
								protocols, discover the growing ecosystem powering the future of
								finance.
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

				<CompanyTicker
					companies={[
						"Blend",
						"MoneyGram",
						"Circle",
						"Lobstr",
						"Decaf",
						"Franklin Templeton",
						"PayPal",
						"Skyhitz",
						"Etherfuse",
					]}
					className="mb-24"
				/>

				{/* Highlights Carousel Section */}
				{featuredPosts.length > 0 && (
					<section className="mb-24">
						<div className="flex items-center justify-between mb-8">
							<div className="flex items-center gap-3">
								<Sparkles className="w-6 h-6 text-[#FDDA24]" />
								<h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
									Highlights
								</h2>
							</div>
							<Button
								asChild
								variant="outline"
								className="hidden sm:flex px-6 py-2 rounded-xl font-medium border-border hover:border-white/20 transition-all duration-300"
							>
								<Link href="/blog">View All Posts</Link>
							</Button>
						</div>
						<Carousel
							opts={{
								align: "start",
								loop: true,
							}}
							className="w-full"
						>
							<CarouselContent className="-ml-2 md:-ml-4">
								{featuredPosts.map((post) => (
									<CarouselItem
										key={post.id}
										className="pl-2 md:pl-4 basis-full md:basis-1/2 lg:basis-1/3"
									>
										<BlogHighlightCard post={post} />
									</CarouselItem>
								))}
							</CarouselContent>
							<CarouselPrevious className="hidden md:flex" />
							<CarouselNext className="hidden md:flex" />
						</Carousel>
						<div className="mt-6 text-center sm:hidden">
							<Button
								asChild
								variant="outline"
								className="px-8 py-3 rounded-xl font-semibold border-border hover:border-white/20 transition-all duration-300"
							>
								<Link href="/blog">View All Posts</Link>
							</Button>
						</div>
					</section>
				)}

				{/* Projects Section */}
				<section className="mb-16">
					<div className="flex items-center justify-between mb-10">
						<div>
							<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-foreground">
								Explore Projects
							</h2>
							<p className="text-muted-foreground">
								{result.totalDocs} projects building on Stellar
							</p>
						</div>
					</div>

					{/* Search and Filter */}
					<div className="mb-10">
						<div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
							<div className="relative w-full md:max-w-[600px]">
								<Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
								<input
									type="text"
									placeholder="Search projects..."
									className="w-full h-12 pl-12 pr-4 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border transition-all duration-200 focus-visible:outline-none focus-visible:border-white/30 focus-visible:shadow-[0_0_0_3px_rgba(253,218,36,0.1)]"
								/>
							</div>

							<Select className="h-12 min-w-[200px] bg-card text-foreground border border-border rounded-xl focus-visible:outline-none focus-visible:border-white/30 focus-visible:shadow-[0_0_0_3px_rgba(253,218,36,0.1)]">
								{categories.map((category) => (
									<option key={category.id} value={category.id}>
										{category.label}
									</option>
								))}
							</Select>
						</div>
					</div>

					{/* Projects Grid */}
					{projects.length === 0 ? (
						<div className="text-center py-20">
							<p className="text-lg text-muted-foreground">
								No projects found. Projects will appear here once approved.
							</p>
						</div>
					) : (
						<>
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
								{projects.map((project, index) => (
									<ProjectCard
										key={project.id}
										project={project}
										isFeatured={
											index === 0 &&
											!project.verificationLevel?.includes("Unverified")
										}
									/>
								))}
							</div>

							{result.totalPages > 1 && (
								<div className="text-center">
									<Button
										asChild
										className="px-10 py-3.5 rounded-xl font-semibold bg-[#404040] text-foreground border border-border hover:bg-[#525252] hover:border-white/20 transition-all duration-300 shadow-lg hover:shadow-xl"
									>
										<Link href="/directory">View All Projects</Link>
									</Button>
								</div>
							)}
						</>
					)}
				</section>
			</main>

			{/* Footer */}
			<footer className="mt-24 border-t border-border/50 bg-background/50 backdrop-blur-sm">
				<div className="max-w-7xl mx-auto px-6 py-16">
					<div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
						<div className="space-y-4">
							<div className="flex items-center space-x-2 mb-2">
								<span className="text-xl font-bold text-foreground">
									Stellar Light
								</span>
							</div>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Explore dApps, Tools, Stablecoins, Wallets, DAOs & more built on
								Stellar. Your gateway to the Stellar ecosystem.
							</p>
						</div>
						<div>
							<h4 className="font-semibold mb-5 text-foreground">Resources</h4>
							<ul className="space-y-3 text-sm text-muted-foreground">
								<li>
									<a
										href="https://communityfund.stellar.org/"
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-foreground transition-colors duration-200 hover:translate-x-1 inline-block"
									>
										Grants
									</a>
								</li>
								<li>
									<a
										href="https://developers.stellar.org/"
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-foreground transition-colors duration-200 hover:translate-x-1 inline-block"
									>
										Documentation
									</a>
								</li>
							</ul>
						</div>
						<div>
							<h4 className="font-semibold mb-5 text-foreground">Community</h4>
							<ul className="space-y-3 text-sm text-muted-foreground">
								<li>
									<a
										href="https://discord.gg/8KtTHJPB8f"
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-foreground transition-colors duration-200 hover:translate-x-1 inline-block"
									>
										Discord
									</a>
								</li>
								<li>
									<a
										href="https://x.com/BuildOnStellar"
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-foreground transition-colors duration-200 hover:translate-x-1 inline-block"
									>
										X (Twitter)
									</a>
								</li>
							</ul>
						</div>
					</div>
					<div className="pt-8 border-t border-border/50 text-center text-sm text-muted-foreground">
						<p>&copy; 2025 Stellar Light. All rights reserved.</p>
					</div>
				</div>
			</footer>
		</div>
	);
}
