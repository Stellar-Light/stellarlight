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
 *
 * A second rule, for a submission no project lists by repo: its demo site is
 * a project's own website, host for host (www. and app. aside). Teams often
 * keep the product and move the code, so the site is the stronger trace of
 * what the submission became. Shared platforms (GitHub, YouTube, DoraHacks,
 * link pages) never count, and a host two projects claim links neither.
 * Every link says which rule made it (`basis`).
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
	/** Which rule linked it: the project lists the submission's exact repo, or
	 * the submission's demo site is the project's website. Absent on links
	 * stored before the basis was recorded (all by repo). */
	basis?: LinkBasis;
	/** The project's directory status today, read with the index. Absent
	 * when that read failed: unknown, not "no status". */
	status?: string | null;
	/** Whether SCF funded the project, read with the index. Absent = unknown. */
	scfAwarded?: boolean;
	/** When status and scfAwarded were read; absent with them. */
	factsReadAt?: string;
}

export const LINK_BASES = ["repo", "website"] as const;
/** reviewSubmission: how the link was resolved, and its check ids.
 * Here (pure) so the spec can spread them. */
export const REVIEW_RESOLVED_BY = ["submission", "repo"] as const;
export const REVIEW_CHECK_IDS = [
	"repo",
	"activity",
	"stack",
	"directory",
	"status",
	"scf",
	"writeUp",
	"demo",
] as const;
export type LinkBasis = (typeof LINK_BASES)[number];

/** The project fields the rule reads. */
export interface ProjectRepoRow {
	slug: string;
	name: string;
	status?: string | null;
	canonicalSlug?: string | null;
	links?: { github?: string | null; website?: string | null } | null;
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

/** Hosts that belong to a platform, not to one product: a demo or website
 * on them says nothing about which project it is. Subdomains included. */
const SHARED_SITES = [
	"github.com",
	"github.io",
	"gitlab.com",
	"bitbucket.org",
	"youtube.com",
	"youtu.be",
	"vimeo.com",
	"loom.com",
	"dorahacks.io",
	"devpost.com",
	"google.com",
	"x.com",
	"twitter.com",
	"t.me",
	"discord.gg",
	"discord.com",
	"linktr.ee",
	"medium.com",
	"notion.so",
	"notion.site",
	"figma.com",
	"canva.com",
	"linkedin.com",
	"instagram.com",
	"facebook.com",
	"npmjs.com",
	"crates.io",
	"stellar.org",
	"stellar.expert",
];

/** A site's comparable host: lowercased, without www. or app., null for a
 * shared platform or anything that is not an http(s) URL with a dotted host. */
export function siteKeyOf(url: string | null | undefined): string | null {
	if (!url) return null;
	let host: string;
	try {
		const u = new URL(url.trim());
		if (u.protocol !== "https:" && u.protocol !== "http:") return null;
		host = u.hostname.toLowerCase();
	} catch {
		return null;
	}
	host = host.replace(/^(www|app)\./, "");
	if (!host.includes(".")) return null;
	if (SHARED_SITES.some((s) => host === s || host.endsWith(`.${s}`)))
		return null;
	return host;
}

/** site key -> the one project whose website it is; null when two projects
 * share it (never linked). */
export function indexProjectSites(
	rows: ProjectRepoRow[],
): Map<string, LinkedProject | null> {
	const names = new Map(rows.map((r) => [r.slug, r.name]));
	const out = new Map<string, LinkedProject | null>();
	for (const r of rows) {
		const slug = r.canonicalSlug || (r.status === "Draft" ? null : r.slug);
		const key = siteKeyOf(r.links?.website);
		if (!slug || !key) continue;
		const project = { slug, name: names.get(slug) ?? r.name };
		if (!out.has(key)) out.set(key, project);
		else if (out.get(key)?.slug !== slug) out.set(key, null);
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
/** meta.matchMode values the submission operations report. */
export const BUILD_MATCH_MODES = [
	"all",
	"filtered",
	"vector",
	"hybrid",
] as const;
