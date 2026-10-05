/**
 * Which directory project a hackathon submission became, decided from its
 * repo alone. Pure (no Payload, no Next) so the sync lane, the served index
 * and the tests share one rule.
 *
 * The rule: a submission links to a project only when that project lists the
 * submission's exact repo as its own (github.repos, or links.github pointing
 * at that repo). An account- or org-level match never counts. The team behind
 * a winner can run other products, and a shared GitHub owner is not the same
 * product: the 2026-10-05 audit found owner-level attribution tying one
 * winner to the official examples repo's project and another to a different
 * product by the same builder.
 */

/** owner/name of a GitHub repository URL, lowercased. null for an account or
 * org URL, or anything that is not GitHub. */
export function repoFullNameOf(url: string | null | undefined): string | null {
	if (!url) return null;
	const m = /github\.com\/([^/#?\s]+)\/([^/#?\s]+)/i.exec(url);
	if (!m) return null;
	const name = m[2].replace(/\.git$/i, "");
	return name ? `${m[1]}/${name}`.toLowerCase() : null;
}

export interface LinkedProject {
	slug: string;
	name: string;
}

/** The project fields the rule reads. */
export interface ProjectRepoRow {
	slug: string;
	name: string;
	status?: string | null;
	canonicalSlug?: string | null;
	links?: { github?: string | null } | null;
	github?: {
		repos?: Array<{ owner?: string | null; name?: string | null }> | null;
	} | null;
}

/**
 * repo owner/name -> the one project that lists it. A repo listed by two
 * different projects maps to null (ambiguous) and is never linked. A
 * duplicate row resolves to its canonical project; a hidden draft is skipped.
 */
export function indexProjectRepos(
	rows: ProjectRepoRow[],
): Map<string, LinkedProject | null> {
	const names = new Map(rows.map((r) => [r.slug, r.name]));
	const out = new Map<string, LinkedProject | null>();
	for (const r of rows) {
		const slug = r.canonicalSlug || (r.status === "Draft" ? null : r.slug);
		if (!slug) continue;
		const project = { slug, name: names.get(slug) ?? r.name };
		const repos = new Set<string>();
		for (const x of r.github?.repos ?? [])
			if (x?.owner && x?.name) repos.add(`${x.owner}/${x.name}`.toLowerCase());
		const linked = repoFullNameOf(r.links?.github);
		if (linked) repos.add(linked);
		for (const repo of repos) {
			if (!out.has(repo)) out.set(repo, project);
			else if (out.get(repo)?.slug !== slug) out.set(repo, null);
		}
	}
	return out;
}

/** A submission's stored id from what an agent is likely to hold: the `id`
 * searchHackathonBuilds returns (dorahacks-buidl-<n>), the bare number, or
 * the dorahacks.io/buidl/<n> link. null when it is none of those. */
export function parseBuildId(raw: string): string | null {
	const s = raw.trim();
	const m =
		/^dorahacks-buidl-(\d+)$/.exec(s) ??
		/^(\d+)$/.exec(s) ??
		/dorahacks\.io\/buidl\/(\d+)/i.exec(s);
	return m ? `dorahacks-buidl-${m[1]}` : null;
}

/** keyword: words and their stems/synonyms. meaning: vector similarity only.
 * hybrid: both, blended. The spec spreads this list (enum ratchet). */
export const BUILD_SEARCH_MODES = ["keyword", "meaning", "hybrid"] as const;
export type BuildSearchMode = (typeof BUILD_SEARCH_MODES)[number];
