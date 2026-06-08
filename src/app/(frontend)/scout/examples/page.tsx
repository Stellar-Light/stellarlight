import { ArrowLeft, Lightbulb, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

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
		title: "Find existing projects",
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
		title: "Conversational — check what's been built",
		eyebrow: "Example 1",
		mode: "conversational" as const,
		userPrompt:
			'"Who built stablecoin off-ramps at Stellar hackathons? Show me the SCF-funded ones first."',
		steps: [
			"GET /api/projects/search?q=stablecoin+offramp&scfAwarded=1&limit=10",
			"Sort by .scfTotalAwardedUSD desc; cite project URLs.",
			"If user wants more, broaden: GET /api/projects/search?q=stablecoin+offramp (no SCF filter).",
		],
		response: {
			summary: "Found 4 SCF-funded off-ramp builders. Top by funding:",
			rows: [
				{
					label: "Kulipa",
					value: "$150,000 SCF",
					meta: "Payments · stellarlight.xyz/project/kulipa",
				},
				{
					label: "StellarPay",
					value: "$148,400 SCF",
					meta: "Payments · stellarlight.xyz/project/stellarpay",
				},
				{
					label: "Wirex Pay",
					value: "$150,000 SCF",
					meta: "User-Facing App · stellarlight.xyz/project/wirex-pay",
				},
				{
					label: "PayZoll",
					value: "$100,000 SCF",
					meta: "Payments · stellarlight.xyz/project/payzoll",
				},
			],
			footer:
				"Combined: $548k SCF-funded across 4 teams. None target a specific geographic corridor yet — that's the differentiator if you're building one.",
		},
	},
	{
		title: "Deep Dive — vet a new idea",
		eyebrow: "Example 2",
		mode: "deepdive" as const,
		userPrompt:
			'"I want to build a privacy-preserving stablecoin on Stellar — Zcash-style shielded pool but for USDC. Vet this idea."',
		steps: [
			"Restate + reframe: \"You're proposing a shielded stablecoin with hidden balances. Before searching: the regulatory layer (Tornado Cash sanctioning) makes pure privacy a dead-end on Stellar. The real wedge is *selective disclosure* — privacy by default, compliance-readable by warrant. I'll vet that angle.\"",
			"GET /api/projects/search?q=privacy+stablecoin+confidential → 1 adjacent match (XLM shielded prototype, abandoned).",
			"Crowdedness 2/10. Partial gap — 1 abandoned adjacent project, 0 SCF-funded, 0 hackathon winners in this exact lane.",
			"GET /api/skills/zk-proofs → quote the SDF skill's ZK primitives section inline. Recommend installing https://skills.stellar.org/skills/zk-proofs/SKILL.md + soroban.",
			"GET /api/builders?q=zk → surface candidates with the small-and-growing caveat.",
			"GET /api/projects/search?q=privacy+zk&scfAwarded=1 → report 0 SCF-funded privacy/ZK projects on Stellar today — funding signal is open.",
			"GET /api/rfps?q=privacy → no open RFP matches; suggest the user submits one at stellarlight.xyz/ideas.",
		],
		response: {
			summary:
				"Reframe accepted? Selective-disclosure stablecoin, Stellar-native.",
			rows: [
				{
					label: "Crowdedness",
					value: "2/10",
					meta: "1 abandoned adjacent project · 0 SCF-funded · 0 hackathon winners",
				},
				{
					label: "Gap classification",
					value: "Partial → Full (with selective-disclosure framing)",
					meta: "The privacy-only lane is a regulatory dead-end; the selective-disclosure lane is wide open.",
				},
				{
					label: "Direct competitors",
					value: "None active",
					meta: "XLM Shielded (abandoned 2024). Adjacent: 2 ZK-curious projects in directory.",
				},
				{
					label: "SDK recommendation",
					value: "zk-proofs + soroban",
					meta: "Install both from skills.stellar.org",
				},
				{
					label: "Funding signal",
					value: "Open",
					meta: "0 SCF-funded ZK/privacy projects on Stellar — significant whitespace.",
				},
				{
					label: "Next step",
					value: "Build for SCF Round Q2 2026",
					meta: "No open RFP matches; you could submit one via stellarlight.xyz/ideas.",
				},
			],
			footer:
				"Honest read: technically demanding (you'd need a new SEP or Soroban precompile for verifiable shielded balances), but funding + competitive whitespace is real. Don't ship pure-privacy; lead with the compliance angle from day one.",
		},
	},
	{
		title: "Map an idea → the right SDF skill",
		eyebrow: "Example 3",
		mode: "conversational" as const,
		userPrompt:
			'"I want to write a Soroban smart contract. What do I need to know first?"',
		steps: [
			"GET /api/skills/soroban → load full SDF Soroban skill (~8k words).",
			"Quote relevant sections inline (setup, storage types, authorization, security pitfalls).",
			"Recommend installing https://skills.stellar.org/skills/soroban/SKILL.md for ongoing work.",
			"Cross-reference: assets (for SAC bridge), data (for RPC queries), standards (for SEP work).",
		],
		response: {
			summary:
				'Loading the official "soroban" skill (8,008 words, SDF-maintained). Five concerns to know upfront:',
			rows: [
				{
					label: "1. Project setup",
					value: "soroban-cli + Rust toolchain",
					meta: "Pinned versions in the skill",
				},
				{
					label: "2. Storage types",
					value: "Persistent / Temporary / Instance",
					meta: "TTL semantics + archival behavior",
				},
				{
					label: "3. Authorization",
					value: "require_auth() patterns",
					meta: "Common pitfalls covered in the skill",
				},
				{
					label: "4. Testing",
					value: "Unit / integration / fuzz / property",
					meta: "Mutation + fork + differential tests too",
				},
				{
					label: "5. Vulnerabilities",
					value: "Storage hygiene, TTL, reentrancy-adjacent bugs",
					meta: "Full checklist in the skill",
				},
			],
			footer:
				"Install the full skill at .claude/skills/stellar-soroban/SKILL.md from https://skills.stellar.org/skills/soroban/SKILL.md. For SAC bridge specifically, also grab the assets skill.",
		},
	},
	{
		title: "Hackathon track research",
		eyebrow: "Example 4",
		mode: "conversational" as const,
		userPrompt:
			'"What prize tracks paid out the most at past Stellar Hacks events?"',
		steps: [
			"GET /api/hackathons?status=completed → list past events with prize pools.",
			"For each curated event, GET /api/hackathons/{slug} → read .hackathon.tracks[*].",
			"Aggregate tracks across events; rank by totalPrizeUSD desc.",
			"Note caveats: DoraHacks-sourced events have prize pool but no track-level data unless curated into Payload.",
		],
		response: {
			summary:
				"Past Stellar Hacks events with documented track payouts (curated entries only — DoraHacks events show pool only):",
			rows: [
				{
					label: "Stellar Hacks: Agents",
					value: "$10,000 pool",
					meta: "DoraHacks · track-level data not curated yet",
				},
				{
					label: "Stellar Hacks: KALE × Reflector",
					value: "$12,000 pool",
					meta: "DoraHacks · track-level data not curated yet",
				},
				{
					label: "Stellar Hacks: ZK Gaming",
					value: "$10,000 pool",
					meta: "DoraHacks · track-level data not curated yet",
				},
				{
					label: "Scaffold Stellar Hackathon",
					value: "$10,000 pool",
					meta: "DoraHacks · track-level data not curated yet",
				},
			],
			footer:
				"Curators haven't tagged track-level data on most DoraHacks-sourced events yet, so I can't rank track payouts. For Stellar Hacks: Agents specifically, the event externalUrl has track results — recommend checking that. I'll be more useful here once tracks are curated into the Hackathons collection.",
		},
	},
	{
		title: "Funding-first project search",
		eyebrow: "Example 5",
		mode: "deepdive" as const,
		userPrompt:
			'"What SCF-funded projects work on payments? Which raised the most?"',
		steps: [
			"GET /api/projects/search?q=payments&scfAwarded=1&limit=20 → SCF-awarded payments projects.",
			"Sort by .scfTotalAwardedUSD desc. Sum total raised.",
			"Optionally cross-reference: filter where .hackathon is set, to see which won hackathon prizes en route to SCF funding.",
		],
		response: {
			summary:
				"10 SCF-funded payments projects on Stellar. Combined: $859,692.",
			rows: [
				{
					label: "Kulipa",
					value: "$150,000",
					meta: "User-Facing App · payments rails for African corridors",
				},
				{
					label: "Rozo",
					value: "$150,000",
					meta: "Payments · QR-based payment dApp",
				},
				{
					label: "StellarPay",
					value: "$148,400",
					meta: "Payments · multi-country payments processor",
				},
				{
					label: "PayZoll",
					value: "$100,000",
					meta: "Payments · payroll-to-stablecoin pipeline",
				},
				{
					label: "TheXBank",
					value: "$89,500",
					meta: "User-Facing App · banking interface",
				},
				{
					label: "SFx",
					value: "$55,000",
					meta: "Protocol/Contract · FX corridor",
				},
			],
			footer:
				"Funding skews toward end-user / B2B payment products, not pure infra. If your idea is in this space, you're competing for SCF dollars against established teams — pick a regional corridor or a B2B vertical they don't cover. None target programmatic agentic payments yet (x402, MPP) — that's a real whitespace.",
		},
	},
	{
		title: "Match an idea to an open RFP",
		eyebrow: "Example 6",
		mode: "conversational" as const,
		userPrompt:
			'"Is there an open Stellar RFP that matches my idea — a real-time price API for Soroban tokens?"',
		steps: [
			"GET /api/rfps?q=price+api+soroban → filter curated RFPs by keyword overlap.",
			"Return matches with title, description, technical requirements, quarter, URL.",
			"If 0 matches: tell user honestly and recommend submitting via stellarlight.xyz/ideas.",
		],
		response: {
			summary: "Direct match found:",
			rows: [
				{
					label: "Prices API & Indexing Service",
					value: "Q1 2026",
					meta: "Infrastructure · stellarlight.xyz/ideas/prices-api",
				},
				{
					label: "Author",
					value: "Jake",
					meta: "RFP description matches your idea closely",
				},
				{
					label: "Tech requirements",
					value: "VWAP · SEP-41",
					meta: "Asset coverage (Classic + SEP-41), VWAP weighting, real-time + historical endpoints, low-latency. Full spec on the RFP page.",
				},
				{
					label: "Funding",
					value: "SCF-funded",
					meta: "Apply via the Stellar Community Fund",
				},
			],
			footer:
				'Your idea aligns with an existing open RFP — no need to reinvent. The brief is specific (VWAP weighting, SEP-41 support, configurable liquidity thresholds) — read the full RFP before applying. Adjacent RFP that overlaps: "DeFi Positions API" (Q1 2026) — same author, complementary scope.',
		},
	},
];

