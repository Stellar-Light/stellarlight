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
 *
 * A third rule, for a submission neither rule links: its repo sits under a
 * project's GitHub owner AND its name is that project's name (or starts with
 * it, as "Neko Protocol" does "Neko"). Owner alone stays refused, for the
 * two reasons above; the name answers both, since the examples repo and a
 * builder's other product carry other names. A submission named for its team
 * ("x402 Wallet by Sorobanhooks") does not start with the team's project
 * name, so it is not taken for that project. Every link says which rule made
 * it (`basis`).
 *
 * A team that renames or transfers its repo leaves the stored URL behind,
 * and GitHub redirects it. The sync lane stores where the repo is now, and
 * the first and third rules also read that repo when the stored one finds
 * nothing (`moved-repo`, `moved-owner-and-name`). A repo GitHub could not
 * resolve is not taken as moved.
 *
 * Two last rules, for a winner every rule above leaves unlinked, read pages
 * the sync lane fetches (pageRuleLink). The winner's name must be the name
 * (or an alias) of exactly one project, a trailing "Stellar" aside; a name
 * alone never links, since that measured 3 right in 15. The second signal is
 * the project's own SCF page linking the submission's DoraHacks page in its
 * `siteUrls` record (`scf-page-and-name`), or the submission's DoraHacks
 * page listing the project's website or X account, one no other project
 * holds (`submission-links-and-name`). A winner
 * that later got funded can keep the product and drop the hackathon repo,
 * as PayZoll (no repo) and YieldBack.Cash (repo gone) did, and then no repo
 * rule sees it.
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
	/** Which rule linked it (LINK_BASES). Absent on links stored before the
	 * basis was recorded (all by repo). */
	basis?: LinkBasis;
	/** The project's directory status today, read with the index. Absent
	 * when that read failed: unknown, not "no status". */
	status?: string | null;
	/** Whether SCF funded the project, read with the index. Absent = unknown. */
	scfAwarded?: boolean;
	/** When status and scfAwarded were read; absent with them. */
	factsReadAt?: string;
}

export const LINK_BASES = [
	"repo",
	"website",
	"owner-and-name",
	"moved-repo",
	"moved-owner-and-name",
	"scf-page-and-name",
	"submission-links-and-name",
] as const;
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
/** The two rules that read upstream pages (pageRuleLink). */
export const PAGE_LINK_BASES = [
	"scf-page-and-name",
	"submission-links-and-name",
] as const satisfies readonly LinkBasis[];
const isPageBasis = (v: unknown): v is (typeof PAGE_LINK_BASES)[number] =>
	(PAGE_LINK_BASES as readonly unknown[]).includes(v);

