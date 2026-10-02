/**
 * Server-side aggregator for skills.stellar.org — the official Stellar
 * Development Foundation skill catalog.
 *
 * Why proxy: lets the Stellar Scout SKILL.md instruct AI agents to query
 * a single endpoint on stellarlight.xyz for the "how to build" layer,
 * rather than scattering 7 separate cross-origin fetches. We cache for
 * 24h so we don't hammer SDF's site.
 */

/** Fallback list of SDF skill names — used ONLY when the live llms.txt
 *  fetch fails. sls-053: the previous hardcode still carried the superseded
 *  `soroban` skill (its URL kept serving 200 while SDF's own site data and
 *  llms.txt had moved to `smart-contracts`) and missed two newer skills —
 *  the stale-snapshot class. The catalog is now derived from llms.txt (24h
 *  cache) so SDF renames/additions propagate without a code change; this
 *  list is the registry's SDF-authored section as of 2026-10-02; community-built entries live in their authors' repositories, so they are never served from this list. */
export const SDF_SKILL_NAMES = [
	"smart-contracts",
	"agentic-payments",
	"dapp",
	"assets",
	"data",
	"zk-proofs",
	"cross-chain",
	"standards",
] as const;

export type SdfSkillName = (typeof SDF_SKILL_NAMES)[number];

/** Derive the CURRENT skill list from SDF's own llms.txt (their agent-facing
 *  index — the source of truth for what is maintained). Falls back to the
 *  static list above on any fetch/parse failure. */
export async function fetchSdfSkillNames(): Promise<string[]> {
	return (await fetchSdfSkillNamesLive()) ?? [...SDF_SKILL_NAMES];
}

/**
 * The live registry list, or null when the registry could not be read: a
 * caller deciding between "unknown skill" and "could not check" needs the
 * difference the static fallback hides.
 */
export type RegistrySection = "official" | "community";

/** One `- [Title](…SKILL.md): summary` line of the registry's llms.txt. */
export interface RegistryEntry {
	/** Catalog name: the directory the SKILL.md sits in (the skill's own id,
	 * stable), else the title slugified (a root-level SKILL.md, or a generic
	 * directory such as `mcp` or `sdk`). */
	name: string;
	/** The registry's display title (the link text). */
	title: string;
	/** The registry's one-line summary. */
	summary: string;
	url: string;
	section: RegistrySection;
}

const GENERIC_SEGMENTS = new Set([
	"mcp",
	"sdk",
	"skill",
	"skills",
	"main",
	"master",
	"src",
	"docs",
]);

/**
 * The registry's llms.txt has two sections: "Included Stellar Skills" (SDF
 * authored, served from skills.stellar.org) and "Community Built" (hosted in
 * their authors' repositories; listed, not reviewed, by SDF). Both are
 * catalogued. The section decides the source label and the link decides the
 * URL: a skill fetched from a derived skills.stellar.org path 404s when it
 * lives elsewhere. The first entry wins on a name collision.
 */
export function parseLlmsRegistry(txt: string): Map<string, RegistryEntry> {
	const entries = new Map<string, RegistryEntry>();
	// Links count only under a skills section: "Included Stellar Skills"
	// (official) and "Community Built"; the Installing and Example Prompts
	// sections are skipped, so a changelog link there never becomes a skill.
	let section: RegistrySection | null = "official";
	for (const line of txt.split("\n")) {
		const heading = line.match(/^##\s+(.+)$/);
		if (heading) {
			section = /community/i.test(heading[1])
				? "community"
				: /skills/i.test(heading[1])
					? "official"
					: null;
			continue;
		}
		if (!section) continue;
		// Three listed skills are a bare .md (defindex-sdk-skill.md), not a
		// SKILL.md: the registry lists them, so the catalog does.
		const m = line.match(
			/\[([^\]]+)\]\((https?:\/\/[^)\s]+\.md)\)(?::\s*(.*))?/,
		);
		if (!m) continue;
		// The directory the SKILL.md sits in is the skill's own id (what its
		// author and other catalogs call it); a repository that is one skill
		// keeps SKILL.md at its root and has no such directory, and a generic
		// directory (mcp, sdk, src) names nothing, so those take the title.
		const rootLevel =
			/^https?:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/[^/]+\.md$/.test(
				m[2],
			);
		const seg = rootLevel
			? undefined
			: m[2]
					.match(/\/([A-Za-z0-9_.-]+)\/[^/]+\.md$/)?.[1]
					.toLowerCase()
					.replace(/[^a-z0-9-]+/g, "-");
		const name = seg && !GENERIC_SEGMENTS.has(seg) ? seg : slugifyTitle(m[1]);
		if (!name || entries.has(name)) continue;
		entries.set(name, {
			name,
			title: m[1].trim(),
			summary: (m[3] ?? "").trim(),
			url: m[2],
			section,
		});
	}
	return entries;
}

function slugifyTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Name to SKILL.md URL, both sections. */
export function parseLlmsSkillLinks(txt: string): Map<string, string> {
	return new Map(
		[...parseLlmsRegistry(txt)].map(([name, e]) => [name, e.url] as const),
	);
}

