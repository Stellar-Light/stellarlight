// Replays this tree's searchHackathonBuilds over a capture from capture.mjs:
// the captured browse rows become stored rows (indexedFromStored, so the
// haystack is built the way the store's index builds it, declared stack
// included), and each hybrid ranking's meaning scores become the meaning map
// the route would pass. Per idea it keeps the builds route's rankings and a
// hash of the plain rankings (no package matching) that vetIdea, the brief
// and analyze read, with vetIdea's five and the brief's picks from them. Run
// it once on the base code and once per candidate; compare.mts reads the
// outputs.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-build-matching/replay.mts <live.json> <label> <out.json>
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pickBriefBuilds } from "../../../src/lib/hackathon-brief";
import {
	indexedFromStored,
	type ScoredBuild,
	searchHackathonBuilds,
} from "../../../src/lib/hackathon-builds";
import { priorArtTop } from "../../../src/lib/prior-art-rank";
import type { HackathonBuild } from "../../../src/payload-types";

type Row = {
	id: string;
	name: string;
	description: string | null;
	track: string | null;
	award: string | null;
	hackathon: string;
	hackathonSlug: string;
	endedAt: string | null;
	placement: string | null;
	isWinner: boolean;
	votes: number | null;
	stack?: string[];
	matchedTerms: string[];
	similarity?: number;
};
type Ranking = {
	pages: number[];
	meta: { counts: { matched: number } } | null;
	rows: Row[];
};

const [, , livePath, label, outPath] = process.argv;
const live = JSON.parse(readFileSync(livePath, "utf8"));
const AT = "2026-10-23T00:00:00.000Z";
const stored = (r: Row) =>
	({
		id: r.id,
		buildId: r.id,
		name: r.name,
		vision: r.description,
		track: r.track,
		award: r.award,
		placement: r.placement,
		isWinner: r.isWinner,
		hackathonSlug: r.hackathonSlug,
		hackathonTitle: r.hackathon,
		endedAt: r.endedAt,
		url: "",
		firstSeenAt: AT,
		lastSeenAt: AT,
		updatedAt: AT,
		createdAt: AT,
		...(r.stack ? { stack: r.stack, stackReadAt: AT } : {}),
	}) as unknown as HackathonBuild;
const pool = (live.corpus as Row[]).map((r) => ({
	...indexedFromStored(stored(r)),
	voteCount: r.votes,
}));

const semOf = (r: Ranking) =>
	new Map(
		r.rows
			.filter((x) => x.similarity !== undefined)
			.map((x) => [x.id, x.similarity as number]),
	);
/** `packages`: what the builds route asks for; vetIdea, the brief and
 * analyze do not (code before the option ignores it). */
const run = (
	q: string,
	mode: "keyword" | "hybrid",
	semantic?: Map<string, number>,
	winnersOnly = false,
	packages = false,
) =>
	searchHackathonBuilds(pool, q, {
		mode,
		semantic,
		winnersOnly,
		perSubmission: true,
		packages,
	});
const top = (s: ScoredBuild[], n = 20) =>
	s.slice(0, n).map((x) => ({ id: x.b.id, matched: x.matched }));
const ids = (s: ScoredBuild[]) => s.map((x) => x.b.id);
/** Live order against the replay's, over the rows live served. */
const parity = (liveRows: Row[], replay: ScoredBuild[]) => {
	const r = ids(replay).slice(0, liveRows.length);
	return liveRows.every((x, i) => x.id === r[i]);
};

const out = {
	label,
	apiVersionStart: live.apiVersionStart,
	apiVersionEnd: live.apiVersionEnd,
	corpus: pool.length,
	ideas: [] as unknown[],
	extra: [] as unknown[],
};
for (const it of live.ideas) {
	const sem = semOf(it.hybrid);
	// The builds route's rankings, and the plain ones prior art reads.
	const hybrid = run(it.idea, "hybrid", sem, false, true);
	const keyword = run(it.idea, "keyword", undefined, false, true);
	const plain = run(it.idea, "hybrid", sem);
	const plainKeyword = run(it.idea, "keyword");
	out.ideas.push({
		set: it.set,
		id: it.id,
		idea: it.idea,
		live: {
			hybridMatched: it.hybrid.meta?.counts.matched ?? null,
			hybridCaptured: it.hybrid.rows.length,
			keywordMatched: it.keyword.meta?.counts.matched ?? null,
			pages: [...it.hybrid.pages, ...it.keyword.pages],
		},
		parity: {
			hybridOrder: parity(it.hybrid.rows, hybrid),
			hybridMatched: hybrid.length === it.hybrid.meta?.counts.matched,
			keywordOrder: parity(it.keyword.rows, keyword),
			keywordMatched: keyword.length === it.keyword.meta?.counts.matched,
		},
		hybrid: { ids: ids(hybrid), top: top(hybrid) },
		keyword: { ids: ids(keyword), top: top(keyword) },
		// Every field of every row of the plain rankings, hashed.
		plainHash: createHash("sha256")
			.update(
				JSON.stringify(
					[plain, plainKeyword].map((r) =>
						r.map(({ b, ...s }) => ({ id: b.id, ...s })),
					),
				),
			)
			.digest("hex"),
		vet: priorArtTop(plain).map((s) => s.b.id),
		brief: pickBriefBuilds(plain).map((s) => s.b.id),
	});
}
for (const x of live.extra) {
	const keyword = run(x.q, "keyword", undefined, !!x.winnersOnly, true);
	const hybrid = run(x.q, "hybrid", semOf(x.hybrid), !!x.winnersOnly, true);
	const named = (s: ScoredBuild[]) =>
		s.map((y) => ({ id: y.b.id, name: y.b.name, matched: y.matched }));
	out.extra.push({
		kind: x.kind,
		q: x.q,
		winnersOnly: !!x.winnersOnly,
		live: {
			keywordMatched: x.keyword.meta?.counts.matched ?? null,
			hybridMatched: x.hybrid.meta?.counts.matched ?? null,
		},
		parity: {
			keywordOrder: parity(x.keyword.rows, keyword),
			hybridOrder: parity(x.hybrid.rows, hybrid),
		},
		keyword: named(keyword),
		hybrid: named(hybrid),
	});
}
writeFileSync(outPath, JSON.stringify(out));
const p = (out.ideas as { parity: Record<string, boolean> }[]).map(
	(i) => i.parity,
);
const n = (k: string) => p.filter((x) => x[k]).length;
console.log(
	`${label}: ${p.length} ideas; parity hybrid order ${n("hybridOrder")}, hybrid matched ${n("hybridMatched")}, keyword order ${n("keywordOrder")}, keyword matched ${n("keywordMatched")}`,
);
