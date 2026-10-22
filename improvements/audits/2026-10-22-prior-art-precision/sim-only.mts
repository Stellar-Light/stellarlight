// The top-five builds the current rule lists on its meaning score alone
// (0.7 or more, fewer than two matched words, not every word in own text),
// sorted by score, with grade, matched words and the gap to the best score
// in the idea's top five. Usage: pnpm exec tsx tmp/sim-only.mts <windows file> <slice>
import { PRIOR_ART_TOP } from "../src/lib/prior-art-rank";
import { clean, readJson } from "./lib.mts";
import { oneWord, sim, twoWords, type W } from "./rules.mts";

const [, , file, slice] = process.argv;
const data = readJson(file);
const out: string[][] = [];
for (const idea of data.ideas) {
	if (idea.slice !== slice) continue;
	const top = idea.window.slice(0, PRIOR_ART_TOP) as (W & {
		grade: number | null;
	})[];
	const best = Math.max(...top.map((w) => w.similarity ?? 0));
	for (const w of top) {
		if (!sim(w) || twoWords(w) || oneWord(w)) continue;
		out.push([
			(w.similarity ?? 0).toFixed(3),
			String(w.grade ?? "-"),
			String(w.matched.length),
			(best - (w.similarity ?? 0)).toFixed(3),
			idea.id,
			clean(w.name),
		]);
	}
}
out.sort((a, b) => Number(b[0]) - Number(a[0]));
console.log("score grade words gap-to-best idea name");
for (const o of out) console.log(o.join("  "));