async function fetchRegistry(): Promise<Map<string, RegistryEntry>> {
	try {
		const res = await fetch(`${BASE}/llms.txt`, {
			next: { revalidate: 86_400 }, // 24h, same cadence as the skills
			signal: AbortSignal.timeout(5000),
			headers: {
				"User-Agent": "StellarLight/1.0 (https://stellarlight.xyz/scout)",
			},
		});
		if (!res.ok) return new Map();
		return parseLlmsRegistry(await res.text());
	} catch {
		return new Map();
	}
}

/** The live registry, or null when it is unreadable (fewer than 3 entries). */
export async function fetchRegistryLive(): Promise<Map<
	string,
	RegistryEntry
> | null> {
	const registry = await fetchRegistry();
	return registry.size >= 3 ? registry : null;
}

export async function fetchSdfSkillNamesLive(): Promise<string[] | null> {
	const registry = await fetchRegistryLive();
	return registry ? [...registry.keys()] : null;
}

const BASE = "https://skills.stellar.org";

export interface SdfSkillSummary {
	/** Catalog name (the slug). */
	name: string;
	/** The registry's display title; the name humanized when not listed. */
	title: string;
	/** The registry's one-line summary ("" when not listed). */
	summary: string;
	/** The SKILL.md frontmatter description. */
	description: string;
	/** Listed in the registry's Community Built section (maintained by its
	 * author, not reviewed by SDF). */
	community: boolean;
	userInvocable?: boolean;
	argumentHint?: string;
	url: string;
	rawUrl: string;
}

export interface SdfSkillFull extends SdfSkillSummary {
	content: string;
	wordCount: number;
}

/** Parse `---\nkey: value\n---\n…body` style frontmatter. Lightweight —
 *  no YAML lib needed since SDF skills use simple flat key: value. */
function parseFrontmatter(md: string): {
	frontmatter: Record<string, string | boolean>;
	body: string;
} {
	if (!md.startsWith("---\n")) {
		return { frontmatter: {}, body: md };
	}
	const end = md.indexOf("\n---\n", 4);
	if (end < 0) return { frontmatter: {}, body: md };
	const block = md.slice(4, end);
	const body = md.slice(end + 5);
	const fm: Record<string, string | boolean> = {};
	for (const line of block.split("\n")) {
		const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (!m) continue;
		let value: string | boolean = m[2].trim();
		if (value.startsWith('"') && value.endsWith('"'))
			value = value.slice(1, -1);
		if (value === "true") value = true;
		else if (value === "false") value = false;
		fm[m[1]] = value;
	}
	return { frontmatter: fm, body };
}

function urlForSkill(
	name: string,
	registryRawUrl?: string,
): { rawUrl: string; url: string } {
	const rawUrl = registryRawUrl ?? `${BASE}/skills/${name}/SKILL.md`;
	// A repository skill lives at <branch>/<path>/SKILL.md or, for a repo
	// that is one skill, at <branch>/SKILL.md.
	const gh = rawUrl.match(
		/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(?:(.+)\/)?[^/]+\.md$/,
	);
	const url = gh
		? `https://github.com/${gh[1]}/${gh[2]}/tree/${gh[3]}${gh[4] ? `/${gh[4]}` : ""}`
		: rawUrl.startsWith(`${BASE}/`)
			? `${BASE}/skills/${name}/`
			: rawUrl;
	return { rawUrl, url };
}

/** Fetch one skill's raw markdown with 24h Next.js cache. Returns null
 *  if the upstream fetch fails. */
export async function fetchSdfSkill(
	name: string,
): Promise<SdfSkillFull | null> {
	const entry = (await fetchRegistry()).get(name);
	const { rawUrl, url } = urlForSkill(name, entry?.url);
	try {
		const res = await fetch(rawUrl, {
			next: { revalidate: 86_400 }, // 24h
			signal: AbortSignal.timeout(5000),
			headers: {
				"User-Agent": "StellarLight/1.0 (https://stellarlight.xyz/scout)",
			},
		});
		if (!res.ok) return null;
		const md = await res.text();
		const { frontmatter, body } = parseFrontmatter(md);
		return {
			name,
			title: entry?.title ?? humanizeSkillName(name),
			summary: entry?.summary ?? "",
			description: String(frontmatter.description ?? ""),
			community: entry?.section === "community",
			userInvocable: frontmatter["user-invocable"] === true,
			argumentHint:
				typeof frontmatter["argument-hint"] === "string"
					? (frontmatter["argument-hint"] as string)
					: undefined,
			url,
			rawUrl,
			content: md,
			wordCount: body.trim().split(/\s+/).length,
		};
	} catch {
		return null;
	}
}

export interface SdfSkillCatalog {
	skills: SdfSkillSummary[];
	/** Names the registry listed (or the fallback list when it was unreadable). */
	listed: number;
	/** Listed names whose SKILL.md could not be fetched (named, not hidden). */
	unreachable: string[];
	/** false = the registry did not answer and the SDF fallback list was used,
	 * so community-built entries are missing. */
	live: boolean;
}

