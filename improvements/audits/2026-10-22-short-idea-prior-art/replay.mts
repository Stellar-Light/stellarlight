// Replays vetIdea's prior-art cut over the live searchHackathonBuilds ranking.
//   before   = the rule production (1.9.87) runs; checked id for id against live vetIdea.
//   unguard  = commit e6431d06: also a build matching every word anywhere (share 1).
//   guarded  = this tree's shipped priorArtTop: every word in the build's own name
//              or description (textShare 1), computed by this tree's searchHackathonBuilds.
// Usage, from the worktree root: pnpm exec tsx tmp/replay.mts tmp/live-short.json [--rows]
import { readFileSync } from "node:fs";
import {
	type IndexedBuild,
	searchHackathonBuilds,
} from "../src/lib/hackathon-builds";
import { PRIOR_ART_TOP, priorArtTop } from "../src/lib/prior-art-rank";
import { contentTokens } from "../src/lib/repo-search";
import { GENERIC_QUERY_TOKENS } from "../src/lib/search-vocabulary";

export type Row = {
	id: string;
	name: string;
	description: string | null;
	track: string | null;
	award?: string | null;
	isWinner: boolean;
	matchedTerms: string[];
	similarity?: number;
};

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

/** textShare as this tree's searchHackathonBuilds computes it, from the
 * build's name and description (track and award cannot raise it). */
export function textShareOf(q: string, r: Row): number {
	const b = {
		id: r.id,
		name: r.name,
		description: r.description,
		track: r.track,
		award: r.award ?? null,
		isWinner: r.isWinner,
		voteCount: null,
		haystack:
			`${r.name} ${r.description ?? ""} ${r.track ?? ""} ${r.award ?? ""}`.toLowerCase(),
		hackathon: { title: "", slug: "", endedAt: null },
	} as unknown as IndexedBuild;
	return searchHackathonBuilds([b], q, { mode: "keyword" })[0]?.textShare ?? 0;
}

export const oldRule = (s: { similarity?: number; matchedTerms: string[] }) =>
	(s.similarity ?? 0) >= 0.7 || s.matchedTerms.length >= 2;

/** Each window row with the fields the shipped rule reads. */
export function scoredRows(q: string, rows: Row[]) {
	const c = concepts(q);
	return rows.map((r) => ({
		...r,
		b: { id: r.id, isWinner: r.isWinner },
		matched: r.matchedTerms,
		share: r.matchedTerms.length / (c.length || 1),
		textShare: textShareOf(q, r),
	}));
}

const isMain = /(^|[\\/])replay\.mts$/.test(process.argv[1] ?? "");
if (isMain) {
	const [, , livePath, flag] = process.argv;
	const live = JSON.parse(readFileSync(livePath, "utf8"));
	const labelKey = JSON.parse(readFileSync("tmp/label-key.json", "utf8")) as {
		n: number;
		idea: string;
		id: string;
	}[];
	const labelOf = new Map<number, number>(
		JSON.parse(readFileSync("tmp/labels.json", "utf8")).map(
			(l: { n: number; label: number }) => [l.n, l.label],
		),
	);
	const label = new Map(
		labelKey.map((k) => [`${k.idea}::${k.id}`, labelOf.get(k.n)]),
	);
	const groups = new Map<string, Record<string, number | number[]>>();
	const add = (g: string, k: string, n = 1) => {
		const o = groups.get(g) ?? {};
		o[k] = ((o[k] as number) ?? 0) + n;
		groups.set(g, o);
	};
	const addLabel = (g: string, k: string, l: number | undefined) => {
		const o = groups.get(g) ?? {};
		const arr = (o[k] as number[]) ?? [0, 0, 0, 0];
		arr[l ?? 3]++;
		o[k] = arr;
		groups.set(g, o);
	};
	let parityFail = 0;
	for (const row of live.rows) {
		const c = concepts(row.idea);
		const window = scoredRows(row.idea, row.ranked.slice(0, PRIOR_ART_TOP));
		const before = window.filter(oldRule).map((s) => s.id);
		const unguard = window
			.filter((s) => oldRule(s) || s.share >= 1)
			.map((s) => s.id);
		const guarded = priorArtTop(window).map((s) => s.id);
		const liveIds =
			row.priorArt?.builds?.map((b: { id: string }) => b.id) ??
			row.vetBuilds ??
			null;
		if (JSON.stringify(liveIds) !== JSON.stringify(before)) parityFail++;
		const words = contentTokens(row.idea).length;
		const g = row.slice ?? (words <= 3 ? "test-short" : "test-long");
		add(g, "ideas");
		add(g, "oneWordIdeas", c.length === 1 ? 1 : 0);
		add(g, "beforeServed", before.length);
		add(g, "unguardServed", unguard.length);
		add(g, "guardedServed", guarded.length);
		add(g, "beforeEmpty", before.length ? 0 : 1);
		add(g, "guardedEmpty", guarded.length ? 0 : 1);
		add(g, "guardedEmptyBelowRule", !guarded.length && window.length ? 1 : 0);
		add(g, "gainedVsBefore", guarded.filter((id) => !before.includes(id)).length);
		add(g, "lostVsBefore", before.filter((id) => !guarded.includes(id)).length);
		add(g, "droppedByGuard", unguard.filter((id) => !guarded.includes(id)).length);
		for (const s of window) {
			const l = label.get(`${row.idea}::${s.id}`);
			if (before.includes(s.id)) addLabel(g, "labelsBefore", l);
			if (guarded.includes(s.id)) addLabel(g, "labelsGuarded", l);
			if (unguard.includes(s.id) && !guarded.includes(s.id))
				addLabel(g, "labelsDroppedByGuard", l);
			if (guarded.includes(s.id) && !before.includes(s.id))
				addLabel(g, "labelsGainedVsBefore", l);
		}
		if (flag === "--rows")
			for (const s of window) {
				const tag = guarded.includes(s.id)
					? before.includes(s.id)
						? "kept"
						: "gained"
					: unguard.includes(s.id)
						? "DROPPED-BY-GUARD"
						: "below";
				console.log(
					`${row.idea.padEnd(26)} ${tag.padEnd(17)} label=${label.get(`${row.idea}::${s.id}`) ?? "-"} ${s.isWinner ? "W" : " "} text=${s.textShare.toFixed(2)} [${s.matchedTerms.join(",")}] ${s.name.slice(0, 60)}`,
				);
			}
	}
	console.log(
		`api ${live.apiVersionStart} -> ${live.apiVersionEnd}; parity failures (before != live vetIdea): ${parityFail}`,
	);
	console.log(
		"label arrays are [0 words only, 1 related, 2 same idea, unlabelled]",
	);
	for (const [g, o] of groups) console.log(g, JSON.stringify(o));
}
