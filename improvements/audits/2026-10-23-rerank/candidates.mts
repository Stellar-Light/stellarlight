// The base: this tree's searchHackathonBuilds replayed over lane K's capture
// (../2026-10-23-build-matching/capture.mjs), as that round's replay.mts
// does. Per idea it keeps the top N of the plain hybrid ranking (what vetIdea
// reads) and of the ranking with package matching (what the builds route
// reads), with the fields the evidence rule reads, vetIdea's listed five,
// and the reranker's document text for every candidate.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-rerank/candidates.mts <live.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { rerankDocument } from "../../../src/lib/build-rerank";
import { pickBriefBuilds } from "../../../src/lib/hackathon-brief";
import {
	indexedFromStored,
	type ScoredBuild,
	searchHackathonBuilds,
} from "../../../src/lib/hackathon-builds";
import {
	priorArtTop,
	twoWordsOrMeaning,
} from "../../../src/lib/prior-art-rank";
import type { HackathonBuild } from "../../../src/payload-types";

const N = 50;
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

const [, , livePath, outPath] = process.argv;
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

const slim = (s: ScoredBuild) => ({
	id: s.b.id,
	similarity: s.similarity,
	matched: s.matched,
	textShare: s.textShare,
});
const out = {
	apiVersionStart: live.apiVersionStart,
	apiVersionEnd: live.apiVersionEnd,
	corpus: pool.length,
	n: N,
	ideas: [] as unknown[],
	docs: {} as Record<string, { doc: string; name: string; event: string }>,
};
let top5Parity = 0;
for (const it of live.ideas) {
	const sem = new Map<string, number>(
		(it.hybrid.rows as Row[])
			.filter((x) => x.similarity !== undefined)
			.map((x) => [x.id, x.similarity as number]),
	);
	const run = (packages: boolean) =>
		searchHackathonBuilds(pool, it.idea, {
			mode: "hybrid",
			semantic: sem,
			perSubmission: true,
			packages,
		});
	const plain = run(false);
	const route = run(true);
	const liveTop5 = new Set(
		(it.hybrid.rows as Row[]).slice(0, 5).map((r) => r.id),
	);
	if (plain.slice(0, 5).every((s) => liveTop5.has(s.b.id))) top5Parity++;
	for (const s of [...plain.slice(0, N), ...route.slice(0, N)])
		out.docs[s.b.id] = {
			// What the reranker reads, the route's own definition.
			doc: rerankDocument(s.b),
			name: s.b.name,
			event: s.b.hackathon.title,
		};
	out.ideas.push({
		set: it.set,
		id: it.id,
		idea: it.idea,
		plain: plain.slice(0, N).map(slim),
		route: route.slice(0, N).map(slim),
		plainMatched: plain.length,
		vet: priorArtTop(plain).map((s) => s.b.id),
		// hackathonBrief's builds and its winner slots (pickBriefBuilds).
		brief: pickBriefBuilds(plain).map((s) => s.b.id),
		briefWinners: plain
			.filter((s) => s.b.isWinner && s.share >= 0.5 && twoWordsOrMeaning(s))
			.slice(0, 2)
			.map((s) => s.b.id),
	});
}
writeFileSync(outPath, JSON.stringify(out));
console.log(
	`${out.ideas.length} ideas, ${Object.keys(out.docs).length} candidate builds; plain top-5 set equal to live on ${top5Parity}`,
);
