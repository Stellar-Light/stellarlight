import type { Metadata } from "next";
import {
	Boxes,
	ShieldCheck,
	ExternalLink,
	Sparkles,
	Bot,
	FileText,
	BookOpen,
	Wrench,
} from "lucide-react";
import { DitherShader } from "@/components/ui/dither-shader";
import { CopyCommand } from "@/components/copy-command";

export const metadata: Metadata = {
	title: "Toolkit",
	description:
		"Curated tools, SDKs, and resources to build and ship on Stellar.",
};

const TOOLKIT_ITEMS = [
	{
		title: "Stellar Dev Skill",
		description:
			"A Claude Code plugin with deep knowledge of Stellar development — Soroban contracts, client SDKs, RPC/Horizon APIs, wallet integration, security patterns, and agentic payments. Install it and start building with AI that actually understands the stack.",
		url: "https://github.com/stellar/stellar-dev-skill",
		icon: "Sparkles",
		color: "#0891B2",
		tags: ["Claude Code", "AI Skill", "Soroban", "Full Stack"],
		author: {
			name: "Stellar Development Foundation",
			url: "https://stellar.org",
		},
		installCmd: "npx skills add https://github.com/stellar/stellar-dev-skill",
	},
	{
		title: "OpenZeppelin Skills",
		description:
			"Agent skills for secure smart contract development. Includes Stellar-specific skills for setting up and upgrading Soroban contracts with OpenZeppelin's audited libraries — works with Claude Code, Codex, and other AI agents.",
		url: "https://github.com/OpenZeppelin/openzeppelin-skills",
		icon: "ShieldCheck",
		color: "#6366F1",
		tags: ["Claude Code", "AI Skill", "Security", "Contracts"],
		author: {
			name: "OpenZeppelin",
			url: "https://www.openzeppelin.com/",
		},
		installCmd: "npx skills add OpenZeppelin/openzeppelin-skills",
	},
	{
		title: "Stella AI",
		description:
			"SDF's AI assistant trained on Stellar documentation and community knowledge. Ask questions about Soroban, the SDK, SEPs, or anything Stellar — available on the docs site and the #stella-help Discord channel.",
		url: "https://developers.stellar.org/docs/tools/developer-tools/ai-bot",
		icon: "Bot",
		color: "#F97316",
		tags: ["AI Assistant", "Documentation", "Q&A", "Discord"],
		author: {
			name: "Stellar Development Foundation",
			url: "https://stellar.org",
		},
	},
	{
		title: "Stellar llms.txt",
		description:
			"Structured Stellar developer documentation in llms.txt format — a standardized way to feed documentation context to AI systems. Point your agent at this file and it instantly knows the Stellar docs.",
		url: "https://developers.stellar.org/llms.txt",
		icon: "FileText",
		color: "#10B981",
		tags: ["LLM Context", "Documentation", "AI Grounding"],
		author: {
			name: "Stellar Development Foundation",
			url: "https://stellar.org",
		},
	},
	{
		title: "Scaffold Soroban",
		description:
			"Example dApps and patterns for building on Soroban. Payment dApp, token minting, atomic swaps — clone a template and start shipping instead of configuring from scratch.",
		url: "https://github.com/stellar/scaffold-soroban",
		icon: "Boxes",
		color: "#7C3AED",
		tags: ["Starter Kit", "Soroban", "dApps", "Templates"],
		author: {
			name: "Stellar Development Foundation",
			url: "https://stellar.org",
		},
	},
	{
		title: "Stellar Developer Docs",
		description:
			"The official developer documentation for Stellar. Guides for Soroban contracts, client SDKs, APIs, tools, and tutorials — the canonical source of truth for building on the network.",
		url: "https://developers.stellar.org/",
		icon: "BookOpen",
		color: "#2563EB",
		tags: ["Documentation", "Guides", "Tutorials", "Reference"],
		author: {
			name: "Stellar Development Foundation",
			url: "https://stellar.org",
		},
	},
	{
		title: "Building with AI on Stellar",
		description:
			"SDF's guide to using AI tools for Stellar development. Covers skills installation, supported platforms (Claude Code, Codex, Gemini CLI), and best practices for AI-assisted blockchain development.",
		url: "https://developers.stellar.org/docs/build/building-with-ai",
		icon: "Wrench",
		color: "#EC4899",
		tags: ["Guide", "AI Development", "Best Practices"],
		author: {
			name: "Stellar Development Foundation",
			url: "https://stellar.org",
		},
	},
];

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
	Sparkles,
	ShieldCheck,
	Bot,
	FileText,
	Boxes,
	BookOpen,
	Wrench,
};

