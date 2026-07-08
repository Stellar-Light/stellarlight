import {
	ArrowLeft,
	Award,
	ChevronDown,
	ExternalLink,
	Github,
	Lightbulb,
	Search,
	Sparkles,
	Terminal,
	Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ScoutCopyButton } from "@/components/scout-copy-button";
import { ScoutInstallPicker } from "@/components/scout-install-picker";
import { getPayloadSafe } from "@/lib/payload-client";

export const revalidate = 300;

interface ShowcaseProject {
	name: string;
	slug: string;
	logoUrl: string | null;
}

const SHOWCASE_SLUGS = ["soroswap", "aquarius", "blend", "kulipa"];

/**
 * Fetch the four showcase projects (Soroswap, Aquarius, Blend, Kulipa)
 * with their Payload logo URLs for the "What's inside" card. Returns
 * an entry for each slug — null logoUrl if the project isn't in the
 * directory or has no logo uploaded (we'll fall back to a letter
 * avatar in render).
 */
async function getShowcaseProjects(): Promise<ShowcaseProject[]> {
	const payload = await getPayloadSafe();
	if (!payload) {
		return SHOWCASE_SLUGS.map((slug) => ({
			name: slug.charAt(0).toUpperCase() + slug.slice(1),
			slug,
			logoUrl: null,
		}));
	}

	try {
		const result = await payload.find({
			collection: "projects",
			where: { slug: { in: SHOWCASE_SLUGS } },
			depth: 1,
			limit: SHOWCASE_SLUGS.length,
		});

		const bySlug = new Map<string, { name: string; logoUrl: string | null }>();
		for (const p of result.docs as Array<{
			name: string;
			slug: string;
			logo?: { url?: string; filename?: string } | string;
		}>) {
			let logoUrl: string | null = null;
			if (p.logo && typeof p.logo === "object") {
				if (p.logo.url) logoUrl = p.logo.url;
				else if (p.logo.filename) logoUrl = `/media/${p.logo.filename}`;
			}
			bySlug.set(p.slug, { name: p.name, logoUrl });
		}

		return SHOWCASE_SLUGS.map((slug) => {
			const hit = bySlug.get(slug);
			return {
				name: hit?.name ?? slug.charAt(0).toUpperCase() + slug.slice(1),
				slug,
				logoUrl: hit?.logoUrl ?? null,
			};
		});
	} catch {
		return SHOWCASE_SLUGS.map((slug) => ({
			name: slug.charAt(0).toUpperCase() + slug.slice(1),
			slug,
			logoUrl: null,
		}));
	}
}

