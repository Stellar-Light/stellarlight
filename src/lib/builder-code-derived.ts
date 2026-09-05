/**
 * Builder row shapes + the P2 code-derived-builder helpers, factored OUT of the
 * `/api/builders` route. A Next.js `route.ts` may only export HTTP-method
 * handlers and route-segment config — exporting `isHandleQuery` /
 * `codeDerivedBuilderRow` from the route broke `next build` (route-export
 * validation) even though tsc + vitest passed. These live here so they stay
 * unit-testable without polluting the route's export surface.
 */

import { applyBuilderNameOverride } from "../data/builder-name-overrides";
import { BUILDER_SYNONYMS } from "./builder-vocabulary";

export interface BuilderProject {
	name: string;
	slug?: string;
	short_description?: string;
	status?: string;
}

/** sls-041: WHY a row matched — profile-text vs code-derived (repo-owner). */
export interface BuilderMatch {
	/** Profile fields the query matched (e.g. "bio", "roleTitle", "projects.name"). */
	matchedFields: string[];
	/** Projects whose name/description matched the query. */
	matchedProjects: Array<{ name: string; slug: string | null }>;
	/** Per query token, the literal term that hit. */
	matchedTerms: Record<string, string>;
	/** 'profile-text' = free-text hit over a Stellar Passport profile.
	 * 'repo-owner' = code-derived: the query is a GitHub login that owns indexed
	 * Stellar repos but has no Passport profile (P2).
	 * 'code-language' = admitted by CODE, not prose: at least one query token IS
	 * the primary language of a repo this builder owns in our index, and their
	 * profile text never says it. A MIXED row (one token by code, another by
	 * prose) keeps this basis and lists the prose fields in matchedFields too.
	 * Candidate discovery from an observable repo fact — never verified
	 * experience — so these rows rank below every prose hit. */
	basis: "profile-text" | "repo-owner" | "code-language";
}

/** sls-041: indexed repository evidence for the query, kept SEPARATE from the
 * subjective profile text — repo/language/last-activity are observable facts. */
export interface BuilderCodeEvidence {
	fullName: string;
	url: string | null;
	primaryLanguage: string | null;
	stars: number;
	lastCommitAt: string | null;
	repoScore: number;
}

export interface BuilderRow {
	githubUsername: string;
	displayName: string;
	bio: string | null;
	roleTitle: string | null;
	location: string | null;
	websiteUrl: string | null;
	twitterHandle: string | null;
	avatarUrl: string | null;
	isFeatured: boolean;
	projectCount: number;
	projects: BuilderProject[];
	url: string;
	/** null when the request had no q/skill filter. */
	match: BuilderMatch | null;
	/** Indexed repos owned by this GitHub account that match the query; [] = no
	 * direct code evidence; null when the request had no q/skill filter. */
	codeEvidence: BuilderCodeEvidence[] | null;
	/**
	 * What this person has actually shipped on Stellar, from the repos we
	 * index — QUERY-INDEPENDENT, present on every row (the profile page's
	 * "On Stellar" card, as data). `projects` above stays Passport-declared
	 * and `codeEvidence` stays query-scoped, exactly as documented; this is
	 * the block that was missing: every row used to read projectCount 0 and
	 * codeEvidence null on the unfiltered listing, so an agent enumerating
	 * builders saw an empty ecosystem. null only when the join could not run.
	 */
	onStellar: BuilderOnStellar | null;
}

/** Attribution rule (the same one the profile page enforces): `builds` =
 * projects reached through repos this person OWNS or an org that IS them;
 * `contributesTo` = projects reached only through repos they committed to.
 * `commits90d` counts own repos only; `contributedCommits12m` is their own
 * share of others' repos. A repo's total is never credited to a contributor. */
export interface BuilderOnStellar {
	repoCount: number;
	stars: number;
	commits90d: number;
	contributedCommits12m: number;
	lastCommitAt: string | null;
	languages: string[];
	builds: Array<{ slug: string; name: string }>;
	contributesTo: Array<{ slug: string; name: string }>;
	/** Up to 5: owned repos first, then by their own commits, then 90d activity. */
	topRepos: Array<{
		fullName: string;
		url: string;
		stars: number;
		lastCommitAt: string | null;
		commits90d: number;
		projectSlug: string | null;
		via: "owner" | "declared" | "contributor";
		myCommits12m: number | null;
	}>;
}

