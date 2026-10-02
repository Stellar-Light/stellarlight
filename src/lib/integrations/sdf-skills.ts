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
 *  list mirrors llms.txt as of 2026-07-12. */
export const SDF_SKILL_NAMES = [
	"smart-contracts",
	"setup-stellar-contracts",
	"agent-browser-webauthn",
	"dapp",
	"assets",
	"data",
	"agentic-payments",
	"zk-proofs",
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
export async function fetchSdfSkillNamesLive(): Promise<string[] | null> {
	const links = await fetchSdfSkillLinks();
	return links.size >= 3 ? [...links.keys()] : null;
}

/**
 * The registry's llms.txt links each skill to the SKILL.md it is served
 * from. Most live under skills.stellar.org, but the registry also lists
 * skills hosted in their authors' repositories (raw.githubusercontent.com),
 * so the name alone does not give the URL: a skill fetched from the derived
 * skills.stellar.org path 404s when it lives elsewhere.
 */
export function parseLlmsSkillLinks(txt: string): Map<string, string> {
	const links = new Map<string, string>();
	for (const m of txt.matchAll(
		/\((https?:\/\/[^)\s]+\/skills\/([a-z0-9-]+)\/SKILL\.md)\)/g,
	)) {
		if (!links.has(m[2])) links.set(m[2], m[1]);
	}
	return links;
}

async function fetchSdfSkillLinks(): Promise<Map<string, string>> {
	try {
		const res = await fetch(`${BASE}/llms.txt`, {
			next: { revalidate: 86_400 }, // 24h, same cadence as the skills
			signal: AbortSignal.timeout(5000),
			headers: {
				"User-Agent": "StellarLight/1.0 (https://stellarlight.xyz/scout)",
			},
		});
		if (!res.ok) return new Map();
		return parseLlmsSkillLinks(await res.text());
	} catch {
		return new Map();
	}
}

const BASE = "https://skills.stellar.org";

export interface SdfSkillSummary {
	name: string;
	description: string;
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
	// A skill the registry hosts elsewhere gets its author's repository as
	// the homepage; the registry has no page for it.
	const gh = rawUrl.match(
		/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)\/SKILL\.md$/,
	);
	const url = gh
		? `https://github.com/${gh[1]}/${gh[2]}/tree/${gh[3]}/${gh[4]}`
		: `${BASE}/skills/${name}/`;
	return { rawUrl, url };
}

/** Fetch one skill's raw markdown with 24h Next.js cache. Returns null
 *  if the upstream fetch fails. */
export async function fetchSdfSkill(
	name: string,
): Promise<SdfSkillFull | null> {
	const { rawUrl, url } = urlForSkill(
		name,
		(await fetchSdfSkillLinks()).get(name),
	);
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
			name: String(frontmatter.name ?? name),
			description: String(frontmatter.description ?? ""),
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

/** Fetch the full catalog (parallel) and return summaries. */
export async function fetchSdfSkillCatalog(): Promise<SdfSkillSummary[]> {
	const names = await fetchSdfSkillNames();
	const results = await Promise.allSettled(names.map((n) => fetchSdfSkill(n)));
	return results
		.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []))
		.map(({ content, wordCount, ...summary }) => {
			void content;
			void wordCount;
			return summary;
		});
}
