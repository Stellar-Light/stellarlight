// Shared helpers and the two candidate rules. Each candidate reads only the
// fields of one ranked row and whether search by meaning ran, so on vetIdea's
// five it can only remove builds (filter-only). Fixed before any fresh result
// was read.
import { readFileSync, writeFileSync } from "node:fs";
import type { IndexedBuild } from "../../../src/lib/hackathon-builds";

export const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

/** JSON with dashes from upstream text escaped as unicode escapes. */
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

export type Row = {
	id: string;
	name: string;
	description: string | null;
	track: string | null;
	award?: string | null;
	hackathon?: string;
	isWinner: boolean;
	hackathonSlug?: string;
	endedAt?: string | null;
	matchedTerms: string[];
	similarity?: number;
};

/** A captured row as the index holds it (haystackOf in hackathon-builds.ts). */
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
			title: r.hackathon ?? "",
			slug: r.hackathonSlug ?? "",
			endedAt: r.endedAt ?? null,
		},
		haystack:
			`${r.name} ${r.description ?? ""} ${r.track ?? ""} ${r.award ?? ""}`.toLowerCase(),
	} as IndexedBuild;
}

/** What a rule reads from one ranked row. */
export type W = {
	id: string;
	name: string;
	isWinner: boolean;
	similarity?: number;
	matched: string[];
	textShare?: number;
	/** Share of the idea's concepts matched (ScoredBuild.share). */
	share?: number;
};

const FLOOR = 0.7;
const sim = (w: W) => (w.similarity ?? 0) >= FLOOR;
/** Among the meaning neighbours: search by meaning scored it. */
const near = (w: W) => w.similarity !== undefined;
const two = (w: W) => w.matched.length >= 2;
const one = (w: W) => (w.textShare ?? 0) >= 1;

export type Rule = {
	/** isPriorArtEvidence: vetIdea's five and the brief's other slots. */
	evidence: (w: W, meaningRan: boolean) => boolean;
	/** twoWordsOrMeaning: the brief's winner slots. */
	winner: (w: W, meaningRan: boolean) => boolean;
};

export const RULES: Record<string, Rule> = {
	// 1.9.91 (main): isPriorArtEvidence and twoWordsOrMeaning.
	current: {
		evidence: (w) => sim(w) || two(w) || one(w),
		winner: (w) => sim(w) || two(w),
	},
	// G1: when meaning ran, the two-word path also needs a meaning score.
	G1: {
		evidence: (w, m) => sim(w) || (two(w) && (!m || near(w))) || one(w),
		winner: (w, m) => sim(w) || (two(w) && (!m || near(w))),
	},
	// G2: G1, and the one-word (textShare) path also needs a meaning score.
	G2: {
		evidence: (w, m) => sim(w) || ((two(w) || one(w)) && (!m || near(w))),
		winner: (w, m) => sim(w) || (two(w) && (!m || near(w))),
	},
};

export const TOP = 5;

/** vetIdea's builds: the top five, filtered. */
export const vetPick = (ranked: W[], r: Rule, m: boolean) =>
	ranked.slice(0, TOP).filter((w) => r.evidence(w, m));

/** pickBriefBuilds with the rule swapped: up to two winners covering half
 * the idea's words, then vetIdea's builds, five at most. */
export function briefPick(ranked: W[], r: Rule, m: boolean) {
	const winners = ranked
		.filter((w) => w.isWinner && (w.share ?? 0) >= 0.5 && r.winner(w, m))
		.slice(0, 2);
	const seen = new Set(winners.map((w) => w.id));
	return [
		...winners,
		...vetPick(ranked, r, m).filter((w) => !seen.has(w.id)),
	].slice(0, TOP);
}