export default function ToolkitPage() {
	return (
		<div className="min-h-screen relative">
			{/* Dither Shader Hero */}
			<div className="relative w-full h-[480px] sm:h-[540px] overflow-hidden -mt-16">
				<div className="absolute inset-0">
					<DitherShader
						src="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22800%22%20height%3D%22400%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%25%22%20y1%3D%220%25%22%20x2%3D%220%25%22%20y2%3D%22100%25%22%3E%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23bbbbbb%22%2F%3E%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%23000000%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22800%22%20height%3D%22400%22%20fill%3D%22url(%23g)%22%2F%3E%3C%2Fsvg%3E"
						gridSize={3}
						ditherMode="bayer"
						colorMode="duotone"
						primaryColor="#ffffff"
						secondaryColor="#0a0a0a"
						backgroundColor="#0a0a0a"
						objectFit="cover"
						contrast={1}
						brightness={0}
						threshold={0.5}
						animated
						animationSpeed={0.012}
						className="w-full h-full"
					/>
				</div>
				{/* Strong gradient fade — pushes the dither up so title has a dark clean zone */}
				<div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent via-background/80 to-background pointer-events-none" />
				{/* Title overlay — sits in the clean dark zone below the dither */}
				<div className="absolute inset-0 flex items-end justify-start max-w-4xl mx-auto px-4 sm:px-6 pb-8 z-10">
					<div>
						<h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
							<span className="text-foreground">Toolkit </span>
							<span className="text-muted-foreground/50">to ship on Stellar</span>
						</h1>
						<p className="text-base text-muted-foreground mt-3 max-w-xl">
							Curated AI skills, agents, and resources to help you build and ship faster on Stellar.
						</p>
					</div>
				</div>
			</div>

			<main className="max-w-4xl mx-auto px-4 sm:px-6 pb-16 pt-4">

				{/* Toolkit Items */}
				<div className="flex flex-col gap-4">
					{TOOLKIT_ITEMS.map((item) => {
						const Icon = iconMap[item.icon] || Sparkles;
						const isExternal = item.url.startsWith("http");
						const hasInstallCmd = "installCmd" in item && !!item.installCmd;

						return (
							<a
								key={item.title}
								href={item.url}
								target={isExternal ? "_blank" : undefined}
								rel={isExternal ? "noopener noreferrer" : undefined}
								className="group flex flex-col sm:flex-row gap-4 sm:gap-6 rounded-2xl border border-border/50 hover:border-border hover:bg-white/[0.02] transition-all p-5 sm:p-6 no-underline"
							>
								{/* Icon */}
								<div
									className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center flex-shrink-0"
									style={{
										backgroundColor: `${item.color}12`,
										color: item.color,
									}}
								>
									<Icon className="w-6 h-6 sm:w-7 sm:h-7" />
								</div>

								{/* Content */}
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between gap-3 mb-1">
										<h2 className="text-lg sm:text-xl font-bold text-foreground leading-tight">
											{item.title}
										</h2>
										<ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-foreground transition-colors flex-shrink-0" />
									</div>

									{/* Author */}
									{item.author && (
										<p className="text-xs text-muted-foreground/60 mb-2">
											by{" "}
											<span className="text-muted-foreground/80">
												{item.author.name}
											</span>
										</p>
									)}

									{/* Description */}
									<p className="text-sm sm:text-[15px] text-muted-foreground leading-relaxed mb-3">
										{item.description}
									</p>

									{/* Tags */}
									<div className="flex flex-wrap gap-1.5">
										{item.tags.map((tag) => (
											<span
												key={tag}
												className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-border/50"
											>
												{tag}
											</span>
										))}
									</div>

									{/* Install command */}
									{hasInstallCmd && (
										<CopyCommand command={item.installCmd!} />
									)}
								</div>
							</a>
						);
					})}
				</div>

			</main>
		</div>
	);
}
