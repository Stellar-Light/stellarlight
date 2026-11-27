import type Anthropic from "@anthropic-ai/sdk";

export type AskSourceType =
	| "partner"
	| "project"
	| "research"
	| "builder"
	| "person"
	| "repo"
	| "hackathon"
	| "build"
	| "rfp"
	| "audit";

export interface AskSource {
	type: AskSourceType;
	title: string;
	snippet: string;
	url: string;
}

type Row = Record<string, unknown>;
type Property = { type: "string"; description: string; enum?: string[] };

interface AskTool {
	name: string;
	description: string;
	properties: Record<string, Property>;
	path: string;
	toSources: (data: Row) => AskSource[];
}

const RESULTS_PER_TOOL = 5;

const text = (value: unknown) => (typeof value === "string" ? value : "");
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value : []);
const day = (value: unknown) => text(value).slice(0, 10);
const joined = (...parts: string[]) => parts.filter(Boolean).join(". ");

export function clean(value: string | null | undefined, n = 500): string {
	if (!value) return "";
	const c = value
		.replace(/[#*`>_]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return c.length > n ? `${c.slice(0, n)}…` : c;
}

const q = (description: string): Property => ({ type: "string", description });

const TOOLS: AskTool[] = [
	{
		name: "search_builders",
		description:
			"Find people building on Stellar by name, GitHub handle, location, skill or project. Returns the profile (bio, role, location, links) and the Stellar repos they have committed to with stars and last commit. Use for any 'who is X' question about a person that is not Stellar Development Foundation staff.",
		properties: {
			q: q("Name, GitHub handle or skill, e.g. 'devodii' or 'rust'."),
			location: q("Optional location filter, e.g. 'Nigeria'."),
		},
		path: "/api/builders",
		toSources: (data) =>
			rows(data.builders).map((b) => {
				const handle = text(b.githubUsername);
				const location = text(b.location);
				const repos = rows(b.codeEvidence)
					.slice(0, 4)
					.map(
						(r) =>
							`${text(r.fullName)} (${text(r.primaryLanguage) || "n/a"}, ${String(r.stars ?? 0)} stars, last commit ${day(r.lastCommitAt)})`,
					)
					.join("; ");
				return {
					type: "builder",
					title: `${text(b.displayName) || handle} (@${handle})`,
					snippet: joined(
						text(b.roleTitle),
						location === "*" ? "" : location,
						text(b.bio),
						repos ? `Stellar repos: ${repos}` : "",
					),
					url: `/builders/${handle}`,
				};
			}),
	},
	{
		name: "search_people",
		description:
			"Look up Stellar Development Foundation leadership, board members and advisors by name or role.",
		properties: {
			q: q("Name or role, e.g. 'CEO' or 'Denelle'."),
			section: {
				type: "string",
				description: "Optional group to list, for example the whole board.",
				enum: ["Leadership", "Board of directors", "Advisors"],
			},
		},
		path: "/api/people",
		toSources: (data) =>
			rows(data.people).map((p) => ({
				type: "person",
				title: text(p.name),
				snippet: `${text(p.role)}, ${text(p.org)} (${text(p.section)}). Observed ${text(p.observedAt)}`,
				url: text(p.sourceUrl),
			})),
	},
	{
		name: "search_projects",
		description:
			"Search the curated directory of Stellar projects: what exists, its category, status and SCF funding. Use for 'has anyone built X', competitors and project profiles.",
		properties: {
			q: q("What the project does or its name."),
		},
		path: "/api/projects/search",
		toSources: (data) =>
			rows(data.projects).map((p) => ({
				type: "project",
				title: text(p.name) || text(p.slug),
				snippet: clean(text(p.shortDescription) || text(p.description)),
				url: `/project/${text(p.slug)}`,
			})),
	},
	{
		name: "search_partners",
		description:
			"Find vetted providers to hire or integrate: audit firms, anchors, on and off ramps, wallets, infrastructure, legal, agencies.",
		properties: {
			q: q("What the team needs, or a provider name."),
			type: {
				type: "string",
				description: "Optional provider type.",
				enum: [
					"anchor",
					"on-off-ramp",
					"infrastructure",
					"tooling",
					"protocol",
					"wallet",
					"audit-firm",
					"legal",
					"agency",
					"asset-issuer",
				],
			},
		},
		path: "/api/partners",
		toSources: (data) =>
			rows(data.partners).map((p) => ({
				type: "partner",
				title: text(p.name) || text(p.slug),
				snippet: clean(text(p.tagline) || text(p.description)),
				url: `/partners/${text(p.slug)}`,
			})),
	},
	{
		name: "search_research",
		description:
			"Search the Stellar knowledge base: SEPs and CAPs, developer docs, the SCF Handbook, SCF proposals, SDF blog posts, papers, audit reports and release notes. Use for how things work and for what a person or team wrote in a proposal.",
		properties: {
			q: q(
				"Short: a bare name or the key noun phrase only, such as 'Emmanuel Odii' or 'trustline'. Never add words like 'SCF submission' or 'profile'.",
			),
			source: {
				type: "string",
				description: "Optional source filter.",
				enum: [
					"sdf-blog",
					"scf-handbook",
					"sep",
					"cap",
					"dev-docs",
					"paper",
					"scf-proposal",
					"audit",
					"incident",
					"release",
				],
			},
		},
		path: "/api/research",
		toSources: (data) =>
			rows(data.results).map((r) => ({
				type: "research",
				title: text(r.title),
				snippet: clean(text(r.content)),
				url: text(r.url),
			})),
	},
	{
		name: "search_repos",
		description:
			"Find open-source Stellar and Soroban GitHub repositories ranked by activity and traction. Use for 'where is the code for X' and starter code.",
		properties: {
			q: q("Topic, library or repo name."),
			language: q("Optional primary language, e.g. 'Rust'."),
		},
		path: "/api/repos/search",
		toSources: (data) =>
			rows(data.repos).map((r) => ({
				type: "repo",
				title: text(r.fullName),
				snippet: joined(
					clean(text(r.description), 200),
					`${text(r.primaryLanguage) || "n/a"}, ${String(r.stars ?? 0)} stars, ${text(r.activityState)}, last commit ${day(r.lastCommitAt)}`,
				),
				url: text(r.url),
			})),
	},
	{
		name: "get_hackathons",
		description:
			"List Stellar hackathons with dates, prize pool and status. Use for what is open or upcoming and for event details.",
		properties: {
			status: {
				type: "string",
				description: "Event status.",
				enum: ["upcoming", "active", "completed"],
			},
			q: q("Optional event name or topic."),
		},
		path: "/api/hackathons",
		toSources: (data) =>
			rows(data.hackathons).map((h) => ({
				type: "hackathon",
				title: text(h.name),
				snippet: joined(
					`${text(h.status)}, ${day(h.startDate)} to ${day(h.endDate)}${h.prizePoolUSD ? `, $${String(h.prizePoolUSD)} prize pool` : ""}`,
					clean(text(h.description), 300),
				),
				url: `/hackathons/${text(h.slug)}`,
			})),
	},
	{
		name: "search_hackathon_builds",
		description:
			"Search hackathon submissions: what teams built, placement and prizes, repo and stack. Use for hackathon prior art and winners.",
		properties: {
			q: q("What the submission does, a technology, or a team."),
			hackathon: q("Optional hackathon slug, e.g. 'hackmeridian-2026'."),
			winnersOnly: {
				type: "string",
				description: "Set to '1' to return winners only.",
				enum: ["1"],
			},
		},
		path: "/api/hackathons/builds",
		toSources: (data) =>
			rows(data.builds).map((b) => ({
				type: "build",
				title: `${text(b.name)} (${text(b.hackathon)})`,
				snippet: joined(
					text(b.placement) || text(b.award) || (b.isWinner ? "Winner" : ""),
					clean(text(b.description), 300),
					Array.isArray(b.stack)
						? `Stack: ${b.stack.slice(0, 5).join(", ")}`
						: "",
				),
				url: text(b.githubUrl) || text(b.url),
			})),
	},
	{
		name: "get_rfps",
		description:
			"List open and closed SCF rounds and sponsor RFPs with deadlines. Use for funding opportunities and submission dates.",
		properties: {
			status: {
				type: "string",
				description: "Open or closed.",
				enum: ["open", "closed"],
			},
			q: q("Optional topic."),
		},
		path: "/api/rfps",
		toSources: (data) =>
			rows(data.rfps).map((r) => ({
				type: "rfp",
				title: text(r.title),
				snippet: joined(
					`${text(r.status)}, ${text(r.quarterLabel)}`,
					clean(text(r.description), 350),
				),
				url: text(r.url),
			})),
	},
	{
		name: "get_audits",
		description:
			"Look up published security audit reports by project or auditor. Absence of a report does not mean a project is unaudited.",
		properties: {
			project: q("Project or protocol name."),
			auditor: q("Audit firm name."),
		},
		path: "/api/audits",
		toSources: (data) =>
			rows(data.audits).map((a) => ({
				type: "audit",
				title: text(a.title),
				snippet: `${text(a.auditor)} audited ${text(a.protocol)}, published ${day(a.publishedAt)}`,
				url: text(a.reportUrl),
			})),
	},
];

export const ASK_TOOLS: Anthropic.Tool[] = TOOLS.map((t) => ({
	name: t.name,
	description: t.description,
	input_schema: {
		type: "object",
		properties: t.properties,
		additionalProperties: false,
	},
}));

export async function runAskTool(
	name: string,
	input: unknown,
	base: string,
	signal: AbortSignal,
): Promise<AskSource[] | null> {
	const tool = TOOLS.find((t) => t.name === name);
	if (!tool) return null;
	const params = new URLSearchParams({ limit: String(RESULTS_PER_TOOL) });
	const args = (input ?? {}) as Row;
	for (const key of Object.keys(tool.properties)) {
		const value = text(args[key]).trim().slice(0, 200);
		if (value) params.set(key, value);
	}
	try {
		const res = await fetch(`${base}${tool.path}?${params}`, { signal });
		if (!res.ok) return null;
		return tool.toSources((await res.json()) as Row);
	} catch {
		return null;
	}
}