/** Shape a CodeActivity (src/lib/builder-code.ts) into the API block. Pure. */
export function onStellarBlock(a: {
	repos: Array<{
		fullName: string;
		url: string;
		stars: number;
		lastCommitAt: string | null;
		commits90d: number;
		projectSlug: string | null;
		via: "owner" | "declared" | "contributor";
		myCommits12m?: number;
	}>;
	stars: number;
	commits90d: number;
	contributedCommits12m: number;
	lastCommitAt: string | null;
	languages: string[];
	projects: Map<string, string>;
	contributesTo: Map<string, string>;
}): BuilderOnStellar {
	// Lexicographic, on purpose: ownership > their OWN commits > the repo's 90d
	// activity. An additive weight let a repo's total (everyone's work) outrank
	// a repo the person actually committed to — the org's number leaking into a
	// person's ordering, the same class as the headline bug the profile page had.
	const key = (r: (typeof a.repos)[number]): [number, number, number] => [
		r.via === "owner" ? 1 : 0,
		r.myCommits12m ?? 0,
		r.commits90d,
	];
	const cmp = (x: (typeof a.repos)[number], y: (typeof a.repos)[number]) => {
		const kx = key(x);
		const ky = key(y);
		for (let i = 0; i < kx.length; i++)
			if (ky[i] !== kx[i]) return ky[i] - kx[i];
		return 0;
	};
	const topRepos = [...a.repos]
		.sort(cmp)
		.slice(0, 5)
		.map((r) => ({
			fullName: r.fullName,
			url: r.url,
			stars: r.stars,
			lastCommitAt: r.lastCommitAt,
			commits90d: r.commits90d,
			projectSlug: r.projectSlug,
			via: r.via,
			myCommits12m: r.myCommits12m ?? null,
		}));
	const toList = (m: Map<string, string>) =>
		[...m.entries()].map(([slug, name]) => ({ slug, name: name || slug }));
	return {
		repoCount: a.repos.length,
		stars: a.stars,
		commits90d: a.commits90d,
		contributedCommits12m: a.contributedCommits12m,
		lastCommitAt: a.lastCommitAt,
		languages: a.languages,
		builds: toList(a.projects),
		contributesTo: toList(a.contributesTo),
		topRepos,
	};
}

/** The honest zero: the join RAN and found nothing indexed for this login.
 * Distinct from `onStellar: null`, which means the join could not run. */
export function emptyOnStellar(): BuilderOnStellar {
	return {
		repoCount: 0,
		stars: 0,
		commits90d: 0,
		contributedCommits12m: 0,
		lastCommitAt: null,
		languages: [],
		builds: [],
		contributesTo: [],
		topRepos: [],
	};
}

// Common tech/role vocabulary that marks a query as skill-search, not a person
// lookup — so "rust developer" / "soroban engineer" aren't mistaken for a name
// or a handle.
export const SKILL_HINT = new Set([
	"rust",
	"react",
	"typescript",
	"javascript",
	"node",
	"python",
	"go",
	"solidity",
	"frontend",
	"backend",
	"fullstack",
	"developer",
	"engineer",
	"dev",
	"devs",
	"smart",
	"contract",
	"contracts",
	"builder",
	"builders",
	"designer",
	"founder",
]);

// A single-token query shaped like a GitHub login (the P2 code-derived-builder
// trigger): one whitespace-free token in GitHub's login charset, and NOT a
// skill/vocabulary term (so q="rust"/"soroban" stay skill searches, never a
// handle lookup). Used only as a fallback when Passport profiles matched none —
// then, if it's also an indexed repo owner, we surface a code-derived row.
export function isHandleQuery(query: string): boolean {
	if (query.length < 2 || /\s/.test(query)) return false;
	if (BUILDER_SYNONYMS[query] || SKILL_HINT.has(query)) return false;
	return /^[a-z0-9][a-z0-9-]*$/.test(query);
}

// P2: synthesize a code-DERIVED builder row from the repos a GitHub login owns
// (the exact-owner subset already cut by the caller — `mine`). Pure so it's
// unit-testable: bio/roleTitle stay null (not a Passport profile), projects come
// from the owner's linked repos (deduped), codeEvidence is the top repos by
// repoScore. Returns null when `mine` is empty. `q` is the raw handle the caller
// matched (recorded as the matched term). The owner casing comes from the repos.
export function codeDerivedBuilderRow(
	q: string,
	mine: Array<Record<string, unknown>>,
): BuilderRow | null {
	if (!mine.length) return null;
	const sorted = [...mine].sort(
		(a, b) => Number(b.repoScore ?? 0) - Number(a.repoScore ?? 0),
	);
	const login = String(sorted[0].owner);
	// A code-derived row has no Passport profile, so displayName falls back to the
	// bare handle — overlay a curated real name (if any) so the person is findable
	// and identifiable by name, not only their login.
	const named = applyBuilderNameOverride({
		githubUsername: login,
		displayName: login,
		bio: null,
	});
	const projectsMap = new Map<string, string | null>();
	for (const d of sorted) {
		const pname = d.projectName ? String(d.projectName) : "";
		if (pname && !projectsMap.has(pname))
			projectsMap.set(pname, d.projectSlug ? String(d.projectSlug) : null);
	}
	const codeEvidence: BuilderCodeEvidence[] = sorted.slice(0, 5).map((d) => ({
		fullName: String(d.fullName ?? ""),
		url: (d.url as string) ?? null,
		primaryLanguage: (d.primaryLanguage as string) ?? null,
		stars: typeof d.stars === "number" ? d.stars : 0,
		lastCommitAt: (d.lastCommitAt as string) ?? null,
		repoScore: typeof d.repoScore === "number" ? d.repoScore : 0,
	}));
	return {
		githubUsername: login,
		displayName: named.displayName,
		bio: named.bio,
		roleTitle: null,
		location: null,
		websiteUrl: null,
		twitterHandle: null,
		avatarUrl: null,
		isFeatured: false,
		projectCount: projectsMap.size,
		projects: [...projectsMap.keys()].map((name) => ({ name })),
		url: `https://github.com/${login}`,
		match: {
			matchedFields: ["githubUsername (repo owner)"],
			matchedProjects: [...projectsMap.entries()].map(([name, slug]) => ({
				name,
				slug,
			})),
			matchedTerms: { [q]: login },
			basis: "repo-owner",
		},
		codeEvidence,
		// filled by the route's page-level join, same as Passport rows
		onStellar: null,
	};
}