export const metadata: Metadata = {
	title: "Stellar Scout | Stellar Light",
	description:
		"An AI skill for Stellar builders — validate ideas, surface existing projects, match SCF-funded RFPs. For hackathon entrants, grant applicants, and independent builders. Installs into Claude Code, Codex, Cursor, or any agent that loads SKILL.md.",
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

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
	{
		q: "Which AI agents does Scout work with?",
		a: (
			<>
				Any agent that loads{" "}
				<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
					SKILL.md
				</code>{" "}
				files — Claude (claude.ai), Claude Code, Codex, Cursor, OpenClaw, and
				dozens more (the underlying{" "}
				<a
					href="https://github.com/vercel-labs/skills"
					target="_blank"
					rel="noopener noreferrer"
					className="underline hover:text-foreground"
				>
					skills CLI
				</a>{" "}
				supports 55+ agents). The npx install handles per-agent placement
				automatically.
			</>
		),
	},
	{
		q: "Does Scout write code for me?",
		a: (
			<>
				No. Scout is a <strong>research skill</strong> — it tells you what's
				been built, who's building it, what got funded, and which SDK skill to
				install next. For the actual code work, install the relevant skill from{" "}
				<a
					href="https://skills.stellar.org/"
					target="_blank"
					rel="noopener noreferrer"
					className="underline hover:text-foreground"
				>
					skills.stellar.org
				</a>{" "}
				(soroban, dapp, assets, etc.) — those are the technical execution layer.
			</>
		),
	},
	{
		q: "What if Scout returns no results for my query?",
		a: (
			<>
				It'll tell you so explicitly rather than fabricating answers. Try
				broader keywords, drop filters (e.g. remove{" "}
				<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
					scfAwarded=1
				</code>
				), or check that the topic is one we index (curated Stellar projects,
				hackathons, SCF rounds, RFPs, dev stats). For raw GitHub searches across
				all of Stellar, use GitHub directly — Scout only covers projects in the
				stellarlight directory.
			</>
		),
	},
	{
		q: "How does Scout differ from just asking ChatGPT/Claude about Stellar?",
		a: (
			<>
				Scout doesn't bring its own brain — it brings{" "}
				<strong>structured Stellar data</strong>. The skill teaches whatever
				agent you use (Claude, ChatGPT, etc.) how to query our public APIs to
				get cited, evidence-backed answers grounded in real numbers: SCF dollars
				raised, hackathon prize pools, project counts, dev activity. Without
				Scout the agent guesses; with Scout it cites.
			</>
		),
	},
	{
		q: "How current is the data?",
		a: (
			<>
				Varies by source. Project + Hackathons + Builders metadata: refreshed
				continuously by curators. Live DoraHacks events: cached 1 hour.
				Ecosystem dev stats (Electric Capital snapshot): daily at 06:00 UTC. SDF
				skill catalog proxy: 24h. RFPs: live from{" "}
				<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
					src/data/ideas.ts
				</code>
				. Hit{" "}
				<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
					/api/status
				</code>{" "}
				for exact{" "}
				<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
					lastUpdatedAt
				</code>{" "}
				per source.
			</>
		),
	},
	{
		q: "Is the API really free? No auth, no rate limits?",
		a: (
			<>
				Yes — all endpoints are public, read-only, no auth, no rate limits.
				Edge- cached for 5 minutes (24h for the SDF skill proxy). Hit them from
				your agent, your Dune query, your dashboard, or anywhere else. If usage
				ever gets large enough to need rate limiting, we'll publish that ahead
				of time on the API reference page.
			</>
		),
	},
	{
		q: "How does Scout relate to skills.stellar.org?",
		a: (
			<>
				They compose. <strong>Scout</strong> answers{" "}
				<em>"what should I build, with whom, for what funding?"</em> — strategy.{" "}
				<strong>skills.stellar.org</strong> (the Stellar Development
				Foundation's 7 official skills — soroban, dapp, assets, data,
				agentic-payments, zk-proofs, standards) answers{" "}
				<em>"how do I actually build it?"</em> — execution. Scout cross-links to
				those skills in its responses; install both when you move from research
				into building.
			</>
		),
	},
	{
		q: "What if I find a bug, missing data, or want to suggest a source?",
		a: (
			<>
				Open an issue in the{" "}
				<a
					href="https://github.com/Stellar-Light/stellar-scout"
					target="_blank"
					rel="noopener noreferrer"
					className="underline hover:text-foreground"
				>
					stellar-scout repo
				</a>
				. For missing projects in the directory, use the Submit form at{" "}
				<a
					href="https://stellarlight.xyz/submit"
					className="underline hover:text-foreground"
				>
					stellarlight.xyz/submit
				</a>
				.
			</>
		),
	},
	{
		q: "What does Scout do when my idea already exists?",
		a: (
			<>
				It tells you. Scout classifies every idea as a <strong>full gap</strong>{" "}
				(zero prior projects), <strong>partial gap</strong> (1–3 adjacent
				projects), or <strong>false gap</strong> (4+ direct competitors or a
				funded category leader), with a crowdedness score (1–10) and a list of
				the existing players. If the gap is false, it'll suggest where the
				whitespace actually is rather than just affirming your idea.
			</>
		),
	},
	{
		q: "What if there's no RFP / sponsor brief matching my idea?",
		a: (
			<>
				Zero RFPs in a category doesn't mean <em>"no opportunity"</em> — it
				means no sponsor brief in the current SCF round covers that lane yet.
				Anyone can propose an RFP at{" "}
				<a
					href="https://stellarlight.xyz/ideas"
					target="_blank"
					rel="noopener noreferrer"
					className="underline hover:text-foreground"
				>
					stellarlight.xyz/ideas
				</a>{" "}
				via the <strong>"Suggest a Need"</strong> button. Community submissions
				go through curators and graduate to confirmed RFPs in upcoming rounds.
				Scout will tell you this directly when its RFP search comes up empty.
			</>
		),
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

export default async function ScoutPage() {
	const showcaseProjects = await getShowcaseProjects();
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

				{/* Hero — opencode.ai-inspired: clean statement, install-first */}
				<div className="mb-16">
					{/* Statement headline */}
					<h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.05] mb-6 max-w-4xl">
						Know what's been built.{" "}
						<span className="text-muted-foreground">Find your gap.</span>
					</h1>

					{/* Tight positioning paragraph */}
					<p className="text-base md:text-lg text-muted-foreground max-w-2xl mb-10 leading-relaxed">
						An AI tool for Stellar builders. Validate ideas, surface prior art,
						and match open SCF-funded briefs — whether you're entering a
						hackathon, applying for a grant, or shipping independently. Works as
						a SKILL.md or an MCP server.
					</p>

					{/* Tabbed install picker — the centerpiece */}
					<ScoutInstallPicker />

					{/* Stats row — opencode-style metrics */}
					<div className="grid grid-cols-3 gap-px mt-4 rounded-xl border border-border/40 bg-border/40 overflow-hidden">
						<div className="bg-card px-4 py-3">
							<div className="text-xl md:text-2xl font-bold text-foreground tabular-nums">
								14
							</div>
							<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mt-0.5">
								Endpoints
							</div>
						</div>
						<div className="bg-card px-4 py-3">
							<div className="text-xl md:text-2xl font-bold text-foreground tabular-nums">
								4,541
							</div>
							<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mt-0.5">
								Research chunks
							</div>
						</div>
						<div className="bg-card px-4 py-3">
							<div className="text-xl md:text-2xl font-bold text-foreground tabular-nums">
								15+
							</div>
							<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mt-0.5">
								Agent clients
							</div>
						</div>
					</div>

					{/* Secondary CTAs */}
					<div className="flex flex-wrap items-center gap-3 mt-6">
						<ScoutCopyButton
							label="Copy skill manifest"
							className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-white/5 hover:border-white/20 transition-colors"
						/>
						<a
							href="/skills/stellar-scout.md"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-white/5 hover:border-white/20 transition-colors"
						>
							View raw <ExternalLink className="w-3.5 h-3.5" />
						</a>
						<a
							href="https://github.com/Stellar-Light/stellar-scout"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-white/5 hover:border-white/20 transition-colors"
						>
							<Github className="w-4 h-4" />
							Skill repo
						</a>
						<a
							href="https://github.com/Stellar-Light/scout-mcp"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-white/5 hover:border-white/20 transition-colors"
						>
							<Github className="w-4 h-4" />
							MCP repo
						</a>
						<Link
							href="/skills"
							className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-white/5 hover:border-white/20 transition-colors"
						>
							Browse all Stellar AI tools →
						</Link>
					</div>
				</div>

				{/* What's inside */}
				<Section title="What's inside">
					<p className="text-sm text-muted-foreground mb-6 max-w-2xl">
						Curated Stellar ecosystem data + the Stellar Foundation's official
						skill catalog — all queryable from inside Claude Code, Codex,
						Cursor, or any agent that loads SKILL.md.
					</p>

					{/* Top row: count cards */}
					<div className="grid md:grid-cols-3 gap-3 mb-3">
						<div className="rounded-xl border border-border bg-card p-5">
							<div className="text-3xl font-bold text-foreground mb-1">
								670+
							</div>
							<div className="text-sm font-semibold text-foreground mb-3">
								Stellar projects
							</div>
							<div className="flex flex-wrap gap-1.5 mb-3">
								{showcaseProjects.map((p) => (
									<Link
										key={p.slug}
										href={`/project/${p.slug}`}
										className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 text-xs rounded-md bg-white/5 text-muted-foreground border border-border/50 hover:bg-white/10 hover:border-white/20 hover:text-foreground transition-colors"
									>
										{p.logoUrl ? (
											// biome-ignore lint/performance/noImgElement: Payload media URLs are dynamic — avoiding next/image's remotePatterns config burden
											// eslint-disable-next-line @next/next/no-img-element
											<img
												src={p.logoUrl}
												alt=""
												className="w-4 h-4 rounded object-cover flex-shrink-0"
											/>
										) : (
											<span
												className="inline-flex items-center justify-center w-4 h-4 rounded bg-white/10 text-[9px] font-semibold text-foreground"
												aria-hidden="true"
											>
												{p.name.charAt(0).toUpperCase()}
											</span>
										)}
										{p.name}
									</Link>
								))}
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Curated projects with category, hackathon history, SCF funding,
								and GitHub activity. Keyword search across name, description,
								category.
							</p>
						</div>

						<div className="rounded-xl border border-border bg-card p-5">
							<div className="text-3xl font-bold text-foreground mb-1">14</div>
							<div className="text-sm font-semibold text-foreground mb-3">
								Sponsor briefs (RFPs)
							</div>
							<div className="flex flex-wrap gap-1.5 mb-3">
								{[
									"Prices API",
									"Passkey UI Kit",
									"DeFi Positions",
									"Trustline Onboarder",
								].map((n) => (
									<span
										key={n}
										className="inline-block px-2 py-0.5 text-xs rounded-md bg-white/5 text-muted-foreground border border-border/50"
									>
										{n}
									</span>
								))}
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Confirmed problem statements that get funded by the Stellar
								Community Fund when winners are picked. Match an idea to an open
								brief.
							</p>
						</div>

						<div className="rounded-xl border border-border bg-card p-5">
							<div className="text-3xl font-bold text-foreground mb-1">11</div>
							<div className="text-sm font-semibold text-foreground mb-3">
								Hackathons
							</div>
							<div className="flex flex-wrap gap-1.5 mb-3">
								{[
									"Stellar Hacks: Agents",
									"KALE × Reflector",
									"ZK Gaming",
									"Scaffold Stellar",
								].map((n) => (
									<span
										key={n}
										className="inline-block px-2 py-0.5 text-xs rounded-md bg-white/5 text-muted-foreground border border-border/50"
									>
										{n}
									</span>
								))}
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Live DoraHacks feed (SDF + Tellus orgs) + curated Stellar events
								with prize pools, tracks, winners, and outcome funnels.
							</p>
						</div>
					</div>

					{/* Bottom row: taxonomies */}
					<div className="grid md:grid-cols-2 gap-3">
						<div className="rounded-xl border border-border bg-card p-5">
							<div className="flex items-center gap-2 mb-3">
								<div className="w-7 h-7 rounded-lg bg-white/5 border border-border flex items-center justify-center flex-shrink-0">
									<Search className="w-3.5 h-3.5 text-muted-foreground" />
								</div>
								<div className="text-sm font-semibold text-foreground">
									Topic clusters
								</div>
							</div>
							<div className="flex flex-wrap gap-1.5 mb-3">
								{[
									"Soroban",
									"Anchors",
									"Agentic Payments",
									"Assets",
									"ZK Proofs",
									"SEPs",
								].map((n) => (
									<span
										key={n}
										className="inline-block px-2 py-0.5 text-xs rounded-md bg-white/5 text-muted-foreground border border-border/50"
									>
										{n}
									</span>
								))}
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Stellar-native categories aligned to skills.stellar.org's
								taxonomy. Scout uses these to frame what to build and which SDK
								to install next.
							</p>
						</div>

						<div className="rounded-xl border border-border bg-card p-5">
							<div className="flex items-center gap-2 mb-3">
								<div className="w-7 h-7 rounded-lg bg-white/5 border border-border flex items-center justify-center flex-shrink-0">
									<Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
								</div>
								<div className="text-sm font-semibold text-foreground">
									Companion skills (from SDF)
								</div>
							</div>
							<div className="flex flex-wrap gap-1.5 mb-3">
								{[
									"soroban",
									"dapp",
									"assets",
									"data",
									"agentic-payments",
									"zk-proofs",
									"standards",
								].map((n) => (
									<span
										key={n}
										className="inline-block px-2 py-0.5 text-xs rounded-md bg-white/5 text-muted-foreground border border-border/50 font-mono"
									>
										{n}
									</span>
								))}
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								The Stellar Foundation's 7 official skills — the "how to build"
								layer. Scout chains into them via{" "}
								<code className="text-[11px] px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
									/api/skills
								</code>{" "}
								when the user moves from research to execution.
							</p>
						</div>
					</div>
				</Section>

				{/* Two modes — text-first, no card chrome */}
				<Section eyebrow="Two modes" title="Conversational + Deep Dive">
					<div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
						<div>
							<div className="flex items-center gap-2 mb-2">
								<Search className="w-3.5 h-3.5 text-muted-foreground" />
								<h3 className="text-sm font-semibold text-foreground">
									Conversational
								</h3>
							</div>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Fast, cited answers for any question. Scout hits the right
								endpoint, surfaces the data, links the source.
							</p>
						</div>
						<div>
							<div className="flex items-center gap-2 mb-2">
								<Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
								<h3 className="text-sm font-semibold text-foreground">
									Deep Dive
								</h3>
							</div>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Triggered by <em>"vet this idea"</em> or{" "}
								<em>"should I build X"</em>. Runs an 8-step workflow: existing
								projects → gap classification → competitors → SDK pick →
								teammates → funding signal → next steps.
							</p>
						</div>
					</div>
				</Section>

				{/* Gap classification — terminal-style data grid */}
				<Section
					eyebrow="The strict part"
					title="Gap classification, no speculation"
				>
					<div className="rounded-xl border border-border/40 bg-card overflow-hidden">
						<div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/40">
							{[
								{
									range: "0–2",
									title: "Full gap",
									signal: "Highest opportunity",
									blurb:
										"Zero prior projects on Stellar. No winning hackathon submissions. No SCF-funded teams in this lane.",
								},
								{
									range: "3–5",
									title: "Partial gap",
									signal: "Medium opportunity",
									blurb:
										"1–3 adjacent projects exist but none cover the specific angle. The user's wedge is fresh.",
								},
								{
									range: "7–10",
									title: "False gap",
									signal: "Low opportunity",
									blurb:
										"4+ direct competitors or a funded category leader already exists. Recommend a differentiator or reframe.",
								},
							].map((c) => (
								<div key={c.title} className="p-5">
									<div className="mb-3">
										<span className="font-mono text-2xl font-bold text-foreground tracking-tight tabular-nums">
											{c.range}
										</span>
									</div>
									<div className="text-sm font-semibold text-foreground mb-0.5">
										{c.title}
									</div>
									<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
										{c.signal}
									</div>
									<p className="text-xs text-muted-foreground leading-relaxed">
										{c.blurb}
									</p>
								</div>
							))}
						</div>
					</div>
					<p className="text-xs text-muted-foreground leading-relaxed mt-4 max-w-2xl">
						<strong className="text-foreground">Evidence floor:</strong> if the
						data doesn't support a claim, Scout says so. It won't invent
						competitors, prize amounts, or builder profiles. Missing data is
						reported as <em>"not indexed"</em> — never papered over.
					</p>
				</Section>

				{/* Capabilities — opencode-style checklist, text-first */}
				<Section eyebrow="What it can answer" title="Six core capabilities">
					<ul className="space-y-4 max-w-3xl">
						{[
							{
								title: "Has anyone built this?",
								blurb:
									"Search for existing Stellar projects, hackathon submissions, and SCF-funded work that overlaps your idea.",
							},
							{
								title: "Hackathon results",
								blurb:
									"Winners, placements, prize tracks, post-hack survival rates per event.",
							},
							{
								title: "Spot Stellar builders",
								blurb:
									"Search the Stellar Passport directory by skill, location, SCF tier. Scout flags gaps and points to Discord / GitHub when results are thin.",
							},
							{
								title: "Idea validation",
								blurb:
									"Full Deep Dive workflow with gap classification and SDK recommendations.",
							},
							{
								title: "Dev metrics",
								blurb:
									"Active dev counts, commit volume, country breakdown via the dev-activity skill.",
							},
							{
								title: "RFP discovery",
								blurb:
									"Native query of confirmed Stellar RFPs (SCF-funded sponsor briefs) via /api/rfps. Match an idea to an open brief or propose a new one.",
								href: "https://ideas.stellarlight.xyz/",
							},
						].map((cap) => {
							const content = (
								<>
									<span className="font-mono text-muted-foreground/60 select-none">
										[+]
									</span>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
											{cap.title}
											{cap.href && (
												<ExternalLink className="w-3 h-3 text-muted-foreground" />
											)}
										</div>
										<p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
											{cap.blurb}
										</p>
									</div>
								</>
							);
							if (cap.href) {
								return (
									<li key={cap.title}>
										<a
											href={cap.href}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-start gap-3 hover:text-foreground transition-colors"
										>
											{content}
										</a>
									</li>
								);
							}
							return (
								<li key={cap.title} className="flex items-start gap-3">
									{content}
								</li>
							);
						})}
					</ul>
				</Section>

				{/* Sample prompts — terminal-aesthetic single block */}
				<Section eyebrow="Sample prompts" title="Try these in your agent">
					<div className="rounded-xl border border-border/40 bg-black/30 p-6 font-mono text-sm space-y-3 mb-3">
						{SAMPLE_PROMPTS.slice(0, 3).map((p) => (
							<div key={p.title}>
								<div className="text-[11px] uppercase tracking-wide text-muted-foreground/60 mb-1 font-sans">
									{p.title}
								</div>
								<div className="text-foreground flex items-start gap-2">
									<span className="text-muted-foreground/50 select-none">
										&gt;
									</span>
									<span>{p.prompt}</span>
								</div>
							</div>
						))}
					</div>
					<Link
						href="/scout/examples"
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						See all 6 prompts + 5 worked sessions →
					</Link>
				</Section>

				{/* Endpoints — tight terminal listing */}
				<Section eyebrow="Under the hood" title="Public APIs the skill calls">
					<div className="rounded-xl border border-border/40 bg-black/30 p-6 font-mono text-xs space-y-1.5 mb-3">
						{[
							["GET", "/api/research", "vector search over 4.5k chunks"],
							["GET", "/api/hackathons", "curated + DoraHacks live"],
							["GET", "/api/projects/search", "prior-art + competitor lookup"],
							["GET", "/api/rfps", "SCF-funded sponsor briefs"],
							["GET", "/api/skills", "SDF skill catalog"],
							["GET", "/api/clusters", "topic clusters + crowdedness"],
							["GET", "/api/analyze", "cross-event analytics"],
							["POST", "/api/feedback", "in-skill feedback loop"],
						].map(([method, path, blurb]) => (
							<div key={path} className="flex items-baseline gap-3">
								<span className="text-emerald-400 w-12 inline-block">
									{method}
								</span>
								<span className="text-foreground w-56 truncate">{path}</span>
								<span className="text-muted-foreground">— {blurb}</span>
							</div>
						))}
						<div className="text-muted-foreground/60 pt-1">…and 6 more</div>
					</div>
					<Link
						href="/scout/api-reference"
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						Full API reference (14 endpoints, params, response shapes) →
					</Link>
				</Section>

				{/* FAQ — flat accordions, no card chrome */}
				<Section eyebrow="FAQ" title="Common questions">
					<div className="rounded-xl border border-border/40 bg-card overflow-hidden divide-y divide-border/40">
						{FAQ.map((qa) => (
							<details
								key={qa.q}
								className="group px-5 py-4 open:bg-white/[0.02] transition-colors"
							>
								<summary className="cursor-pointer list-none flex items-start justify-between gap-4">
									<span className="text-sm font-medium text-foreground">
										{qa.q}
									</span>
									<span
										className="flex-shrink-0 mt-0.5 text-muted-foreground/60 group-open:rotate-180 transition-transform duration-150"
										aria-hidden="true"
									>
										<ChevronDown className="w-4 h-4" />
									</span>
								</summary>
								<div className="text-sm text-muted-foreground leading-relaxed mt-3">
									{qa.a}
								</div>
							</details>
						))}
					</div>
				</Section>

				{/* Footer CTA — left-aligned, tight */}
				<div className="rounded-xl border border-border/40 bg-card p-6 md:p-7 flex flex-wrap items-center justify-between gap-4">
					<div>
						<h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
							Ready to validate your hackathon idea?
						</h3>
						<p className="text-sm text-muted-foreground">
							Install Scout, ask <em>"should I build X on Stellar?"</em> — get
							evidence.
						</p>
					</div>
					<ScoutCopyButton
						label="Copy the skill"
						className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-[#171717] text-sm font-semibold hover:bg-[#F5F5F5] active:bg-[#E5E5E5] transition-colors"
					/>
				</div>
			</main>
		</div>
	);
}
