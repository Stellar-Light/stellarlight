import { getPayload } from "payload";
import configPromise from "@/payload.config";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Search, ExternalLink } from "lucide-react";
import Typewriter from "@/components/fancy/text/typewriter";
import CompanyTicker from "@/components/company-ticker";
import TVLStats from "@/components/tvl-stats";
import BaseFeeDisplay from "@/components/base-fee-display";
import ProjectCard from "@/components/project-card";
import { Select } from "@/components/ui/select";
import { FlickeringGrid } from "@/components/flickering-grid";

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

			<main className="max-w-6xl mx-auto px-6 py-12 pt-24">
				{/* Hero Section */}
				<div className="mb-12 flex flex-col md:flex-row items-center justify-between gap-12 min-h-[500px] relative">
					<div className="flex-1 text-left relative z-10">
						<h1 className="text-3xl md:text-5xl font-semibold tracking-tight mb-6 text-foreground">
							<div>Explore</div>
							<Typewriter
								text={["Stellar", "Stablecoins", "Lending", "AMMs", "Wallets"]}
								speed={80}
								className="text-[#FDDA24]"
								waitTime={1800}
								deleteSpeed={50}
								cursorChar="_"
								whiteTextWords={["Stellar"]}
							/>
						</h1>
						<p className="text-base text-muted-foreground max-w-[62ch] mb-6">
							Explore the apps and services built on Stellar. From wallets to DeFi
							protocols, discover the growing ecosystem.
						</p>
						<TVLStats />
					</div>
					<div className="flex-shrink-0 relative z-10">
						<FlickeringGrid
							logoSrc="/stellar-xlm-logo.png"
							squareSize={8}
							gridGap={4}
							color="#FDDA24"
							inactiveColor="#525252"
							maxOpacity={1}
							trailRadius={100}
							width={450}
							height={450}
							className="rounded-xl"
						/>
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
					className="mb-16"
				/>

				{/* Projects Section */}
				<div className="mb-8">
					<h2 className="text-3xl font-medium tracking-tight mb-6">
						Explore Projects
						<span className="ml-3 text-lg text-muted-foreground">
							{result.totalDocs}
						</span>
					</h2>
				</div>

				{/* Search and Filter */}
				<div className="mb-8">
					<div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
						<div className="relative w-full md:max-w-[560px]">
							<Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
							<input
								type="text"
								placeholder="Search projects..."
								className="w-full h-11 pl-12 pr-4 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border transition-all duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
							/>
						</div>

						<Select className="h-11 min-w-[180px] bg-card text-foreground border border-border rounded-xl focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]">
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
					<div className="text-center py-16">
						<p className="text-lg text-muted-foreground">
							No projects found. Projects will appear here once approved.
						</p>
					</div>
				) : (
					<>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
							{projects.map((project, index) => (
								<ProjectCard
									key={project.id}
									project={project}
									isFeatured={index === 0 && !project.verificationLevel?.includes("Unverified")}
								/>
							))}
						</div>

						{result.totalPages > 1 && (
							<div className="text-center">
								<Button
									asChild
									style={{
										background: "#404040",
										color: "#E5E5E5",
										border: "1px solid #525252",
									}}
									className="px-8 py-3 rounded-xl font-semibold hover:bg-[#525252]"
								>
									<Link href="/directory">View All Projects</Link>
								</Button>
							</div>
						)}
					</>
				)}
			</main>

			{/* Footer */}
			<footer className="mt-16">
				<div className="max-w-6xl mx-auto px-6 py-12">
					<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
						<div>
							<div className="flex items-center space-x-2 mb-4">
								<span className="text-lg font-semibold text-foreground">
									Stellar Light
								</span>
							</div>
							<p className="text-sm text-muted-foreground">
								Explore dApps, Tools, Stablecoins, Wallets, DAOs & more built on
								Stellar
							</p>
						</div>
						<div>
							<h4 className="font-semibold mb-4 text-foreground">Resources</h4>
							<ul className="space-y-2 text-sm text-muted-foreground">
								<li>
									<a
										href="https://communityfund.stellar.org/"
										target="_blank"
            rel="noopener noreferrer"
										className="hover:text-foreground transition-all duration-150"
          >
										Grants
          </a>
								</li>
								<li>
          <a
										href="https://developers.stellar.org/"
										target="_blank"
            rel="noopener noreferrer"
										className="hover:text-foreground transition-all duration-150"
          >
            Documentation
          </a>
								</li>
							</ul>
						</div>
						<div>
							<h4 className="font-semibold mb-4 text-foreground">Community</h4>
							<ul className="space-y-2 text-sm text-muted-foreground">
								<li>
									<a
										href="https://discord.gg/8KtTHJPB8f"
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-foreground transition-all duration-150"
									>
										Discord
									</a>
								</li>
								<li>
									<a
										href="https://x.com/BuildOnStellar"
										target="_blank"
										rel="noopener noreferrer"
										className="hover:text-foreground transition-all duration-150"
									>
										X
									</a>
								</li>
							</ul>
        </div>
      </div>
					<div className="mt-8 pt-8 text-center text-sm text-muted-foreground">
						<p>&copy; 2025 Stellar Light</p>
      </div>
    </div>
			</footer>
		</div>
	);
}
