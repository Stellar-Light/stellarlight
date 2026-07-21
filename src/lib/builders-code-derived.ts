/**
 * Pure, unit-testable builder-matching helpers + row types, extracted from
 * src/app/api/builders/route.ts.
 *
 * A Next.js App Router `route.ts` may only export route handlers (GET/POST/…)
 * and route config (`dynamic`/`revalidate`/…) — exporting arbitrary helpers
 * ("Route does not match the required types of a Next.js Route", a `next build`
 * error tsc --noEmit does NOT catch). These were exported from the route so the
 * P2 code-derived-builder test could import them; they live here instead, and
 * both the route and its test import from this module.
 */
import { BUILDER_SYNONYMS } from "@/lib/builder-vocabulary";

export interface BuilderProject {
	name: string;
	slug?: string;
	short_description?: string;
	status?: string;
}

/** sls-041: WHY a row matched the skill query — candidate discovery is a TEXT
 * match over profile/project prose, and consumers must be able to tell a
 * strong repository-backed match from a weak bio mention without re-running
 * the investigation. */
export interface BuilderMatch {
	/** Profile fields the query matched (e.g. "bio", "roleTitle", "projects.name"). */
	matchedFields: string[];
	/** Projects whose name/description matched the query. */
	matchedProjects: Array<{ name: string; slug: string | null }>;
	/** Per query token, the literal term that hit (a token can match via a
	 * synonym — e.g. "payments" hitting via "remittance"). */
	matchedTerms: Record<string, string>;
	/** What this match IS. "profile-text" = free-text profile/project hit (a
	 * Stellar Passport builder). "repo-owner" = a code-DERIVED row: the query is
	 * a GitHub login that owns indexed Stellar repos but has no Passport profile
	 * (P2 — e.g. `kalepail`), so the row is built from repo OWNERSHIP, not a
	 * profile; `bio`/`roleTitle` are null and the evidence is in `codeEvidence`. */
	basis: "profile-text" | "repo-owner";
}

/** sls-041: indexed repository evidence for the query, kept SEPARATE from the
 * subjective profile text — the repo, its language and last activity are
 * observable facts; bio/role claims are not. */
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
	// `scfTier` REMOVED in spec 1.7.19 (sls-040 / #521): the source field was
	// never populated (116/116 live profiles empty), so the always-blank value
	// contradicted the documented "SCF-tier data unsupported" contract. Person-
	// level SCF tier, if it ever gets a real source, returns as a typed,
	// documented field — not a blank placeholder.
	isFeatured: boolean;
	projectCount: number;
	projects: BuilderProject[];
	url: string;
	/** null when the request had no q/skill filter. */
	match: BuilderMatch | null;
	/** Indexed repos owned by this GitHub account that match the query; [] =
	 * no direct code evidence in our index (an explicitly weaker match), null
	 * when the request had no q/skill filter. */
	codeEvidence: BuilderCodeEvidence[] | null;
}

// Skill/tech terms that, on their own, read as a candidate search NOT a person
// lookup — so "rust developer" / "soroban engineer" don't get mistaken for a
// name. Complements the BUILDER_SYNONYMS keys already checked below.
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
		displayName: login,
		bio: null,
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
