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
	try {
		const res = await fetch(`${BASE}/llms.txt`, {
			next: { revalidate: 86_400 }, // 24h, same cadence as the skills
			headers: {
				"User-Agent": "StellarLight/1.0 (https://stellarlight.xyz/scout)",
			},
		});
		if (!res.ok) return [...SDF_SKILL_NAMES];
		const txt = await res.text();
		const names = [
			...new Set(
				[...txt.matchAll(/skills\/([a-z0-9-]+)\/SKILL\.md/g)].map((m) => m[1]),
			),
		];
		return names.length >= 3 ? names : [...SDF_SKILL_NAMES];
	} catch {
		return [...SDF_SKILL_NAMES];
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
