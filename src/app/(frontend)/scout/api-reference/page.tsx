import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "API Reference · Stellar Scout | Stellar Light",
	description:
		"Endpoint reference for the public read-only APIs that power Stellar Scout — hackathons (curated + DoraHacks), projects search, builders, SDF skills proxy, and ecosystem dev stats.",
};

interface Endpoint {
	method: "GET";
	path: string;
	summary: string;
	params?: Array<{ name: string; type: string; description: string }>;
	returns: string[];
	notes?: string;
}

const ENDPOINTS: Endpoint[] = [
	{
		method: "GET",
		path: "/api/hackathons",
		summary:
			"Merged feed of curated Stellar hackathons (from the Payload directory) and live DoraHacks events (SDF + Tellus orgs). Each row tagged with `source: 'curated' | 'dorahacks'`.",
		params: [
			{
				name: "status",
				type: "string",
				description: "upcoming | active | completed",
			},
			{
				name: "organizer",
				type: "string",
				description: "Slug of organizer entity",
			},
			{
				name: "source",
				type: "string",
				description: "curated | dorahacks (restrict to one feed)",
			},
			{
				name: "limit",
				type: "number",
				description: "Max rows (default 100, max 300)",
			},
		],
		returns: [
			".hackathons[*] — id, name, slug, dates, status, externalUrl, organizer, source, prizePoolUSD (DoraHacks only), hackersCount (DoraHacks only), url",
			".meta.counts.{curated, dorahacks, returned} — coverage stats",
		],
	},
	{
		method: "GET",
		path: "/api/hackathons/{slug}",
		summary:
			"Single curated hackathon detail — submissions, winners, prize-track aggregation, post-hack outcome funnel.",
		returns: [
			".hackathon.stats — totalSubmissions, totalPrizeUSD, winners count, outcome funnel (built / inProgress / abandoned / unknown)",
			".hackathon.tracks[*] — prize tracks derived from past submissions: { name, winnerCount, submissionCount, totalPrizeUSD }",
			".winners[*] — projects that placed",
			".submissions[*] — every submission with placement, prize, track",
		],
		notes:
			"Only works for slugs in the curated Payload Hackathons collection. DoraHacks-sourced slugs return 404 — for those, see the externalUrl in the list endpoint.",
	},
	{
		method: "GET",
		path: "/api/builders",
		summary:
			"Stellar builder directory (synced from Stellar Passport). Small + growing dataset — opt-in profiles only.",
		params: [
			{
				name: "q",
				type: "string",
				description: "Free-text match across bio + role + project names",
			},
			{
				name: "location",
				type: "string",
				description: "Substring match against location field",
			},
			{
				name: "limit",
				type: "number",
				description: "Max rows (default 50, max 200)",
			},
		],
		returns: [
			".builders[*] — githubUsername, displayName, bio, roleTitle, location, projects[], url (a scfTier field exists on rows but is unpopulated — empty for every profile; SCF award history lives on PROJECTS via /api/projects/search)",
		],
		notes:
			"When fewer than 3 builders match, the SKILL.md instructs the agent to surface that explicitly and recommend Stellar Discord #builders + the Stellar GitHub org as fallback channels.",
	},
	{
		method: "GET",
		path: "/api/projects/search",
		summary:
			'Search existing Stellar projects. Keyword-scored matches across name + short description + category. The workhorse for Deep Dive step 2 ("has anyone built this?").',
		params: [
			{ name: "q", type: "string", description: "Keywords to score against" },
			{
				name: "category",
				type: "string",
				description: "Filter by project category",
			},
			{
				name: "hackathon",
				type: "string",
				description: "Filter to one hackathon by slug",
			},
			{
				name: "scfAwarded",
				type: "1",
				description: "Only SCF-funded projects",
			},
			{
				name: "limit",
				type: "number",
				description: "Max rows (default 20, max 100)",
			},
		],
		returns: [
			".projects[*] — scored by keyword overlap, sorted by relevance; includes scfAwarded flag, scfTotalAwardedUSD, hackathon (if any), hackathonPlacement, hackathonPrize, hackathonPrizeTrack",
		],
	},
	{
		method: "GET",
		path: "/api/rfps",
		summary:
			'Confirmed Stellar RFPs / sponsor briefs — problem statements that get funded by the Stellar Community Fund when winners are picked. Native source for "is there an open RFP matching my idea?" Backed by src/data/ideas.ts (curated). Mirrors what\'s on /ideas.',
		params: [
			{
				name: "q",
				type: "string",
				description:
					"Free-text match across title + description + technical requirements + category",
			},
			{
				name: "category",
				type: "string",
				description:
					"ai | consumer-dapps | defi | developer-tooling | gaming | infrastructure | nfts | payments | scf | web3-social",
			},
			{
				name: "quarter",
				type: "string",
				description: "q1-2026 | q2-2026 (more added as new rounds open)",
			},
			{
				name: "limit",
				type: "number",
				description: "Max rows (default 100, max 200)",
			},
		],
		returns: [
			".rfps[*] — id, title, description, technicalRequirements, category, categoryLabel, authorName, quarter, quarterLabel, url",
			".meta.categories, .meta.quarters — full enums for client-side filtering",
			".funding — clarifies that winners are SCF-funded",
		],
	},
	{
		method: "GET",
		path: "/api/skills",
		summary:
			"Catalog of the 7 official Stellar Foundation skills from skills.stellar.org (soroban, dapp, assets, data, agentic-payments, zk-proofs, standards).",
		returns: [
			".skills[*] — name, description, userInvocable, argumentHint, url, rawUrl",
		],
		notes: "Server-cached for 24h via the upstream Next.js revalidate hint.",
	},
	{
		method: "GET",
		path: "/api/skills/{name}",
		summary:
			"Full content of one SDF skill. Use in Deep Dive step 5 (SDK recommendation) to quote/summarize inline before pointing the user at the upstream install URL.",
		returns: [
			".skill.content — full SKILL.md markdown (frontmatter included)",
			".skill.{name, description, userInvocable, argumentHint, url, wordCount}",
		],
	},
	{
		method: "GET",
		path: "/api/leaderboard",
		summary:
			"Stellar ecosystem developer-activity stats and ranked project leaderboard. Backed by the daily Electric Capital snapshot + GitHub Signals.",
		params: [
			{
				name: "sort",
				type: "string",
				description: "activity | stars | issues",
			},
			{
				name: "range",
				type: "string",
				description: "7d | 30d | 90d | 1y | all",
			},
			{
				name: "category",
				type: "string",
				description: "Filter by project category",
			},
			{ name: "limit", type: "number", description: "Max rows (default 50)" },
			{ name: "format", type: "string", description: "json (default) | csv" },
		],
		returns: [
			".ecosystem.{activeDevs28d, commits28d, fullTimeDevs, ...}",
			".projects[*] — ranked",
		],
	},
	{
		method: "GET",
		path: "/api/status",
		summary:
			"Self-check + data freshness. Call this on first invocation so you can surface dataset age in answers.",
		returns: [
			".ok, .service, .version, .generatedAt",
			".sources[*] — per-source { name, count, lastUpdatedAt, notes? }",
			".endpoints[*] — full catalog",
			".docs, .skill — canonical URLs",
		],
	},
];

