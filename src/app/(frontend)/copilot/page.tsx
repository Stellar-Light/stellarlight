import type { Metadata } from "next";
import Link from "next/link";
import {
	ArrowLeft,
	Sparkles,
	Search,
	Users,
	Award,
	Lightbulb,
	Terminal,
	ExternalLink,
} from "lucide-react";
import { CopilotCopyButton } from "@/components/copilot-copy-button";

export const metadata: Metadata = {
	title: "Stellar Hackathon Copilot | Stellar Light",
	description:
		"A skill for deep Stellar ecosystem research. Validate ideas, find prior art, surface teammates, and recommend SDK tracks — installed into Claude Code, Codex, or any agent that loads SKILL.md.",
};

const SAMPLE_PROMPTS = [
	{
		title: "Vet a new idea",
		prompt:
			'"I want to build a privacy-preserving stablecoin on Stellar. Vet this idea."',
	},
	{
		title: "Find prior art",
		prompt:
			'"What Stellar hackathon projects have built stablecoin off-ramps in West Africa?"',
	},
	{
		title: "Search for teammates",
		prompt:
			'"Find me Stellar builders in Lagos who\'ve worked on Soroban smart contracts."',
	},
	{
		title: "Surface SCF history",
		prompt:
			'"What SCF-funded projects work on agentic payments? How much have they raised total?"',
	},
	{
		title: "Discover upcoming hackathons",
		prompt:
			'"What Stellar hackathons are coming up in the next 3 months and what are the prize pools?"',
	},
	{
		title: "Pick a winning track",
		prompt:
			'"I have a soroban DeFi protocol idea. Which prize tracks at the next hackathon would it fit?"',
	},
];

const TOPIC_CLUSTERS = [
	{
		name: "Soroban smart contracts",
		blurb: "Rust contracts on Soroban — DeFi protocols, AMMs, lending markets",
	},
	{
		name: "Anchors & off-ramps",
		blurb: "SEP-24 / SEP-31 deployments, regional payment corridors",
	},
	{
		name: "Agentic payments",
		blurb: "x402, MPP, AI-agent payment rails — Stellar's emerging differentiator",
	},
	{
		name: "Asset issuance",
		blurb: "SAC issuance, stablecoins, RWA tokenization",
	},
	{
		name: "Wallets & dapps",
		blurb: "Freighter, Lobstr integrations, browser wallets, mobile dapps",
	},
	{
		name: "ZK proofs",
		blurb: "Privacy primitives, confidential transactions",
	},
	{
		name: "SEP standards",
		blurb: "Protocol-level work, new SEPs / CAPs",
	},
	{
		name: "Data infrastructure",
		blurb: "Indexers, Horizon clients, RPC infra, analytics",
	},
];

function Section({
	eyebrow,
	title,
	children,
}: {
	eyebrow?: string;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mb-12">
			{eyebrow && (
				<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
					{eyebrow}
				</div>
			)}
			<h2 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground mb-4">
				{title}
			</h2>
			{children}
		</section>
	);
}

