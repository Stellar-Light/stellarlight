/**
 * Hardcoded skill entries we curate ourselves — Stellarlight's own skills
 * and trusted third-party skills (lumenloop, future SDK skills, etc.).
 *
 * These don't need an admin UI because we control them directly. Community
 * submissions go through the `community-skills` Payload collection with
 * moderation queue; SDF skills come from the skills.stellar.org proxy.
 *
 * The skills marketplace merges all three sources into one unified
 * `/api/skills` response.
 */

export type CuratedSkillSource = "stellarlight" | "lumenloop" | "external";

export type CuratedSkillKind =
	| "skill-md" // a SKILL.md installable via the vercel-labs/skills CLI
	| "mcp-server" // a Model Context Protocol server
	| "sdk" // a library you import in your code (Stellar SDK, protocol SDKs)
	| "cli" // a command-line tool you run
	| "agent-kit" // SDK specifically designed for AI agents to use (none on Stellar yet — will exist after Phase 2)
	| "tool"; // anything else (oracles, indexers, infrastructure)

export interface CuratedSkill {
	/** Stable kebab-case slug used in URLs and as the dedup key. */
	slug: string;
	/** Display name shown on the card. */
	name: string;
	/** Short one-line tagline (≤ 120 chars). */
	tagline: string;
	/** Longer description (1-2 paragraphs). */
	description: string;
	/** Curator source. */
	source: CuratedSkillSource;
	/** What kind of tool this is. */
	kind: CuratedSkillKind;
	/**
	 * The exact install command shown on the card.
	 * Example: "npx skills add Stellar-Light/stellar-scout"
	 * Or for MCP servers: "npx @stellar-light/scout-mcp"
	 */
	install: string;
	/** Optional secondary install commands (e.g. per agent). */
	installAlt?: { label: string; command: string }[];
	/** Repository URL (GitHub usually). */
	repository?: string;
	/** Homepage / landing page URL. */
	homepage?: string;
	/** Documentation URL. */
	docs?: string;
	/** Compatible agents (claude-code, cursor, chatgpt, gemini, etc.). */
	compatibility: string[];
	/** Who's it for. */
	targetUser: ("dev" | "founder" | "agent")[];
	/** Tags shown as chips on the card. */
	tags: string[];
	/** Whether to highlight this entry visually. */
	featured?: boolean;
}

/**
 * The curated catalog. To add a new entry, append it here and it shows
 * up in the marketplace on next deploy.
 */
