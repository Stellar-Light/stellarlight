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
	ChevronDown,
} from "lucide-react";
import { ScoutCopyButton } from "@/components/scout-copy-button";
import { CopyCommand } from "@/components/copy-command";
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

		const bySlug = new Map<
			string,
			{ name: string; logoUrl: string | null }
		>();
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
		"Scout the Stellar ecosystem before you build. Validate ideas, find existing projects, surface teammates, and recommend SDK tracks — installed into Claude, Claude Code, Codex, or any agent that loads SKILL.md.",
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
				Any agent that loads <code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">SKILL.md</code>{" "}
				files — Claude (claude.ai), Claude Code, Codex, Cursor, OpenClaw, and dozens
				more (the underlying{" "}
				<a
					href="https://github.com/vercel-labs/skills"
					target="_blank"
					rel="noopener noreferrer"
					className="underline hover:text-foreground"
				>
					skills CLI
				</a>{" "}
				supports 55+ agents). The npx install handles per-agent placement automatically.
			</>
		),
	},
	{
		q: "Does Scout write code for me?",
		a: (
			<>
				No. Scout is a <strong>research skill</strong> — it tells you what's been
				built, who's building it, what got funded, and which SDK skill to install
				next. For the actual code work, install the relevant skill from{" "}
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
				It'll tell you so explicitly rather than fabricating answers. Try broader
				keywords, drop filters (e.g. remove <code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">scfAwarded=1</code>),
				or check that the topic is one we index (curated Stellar projects, hackathons,
				SCF rounds, RFPs, dev stats). For raw GitHub searches across all of Stellar,
				use GitHub directly — Scout only covers projects in the stellarlight directory.
			</>
		),
	},
	{
		q: "How does Scout differ from just asking ChatGPT/Claude about Stellar?",
		a: (
			<>
				Scout doesn't bring its own brain — it brings <strong>structured Stellar data</strong>.
				The skill teaches whatever agent you use (Claude, ChatGPT, etc.) how to query
				our public APIs to get cited, evidence-backed answers grounded in real
				numbers: SCF dollars raised, hackathon prize pools, project counts, dev
				activity. Without Scout the agent guesses; with Scout it cites.
			</>
		),
	},
	{
		q: "How current is the data?",
		a: (
			<>
				Varies by source. Project + Hackathons + Builders metadata: refreshed
				continuously by curators. Live DoraHacks events: cached 1 hour. Ecosystem
				dev stats (Electric Capital snapshot): daily at 06:00 UTC. SDF skill catalog
				proxy: 24h. RFPs: live from <code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">src/data/ideas.ts</code>.
				Hit <code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">/api/status</code> for exact{" "}
				<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">lastUpdatedAt</code> per source.
			</>
		),
	},
	{
		q: "Is the API really free? No auth, no rate limits?",
		a: (
			<>
				Yes — all endpoints are public, read-only, no auth, no rate limits. Edge-
				cached for 5 minutes (24h for the SDF skill proxy). Hit them from your
				agent, your Dune query, your dashboard, or anywhere else. If usage ever
				gets large enough to need rate limiting, we'll publish that ahead of time
				on the API reference page.
			</>
		),
	},
	{
		q: "How does Scout relate to skills.stellar.org?",
		a: (
			<>
				They compose. <strong>Scout</strong> answers <em>"what should I build, with
				whom, for what funding?"</em> — strategy. <strong>skills.stellar.org</strong>{" "}
				(the Stellar Development Foundation's 7 official skills — soroban, dapp,
				assets, data, agentic-payments, zk-proofs, standards) answers{" "}
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
				</a>{" "}
				or the{" "}
				<a
					href="https://github.com/alexanderkoh/stellarlight"
					target="_blank"
					rel="noopener noreferrer"
					className="underline hover:text-foreground"
				>
					main stellarlight repo
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
				via the <strong>"Suggest a Need"</strong> button. Community
				submissions go through curators and graduate to confirmed RFPs in
				upcoming rounds. Scout will tell you this directly when its RFP
				search comes up empty.
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

				{/* Hero — clean statement-led, design-system typography */}
				<div className="mb-16">
					{/* Eyebrow tag */}
					<div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full border border-border bg-card">
						<Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
						<span className="text-xs font-medium text-muted-foreground">
							Stellar ecosystem · AI skill
						</span>
					</div>

					{/* Statement headline — two short lines, big and confident */}
					<h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.05] mb-6 max-w-4xl">
						Know what's been built.{" "}
						<span className="text-muted-foreground">Find your gap.</span>
					</h1>

					{/* Positioning paragraph */}
					<p className="text-base md:text-lg text-muted-foreground max-w-2xl mb-10 leading-relaxed">
						Stellar Scout is an AI skill for validating Stellar hackathon ideas
						before you build. It surfaces existing projects, finds teammates,
						points to the right SDK, and matches open SCF-funded briefs — all
						from inside Claude Code, Codex, Cursor, or any agent that loads{" "}
						<code className="font-mono text-foreground/90 text-sm px-1.5 py-0.5 rounded bg-white/[0.04] border border-border/30">
							SKILL.md
						</code>
						.
					</p>

					{/* CTAs */}
					<div className="flex flex-wrap items-center gap-3">
						<ScoutCopyButton
							label="Copy skill"
							className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-[#171717] text-sm font-semibold hover:bg-[#F5F5F5] active:bg-[#E5E5E5] transition-colors"
						/>
						<a
							href="/skills/stellar-scout.md"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-white/5 hover:border-white/20 transition-colors"
						>
							View raw <ExternalLink className="w-3.5 h-3.5" />
						</a>
					</div>
				</div>

				{/* How it works */}
				<Section eyebrow="How it works" title="One command, then ask away">
					<div className="rounded-xl border border-border/50 bg-card p-6">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
							Install via npx
						</div>
						<CopyCommand
							command="npx skills add Stellar-Light/stellar-scout"
							className="flex items-center gap-3 rounded-lg bg-black/40 border border-border/30 p-4 mb-2 font-mono text-sm text-foreground overflow-hidden"
						/>
						<p className="text-xs text-muted-foreground mb-5">
							For Codex or OpenClaw, append{" "}
							<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
								-a codex
							</code>{" "}
							or{" "}
							<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
								-a openclaw
							</code>
							. Powered by the open-source{" "}
							<a
								href="https://github.com/vercel-labs/skills"
								target="_blank"
								rel="noopener noreferrer"
								className="underline hover:text-foreground"
							>
								vercel-labs/skills
							</a>{" "}
							CLI.
						</p>
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2 mt-6">
							Or copy/paste manually
						</div>
						<ol className="space-y-3 text-sm text-foreground">
							<li className="flex gap-3">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/5 border border-border/50 text-xs text-muted-foreground inline-flex items-center justify-center font-mono">
									1
								</span>
								<div>
									<strong>Copy the skill manifest</strong> using the button at
									the top of this page (or view the raw{" "}
									<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
										.md
									</code>
									).
								</div>
							</li>
							<li className="flex gap-3">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/5 border border-border/50 text-xs text-muted-foreground inline-flex items-center justify-center font-mono">
									2
								</span>
								<div>
									<strong>Paste it into your AI agent</strong> — Claude
									(claude.ai), Claude Code, Codex, Cursor, or any client that
									loads{" "}
									<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
										SKILL.md
									</code>
									files. For Claude Code, drop the file into{" "}
									<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
										.claude/skills/stellar-scout/SKILL.md
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
								Community Fund when winners are picked. Match an idea to an
								open brief.
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
								Live DoraHacks feed (SDF + Tellus orgs) + curated Stellar
								events with prize pools, tracks, winners, and outcome funnels.
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
								taxonomy. Scout uses these to frame what to build and which
								SDK to install next.
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
								The Stellar Foundation's 7 official skills — the "how to
								build" layer. Scout chains into them via{" "}
								<code className="text-[11px] px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
									/api/skills
								</code>{" "}
								when the user moves from research to execution.
							</p>
						</div>
					</div>
				</Section>

				{/* Two modes */}
				<Section eyebrow="Two modes" title="Conversational + Deep Dive">
					<div className="grid md:grid-cols-2 gap-4">
						<div className="rounded-xl border border-border bg-card p-5">
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
						<div className="rounded-xl border border-border bg-card p-5">
							<div className="flex items-center gap-2 mb-3">
								<Lightbulb className="w-4 h-4 text-muted-foreground" />
								<h3 className="text-sm font-semibold text-foreground">
									Deep Dive
								</h3>
							</div>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Triggered by <em>"vet this idea"</em> /{" "}
								<em>"should I build"</em>. Runs an 8-step workflow: search
								existing projects → gap classification → competitors → SDK
								recommendation → teammates → funding signal → next steps.
							</p>
						</div>
					</div>
				</Section>

				{/* Gap classification */}
				<Section eyebrow="The strict part" title="Gap classification, no speculation">
					<div className="grid sm:grid-cols-3 gap-3 mb-3">
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
							<div
								key={c.title}
								className="rounded-xl border border-border bg-card p-5"
							>
								<div className="flex items-baseline justify-between mb-3">
									<span className="font-mono text-2xl font-bold text-foreground tracking-tight">
										{c.range}
									</span>
									<span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
										Crowdedness
									</span>
								</div>
								<div className="text-sm font-semibold text-foreground mb-1">
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
					<div className="rounded-xl border border-border bg-card p-5">
						<div className="flex items-start gap-3">
							<div className="w-7 h-7 rounded-lg bg-white/5 border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
								<Award className="w-3.5 h-3.5 text-muted-foreground" />
							</div>
							<div>
								<div className="text-sm font-semibold text-foreground mb-1">
									Evidence floor
								</div>
								<p className="text-xs text-muted-foreground leading-relaxed">
									If the data doesn't support a claim, Scout says so. It won't
									invent competitors, prize amounts, or builder profiles.
									Missing data is reported as <em>"not indexed"</em> — never
									papered over.
								</p>
							</div>
						</div>
					</div>
				</Section>

				{/* Capabilities */}
				<Section eyebrow="What it can answer" title="Six core capabilities">
					<div className="grid sm:grid-cols-2 gap-3">
						{[
							{
								icon: Search,
								title: "Has anyone built this?",
								blurb:
									"Search for existing Stellar projects, hackathon submissions, and SCF-funded work that overlaps your idea.",
							},
							{
								icon: Award,
								title: "Hackathon results",
								blurb:
									"Winners, placements, prize tracks, post-hack survival rates per event.",
							},
							{
								icon: Users,
								title: "Spot Stellar builders",
								blurb:
									"Search the Stellar Passport directory by skill, location, SCF tier. Small and growing — Scout flags gaps and points to Discord/GitHub when results are thin.",
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
								blurb:
									"Native query of confirmed Stellar RFPs (SCF-funded sponsor briefs) via /api/rfps. Match an idea to an open brief, or propose a new brief at stellarlight.xyz/ideas.",
								href: "https://ideas.stellarlight.xyz/",
							},
						].map((cap) => {
							const Icon = cap.icon;
							const inner = (
								<>
									<div className="flex items-center gap-2 mb-2">
										<Icon className="w-4 h-4 text-muted-foreground" />
										<h3 className="text-sm font-semibold text-foreground">
											{cap.title}
										</h3>
										{cap.href && (
											<ExternalLink className="w-3 h-3 text-muted-foreground ml-auto" />
										)}
									</div>
									<p className="text-xs text-muted-foreground leading-relaxed">
										{cap.blurb}
									</p>
								</>
							);
							if (cap.href) {
								return (
									<a
										key={cap.title}
										href={cap.href}
										target="_blank"
										rel="noopener noreferrer"
										className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-white/[0.03] hover:border-white/20"
									>
										{inner}
									</a>
								);
							}
							return (
								<div
									key={cap.title}
									className="rounded-xl border border-border bg-card p-4"
								>
									{inner}
								</div>
							);
						})}
					</div>
				</Section>

				{/* Sample prompts teaser → /scout/examples */}
				<Section eyebrow="Sample prompts" title="Try these in your agent">
					<div className="space-y-2 mb-3">
						{SAMPLE_PROMPTS.slice(0, 3).map((p) => (
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
					<Link
						href="/scout/examples"
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						See all 6 prompts + 5 worked sessions →
					</Link>
				</Section>

				{/* Endpoints teaser → /scout/api-reference */}
				<Section eyebrow="Under the hood" title="Public APIs the skill calls">
					<div className="rounded-xl border border-border/50 bg-card p-6 font-mono text-xs space-y-2 mb-3">
						<div>
							<span className="text-emerald-400">GET</span>{" "}
							<span className="text-foreground">/api/hackathons</span>{" "}
							<span className="text-muted-foreground">
								— curated + DoraHacks live
							</span>
						</div>
						<div>
							<span className="text-emerald-400">GET</span>{" "}
							<span className="text-foreground">/api/projects/search</span>{" "}
							<span className="text-muted-foreground">
								— search existing projects
							</span>
						</div>
						<div>
							<span className="text-emerald-400">GET</span>{" "}
							<span className="text-foreground">/api/rfps</span>{" "}
							<span className="text-muted-foreground">
								— SCF-funded sponsor briefs
							</span>
						</div>
						<div>
							<span className="text-emerald-400">GET</span>{" "}
							<span className="text-foreground">/api/skills</span>{" "}
							<span className="text-muted-foreground">
								— SDF skill catalog
							</span>
						</div>
						<div className="text-muted-foreground/70 pt-1">…and 5 more</div>
					</div>
					<Link
						href="/scout/api-reference"
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						Full API reference (9 endpoints, params, response shapes) →
					</Link>
				</Section>

				{/* FAQ */}
				<Section eyebrow="FAQ" title="Common questions">
					<div className="space-y-3">
						{FAQ.map((qa) => (
							<details
								key={qa.q}
								className="group rounded-xl border border-border/50 bg-card p-5 open:bg-white/[0.02] transition-colors"
							>
								<summary className="cursor-pointer list-none flex items-start justify-between gap-4">
									<span className="text-sm font-medium text-foreground">
										{qa.q}
									</span>
									<span
										className="flex-shrink-0 mt-0.5 text-muted-foreground group-open:rotate-180 transition-transform duration-150"
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

				{/* Footer CTA */}
				<div className="rounded-2xl border border-border/50 bg-card p-8 text-center">
					<h3 className="text-lg font-semibold text-foreground mb-2">
						Ready to validate your hackathon idea?
					</h3>
					<p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
						Copy the skill, paste it into your agent, ask{" "}
						<em>"should I build X on Stellar?"</em>
					</p>
					<ScoutCopyButton label="Copy the skill" />
				</div>
			</main>
		</div>
	);
}