export default function CopilotPage() {
	return (
		<div className="min-h-screen relative">
			<main className="max-w-4xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Home</span>
				</Link>

				{/* Hero */}
				<div className="mb-14">
					<div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-[#FDDA24]/30 bg-[#FDDA24]/5">
						<Sparkles className="w-3.5 h-3.5 text-[#FDDA24]" />
						<span className="text-xs font-medium text-[#FDDA24]">
							A skill for deep Stellar ecosystem research
						</span>
					</div>
					<h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
						Stellar Hackathon Copilot
					</h1>
					<p className="text-lg text-muted-foreground max-w-2xl mb-8">
						Validate ideas before you build. Surface prior art across Stellar
						hackathons, SCF rounds, and the project directory. Find teammates
						with the right skills. Get pointed to the right SDK.
					</p>
					<div className="flex flex-wrap items-center gap-3">
						<CopilotCopyButton label="Copy skill" />
						<a
							href="/skills/stellar-hackathon-copilot.md"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border/50 bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
						>
							View raw <ExternalLink className="w-3.5 h-3.5" />
						</a>
					</div>
				</div>

				{/* How it works */}
				<Section eyebrow="How it works" title="Install once, use forever">
					<div className="rounded-xl border border-border/50 bg-card p-6">
						<ol className="space-y-4 text-sm text-foreground">
							<li className="flex gap-3">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/5 border border-border/50 text-xs text-muted-foreground inline-flex items-center justify-center font-mono">
									1
								</span>
								<div>
									<strong>Copy the skill manifest</strong> using the button
									above (or download the raw <code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">.md</code>).
								</div>
							</li>
							<li className="flex gap-3">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/5 border border-border/50 text-xs text-muted-foreground inline-flex items-center justify-center font-mono">
									2
								</span>
								<div>
									<strong>Paste it into your AI agent</strong> — Claude
									(claude.ai), Claude Code, Codex, Cursor, or any client that
									loads <code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">SKILL.md</code> files.
									For Claude Code, drop the file into{" "}
									<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
										.claude/skills/stellar-hackathon-copilot/SKILL.md
									</code>
									.
								</div>
							</li>
							<li className="flex gap-3">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/5 border border-border/50 text-xs text-muted-foreground inline-flex items-center justify-center font-mono">
									3
								</span>
								<div>
									<strong>Ask any question</strong> about Stellar hackathons,
									projects, builders, or SCF history. The skill teaches your
									agent how to query our public APIs to get cited, evidence-
									backed answers.
								</div>
							</li>
						</ol>
					</div>
				</Section>

				{/* Two modes */}
				<Section eyebrow="Two modes" title="Conversational + Deep Dive">
					<div className="grid md:grid-cols-2 gap-4">
						<div className="rounded-xl border border-border/50 bg-card p-5">
							<div className="flex items-center gap-2 mb-3">
								<Search className="w-4 h-4 text-muted-foreground" />
								<h3 className="text-sm font-semibold text-foreground">
									Conversational
								</h3>
							</div>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Fast, cited answers for any question. Hit the right endpoint,
								surface the data, link the source.
							</p>
						</div>
						<div className="rounded-xl border border-[#FDDA24]/40 bg-[#FDDA24]/[0.03] p-5">
							<div className="flex items-center gap-2 mb-3">
								<Lightbulb className="w-4 h-4 text-[#FDDA24]" />
								<h3 className="text-sm font-semibold text-foreground">
									Deep Dive
								</h3>
							</div>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Triggered by <em>"vet this idea"</em> /{" "}
								<em>"should I build"</em>. Runs an 8-step workflow: prior-art
								search → gap classification → competitors → SDK
								recommendation → teammates → funding signal → next steps.
							</p>
						</div>
					</div>
				</Section>

				{/* Gap classification */}
				<Section eyebrow="The strict part" title="Gap classification, no speculation">
					<div className="rounded-xl border border-border/50 bg-card p-6">
						<div className="grid sm:grid-cols-3 gap-4 mb-5">
							<div>
								<div className="text-emerald-400 font-semibold text-sm mb-1">
									Full gap
								</div>
								<p className="text-xs text-muted-foreground leading-relaxed">
									Zero prior projects, no winning hackathon submissions, no SCF
									funding. Highest opportunity.
								</p>
							</div>
							<div>
								<div className="text-amber-300 font-semibold text-sm mb-1">
									Partial gap
								</div>
								<p className="text-xs text-muted-foreground leading-relaxed">
									1–3 adjacent projects exist but none cover the specific
									angle. Medium opportunity.
								</p>
							</div>
							<div>
								<div className="text-rose-400 font-semibold text-sm mb-1">
									False gap
								</div>
								<p className="text-xs text-muted-foreground leading-relaxed">
									4+ direct competitors or a funded leader already exists. Low
									opportunity unless clear differentiator.
								</p>
							</div>
						</div>
						<p className="text-xs text-muted-foreground border-t border-border/40 pt-4">
							<strong className="text-foreground">Evidence floor:</strong> if
							the data doesn't support a claim, the copilot says so. It won't
							invent competitors, prize amounts, or builder profiles. Missing
							data is reported as "not indexed" — never papered over.
						</p>
					</div>
				</Section>

				{/* Capabilities */}
				<Section eyebrow="What it can answer" title="Five core capabilities">
					<div className="grid sm:grid-cols-2 gap-3">
						{[
							{
								icon: Search,
								title: "Prior-art lookup",
								blurb:
									"Has anyone built this on Stellar? Across hackathons, SCF, and the directory.",
							},
							{
								icon: Award,
								title: "Hackathon results",
								blurb:
									"Winners, placements, prize tracks, post-hack survival rates per event.",
							},
							{
								icon: Users,
								title: "Teammate matching",
								blurb:
									"Find Stellar builders by skill, location, SCF tier, or project history.",
							},
							{
								icon: Lightbulb,
								title: "Idea validation",
								blurb:
									"Full Deep Dive workflow with gap classification and SDK recommendations.",
							},
							{
								icon: Terminal,
								title: "Dev metrics",
								blurb:
									"Active dev counts, commit volume, country breakdown via the dev-activity skill.",
							},
							{
								icon: ExternalLink,
								title: "RFP discovery",
								blurb: (
									<>
										Points to{" "}
										<a
											href="https://ideas.stellarlight.xyz/"
											target="_blank"
											rel="noopener noreferrer"
											className="underline hover:text-foreground"
										>
											ideas.stellarlight.xyz
										</a>{" "}
										for current sponsor briefs and prize tracks.
									</>
								),
							},
						].map((cap) => {
							const Icon = cap.icon;
							return (
								<div
									key={cap.title}
									className="rounded-xl border border-border/50 bg-card p-4"
								>
									<div className="flex items-center gap-2 mb-2">
										<Icon className="w-4 h-4 text-muted-foreground" />
										<h3 className="text-sm font-semibold text-foreground">
											{cap.title}
										</h3>
									</div>
									<p className="text-xs text-muted-foreground leading-relaxed">
										{cap.blurb}
									</p>
								</div>
							);
						})}
					</div>
				</Section>

				{/* Sample prompts */}
				<Section eyebrow="Sample prompts" title="Try these in your agent">
					<div className="space-y-2">
						{SAMPLE_PROMPTS.map((p) => (
							<div
								key={p.title}
								className="rounded-xl border border-border/50 bg-card p-4"
							>
								<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1.5">
									{p.title}
								</div>
								<div className="text-sm text-foreground font-mono">
									{p.prompt}
								</div>
							</div>
						))}
					</div>
				</Section>

				{/* Topic clusters */}
				<Section
					eyebrow="Stellar-native"
					title="Topic clusters the copilot understands"
				>
					<div className="grid sm:grid-cols-2 gap-3">
						{TOPIC_CLUSTERS.map((t) => (
							<div
								key={t.name}
								className="rounded-xl border border-border/50 bg-card p-4"
							>
								<div className="text-sm font-semibold text-foreground mb-1">
									{t.name}
								</div>
								<div className="text-xs text-muted-foreground leading-relaxed">
									{t.blurb}
								</div>
							</div>
						))}
					</div>
					<p className="text-xs text-muted-foreground mt-4">
						These map directly to{" "}
						<a
							href="https://skills.stellar.org/"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-foreground inline-flex items-center gap-0.5"
						>
							skills.stellar.org <ExternalLink className="w-3 h-3" />
						</a>{" "}
						— the Stellar Foundation's official skill catalog covering{" "}
						<em>how</em> to build. This copilot covers <em>what</em> to build
						and <em>with whom</em>. They compose.
					</p>
				</Section>

				{/* Endpoints */}
				<Section eyebrow="Under the hood" title="Public APIs the skill calls">
					<div className="rounded-xl border border-border/50 bg-card p-6 font-mono text-xs space-y-2">
						<div>
							<span className="text-emerald-400">GET</span>{" "}
							<span className="text-foreground">/api/hackathons</span>{" "}
							<span className="text-muted-foreground">
								— list curated Stellar hackathons
							</span>
						</div>
						<div>
							<span className="text-emerald-400">GET</span>{" "}
							<span className="text-foreground">
								/api/hackathons/{"{slug}"}
							</span>{" "}
							<span className="text-muted-foreground">
								— submissions, winners, outcomes
							</span>
						</div>
						<div>
							<span className="text-emerald-400">GET</span>{" "}
							<span className="text-foreground">/api/builders</span>{" "}
							<span className="text-muted-foreground">
								— builder directory search
							</span>
						</div>
						<div>
							<span className="text-emerald-400">GET</span>{" "}
							<span className="text-foreground">/api/projects/search</span>{" "}
							<span className="text-muted-foreground">
								— prior-art / competitor lookup
							</span>
						</div>
						<div>
							<span className="text-emerald-400">GET</span>{" "}
							<span className="text-foreground">/api/leaderboard</span>{" "}
							<span className="text-muted-foreground">
								— ecosystem dev stats
							</span>
						</div>
					</div>
					<p className="text-xs text-muted-foreground mt-3">
						All endpoints are public, read-only, edge-cached for 5 minutes. No
						auth required.
					</p>
				</Section>

				{/* Footer CTA */}
				<div className="rounded-2xl border border-border/50 bg-card p-8 text-center">
					<h3 className="text-lg font-semibold text-foreground mb-2">
						Ready to validate your hackathon idea?
					</h3>
					<p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
						Copy the skill, paste it into your agent, ask{" "}
						<em>"should I build X on Stellar?"</em>
					</p>
					<CopilotCopyButton label="Copy the skill" />
				</div>
			</main>
		</div>
	);
}