/** Fetch the full catalog (parallel): every listed entry that resolves, and
 * the names of those that did not. */
export async function fetchSdfSkillCatalog(): Promise<SdfSkillCatalog> {
	const liveNames = await fetchSdfSkillNamesLive();
	const names = liveNames ?? [...SDF_SKILL_NAMES];
	const results = await Promise.allSettled(names.map((n) => fetchSdfSkill(n)));
	const skills: SdfSkillSummary[] = [];
	const unreachable: string[] = [];
	results.forEach((r, i) => {
		if (r.status === "fulfilled" && r.value) {
			const { content, wordCount, ...summary } = r.value;
			void content;
			void wordCount;
			skills.push(summary);
		} else unreachable.push(names[i]);
	});
	return {
		skills,
		listed: names.length,
		unreachable,
		live: liveNames !== null,
	};
}

export const SKILLS_REGISTRY = "skills.stellar.org";
const OFFICIAL_REPO = "https://github.com/stellar/stellar-dev-skill";

/**
 * The one catalog shape for a registry entry, used by the list and detail
 * routes and both pages. The source label follows the registry's section:
 * `sdf` for the SDF-authored set, `community` for Community Built (listed by
 * SDF, maintained by its author, not reviewed). The install command is the
 * registry's own (`npx skills add <repo>`): the catalog once printed
 * `npx skills add stellar/<name>`, a repository that does not exist.
 */
export function registrySkillView(s: SdfSkillSummary) {
	const gh = s.rawUrl.match(
		/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//,
	);
	const repo = s.community
		? gh
			? `https://github.com/${gh[1]}/${gh[2]}`
			: undefined
		: OFFICIAL_REPO;
	// The skills CLI installs a SKILL.md; a skill the registry serves as a
	// bare .md is fetched from rawUrl instead, so no install command is
	// claimed for it.
	const installable = /\/SKILL\.md$/.test(s.rawUrl);
	return {
		slug: s.name,
		name: s.title,
		tagline: shortenSkillText(s.summary || s.description, 160),
		description: s.description || s.summary,
		source: s.community ? ("community" as const) : ("sdf" as const),
		kind: "skill-md" as const,
		registry: SKILLS_REGISTRY,
		...(repo ? { repository: repo } : {}),
		...(repo && installable ? { install: `npx skills add ${repo}` } : {}),
		...(s.community
			? {}
			: {
					installAlt: [
						{
							label: "Claude Code (marketplace)",
							command: "/plugin marketplace add stellar/stellar-dev-skill",
						},
						{
							label: "Claude Code (install)",
							command: "/plugin install stellar-dev@stellar-dev",
						},
						{
							label: "Codex",
							command: `git clone ${OFFICIAL_REPO} ~/.codex/skills/stellar-dev-skill`,
						},
					],
					compatibility: ["Claude Code", "OpenCode", "Codex", "Pi", "Cursor"],
				}),
		homepage: s.url,
		rawUrl: s.rawUrl,
		userInvocable: s.userInvocable ?? false,
		...(s.argumentHint ? { argumentHint: s.argumentHint } : {}),
		targetUser: ["dev"],
		tags: s.community
			? [s.name, "community", ...(gh ? [gh[1]] : [])]
			: [s.name, "SDF"],
	};
}

export type RegistrySkillView = ReturnType<typeof registrySkillView>;

/**
 * Merge the three skill lists with dedup: curated wins over the registry wins
 * over community submissions (a submission cannot shadow Scout). A curated
 * entry that names its registry copy (registryName) replaces that copy too:
 * Lumen Loop's skills are listed on the registry under other slugs, and the
 * catalog once showed each of them twice.
 */
export function mergeSkillLists<T extends { slug: string }>(
	curated: T[],
	registry: T[],
	community: T[],
	aliases: Iterable<string>,
): { all: T[]; merged: number } {
	const all: T[] = [];
	const seen = new Set<string>();
	for (const c of curated) {
		if (seen.has(c.slug)) continue;
		seen.add(c.slug);
		all.push(c);
	}
	let merged = 0;
	const aliased = new Set(aliases);
	for (const r of registry) {
		if (aliased.has(r.slug)) {
			merged += 1;
			continue;
		}
		if (seen.has(r.slug)) continue;
		seen.add(r.slug);
		all.push(r);
	}
	for (const c of community) {
		if (seen.has(c.slug)) continue;
		seen.add(c.slug);
		all.push(c);
	}
	return { all, merged };
}

export function humanizeSkillName(slug: string): string {
	return slug
		.split("-")
		.map((w) =>
			w === "zk"
				? "ZK"
				: w === "dapp"
					? "dApp"
					: (w[0]?.toUpperCase() ?? "") + w.slice(1),
		)
		.join(" ");
}

export function shortenSkillText(s: string, max: number): string {
	const first = s.split(/[.!?]\s/)[0] ?? s;
	if (first.length <= max) return first.endsWith(".") ? first : `${first}.`;
	return `${first.slice(0, max - 1)}…`;
}
