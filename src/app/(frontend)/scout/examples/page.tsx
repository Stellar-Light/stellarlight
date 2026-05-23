import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lightbulb, Search } from "lucide-react";

export const metadata: Metadata = {
	title: "Examples · Stellar Scout | Stellar Light",
	description:
		"Sample prompts and walk-throughs of full Stellar Scout sessions — Conversational and Deep Dive — including gap classification, SCF history queries, and hackathon track research.",
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
			'"What Stellar projects have built stablecoin off-ramps? Show me the SCF-funded ones first."',
	},
	{
		title: "Spot Stellar builders",
		prompt:
			'"Find Stellar builders who\'ve shipped Soroban contracts (small directory — flag any gaps)."',
	},
	{
		title: "Surface SCF history",
		prompt:
			'"What SCF-funded projects work on payments? How much have they raised total?"',
	},
	{
		title: "Recent hackathon winners",
		prompt:
			'"Show me the most recent Stellar Hacks events and what prize tracks they had."',
	},
	{
		title: "Map an idea to a track",
		prompt:
			'"I have a soroban DeFi protocol idea. What past Stellar hackathon tracks paid out for similar work?"',
	},
];

const SESSIONS = [
	{
		title: "Conversational",
		eyebrow: "Example 1",
		mode: "conversational" as const,
		userPrompt:
			'"Who built stablecoin off-ramps at Stellar hackathons?"',
		steps: [
			"GET /api/projects/search?q=stablecoin+offramp&limit=10",
			"List matches with hackathon, placement, prize. Cite project URLs (stellarlight.xyz/project/{slug}).",
		],
	},
	{
		title: "Deep Dive — vet an idea",
		eyebrow: "Example 2",
		mode: "deepdive" as const,
		userPrompt:
			'"I want to build a privacy-preserving stablecoin on Stellar. Vet this idea."',
		steps: [
			'Restate: "You\'re proposing a stablecoin with confidential transactions / hidden balances, built on Stellar."',
			"GET /api/projects/search?q=privacy+stablecoin+confidential → 1 adjacent match (XLM shielded prototype, abandoned).",
			"Classify: Partial gap — adjacent prior art exists but abandoned; user's angle is fresh.",
			"List the abandoned project + 2 ZK-adjacent projects.",
			"GET /api/skills/zk-proofs → quote relevant section inline. Tell user to install https://skills.stellar.org/skills/zk-proofs/SKILL.md for ongoing use. Also recommend soroban.",
			"GET /api/builders?q=zk → surface candidates. If < 3 hits, note the directory is small + growing and recommend Stellar Discord #builders.",
			"GET /api/projects/search?q=privacy+zk&scfAwarded=1 → report total SCF-funded $.",
			"Next steps: GET /api/hackathons?status=upcoming for upcoming events; check ideas.stellarlight.xyz for sponsor RFPs matching ZK/privacy.",
		],
	},
	{
		title: "SDF skill discovery",
		eyebrow: "Example 3",
		mode: "conversational" as const,
		userPrompt:
			'"I want to write a Soroban contract. What do I need to know?"',
		steps: [
			"GET /api/skills/soroban → load the full SDF Soroban skill content (~8k words).",
			"Answer the user's question with cited references to actual skill sections.",
			'Tell user: "For ongoing work, install this skill at .claude/skills/stellar-soroban/SKILL.md from https://skills.stellar.org/skills/soroban/SKILL.md."',
		],
	},
	{
		title: "Hackathon track research",
		eyebrow: "Example 4",
		mode: "conversational" as const,
		userPrompt:
			'"What prize tracks paid out the most at past Stellar Hacks events?"',
		steps: [
			"GET /api/hackathons?status=completed → list past events.",
			"For each, GET /api/hackathons/{slug} → read .hackathon.tracks[*] (each has name, winnerCount, submissionCount, totalPrizeUSD).",
			"Aggregate tracks across events; rank by totalPrizeUSD desc.",
			"Surface top 5 tracks with prize totals + which hackathons paid them out.",
			"If track data is sparse (curators haven't tagged submissions), say so — don't infer tracks from project descriptions.",
		],
	},
	{
		title: "Funding-first prior art",
		eyebrow: "Example 5",
		mode: "deepdive" as const,
		userPrompt:
			'"What SCF-funded projects work on payments? Which raised the most?"',
		steps: [
			"GET /api/projects/search?q=payments&scfAwarded=1&limit=20 → SCF-awarded payments projects.",
			"Sort by .scfTotalAwardedUSD desc. Sum total raised.",
			"Surface top 5 with name, SCF $, category, link.",
			"Optionally cross-reference recent hackathon submissions: filter results where .hackathon is set, to see which won prizes en route to SCF funding.",
		],
	},
];

function ModeBadge({ mode }: { mode: "conversational" | "deepdive" }) {
	if (mode === "deepdive") {
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#FDDA24]/40 bg-[#FDDA24]/[0.05] text-[10px] uppercase tracking-wide text-[#FDDA24] font-medium">
				<Lightbulb className="w-3 h-3" /> Deep Dive
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/50 bg-card text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
			<Search className="w-3 h-3" /> Conversational
		</span>
	);
}

export default function ExamplesPage() {
	return (
		<div className="min-h-screen relative">
			<main className="max-w-4xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/scout"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Scout</span>
				</Link>

				<div className="mb-10">
					<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
						Examples
					</div>
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-3">
						Sample prompts &amp; full sessions
					</h1>
					<p className="text-muted-foreground max-w-2xl">
						Six starter prompts you can paste into any Scout-equipped agent,
						plus five worked examples showing exactly which endpoints Scout
						hits and how it stitches the answer together.
					</p>
				</div>

				{/* Sample prompts */}
				<section className="mb-14">
					<h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
						Try these in your agent
					</h2>
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
				</section>

				{/* Worked sessions */}
				<section>
					<h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
						Worked sessions
					</h2>
					<div className="space-y-6">
						{SESSIONS.map((s) => (
							<div
								key={s.title}
								className="rounded-xl border border-border/50 bg-card p-6"
							>
								<div className="flex items-center gap-2 mb-3 flex-wrap">
									<span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
										{s.eyebrow}
									</span>
									<ModeBadge mode={s.mode} />
								</div>
								<h3 className="text-base font-semibold text-foreground mb-3">
									{s.title}
								</h3>
								<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1">
									User
								</div>
								<div className="text-sm text-foreground font-mono mb-4">
									{s.userPrompt}
								</div>
								<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
									Scout's actions
								</div>
								<ol className="space-y-2 text-sm text-foreground">
									{s.steps.map((step, i) => (
										<li
											// biome-ignore lint/suspicious/noArrayIndexKey: ordered steps
											key={i}
											className="flex gap-3"
										>
											<span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/5 border border-border/40 text-[10px] text-muted-foreground inline-flex items-center justify-center font-mono">
												{i + 1}
											</span>
											<span className="flex-1 leading-relaxed">{step}</span>
										</li>
									))}
								</ol>
							</div>
						))}
					</div>
				</section>

				<div className="mt-12 text-center">
					<Link
						href="/scout"
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						← Back to Scout overview
					</Link>
				</div>
			</main>
		</div>
	);
}
