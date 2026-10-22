// Candidate evidence rules replayed over each idea's top five, per slice:
// builds listed by grade, the wrong share, ideas with a wrong build, empty
// ideas, which condition of the current rule admitted each wrong build, and
// every build lost or gained against the current rule, by name and grade.
// Usage: pnpm exec tsx tmp/evaluate.mts <windows file> <slice|all> [--detail]
import { PRIOR_ART_TOP } from "../src/lib/prior-art-rank";
import { clean, readJson } from "./lib.mts";
import { CANDIDATES, type W, why } from "./rules.mts";

const [, , file, only, flag] = process.argv;
const data = readJson(file);
type Idea = {
	id: string;
	slice: string;
	totalWeight: number;
	corpus: number;
	window: (W & { grade: number | null })[];
};
const ideas = (data.ideas as Idea[]).filter(
	(i) => only === "all" || i.slice === only,
);
const slices = [...new Set(ideas.map((i) => i.slice))];
console.log(
	`${file}: api ${data.apiVersionStart} -> ${data.apiVersionEnd}; corpus ${data.corpus}; ${ideas.length} ideas`,
);
const g = (x: number | null) => (x === null ? "-" : String(x));
for (const s of slices) {
	const inSlice = ideas.filter((i) => i.slice === s);
	for (const [name, rule] of Object.entries(CANDIDATES)) {
		const listed = [0, 0, 0, 0];
		let wrongIdeas = 0;
		let empty = 0;
		const wrong: string[] = [];
		const lost: string[] = [];
		const gained: string[] = [];
		for (const idea of inSlice) {
			const top = idea.window
				.slice(0, PRIOR_ART_TOP)
				.map((w) => ({ ...w, total: idea.totalWeight, n: idea.corpus }));
			const base = new Set(top.filter(CANDIDATES.current).map((w) => w.id));
			const kept = top.filter(rule);
			if (!kept.length) empty++;
			let here = 0;
			for (const w of kept) {
				listed[w.grade ?? 3]++;
				if (w.grade === 0) {
					here++;
					wrong.push(`${idea.id} ${clean(w.name)} (${why(w)})`);
				}
			}
			if (here) wrongIdeas++;
			for (const w of top) {
				const k = kept.some((x) => x.id === w.id);
				if (base.has(w.id) && !k)
					lost.push(`${idea.id} ${clean(w.name)} g=${g(w.grade)}`);
				if (!base.has(w.id) && k)
					gained.push(`${idea.id} ${clean(w.name)} g=${g(w.grade)}`);
			}
		}
		const n = listed.reduce((a, b) => a + b, 0);
		console.log(
			`\n[${s}] ${name}: ideas ${inSlice.length}, listed ${n} (g2 ${listed[2]}, g1 ${listed[1]}, g0 ${listed[0]}, unlabeled ${listed[3]}), wrong share ${((100 * listed[0]) / (n || 1)).toFixed(1)}%, ideas with a wrong build ${wrongIdeas}, empty ${empty}`,
		);
		if (name === "current" || flag === "--detail")
			for (const x of wrong) console.log(`   wrong: ${x}`);
		for (const x of lost) console.log(`   lost: ${x}`);
		for (const x of gained) console.log(`   gained: ${x}`);
	}
}
