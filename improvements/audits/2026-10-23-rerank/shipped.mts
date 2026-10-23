// Parity of the shipped stage with the measurement: runs this tree's
// rerankBuilds (src/lib/build-rerank.ts) over each idea's base top N, with the
// reranker answered from the recorded scores, and checks that vetIdea's
// listed builds (the reranked top five at RERANK_FLOOR) and the route's top 5
// equal evaluate.mts' variants (c) and (a). No network.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-rerank/shipped.mts <candidates.json> <scores.json>
import { readFileSync } from "node:fs";
import {
	RERANK_FLOOR,
	RERANK_MODEL,
	rerankBuilds,
} from "../../../src/lib/build-rerank";

type Slim = { id: string };
const [, , candPath, scoresPath] = process.argv;
const cand = JSON.parse(readFileSync(candPath, "utf8"));
const scores = JSON.parse(readFileSync(scoresPath, "utf8"))[RERANK_MODEL];
process.env.VOYAGE_API_KEY = "replay";
let current: Record<string, number> = {};
let ids: string[] = [];
globalThis.fetch = (async (_url: string, init: RequestInit) => {
	const { documents } = JSON.parse(String(init.body)) as {
		documents: string[];
	};
	return {
		ok: true,
		json: async () => ({
			data: documents.map((_, index) => ({
				index,
				relevance_score: current[ids[index]],
			})),
		}),
	};
}) as unknown as typeof fetch;

// evaluate.mts' order: score, best first; a tie keeps base order.
const reranked = (list: Slim[], s: Record<string, number>) =>
	list
		.map((x, r) => ({ x, r }))
		.sort((a, b) => s[b.x.id] - s[a.x.id] || a.r - b.r)
		.map(({ x }) => x.id);
let vetSame = 0;
let routeSame = 0;
for (const i of cand.ideas) {
	current = scores[`${i.set}|${i.id}`].scores;
	const asRows = (list: Slim[]) =>
		list.map((x) => ({ b: { ...cand.docs[x.id], id: x.id } }));
	ids = i.plain.map((x: Slim) => x.id);
	const vet = await rerankBuilds(i.idea.toLowerCase().trim(), asRows(i.plain));
	const vetListed = vet.ranked
		.slice(0, 5)
		.filter((x) => (vet.scores?.get(x.b.id) ?? 0) >= RERANK_FLOOR)
		.map((x) => x.b.id);
	const wantVet = reranked(i.plain, current)
		.slice(0, 5)
		.filter((id) => current[id] >= RERANK_FLOOR);
	if (JSON.stringify(vetListed) === JSON.stringify(wantVet)) vetSame++;
	ids = i.route.map((x: Slim) => x.id);
	const route = await rerankBuilds(
		i.idea.toLowerCase().trim(),
		asRows(i.route),
	);
	const wantRoute = reranked(i.route, current).slice(0, 5);
	if (
		JSON.stringify(route.ranked.slice(0, 5).map((x) => x.b.id)) ===
		JSON.stringify(wantRoute)
	)
		routeSame++;
}
console.log(
	`${cand.ideas.length} ideas: vetIdea's listed builds equal (c) on ${vetSame}, the route's top 5 equal (a) on ${routeSame}`,
);
