/**
 * Server-side aggregator for skills.stellar.org — the official Stellar
 * Development Foundation skill catalog.
 *
 * Why proxy: lets the Stellar Scout SKILL.md instruct AI agents to query
 * a single endpoint on stellarlight.xyz for the "how to build" layer,
 * rather than scattering 7 separate cross-origin fetches. We cache for
 * 24h so we don't hammer SDF's site.
 */

/** Stable list of SDF skill names (from skills.stellar.org/sitemap.xml).
 *  If SDF adds more, we can either re-read the sitemap or extend this. */
export const SDF_SKILL_NAMES = [
	"soroban",
	"dapp",
	"assets",
	"data",
	"agentic-payments",
	"zk-proofs",
	"standards",
] as const;

export type SdfSkillName = (typeof SDF_SKILL_NAMES)[number];

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

function urlForSkill(name: string): { rawUrl: string; url: string } {
	return {
		rawUrl: `${BASE}/skills/${name}/SKILL.md`,
		url: `${BASE}/skills/${name}/`,
	};
}

/** Fetch one skill's raw markdown with 24h Next.js cache. Returns null
 *  if the upstream fetch fails. */
export async function fetchSdfSkill(
	name: string,
): Promise<SdfSkillFull | null> {
	const { rawUrl, url } = urlForSkill(name);
	try {
		const res = await fetch(rawUrl, {
			next: { revalidate: 86_400 }, // 24h
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
	const results = await Promise.allSettled(
		SDF_SKILL_NAMES.map((n) => fetchSdfSkill(n)),
	);
	return results
		.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []))
		.map(({ content, wordCount, ...summary }) => {
			void content;
			void wordCount;
			return summary;
		});
}
