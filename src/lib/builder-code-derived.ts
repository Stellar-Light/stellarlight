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
	 * Stellar repos but has no Passport profile (P2). */
	basis: "profile-text" | "repo-owner";
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
	};
}
