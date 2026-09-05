/**
 * Code-language admission for /api/builders.
 *
 * The `q`/`skill` filter reads profile PROSE (bio, roleTitle, declared project
 * text). Measured 2026-09-05: `?q=rust` returned 8 builders while 40 of the 170
 * served carry "Rust" in `onStellar.languages` — a builder whose bio never says
 * "Rust" but who owns Rust repos on Stellar was invisible to "who are
 * experienced Rust Soroban devs".
 *
 * So: a query token that IS the primary language of a repo the builder OWNS in
 * our index also admits them. That is CANDIDATE DISCOVERY from an observable
 * repo fact, never verified experience — such rows are marked
 * `match.basis: "code-language"` and rank below every prose hit.
 *
 * Pure (no Payload/DB): the route hands it the owned repos it already loaded.
 */

import type { BuilderCodeEvidence } from "./builder-code-derived";

/** The repo fields this pass needs — a raw Payload doc, loosely typed. */
export type OwnedRepoDoc = Record<string, unknown>;

/** Evidence cap per row: the same 5 the query-scoped codeEvidence pass uses. */
export const CODE_EVIDENCE_CAP = 5;

export interface CodeLanguageAdmission {
	/** query token → the language AS INDEXED (`rust` → `Rust`). Empty = no admission. */
	terms: Record<string, string>;
	/** The repos that prove it, most recently committed first, capped. */
	repos: BuilderCodeEvidence[];
}

/**
 * Which of `tokens` are satisfied by an owned repo's `primaryLanguage`
 * (case-insensitive, exact — "rust" matches "Rust", never "Rustlang"), and the
 * repos proving it. `tokens` are the raw query tokens; the caller decides
 * admission (a token still needs a prose OR code hit, so AND-semantics hold).
 */
export function admitByCodeLanguage(
	tokens: string[],
	ownedRepos: OwnedRepoDoc[],
	cap: number = CODE_EVIDENCE_CAP,
): CodeLanguageAdmission {
	const wanted = new Map(tokens.map((t) => [t.toLowerCase(), t]));
	const terms: Record<string, string> = {};
	const hits: BuilderCodeEvidence[] = [];
	for (const d of ownedRepos) {
		const lang = String(d.primaryLanguage ?? "");
		const token = lang && wanted.get(lang.toLowerCase());
		if (!token) continue;
		terms[token] = lang;
		hits.push({
			fullName: String(d.fullName ?? ""),
			url: (d.url as string) ?? null,
			primaryLanguage: lang,
			stars: typeof d.stars === "number" ? d.stars : 0,
			lastCommitAt: (d.lastCommitAt as string) ?? null,
			repoScore: typeof d.repoScore === "number" ? d.repoScore : 0,
		});
	}
	hits.sort(
		(a, b) =>
			Date.parse(b.lastCommitAt ?? "0") - Date.parse(a.lastCommitAt ?? "0"),
	);
	return { terms, repos: hits.slice(0, cap) };
}

/** GitHub language names whose casing a Title-case of the token gets wrong. */
const LANGUAGE_CASING: Record<string, string> = {
	typescript: "TypeScript",
	javascript: "JavaScript",
	"c++": "C++",
	"c#": "C#",
	php: "PHP",
	html: "HTML",
	css: "CSS",
	"objective-c": "Objective-C",
};

/**
 * Language values to test a query token against with an EXACT (`in`) match.
 *
 * `primaryLanguage: { like: token }` was a substring test, so `java` matched
 * every JavaScript repo — filling a capped page with rows the JS-side exact
 * check then discards, and dropping the Java owners that never fit. Mongo
 * equality is case-sensitive, so the token is mapped to GitHub's own casing
 * (Title-case by default) and the raw token is kept for anything the map and
 * Title-case both miss.
 */
export function languageCandidates(token: string): string[] {
	const t = token.toLowerCase();
	const canonical =
		LANGUAGE_CASING[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
	return [...new Set([canonical, token])];
}
