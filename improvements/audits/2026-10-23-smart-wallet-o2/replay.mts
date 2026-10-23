// Replays this tree's searchHackathonBuilds over one capture (the shape
// ../2026-10-23-build-matching/capture.mjs and ../2026-10-23-nonsense-queries/
// capture.mjs write) and keeps every output a caller reads, so two runs (base
// and change) can be compared byte for byte: per query, the builds route's
// keyword and hybrid rankings (declared packages matched, one row per
// submission, winners only when the query was captured so) with every field
// of every row, the builds rule L held back and the unused-words line; the
// plain rankings prior art and analyze read; vetIdea's five (priorArtTop, as
// when its reranker does not run) and the brief's picks. The pool is built as
// ../2026-10-23-build-matching/replay.mts builds it. Also writes the line in
// note.mts's format, for check-unused.py.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-smart-account-recall/replay.mts <capture.json> <label> <out.json> <note.txt>
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pickBriefBuilds } from "../../../src/lib/hackathon-brief";
import {
	type IndexedBuild,
	indexedFromStored,
	type ScoredBuild,
	searchHackathonBuilds,
	unusedWordsWarning,
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
	similarity?: number;
};
type Captured = {
	set?: string;
	id?: string;
	idea?: string;
	kind?: string;
	group?: string;
	q?: string;
	winnersOnly?: boolean;
	hybrid: { rows: Row[] };
};

const [, , capturePath, label, outPath, notePath] = process.argv;
const live = JSON.parse(readFileSync(capturePath, "utf8"));
const AT = "2026-10-23T00:00:00.000Z";
const pool = (live.corpus as Row[]).map((r) => ({
	...indexedFromStored({
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
	} as unknown as HackathonBuild),
	voteCount: r.votes,
}));

const full = (s: ScoredBuild[]) => s.map(({ b, ...x }) => ({ id: b.id, ...x }));
const sha = (v: unknown) =>
	createHash("sha256").update(JSON.stringify(v)).digest("hex");
const ranking = (s: ScoredBuild[]) => ({
	hash: sha(full(s)),
	n: s.length,
	ids: s.map((x) => x.b.id),
	top20: full(s.slice(0, 20)),
});

const queries = [
	...(live.ideas as Captured[]).map((i) => ({
		key: `idea|${i.set}|${i.id}`,
		group: `idea ${i.set}`,
		set: i.set,
		id: i.id,
		q: i.idea as string,
		winnersOnly: false,
		hybrid: i.hybrid,
	})),
	...(live.extra as Captured[]).map((x) => ({
		key: `${x.kind}|${x.id ?? x.q}|${x.winnersOnly ? "winners" : "all"}`,
		group: x.group ? `${x.kind} ${x.group}` : (x.kind as string),
		set: x.kind as string,
		id: x.id ?? (x.q as string),
		q: x.q as string,
		winnersOnly: !!x.winnersOnly,
		hybrid: x.hybrid,
	})),
];

const out = {
	label,
	capture: capturePath.split("/").pop(),
	apiVersionStart: live.apiVersionStart,
	apiVersionEnd: live.apiVersionEnd,
	corpus: pool.length,
	queries: [] as unknown[],
};
const note: string[] = [];
for (const x of queries) {
	// The route lowercases and trims q (parseBuildFilters).
	const q = x.q.trim().toLowerCase();
	const semantic = new Map(
		x.hybrid.rows
			.filter((r) => r.similarity !== undefined)
			.map((r) => [r.id, r.similarity as number]),
	);
	const base = { winnersOnly: x.winnersOnly, perSubmission: true };
	// The builds route, as queryBuilds runs it before the reranker.
	const route = (mode: "keyword" | "hybrid") => {
		const held: { b: IndexedBuild; matched: string[] }[] = [];
		const rows = searchHackathonBuilds(pool, q, {
			...base,
			mode,
			semantic,
			packages: true,
			withheld: held,
		});
		const listed = new Set(rows.map((s) => s.b.id));
		const kept = held.filter((w) => !listed.has(w.b.id));
		const warning = unusedWordsWarning(pool, q, rows, kept);
		note.push(
			`${x.group} | ${x.q} | ${mode} | ${rows.length} | ${warning ?? "none"}`,
		);
		return {
			...ranking(rows),
			held: kept.map((w) => ({ id: w.b.id, matched: w.matched })),
			warning,
		};
	};
	const plain = (mode: "keyword" | "hybrid") =>
		searchHackathonBuilds(pool, q, { ...base, mode, semantic });
	const plainHybrid = plain("hybrid");
	out.queries.push({
		key: x.key,
		group: x.group,
		set: x.set,
		id: x.id,
		q: x.q,
		winnersOnly: x.winnersOnly,
		route: { keyword: route("keyword"), hybrid: route("hybrid") },
		plain: { keyword: ranking(plain("keyword")), hybrid: ranking(plainHybrid) },
		vet: priorArtTop(plainHybrid).map((s) => s.b.id),
		brief: pickBriefBuilds(plainHybrid).map((s) => s.b.id),
	});
}
writeFileSync(outPath, JSON.stringify(out));
writeFileSync(notePath, `${note.join("\n")}\n`);
console.log(
	`${label}: ${capturePath.split("/").pop()}, corpus ${pool.length}, ${queries.length} queries, api ${live.apiVersionStart} -> ${live.apiVersionEnd}`,
);