export const CURATED_SKILLS: CuratedSkill[] = [
	{
		slug: "stellar-scout",
		name: "Stellar Scout",
		tagline:
			"Vet ideas, match SCF RFPs, scan audits, map competitors, connect with builders — your AI analyst for building on Stellar.",
		description:
			"AI skill that turns your coding agent into a Stellar ecosystem analyst. Vets ideas against existing projects, matches open SCF-funded RFPs, surfaces audit findings with severity, cites primary sources (SEPs, papers, lumenloop, EC reports). 8-step Deep Dive workflow with gap classification.",
		source: "stellarlight",
		kind: "skill-md",
		install: "npx skills add Stellar-Light/stellar-scout",
		installAlt: [
			{
				label: "Codex",
				command: "npx skills add Stellar-Light/stellar-scout -a codex",
			},
			{
				label: "OpenClaw",
				command: "npx skills add Stellar-Light/stellar-scout -a openclaw",
			},
		],
		repository: "https://github.com/Stellar-Light/stellar-scout",
		homepage: "https://stellarlight.xyz/scout",
		docs: "https://stellarlight.xyz/skills/stellar-scout.md",
		compatibility: [
			"Claude Code",
			"Codex",
			"Cursor",
			"OpenClaw",
			"Amp",
			"Cline",
			"Antigravity",
		],
		targetUser: ["dev", "founder", "agent"],
		tags: ["research", "strategy", "audits", "SCF", "RFPs"],
		featured: true,
	},
	{
		slug: "stellar-scout-mcp",
		name: "Stellar Scout MCP",
		tagline:
			"Idea vetting, SCF radar, audit intel, competitor & repo search, builder discovery — Scout's full API as native MCP tools for Claude.ai, ChatGPT, Gemini, Cursor.",
		description:
			"MCP server wrapping Scout's full public API as native callable tools, each with use-case-driven descriptions so agents know when to reach for which. Reach the AI clients that don't load SKILL.md (Claude desktop, Cursor MCP mode, ChatGPT custom GPTs, Gemini, Cline, Continue, Zed). Same backend as the SKILL.md version.",
		source: "stellarlight",
		kind: "mcp-server",
		install: "npx @stellar-light/scout-mcp",
		repository: "https://github.com/Stellar-Light/scout-mcp",
		homepage: "https://stellarlight.xyz/scout",
		compatibility: [
			"Claude Desktop",
			"Cursor (MCP)",
			"ChatGPT (custom GPT)",
			"Gemini",
			"Cline",
			"Continue",
			"Zed",
		],
		targetUser: ["dev", "founder", "agent"],
		tags: ["research", "MCP", "strategy", "audits"],
		featured: true,
	},
	{
		slug: "lumenloop-mcp",
		name: "LumenLoop MCP",
		tagline:
			"Read-only Stellar ecosystem MCP — 18 tools over projects, SCF, news, media.",
		description:
			"Free read-only MCP server at https://mcp.lumenloop.com indexing 756+ Stellar projects, 912+ SCF submissions, editorial content, talks, and events. 18 query tools — projects, submissions, articles, media, events. Any MCP-capable client connects (Claude, ChatGPT, Gemini, Cursor). One-time sign-in.",
		source: "lumenloop",
		kind: "mcp-server",
		install:
			"claude mcp add --transport http lumenloop https://mcp.lumenloop.com",
		repository: "https://github.com/lumenloop/lumenloop-skills",
		homepage: "https://lumenloop.com/",
		docs: "https://github.com/lumenloop/lumenloop-skills#connect-the-server",
		compatibility: [
			"Claude Desktop",
			"Claude.ai",
			"Claude Code",
			"ChatGPT",
			"Gemini",
			"Cursor (MCP)",
		],
		targetUser: ["dev", "founder", "agent"],
		tags: ["search", "MCP", "ecosystem", "research"],
	},

	// ── LumenLoop Claude Agent Skills (playbooks on top of their MCP) ────────

	{
		slug: "lumenloop-mcp-connect",
		name: "LumenLoop: MCP Connect",
		tagline:
			"Wire the LumenLoop MCP into your agent and learn what each tool does.",
		description:
			"The starting-point skill from lumenloop-skills. Walks the agent through connecting to LumenLoop's MCP server, explains each of the 18 read-only tools, and tells the agent which downstream LumenLoop skill to invoke for different research questions.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/lumenloop-skills",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install lumenloop-skills@lumenloop",
			},
		],
		repository:
			"https://github.com/lumenloop/lumenloop-skills/tree/main/skills/lumenloop-mcp-connect",
		homepage: "https://github.com/lumenloop/lumenloop-skills",
		compatibility: ["Claude Code"],
		targetUser: ["dev", "agent"],
		tags: ["MCP", "lumenloop", "connector", "setup"],
	},
	{
		slug: "lumenloop-ecosystem-scout",
		name: "LumenLoop: Stellar Ecosystem Scout",
		tagline:
			"Map a sector or topic into a landscape of Stellar projects + content.",
		description:
			'Given a sector (e.g. "RWA", "agentic payments", "stablecoin off-ramps") or topic, this skill orchestrates the LumenLoop MCP tools to produce a landscape map — every relevant project, related SCF submissions, editorial coverage, and media. Useful for ecosystem-wide *"who\'s building in X"* questions.',
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/lumenloop-skills",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install lumenloop-skills@lumenloop",
			},
		],
		repository:
			"https://github.com/lumenloop/lumenloop-skills/tree/main/skills/stellar-ecosystem-scout",
		homepage: "https://github.com/lumenloop/lumenloop-skills",
		compatibility: ["Claude Code"],
		targetUser: ["dev", "founder", "agent"],
		tags: ["research", "landscape", "discovery", "lumenloop"],
	},
	{
		slug: "lumenloop-project-dossier",
		name: "LumenLoop: Project Dossier",
		tagline: "Build a due-diligence profile of a single Stellar project.",
		description:
			"Given a project slug, the agent pulls every signal from LumenLoop's MCP — basic info, SCF history, associated team, recent activity, content coverage — and assembles a structured due-diligence dossier. Useful before integrations, partnerships, or vetting an unknown project.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/lumenloop-skills",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install lumenloop-skills@lumenloop",
			},
		],
		repository:
			"https://github.com/lumenloop/lumenloop-skills/tree/main/skills/stellar-project-dossier",
		homepage: "https://github.com/lumenloop/lumenloop-skills",
		compatibility: ["Claude Code"],
		targetUser: ["dev", "founder", "agent"],
		tags: ["due-diligence", "research", "project-profile", "lumenloop"],
	},
	{
		slug: "lumenloop-scf-radar",
		name: "LumenLoop: SCF Submission Radar",
		tagline: "Position an SCF idea against prior submissions before you apply.",
		description:
			"Given an idea, the skill searches prior SCF submissions for overlap, surfaces gap-vs-saturation signal, identifies adjacent funded teams, and recommends differentiation angles. Run this before writing an SCF application.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/lumenloop-skills",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install lumenloop-skills@lumenloop",
			},
		],
		repository:
			"https://github.com/lumenloop/lumenloop-skills/tree/main/skills/scf-submission-radar",
		homepage: "https://github.com/lumenloop/lumenloop-skills",
		compatibility: ["Claude Code"],
		targetUser: ["founder", "agent"],
		tags: ["SCF", "research", "funding", "lumenloop"],
	},
	{
		slug: "lumenloop-integration-finder",
		name: "LumenLoop: Integration Finder",
		tagline:
			"Find the right wallet / oracle / anchor / RWA / DEX to integrate.",
		description:
			'Given an integration need (e.g. "oracle for soroban contract", "USDC anchor in Brazil"), the skill walks LumenLoop\'s project catalog and returns ranked integration candidates with rationale, plus the contact / docs link for each.',
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/lumenloop-skills",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install lumenloop-skills@lumenloop",
			},
		],
		repository:
			"https://github.com/lumenloop/lumenloop-skills/tree/main/skills/stellar-integration-finder",
		homepage: "https://github.com/lumenloop/lumenloop-skills",
		compatibility: ["Claude Code"],
		targetUser: ["dev", "founder", "agent"],
		tags: ["integration", "partners", "discovery", "lumenloop"],
	},
	{
		slug: "lumenloop-ecosystem-digest",
		name: "LumenLoop: Ecosystem Digest",
		tagline: "Dated digest of recent activity on a theme or entity.",
		description:
			'Pulls recent news, SCF round movement, project updates, and media coverage tied to a theme (e.g. "stablecoins") or specific entity. Output is a dated digest you can publish, share, or use as briefing prep.',
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/lumenloop-skills",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install lumenloop-skills@lumenloop",
			},
		],
		repository:
			"https://github.com/lumenloop/lumenloop-skills/tree/main/skills/stellar-ecosystem-digest",
		homepage: "https://github.com/lumenloop/lumenloop-skills",
		compatibility: ["Claude Code"],
		targetUser: ["dev", "founder", "agent"],
		tags: ["digest", "news", "briefing", "lumenloop"],
	},
	{
		slug: "lumenloop-builder-quickstart",
		name: "LumenLoop: Builder Quickstart",
		tagline: "Idea → Stellar primitives → prior art → a build path.",
		description:
			"Given a builder's idea, the skill maps it to the Stellar primitives required (Soroban contracts, anchors, SEP standards, wallets), surfaces relevant prior art from the ecosystem, and recommends a concrete build path. Useful for hackathon entrants or first-time Stellar builders.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/lumenloop-skills",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install lumenloop-skills@lumenloop",
			},
		],
		repository:
			"https://github.com/lumenloop/lumenloop-skills/tree/main/skills/stellar-builder-quickstart",
		homepage: "https://github.com/lumenloop/lumenloop-skills",
		compatibility: ["Claude Code"],
		targetUser: ["dev", "agent"],
		tags: ["quickstart", "hackathon", "research", "lumenloop"],
	},
	{
		slug: "lumenloop-content-auditor",
		name: "LumenLoop: Content Auditor",
		tagline:
			"Audit a draft against the ecosystem — fix handles, add citations, flag bad claims.",
		description:
			"Given a draft article, blog post, tweet, or pitch, the skill cross-references it against LumenLoop's ecosystem data to fix mis-attributed @handles, add citations to relevant projects, and flag claims that don't hold up against indexed reality.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/lumenloop-skills",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install lumenloop-skills@lumenloop",
			},
		],
		repository:
			"https://github.com/lumenloop/lumenloop-skills/tree/main/skills/stellar-content-auditor",
		homepage: "https://github.com/lumenloop/lumenloop-skills",
		compatibility: ["Claude Code"],
		targetUser: ["founder", "agent"],
		tags: ["content", "audit", "citations", "lumenloop"],
	},

	// ── LumenLoop SCF Skills (awesome-stellar-community-fund plugin) ─────────
	// The ten Stellar Community Fund skills — the "one service offering" for
	// SCF applications and reviews, distributed through the marketplace so
	// founders and reviewers reach them here. Install the whole plugin once
	// (`/plugin marketplace add lumenloop/awesome-stellar-community-fund` →
	// `/plugin install awesome-stellar-community-fund@awesome-scf`); each entry
	// links its individual SKILL.md.
	{
		slug: "scf-submission-drafter",
		name: "SCF Submission Drafter",
		tagline:
			"Draft a complete SCF Build Award application interactively, section by section.",
		description:
			"Walks you through a full Stellar Community Fund Build Award application one section at a time — problem, solution, integration, team, traction, budget, and ecosystem commitment — producing submission-ready copy grounded in what SCF reviewers actually score.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/awesome-stellar-community-fund",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install awesome-stellar-community-fund@awesome-scf",
			},
		],
		repository:
			"https://github.com/lumenloop/awesome-stellar-community-fund/tree/main/skills/scf-submission-drafter",
		homepage: "https://github.com/lumenloop/awesome-stellar-community-fund",
		compatibility: ["Claude Code"],
		targetUser: ["founder", "agent"],
		tags: ["SCF", "funding", "grants", "application", "drafting"],
	},
	{
		slug: "scf-interest-form-drafter",
		name: "SCF Interest Form Drafter",
		tagline: "Draft a strong SCF Interest Form to get invited to apply.",
		description:
			"Drafts a compelling Stellar Community Fund Interest Form — the gate to a Build Award invitation. Sharpens the one-liner, problem framing, and Stellar-fit so the SCF team invites you to the full application.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/awesome-stellar-community-fund",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install awesome-stellar-community-fund@awesome-scf",
			},
		],
		repository:
			"https://github.com/lumenloop/awesome-stellar-community-fund/tree/main/skills/scf-interest-form-drafter",
		homepage: "https://github.com/lumenloop/awesome-stellar-community-fund",
		compatibility: ["Claude Code"],
		targetUser: ["founder", "agent"],
		tags: ["SCF", "funding", "grants", "interest-form"],
	},
	{
		slug: "scf-prescreen-checker",
		name: "SCF Prescreen Checker",
		tagline:
			"Simulate the SCF team's manual prescreen (completeness + eligibility) before you submit.",
		description:
			"Runs your draft through a simulation of the Stellar Community Fund's manual prescreen — the completeness and eligibility pass an application must clear before review — so you catch disqualifiers and gaps before you submit, not after.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/awesome-stellar-community-fund",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install awesome-stellar-community-fund@awesome-scf",
			},
		],
		repository:
			"https://github.com/lumenloop/awesome-stellar-community-fund/tree/main/skills/scf-prescreen-checker",
		homepage: "https://github.com/lumenloop/awesome-stellar-community-fund",
		compatibility: ["Claude Code"],
		targetUser: ["founder", "agent"],
		tags: ["SCF", "funding", "eligibility", "prescreen"],
	},
	{
		slug: "scf-budget-builder",
		name: "SCF Budget Builder",
		tagline:
			"Build bottom-up SCF budgets with rates, per-deliverable breakdowns, and tranche mapping.",
		description:
			"Builds a defensible Stellar Community Fund budget from the bottom up — hourly/role rates, per-deliverable cost breakdowns, and mapping to the award's tranche structure — so the numbers hold up under reviewer scrutiny.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/awesome-stellar-community-fund",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install awesome-stellar-community-fund@awesome-scf",
			},
		],
		repository:
			"https://github.com/lumenloop/awesome-stellar-community-fund/tree/main/skills/scf-budget-builder",
		homepage: "https://github.com/lumenloop/awesome-stellar-community-fund",
		compatibility: ["Claude Code"],
		targetUser: ["founder", "agent"],
		tags: ["SCF", "funding", "budget", "tranches"],
	},
	{
		slug: "scf-competitor-analyst",
		name: "SCF Competitor Analyst",
		tagline:
			"Research the competitive landscape and articulate your differentiation for SCF.",
		description:
			"Maps the competitive landscape for your Stellar Community Fund idea — who else is building this on Stellar and beyond — and helps you articulate crisp differentiation, the section SCF reviewers use to judge whether an award is additive.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/awesome-stellar-community-fund",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install awesome-stellar-community-fund@awesome-scf",
			},
		],
		repository:
			"https://github.com/lumenloop/awesome-stellar-community-fund/tree/main/skills/scf-competitor-analyst",
		homepage: "https://github.com/lumenloop/awesome-stellar-community-fund",
		compatibility: ["Claude Code"],
		targetUser: ["founder", "agent"],
		tags: ["SCF", "funding", "competitors", "differentiation"],
	},
	{
		slug: "scf-referral-preparer",
		name: "SCF Referral Preparer",
		tagline:
			"Prepare materials for an SCF referral from an approved Referrer.",
		description:
			"Prepares the materials an approved Stellar Community Fund Referrer (Ambassador, Navigator, Pilot, partner, or SDF personnel) needs to refer you — a tight brief that makes the referral easy to give and credible to the SCF team.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/awesome-stellar-community-fund",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install awesome-stellar-community-fund@awesome-scf",
			},
		],
		repository:
			"https://github.com/lumenloop/awesome-stellar-community-fund/tree/main/skills/scf-referral-preparer",
		homepage: "https://github.com/lumenloop/awesome-stellar-community-fund",
		compatibility: ["Claude Code"],
		targetUser: ["founder", "agent"],
		tags: ["SCF", "funding", "referral"],
	},
	{
		slug: "scf-tranche-reporter",
		name: "SCF Tranche Reporter",
		tagline:
			"Write SCF tranche submission reports with deliverable evidence and completion docs.",
		description:
			"Writes the tranche submission reports a funded Stellar Community Fund project owes between payments — deliverable-by-deliverable evidence and completion documentation formatted the way the SCF team expects, so your next tranche clears cleanly.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/awesome-stellar-community-fund",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install awesome-stellar-community-fund@awesome-scf",
			},
		],
		repository:
			"https://github.com/lumenloop/awesome-stellar-community-fund/tree/main/skills/scf-tranche-reporter",
		homepage: "https://github.com/lumenloop/awesome-stellar-community-fund",
		compatibility: ["Claude Code"],
		targetUser: ["founder", "agent"],
		tags: ["SCF", "funding", "tranches", "reporting"],
	},
	{
		slug: "scf-reviewer",
		name: "SCF Reviewer",
		tagline:
			"Review a single SCF Build Award application with structured, calibrated scoring.",
		description:
			"For reviewers: evaluates one Stellar Community Fund Build Award application with structured scoring across integration fit, architecture, team, traction, budget, and ecosystem commitment — the same axes SCF weighs — for consistent, defensible verdicts.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/awesome-stellar-community-fund",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install awesome-stellar-community-fund@awesome-scf",
			},
		],
		repository:
			"https://github.com/lumenloop/awesome-stellar-community-fund/tree/main/skills/scf-reviewer",
		homepage: "https://github.com/lumenloop/awesome-stellar-community-fund",
		compatibility: ["Claude Code"],
		targetUser: ["founder", "agent"],
		tags: ["SCF", "review", "scoring", "evaluation"],
	},
	{
		slug: "scf-round-reviewer",
		name: "SCF Round Reviewer",
		tagline:
			"Review and rank an entire SCF round end-to-end from a CSV export.",
		description:
			"For reviewers running a whole Stellar Community Fund round: takes a CSV export and orchestrates parallel batch reviews, cross-application calibration, and a final ranking across Open, Integration, and RFP tracks with track-specific scoring. Pairs with the scf-review-boilerplate for a turnkey setup.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/awesome-stellar-community-fund",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install awesome-stellar-community-fund@awesome-scf",
			},
		],
		repository:
			"https://github.com/lumenloop/awesome-stellar-community-fund/tree/main/skills/scf-round-reviewer",
		homepage: "https://github.com/lumenloop/awesome-stellar-community-fund",
		compatibility: ["Claude Code"],
		targetUser: ["founder", "agent"],
		tags: ["SCF", "review", "ranking", "round", "calibration"],
	},
	{
		slug: "scf-fetch-external-doc",
		name: "SCF Fetch External Doc",
		tagline:
			"Fetch external docs linked in SCF submissions — Google Docs/Drive, GitHub, Notion, IPFS.",
		description:
			"A utility for SCF reviewers and applicants: reliably fetches the external documents submissions link out to — Google Docs, Google Drive PDFs, GitHub, Notion, IPFS — using curl for the Google cases that normally fail, so review context is never missing.",
		source: "lumenloop",
		kind: "skill-md",
		install: "/plugin marketplace add lumenloop/awesome-stellar-community-fund",
		installAlt: [
			{
				label: "Install plugin",
				command: "/plugin install awesome-stellar-community-fund@awesome-scf",
			},
		],
		repository:
			"https://github.com/lumenloop/awesome-stellar-community-fund/tree/main/skills/fetch-external-doc",
		homepage: "https://github.com/lumenloop/awesome-stellar-community-fund",
		compatibility: ["Claude Code"],
		targetUser: ["dev", "agent"],
		tags: ["SCF", "review", "utility", "fetch"],
	},

	// ── Stellar SDKs & libraries ─────────────────────────────────────────────

	{
		slug: "openzeppelin-stellar-contracts",
		name: "OpenZeppelin Stellar Contracts",
		tagline:
			"Audited Soroban contract primitives — tokens, ownership, governance.",
		description:
			"OpenZeppelin's official Stellar contracts library for Soroban. Provides audited building blocks: fungible tokens, non-fungible tokens, access control (Ownable, AccessControl), upgradeability, governance, and pausable mechanisms. Reduces audit surface area by using battle-tested primitives instead of writing your own.",
		source: "external",
		kind: "sdk",
		install: "cargo add openzeppelin-stellar-contracts",
		repository: "https://github.com/OpenZeppelin/stellar-contracts",
		homepage: "https://docs.openzeppelin.com/stellar-contracts/",
		compatibility: ["Soroban (Rust)"],
		targetUser: ["dev"],
		tags: ["soroban", "library", "rust", "audited", "security"],
	},
	{
		slug: "soroswap-sdk",
		name: "Soroswap SDK",
		tagline: "TypeScript SDK for the Soroswap AMM (DEX on Soroban).",
		description:
			"Official TypeScript SDK from Soroswap for interacting with their automated market maker. Quote prices, execute swaps, add or remove liquidity, query pair reserves and pool stats — all from JavaScript / TypeScript agents.",
		source: "external",
		kind: "sdk",
		install: "npm install @soroswap/sdk",
		repository: "https://github.com/soroswap/core",
		homepage: "https://soroswap.finance/",
		compatibility: ["Node.js", "Browser", "TypeScript"],
		targetUser: ["dev", "agent"],
		tags: ["DEX", "AMM", "soroban", "typescript"],
	},
	{
		slug: "stellar-sdk",
		name: "Stellar SDK",
		tagline: "Official JavaScript SDK for the Stellar network + Soroban.",
		description:
			"Official @stellar/stellar-sdk. Build transactions, manage accounts, interact with Soroban smart contracts, parse XDR, sign with keypairs or Freighter. The foundation for every Stellar agent and dapp written in JavaScript / TypeScript.",
		source: "external",
		kind: "sdk",
		install: "npm install @stellar/stellar-sdk",
		repository: "https://github.com/stellar/js-stellar-sdk",
		homepage: "https://stellar.github.io/js-stellar-sdk/",
		docs: "https://developers.stellar.org/docs/tools/sdks/client-sdks",
		compatibility: ["Node.js", "Browser", "TypeScript"],
		targetUser: ["dev", "agent"],
		tags: ["SDK", "stellar", "soroban", "typescript", "official"],
	},
	{
		slug: "stellar-cli",
		name: "Stellar CLI",
		tagline:
			"Official command-line tool for Stellar + Soroban contract deploy.",
		description:
			"The official `stellar` CLI — build, deploy, and invoke Soroban contracts; manage accounts; sign and submit transactions; inspect network state. Required for almost every Soroban dev workflow.",
		source: "external",
		kind: "cli",
		install: "cargo install --locked stellar-cli",
		repository: "https://github.com/stellar/stellar-cli",
		homepage: "https://developers.stellar.org/docs/tools/cli/install-cli",
		compatibility: ["Soroban", "Stellar"],
		targetUser: ["dev"],
		tags: ["CLI", "soroban", "official", "deploy"],
	},
	{
		slug: "blend-sdk",
		name: "Blend SDK",
		tagline: "TypeScript SDK for Blend Capital's Soroban lending protocol.",
		description:
			"Official Blend Protocol SDK. Deposit, borrow, repay, liquidate, and read positions across Blend's permissionless lending pools. Includes typed helpers for pool config, reserve data, and emissions tracking.",
		source: "external",
		kind: "sdk",
		install: "npm install @blend-capital/blend-sdk",
		repository: "https://github.com/blend-capital/blend-sdk-js",
		homepage: "https://blend.capital/",
		compatibility: ["Node.js", "Browser", "TypeScript"],
		targetUser: ["dev", "agent"],
		tags: ["lending", "DeFi", "soroban", "typescript"],
	},
	{
		slug: "reflector-network",
		name: "Reflector Oracle",
		tagline: "Decentralized price feed contracts on Soroban.",
		description:
			"Reflector Network's Soroban oracle contracts — fetch verified price data for crypto assets and forex pairs. Critical infrastructure for any lending market, derivative, or RWA protocol on Stellar that needs reliable on-chain pricing.",
		source: "external",
		kind: "tool",
		install: "See https://reflector.network/docs",
		repository: "https://github.com/reflector-network",
		homepage: "https://reflector.network/",
		compatibility: ["Soroban"],
		targetUser: ["dev"],
		tags: ["oracle", "soroban", "price-feed", "infrastructure"],
	},
	{
		slug: "freighter-api",
		name: "Freighter API",
		tagline: "Browser SDK for connecting to the Freighter Stellar wallet.",
		description:
			"Official @stellar/freighter-api package. Detect and connect to the Freighter wallet extension from any web dapp. Request signatures, fetch the user's network + public key, and sign transactions for Stellar Classic and Soroban.",
		source: "external",
		kind: "sdk",
		install: "npm install @stellar/freighter-api",
		repository: "https://github.com/stellar/freighter",
		homepage: "https://www.freighter.app/",
		docs: "https://docs.freighter.app/",
		compatibility: ["Browser", "TypeScript", "Freighter wallet"],
		targetUser: ["dev"],
		tags: ["wallet", "freighter", "browser", "stellar"],
	},
	{
		slug: "stellar-wallets-kit",
		name: "Stellar Wallets Kit",
		tagline:
			"Multi-wallet connector for Stellar dapps (Freighter, xBull, Albedo, Lobstr, …).",
		description:
			"@creit.tech/stellar-wallets-kit — community-maintained one-shot integration for every major Stellar wallet (Freighter, xBull, Albedo, Lobstr, Hana, Rabet, Walletconnect, Hardware wallets). Drop-in modal UI + a clean unified API. The fastest way to ship a Stellar dapp with wallet support.",
		source: "external",
		kind: "sdk",
		install: "npm install @creit.tech/stellar-wallets-kit",
		repository: "https://github.com/Creit-Tech/Stellar-Wallets-Kit",
		homepage: "https://stellarwalletskit.dev/",
		compatibility: ["Browser", "TypeScript", "React", "Vue"],
		targetUser: ["dev"],
		tags: ["wallet", "multi-wallet", "ui", "stellar"],
	},
	{
		slug: "mercury-indexer",
		name: "Mercury",
		tagline:
			"Real-time Soroban indexer + GraphQL API for contract events and state.",
		description:
			"Mercury (by Xycloo Labs) — production-grade Soroban indexer. Subscribes to mainnet events, indexes contract storage, and exposes structured GraphQL + REST endpoints. Use it when you need a real-time activity feed, contract event stream, or state queries from a JavaScript / TypeScript backend.",
		source: "external",
		kind: "tool",
		install: "See https://mercurydata.app/get-started",
		homepage: "https://mercurydata.app/",
		docs: "https://docs.mercurydata.app/",
		compatibility: ["Soroban", "Backend (any language)"],
		targetUser: ["dev"],
		tags: ["indexer", "soroban", "events", "graphql"],
	},
	{
		slug: "allbridge-sdk",
		name: "Allbridge SDK",
		tagline:
			"Cross-chain bridge SDK — move USDC between Stellar and 14+ chains.",
		description:
			"Allbridge Core SDK for bridging USDC and other stablecoins between Stellar and EVM chains (Ethereum, Polygon, BNB, Avalanche, etc.) plus Solana and Tron. Quote, sign, and execute bridge transfers from JavaScript / TypeScript.",
		source: "external",
		kind: "sdk",
		install: "npm install @allbridge/bridge-core-sdk",
		repository: "https://github.com/allbridge-io/allbridge-core-js-sdk",
		homepage: "https://allbridge.io/",
		docs: "https://docs-core.allbridge.io/",
		compatibility: ["Node.js", "Browser", "TypeScript"],
		targetUser: ["dev"],
		tags: ["bridge", "cross-chain", "USDC", "stellar"],
	},
	{
		slug: "rozo-intent-pay",
		name: "Rozo Intent Pay",
		tagline:
			"Drop-in React button to accept USDC + EURC on Stellar from any chain.",
		description:
			"@rozoai/intent-pay — a React SDK that ships a <RozoPayButton/> component. Customers pay from any supported chain (Ethereum, Arbitrum, Base, BSC, Polygon, HyperEVM, Solana, Stellar) and the merchant receives the exact asset they want. On Stellar, Rozo runs its own SEP-24 anchor with USDC (issuer GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN) and EURC (issuer GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2). Built on stellar-sdk + @creit.tech/stellar-wallets-kit + wagmi/viem.",
		source: "external",
		kind: "sdk",
		install: "npm install @rozoai/intent-pay @rozoai/intent-common",
		homepage: "https://rozo.ai/",
		docs: "https://docs.rozo.ai/integration/rozointentpay",
		compatibility: ["React", "Next.js", "wagmi", "viem", "Stellar SEP-24"],
		targetUser: ["dev", "founder"],
		tags: [
			"payments",
			"checkout",
			"SEP-24",
			"anchor",
			"USDC",
			"EURC",
			"cross-chain",
		],
	},
	{
		slug: "stellar-typescript-wallet-sdk",
		name: "Stellar TypeScript Wallet SDK",
		tagline:
			"High-level wallet SDK — accounts, SEP-24 deposits, SEP-31 transfers.",
		description:
			"Official @stellar/typescript-wallet-sdk. Higher-level abstraction over Stellar SDK for building wallet apps: create + recover accounts, interact with anchors via SEP-1/6/10/12/24/31 standards, build payments and asset trustlines. The recommended starting point for a Stellar consumer wallet.",
		source: "external",
		kind: "sdk",
		install: "npm install @stellar/typescript-wallet-sdk",
		repository: "https://github.com/stellar/typescript-wallet-sdk",
		homepage: "https://developers.stellar.org/docs/build/apps/wallet/overview",
		docs: "https://github.com/stellar/typescript-wallet-sdk",
		compatibility: ["Node.js", "Browser", "TypeScript"],
		targetUser: ["dev"],
		tags: ["wallet", "anchors", "SEP", "stellar", "official"],
	},
];

export function findCuratedSkill(slug: string): CuratedSkill | undefined {
	return CURATED_SKILLS.find((s) => s.slug === slug);
}