function MethodBadge({ method }: { method: string }) {
	return (
		<span className="font-mono text-xs px-1.5 py-0.5 rounded bg-emerald-400/10 border border-emerald-400/30 text-emerald-400">
			{method}
		</span>
	);
}

export default function ApiReferencePage() {
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
						API Reference
					</div>
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-3">
						Public endpoints
					</h1>
					<p className="text-muted-foreground max-w-2xl">
						Every endpoint Scout calls is public, read-only, no auth, edge-
						cached (5 minutes for ecosystem data, 24 hours for the SDF skill
						proxy). Hit them from your agent, your dashboard, your{" "}
						<a
							href="https://dune.com"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-foreground"
						>
							Dune
						</a>{" "}
						query, or anywhere else.
					</p>
				</div>

				<div className="space-y-6">
					{ENDPOINTS.map((e) => (
						<div
							key={e.path}
							className="rounded-xl border border-border/50 bg-card p-6"
						>
							<div className="flex items-center gap-3 mb-3 flex-wrap">
								<MethodBadge method={e.method} />
								<code className="font-mono text-sm font-semibold text-foreground">
									{e.path}
								</code>
							</div>
							<p className="text-sm text-muted-foreground leading-relaxed mb-4">
								{e.summary}
							</p>

							{e.params && e.params.length > 0 && (
								<div className="mb-4">
									<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
										Query params
									</div>
									<div className="rounded-lg border border-border/30 bg-black/20 overflow-hidden">
										<table className="w-full text-xs">
											<thead>
												<tr className="border-b border-border/30">
													<th className="text-left px-3 py-2 text-muted-foreground font-medium">
														Name
													</th>
													<th className="text-left px-3 py-2 text-muted-foreground font-medium">
														Type
													</th>
													<th className="text-left px-3 py-2 text-muted-foreground font-medium">
														Description
													</th>
												</tr>
											</thead>
											<tbody>
												{e.params.map((p) => (
													<tr
														key={p.name}
														className="border-b border-border/20 last:border-b-0"
													>
														<td className="px-3 py-2 font-mono text-foreground">
															{p.name}
														</td>
														<td className="px-3 py-2 font-mono text-muted-foreground">
															{p.type}
														</td>
														<td className="px-3 py-2 text-muted-foreground">
															{p.description}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							)}

							<div className="mb-2">
								<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
									Returns
								</div>
								<ul className="space-y-1">
									{e.returns.map((r) => (
										<li
											key={r}
											className="text-xs text-foreground font-mono leading-relaxed pl-4 relative"
										>
											<span className="absolute left-0 text-muted-foreground/60">
												·
											</span>
											{r}
										</li>
									))}
								</ul>
							</div>

							{e.notes && (
								<p className="text-xs text-muted-foreground/80 mt-3 pt-3 border-t border-border/30">
									{e.notes}
								</p>
							)}
						</div>
					))}
				</div>

				<div className="mt-12 rounded-xl border border-border/50 bg-card p-6">
					<h3 className="text-sm font-semibold text-foreground mb-2">Source</h3>
					<p className="text-sm text-muted-foreground leading-relaxed">
						All endpoints live in{" "}
						<a
							href="https://github.com/Stellar-Light/stellarlight/tree/main/src/app/api"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-foreground inline-flex items-center gap-1"
						>
							Stellar-Light/stellarlight
							<ExternalLink className="w-3 h-3" />
						</a>
						. The skill manifest that documents them is in{" "}
						<a
							href="https://github.com/Stellar-Light/stellar-scout"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-foreground inline-flex items-center gap-1"
						>
							Stellar-Light/stellar-scout
							<ExternalLink className="w-3 h-3" />
						</a>
						.
					</p>
				</div>
			</main>
		</div>
	);
}
