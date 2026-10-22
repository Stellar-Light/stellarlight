// Shared replay helpers: captured rows as IndexedBuild rows, the scorer's
// concept list and per-word detail, and output helpers.
import { readFileSync, writeFileSync } from "node:fs";
import {
	expandBuildTerm,
	type IndexedBuild,
} from "../src/lib/hackathon-builds";
import { contentTokens } from "../src/lib/repo-search";
import { GENERIC_QUERY_TOKENS } from "../src/lib/search-vocabulary";

export type Row = {
	id: string;
	name: string;
	description: string | null;
	track: string | null;
	award?: string | null;
	isWinner: boolean;
	hackathonSlug?: string;
	endedAt?: string | null;
	matchedTerms: string[];
	similarity?: number;
};

export const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

/** JSON with dashes from upstream text escaped as unicode escapes: the same
 * data once parsed. */
export const writeJson = (p: string, v: unknown) =>
	writeFileSync(
		p,
		`${JSON.stringify(v, null, 1).replace(
			/[\u2013\u2014]/g,
			(c) => `\\u${c.charCodeAt(0).toString(16)}`,
		)}\n`,
	);

/** Upstream names for printing, dashes as hyphens. */
export const clean = (s: string, n = 50) =>
	s.replace(/[\u2013\u2014]/g, "-").slice(0, n);

export function indexed(r: Row): IndexedBuild {
	return {
		id: r.id,
		name: r.name,
		description: r.description,
		githubUrl: null,
		demoUrl: null,
		videoUrl: null,
		track: r.track,
		hackathonPlacement: null,
		award: r.award ?? null,
		isWinner: r.isWinner,
		voteCount: null,
		url: "",
		source: "dorahacks",
		hackathon: {
			title: "",
			slug: r.hackathonSlug ?? "",
			endedAt: r.endedAt ?? null,
		},
		// haystackOf in src/lib/hackathon-builds.ts
		haystack:
			`${r.name} ${r.description ?? ""} ${r.track ?? ""} ${r.award ?? ""}`.toLowerCase(),
	} as IndexedBuild;
}

// searchHackathonBuilds' own concept list (src/lib/hackathon-builds.ts).
const QUERY_FILLER = new Set(["like", "similar"]);
export function concepts(q: string): string[] {
	const raw = [
		...new Set(
			contentTokens(q.toLowerCase().trim()).filter(
				(t) => !GENERIC_QUERY_TOKENS.has(t) && !QUERY_FILLER.has(t),
			),
		),
	];
	const parts = new Set(
		raw.filter((t) => t.includes("-")).flatMap((t) => t.split("-")),
	);
	return raw.filter((t) => !parts.has(t));
}

// wordForms and termMatcher as in src/lib/hackathon-builds.ts (not exported).
function wordForms(token: string): string[] {
	if (token.length > 3 && token.endsWith("s"))
		return [token, token.slice(0, -1)];
	return token.length > 2 ? [token, `${token}s`] : [token];
}
function termMatcher(v: string): (hay: string) => boolean {
	if (v.length > 3) return (hay) => hay.includes(v);
	const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`\\b${escaped}\\b`);
	return (hay) => re.test(hay);
}

export type WordHit = {
	t: string;
	/** Rarity weight over the pool, as the scorer computes it. */
	w: number;
	/** Pool builds whose haystack matches the word (synonyms included). */
	df: number;
	name: boolean;
	/** In the build's own name or description, synonyms included. */
	text: boolean;
	/** In its own name or description as typed (what textShare reads). */
	typed: boolean;
	/** Anywhere, track and award text included (what matchedTerms reads). */
	any: boolean;
};

/** Per concept: its rarity weight over the pool, and per build where it
 * matched. */
export function termDetail(q: string, pool: IndexedBuild[]) {
	const tokens = concepts(q);
	const terms = tokens.map((t) => {
		const joined = t.includes("-")
			? [t.replace(/-/g, " "), t.replace(/-/g, "")]
			: [];
		return {
			t,
			variants: [...expandBuildTerm(t), ...joined].map(termMatcher),
			own: [...wordForms(t), ...joined].map(termMatcher),
		};
	});
	const weight = new Map<string, number>();
	const df = new Map<string, number>();
	for (const { t, variants } of terms) {
		const n = pool.filter((b) =>
			variants.some((hit) => hit(b.haystack)),
		).length;
		df.set(t, n);
		weight.set(t, Math.log((pool.length + 1) / (n + 1)));
	}
	const total = [...weight.values()].reduce((n, w) => n + w, 0) || 1;
	const per = (b: IndexedBuild): WordHit[] => {
		const name = b.name.toLowerCase();
		const text = `${name} ${b.description ?? ""}`.toLowerCase();
		return terms.map(({ t, variants, own }) => ({
			t,
			w: weight.get(t) ?? 0,
			df: df.get(t) ?? 0,
			name: variants.some((h) => h(name)),
			text: variants.some((h) => h(text)),
			typed: own.some((h) => h(text)),
			any: variants.some((h) => h(b.haystack)),
		}));
	};
	return { tokens, weight, df, total, per, n: pool.length };
}
