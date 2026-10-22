// Per idea: its words (corpus count, weight) and each top-five build with
// the condition of the current rule that admits it (S meaning score >= 0.7,
// M two matched words, T every word in own text), its share of the idea's
// weight (anywhere / own text / as typed) and its matched words (^ in the
// name, * only in track or award text). Usage:
//   pnpm exec tsx tmp/diagnose.mts <windows file> <slice>
import { PRIOR_ART_TOP } from "../src/lib/prior-art-rank";
import { clean, readJson } from "./lib.mts";
import { CANDIDATES, oneWord, share, sim, twoWords, type W } from "./rules.mts";

const [, , file, slice] = process.argv;
const data = readJson(file);
for (const idea of data.ideas) {
	if (idea.slice !== slice) continue;
	console.log(
		`\n${idea.id} [${idea.slice}] ${idea.idea}  words: ${idea.words
			.map(
				(x: { t: string; df: number; w: number }) =>
					`${x.t}(df ${x.df}, w ${x.w.toFixed(2)})`,
			)
			.join(" ")}`,
	);
	for (const r of idea.window.slice(0, PRIOR_ART_TOP)) {
		const w: W = { ...r, total: idea.totalWeight, n: idea.corpus };
		const cond = `${sim(w) ? "S" : ""}${twoWords(w) ? "M" : ""}${oneWord(w) ? "T" : ""}`;
		console.log(
			`  ${CANDIDATES.current(w) ? "LIST" : "    "} g=${r.grade ?? "-"} ${cond.padEnd(3)} sim=${(r.similarity ?? 0).toFixed(3)} cov=${share(w, (x) => x.any).toFixed(2)} own=${share(w, (x) => x.text).toFixed(2)} typed=${share(w, (x) => x.typed).toFixed(2)} [${w.words
				.filter((x) => x.any)
				.map((x) => `${x.t}${x.name ? "^" : x.text ? "" : "*"}`)
				.join(",")}] ${r.isWinner ? "W " : ""}${clean(r.name, 60)}`,
		);
	}
}