type SessionRow = { label: string; value: string; meta?: string };

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
						plus six worked sessions — each showing the endpoints Scout calls,
						the actions it runs, and the structured response it produces.
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
								<ol className="space-y-2 text-sm text-foreground mb-5">
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

								{/* Response preview */}
								<div className="rounded-lg border border-border/40 bg-black/20 p-4">
									<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-3">
										Scout's response (sample)
									</div>
									<p className="text-sm text-foreground mb-3 leading-relaxed">
										{s.response.summary}
									</p>
									<div className="space-y-2 mb-3">
										{(s.response.rows as SessionRow[]).map((row) => (
											<div
												key={row.label}
												className="grid grid-cols-[1fr_auto] gap-3 items-baseline pb-2 border-b border-border/30 last:border-b-0 last:pb-0"
											>
												<div className="min-w-0">
													<div className="text-sm font-medium text-foreground">
														{row.label}
													</div>
													{row.meta && (
														<div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
															{row.meta}
														</div>
													)}
												</div>
												<div className="text-sm font-mono text-foreground text-right tabular-nums whitespace-nowrap">
													{row.value}
												</div>
											</div>
										))}
									</div>
									<p className="text-xs text-muted-foreground leading-relaxed">
										{s.response.footer}
									</p>
								</div>
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
