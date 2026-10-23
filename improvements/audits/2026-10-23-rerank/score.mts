// Scores each idea's candidates (candidates.mts) with the embedding
// provider's rerank API (the key search by meaning uses):
// one call per idea and model, the union of vetIdea's and the route's top N
// as the documents. Scores land in a cache file that is read first, so a
// rerun skips what is scored. Retries only on 429, 5xx and network errors.
// VOYAGE_API_KEY comes from the environment, loaded with dotenv the way the
// app's scripts load .env.local; it is never printed.
// Usage, from the repository root:
//   DOTENV_CONFIG_PATH=<.env.local> pnpm exec tsx -r dotenv/config \
//     improvements/audits/2026-10-23-rerank/score.mts <candidates.json> <scores.json> <models> <slices>
// <models>: comma list (rerank-2,rerank-2-lite); <slices>: comma list of
// working, holdout, short, tests, fresh.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [, , candPath, scoresPath, modelArg, sliceArg] = process.argv;
const key = process.env.VOYAGE_API_KEY;
if (!key) throw new Error("VOYAGE_API_KEY is not set");
const cand = JSON.parse(readFileSync(candPath, "utf8"));
const slices = new Set(sliceArg.split(","));
const held = new Set(
	JSON.parse(
		readFileSync(
			"improvements/audits/2026-10-22-prior-art-precision/ideas.json",
			"utf8",
		),
	)
		.ideas.filter((i: { slice: string }) => i.slice === "holdout")
		.map((i: { id: string }) => i.id),
);
const sliceOf = (i: { set: string; id: string }) =>
	i.set === "40" ? (held.has(i.id) ? "holdout" : "working") : i.set;
// scores[model][set|id] = { tokens, scores: { buildId: relevance } }
const scores: Record<
	string,
	Record<string, { tokens: number; scores: Record<string, number> }>
> = existsSync(scoresPath) ? JSON.parse(readFileSync(scoresPath, "utf8")) : {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rerank(model: string, query: string, documents: string[]) {
	for (let attempt = 1; ; attempt++) {
		let status = 0;
		try {
			const res = await fetch("https://api.voyageai.com/v1/rerank", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${key}`,
				},
				body: JSON.stringify({ model, query, documents, truncation: true }),
				signal: AbortSignal.timeout(30_000),
			});
			status = res.status;
			if (res.ok)
				return (await res.json()) as {
					data: { index: number; relevance_score: number }[];
					usage: { total_tokens: number };
				};
			if (status !== 429 && status < 500)
				throw new Error(
					`rerank ${status}: ${(await res.text()).slice(0, 200)}`,
				);
		} catch (e) {
			// A 4xx other than 429 is not transient: stop.
			if (status && status !== 429 && status < 500) throw e;
		}
		if (attempt >= 4)
			throw new Error(`rerank failed after ${attempt} tries (${status})`);
		console.log(`  retry ${attempt} (${status || "network"})`);
		await sleep(2000 * attempt);
	}
}

let calls = 0;
let tokens = 0;
for (const model of modelArg.split(",")) {
	scores[model] ??= {};
	for (const i of cand.ideas) {
		if (!slices.has(sliceOf(i))) continue;
		const k = `${i.set}|${i.id}`;
		if (scores[model][k]) continue;
		const ids = [
			...new Set([...i.plain, ...i.route].map((x: { id: string }) => x.id)),
		];
		const r = await rerank(
			model,
			i.idea.toLowerCase().trim(),
			ids.map((id) => cand.docs[id].doc),
		);
		const s: Record<string, number> = {};
		for (const d of r.data) s[ids[d.index]] = d.relevance_score;
		if (Object.keys(s).length !== ids.length)
			throw new Error(
				`${k}: ${Object.keys(s).length} scores for ${ids.length} documents`,
			);
		scores[model][k] = { tokens: r.usage.total_tokens, scores: s };
		calls++;
		tokens += r.usage.total_tokens;
		writeFileSync(scoresPath, JSON.stringify(scores));
		await sleep(250);
	}
}
console.log(`${calls} calls, ${tokens} tokens`);