/** The project fields the rules read. */
export interface ProjectRepoRow {
	slug: string;
	name: string;
	status?: string | null;
	canonicalSlug?: string | null;
	aliases?: string[] | null;
	links?: {
		github?: string | null;
		website?: string | null;
		twitter?: string | null;
	} | null;
	github?: {
		repos?: Array<{ owner?: string | null; name?: string | null }> | null;
	} | null;
	scf?: { sourceUrl?: string | null } | null;
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

/** A name compared as letters and digits only, lowercased; null under four
 * characters, too short to identify anything. */
export function nameKeyOf(name: string | null | undefined): string | null {
	const key = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
	return key.length >= 4 ? key : null;
}

/** GitHub owner -> the projects whose repos or GitHub link sit under it. */
export function indexProjectOwners(
	rows: ProjectRepoRow[],
): Map<string, LinkedProject[]> {
	const names = new Map(rows.map((r) => [r.slug, r.name]));
	const out = new Map<string, LinkedProject[]>();
	for (const r of rows) {
		const slug = r.canonicalSlug || (r.status === "Draft" ? null : r.slug);
		if (!slug) continue;
		const owners = new Set<string>();
		for (const x of r.github?.repos ?? [])
			if (x?.owner) owners.add(x.owner.toLowerCase());
		const linkOwner = githubOwnerOf(r.links?.github);
		if (linkOwner) owners.add(linkOwner);
		for (const owner of owners) {
			const list = out.get(owner) ?? [];
			if (!list.some((p) => p.slug === slug))
				list.push({ slug, name: names.get(slug) ?? r.name });
			out.set(owner, list);
		}
	}
	return out;
}

/** The GitHub owner a submission's link names: a repo's owner, or the
 * account or organization itself (github.com/orgs/<name> included). */
export function githubOwnerOf(url: string | null | undefined): string | null {
	const m = /github\.com\/(?:orgs\/)?([^/#?\s]+)/i.exec(url ?? "");
	return m ? m[1].toLowerCase() : null;
}

/** The one project under the submission's GitHub owner whose name the
 * submission carries (equal, or the submission's name starts with it); null
 * when none or more than one does. */
export function ownerAndNameLink(
	githubUrl: string | null | undefined,
	buildName: string | null | undefined,
	owners: Map<string, LinkedProject[]>,
): LinkedProject | null {
	const owner = githubOwnerOf(githubUrl);
	const key = nameKeyOf(buildName);
	if (!owner || !key) return null;
	const hits = (owners.get(owner) ?? []).filter((p) => {
		const pk = nameKeyOf(p.name);
		return !!pk && (key === pk || key.startsWith(pk));
	});
	return hits.length === 1 ? { ...hits[0], basis: "owner-and-name" } : null;
}

/** The submission fields the rules read. */
export interface BuildLinkFields {
	name?: string | null;
	githubUrl?: string | null;
	demoUrl?: string | null;
	/** owner/name of githubUrl, lowercased (repoFullNameOf). */
	repoFullName?: string | null;
	/** owner/name GitHub resolves that repo to now, lowercased, when it was
	 * renamed or transferred. Absent or null: not moved, or not read. */
	repoCurrentFullName?: string | null;
}

/** The repoCurrentFullName the sync lane stores: where this run's read
 * found the repo (null when that is the repo itself), or with no read (not
 * found, or the read failed) the last value stored for this same repo. A
 * value stored for a different repo is never carried over. */
export function currentRepoFor(
	repoFullName: string | null | undefined,
	read: string | undefined,
	prev?: {
		repoFullName?: string | null;
		repoCurrentFullName?: string | null;
	} | null,
): string | null {
	if (read !== undefined) return read !== repoFullName ? read : null;
	return prev && prev.repoFullName === repoFullName
		? (prev.repoCurrentFullName ?? null)
		: null;
}

/** The three directory indexes the rules read. */
export interface ProjectIndexes {
	repos: Map<string, LinkedProject | null>;
	sites: Map<string, LinkedProject | null>;
	owners: Map<string, LinkedProject[]>;
}

/**
 * The one project a submission became and the rule that made the link, first
 * match wins: a project lists its stored repo; a project lists the repo it
 * moved to; its demo site is a project's website; owner and name on the
 * stored repo; owner and name on the repo it moved to. A repo two projects
 * list links nothing (`ambiguous`), and neither does a site two projects
 * share.
 */
export function linkBuild(
	b: BuildLinkFields,
	idx: ProjectIndexes,
): { project: LinkedProject | null; ambiguous: boolean } {
	const stored = b.repoFullName || null;
	const moved =
		b.repoCurrentFullName && b.repoCurrentFullName !== stored
			? b.repoCurrentFullName
			: null;
	for (const [repo, basis] of [
		[stored, "repo"],
		[moved, "moved-repo"],
	] as const) {
		const p = repo ? idx.repos.get(repo) : undefined;
		if (p === null) return { project: null, ambiguous: true };
		if (p) return { project: { ...p, basis }, ambiguous: false };
	}
	const key = siteKeyOf(b.demoUrl);
	const s = key ? idx.sites.get(key) : undefined;
	if (s !== undefined)
		return { project: s && { ...s, basis: "website" }, ambiguous: false };
	const o = ownerAndNameLink(b.githubUrl, b.name, idx.owners);
	const m =
		!o && moved
			? ownerAndNameLink(`https://github.com/${moved}`, b.name, idx.owners)
			: null;
	return {
		project: o ?? (m && { ...m, basis: "moved-owner-and-name" }),
		ambiguous: false,
	};
}

/** A name as the page rules compare it: lowercase words of letters and
 * digits, one trailing "stellar" or "soroban" dropped and then a trailing
 * "on" or "x" ("PayZoll_Stellar" and "Widget on Stellar" read as the product
 * alone), joined; null under four characters. */
export function productKeyOf(name: string | null | undefined): string | null {
	const words = (name ?? "")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	if (["stellar", "soroban"].includes(words[words.length - 1])) {
		words.pop();
		if (words.length > 1 && ["on", "x"].includes(words[words.length - 1]))
			words.pop();
	}
	return nameKeyOf(words.join(""));
}

/** An X (or Twitter) profile link's handle, lowercased; null for a post, a
 * search, an intent link or anything else. */
export function xHandleOf(url: string | null | undefined): string | null {
	let u: URL;
	try {
		u = new URL((url ?? "").trim());
	} catch {
		return null;
	}
	const host = u.hostname.toLowerCase().replace(/^(www|mobile)\./, "");
	if (host !== "x.com" && host !== "twitter.com") return null;
	const parts = u.pathname.split("/").filter(Boolean);
	const h = parts.length === 1 ? parts[0].toLowerCase() : "";
	return /^[a-z0-9_]{1,15}$/.test(h) &&
		!["home", "i", "intent", "search", "share", "explore"].includes(h)
		? h
		: null;
}

/** A project's SCF page, communityfund.stellar.org/project/<slug>; null for
 * anything else. */
export function scfPageOf(url: string | null | undefined): string | null {
	const m =
		/^https?:\/\/(?:www\.)?communityfund\.stellar\.org\/project\/([a-z0-9-]+)\/?(?:[?#].*)?$/i.exec(
			(url ?? "").trim(),
		);
	return m
		? `https://communityfund.stellar.org/project/${m[1].toLowerCase()}`
		: null;
}

/** The DoraHacks submission numbers a page links (dorahacks.io/buidl/<n>),
 * escaped slashes included. */
export function buidlNumbersIn(text: string): Set<string> {
	return new Set(
		[...text.matchAll(/dorahacks\.io\\?\/buidl\\?\/(\d+)/gi)].map((m) => m[1]),
	);
}

/** The DoraHacks numbers an SCF page's own `siteUrls` record links (its
 * brace-matched object on the rebuilt flight stream, as
 * scripts/enrich-from-scf.ts reads it); a number elsewhere on the page (a
 * bio, the traction text) never counts. undefined when the page carries no
 * `siteUrls` record, a format this reader does not know: could not check. */
export function scfSiteUrlsBuidls(txt: string): Set<string> | undefined {
	if (!txt.includes('"siteUrls":')) return undefined;
	const at = txt.indexOf('"siteUrls":{');
	if (at < 0) return new Set(); // "siteUrls":null, a page that lists none
	const start = at + '"siteUrls":'.length;
	let depth = 0;
	for (let i = start; i < txt.length; i++) {
		if (txt[i] === "{") depth++;
		else if (txt[i] === "}" && --depth === 0)
			return buidlNumbersIn(txt.slice(start, i + 1));
	}
	return new Set();
}

/** A project as the page rules read it: its SCF page, website and X account
 * (each null when two or more projects hold it, so it never corroborates). */
export interface NamedProject extends LinkedProject {
	scfPage: string | null;
	site: string | null;
	xHandle: string | null;
}

/** product key (productKeyOf, over names and aliases) -> the one project
 * named so; null when two projects are. Duplicates resolve to their
 * canonical project, with its facts; hidden drafts are skipped. */
export function indexProjectNames(
	rows: ProjectRepoRow[],
): Map<string, NamedProject | null> {
	const bySlug = new Map(rows.map((r) => [r.slug, r]));
	const slugOf = (r: ProjectRepoRow) =>
		r.canonicalSlug || (r.status === "Draft" ? null : r.slug);
	// site key or X handle -> the projects holding it, as indexProjectSites.
	const holders = new Map<string, Set<string>>();
	const keysOf = (r: ProjectRepoRow) => [
		`site:${siteKeyOf(r.links?.website)}`,
		`x:${xHandleOf(r.links?.twitter)}`,
	];
	for (const r of rows) {
		const slug = slugOf(r);
		if (slug)
			for (const k of keysOf(r))
				holders.set(k, (holders.get(k) ?? new Set()).add(slug));
	}
	const sole = (k: string, v: string | null) =>
		(holders.get(k)?.size ?? 0) > 1 ? null : v;
	const out = new Map<string, NamedProject | null>();
	for (const r of rows) {
		const slug = slugOf(r);
		if (!slug) continue;
		const own = bySlug.get(slug) ?? r;
		const [siteK, xK] = keysOf(own);
		const project: NamedProject = {
			slug,
			name: own.name,
			scfPage: scfPageOf(own.scf?.sourceUrl),
			site: sole(siteK, siteKeyOf(own.links?.website)),
			xHandle: sole(xK, xHandleOf(own.links?.twitter)),
		};
		for (const n of [r.name, ...(r.aliases ?? [])]) {
			const key = productKeyOf(n);
			if (!key) continue;
			if (!out.has(key)) out.set(key, project);
			else if (out.get(key)?.slug !== slug) out.set(key, null);
		}
	}
	return out;
}

/** The project a winner is named for, when every other rule left it
 * unlinked: no project, no repo two projects list, no demo site two
 * projects share. null for a submission that did not win. */
export function namedCandidate(
	b: BuildLinkFields & { isWinner?: boolean | null },
	idx: ProjectIndexes,
	names: Map<string, NamedProject | null>,
): NamedProject | null {
	const m = nameMatch(b, idx, names);
	return typeof m === "string" ? null : m;
}

/** namedCandidate's project, or why there is none. */
function nameMatch(
	b: BuildLinkFields & { isWinner?: boolean | null },
	idx: ProjectIndexes,
	names: Map<string, NamedProject | null>,
): NamedProject | string {
	if (!b.isWinner) return "not a winner";
	const { project, ambiguous } = linkBuild(b, idx);
	if (project) return `linked by the ${project.basis ?? "repo"} rule`;
	if (ambiguous) return "its repo is listed by two or more projects";
	const site = siteKeyOf(b.demoUrl);
	if (site && idx.sites.get(site) === null)
		return "its demo site is shared by two or more projects";
	const key = productKeyOf(b.name);
	if (!key) return "its name is too short to compare";
	const p = names.get(key);
	if (p === null) return "its name is carried by two or more projects";
	return p ?? "no project carries its name";
}

/** Why a stored link is gone after this run's linking, for the lane's log:
 * a page rule link (its name no longer names the project alone, or both
 * pages were read and neither says so), or any other rule's. */
export function linkDropReason(
	b: BuildLinkFields & { isWinner?: boolean | null },
	old: { projectSlug?: string | null; projectLinkBasis?: string | null },
	idx: ProjectIndexes,
	names: Map<string, NamedProject | null>,
): string {
	const basis = old.projectLinkBasis ?? "repo";
	if (!isPageBasis(basis))
		return linkBuild(b, idx).ambiguous
			? "its repo is listed by two or more projects"
			: `the ${basis} rule no longer finds ${old.projectSlug}`;
	const m = nameMatch(b, idx, names);
	if (typeof m === "string") return m;
	if (m.slug !== old.projectSlug)
		return `its name now names ${m.slug}, and no page says so`;
	return "pages read: the SCF page's siteUrls do not link the submission and its page lists neither the project's website nor its X account (one two projects hold never counts)";
}

/** One dry-run line for a row whose project or basis changes, old to new;
 * null when neither does. A stored link that leaves the row unlinked is
 * named as dropped, with why. */
export function linkChangeLine(
	entryKey: string,
	old: { projectSlug?: string | null; projectLinkBasis?: string | null },
	now: { projectSlug?: string | null; projectLinkBasis?: string | null },
	why?: string,
): string | null {
	const show = (l: typeof old) =>
		l.projectSlug
			? `${l.projectSlug} (${l.projectLinkBasis ?? "no basis"})`
			: "none";
	if (show(old) === show(now)) return null;
	const dropped = !!old.projectSlug && !now.projectSlug;
	return `  ${dropped ? "dropped" : "link"} ${entryKey}: ${show(old)} -> ${show(now)}${dropped ? `: ${why ?? "no rule links it now"}` : ""}`;
}

/** What the sync lane read for one candidate. */
export interface PageEvidence {
	/** DoraHacks numbers the project's SCF page links: null when the project
	 * has no SCF page, absent when the page could not be read. */
	scfBuidls?: Set<string> | null;
	/** The links the submission's DoraHacks page lists: absent, or empty
	 * (a 404, a private or archived record), when it could not be read. */
	pageLinks?: string[];
}

/**
 * The page rules' link for a named candidate (namedCandidate): the project's
 * SCF page's siteUrls link this submission (`scf-page-and-name`), else the
 * submission's page lists the project's website or X account
 * (`submission-links-and-name`). When neither holds and a page it needed
 * was not read (an empty links list counts as not read), the link stored
 * by one of these rules to the same project is kept; otherwise none.
 */
export function pageRuleLink(
	buildId: string,
	p: NamedProject,
	ev: PageEvidence,
	stored?: {
		projectSlug?: string | null;
		projectLinkBasis?: string | null;
	} | null,
): LinkedProject | null {
	const n = /^dorahacks-buidl-(\d+)$/.exec(buildId)?.[1];
	if (!n) return null;
	const link = (basis: LinkBasis) => ({ slug: p.slug, name: p.name, basis });
	if (ev.scfBuidls?.has(n)) return link("scf-page-and-name");
	const listed = (l: string) =>
		(!!p.site && siteKeyOf(l) === p.site) ||
		(!!p.xHandle && xHandleOf(l) === p.xHandle);
	if (ev.pageLinks?.some(listed)) return link("submission-links-and-name");
	const unread =
		(!!p.scfPage && ev.scfBuidls === undefined) || !ev.pageLinks?.length;
	const kept = stored?.projectLinkBasis;
	return unread && stored?.projectSlug === p.slug && isPageBasis(kept)
		? link(kept)
		: null;
}

/** A curated submission id, as curated-builds.ts makes them: lowercase words
 * joined by single hyphens, none leading or trailing ("curated--" is not one). */
export const CURATED_BUILD_ID = /^curated-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A submission's stored id from what an agent is likely to hold: the `id`
 * searchHackathonBuilds returns (dorahacks-buidl-<n>, or curated-<event>-<name>
 * for an event off DoraHacks), the bare number, or the dorahacks.io/buidl/<n>
 * link. null when it is none of those. */
export function parseBuildId(raw: string): string | null {
	const s = raw.trim();
	if (CURATED_BUILD_ID.test(s)) return s;
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
