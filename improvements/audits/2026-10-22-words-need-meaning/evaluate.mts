// With the blind grades: per candidate, what it removes from vetIdea's five
// and from the brief on the fresh set, by grade and by name per idea, the
// kept decoys by grade, and what the brief gains. Then both candidates over
// the earlier labeled sets (vetIdea's five, every idea there ran hybrid), and
// the brief over the 40-idea windows (top 20 only), with every build lost by
// name and grade, and the ship criteria.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-22-words-need-meaning/evaluate.mts <windows-fresh.json> <grades.json> <labeler1|labeler2> <earlier dir>
import { briefPick, clean, RULES, readJson, vetPick, type W } from "./lib.mts";

const [, , freshPath, gradesPath, labeler, earlierDir] = process.argv;
type Idea = {
	id: string;
	idea: string;
	slice?: string;
	buildsMode?: string | null;
	words?: { t: string }[];
	window: (W & { rank: number; grade?: number | null })[];
};
const fresh = readJson(freshPath);
const grades = (
	readJson(gradesPath) as {
		grades: ({ ideaId: string; buildId: string; status: string } & Record<
			string,
			unknown
		>)[];
	}
).grades.map((x) => ({ ...x, grade: x[labeler] as number }));
const gradeOf = new Map(
	grades.map((g) => [`${g.ideaId}::${g.buildId}`, g.grade]),
);
const g = (x: number | null | undefined) =>
	x === null || x === undefined ? "-" : String(x);
const tally = () => ({ 2: 0, 1: 0, 0: 0, "-": 0 }) as Record<string, number>;
const fmt = (t: Record<string, number>) =>
	`g2 ${t[2]}, g1 ${t[1]}, g0 ${t[0]}${t["-"] ? `, ungraded ${t["-"]}` : ""}`;

const verdict: Record<string, string[]> = { G1: [], G2: [] };
console.log(
	`fresh set: ${fresh.ideas.length} ideas, api ${fresh.apiVersionStart} -> ${fresh.apiVersionEnd}; grades of ${labeler}`,
);
const decoys = tally();
for (const x of grades.filter((x) => x.status === "kept")) decoys[g(x.grade)]++;
console.log(
	`kept decoys (vetIdea lists them under every rule): ${fmt(decoys)}`,
);
for (const cand of ["G1", "G2"]) {
	const removed = tally();
	const gained = tally();
	const lines: string[] = [];
	let emptied = 0;
	for (const idea of fresh.ideas as Idea[]) {
		const m = idea.buildsMode !== "keyword";
		const gr = (id: string) => gradeOf.get(`${idea.id}::${id}`);
		const vet0 = vetPick(idea.window, RULES.current, m);
		const vet = vetPick(idea.window, RULES[cand], m);
		const b0 = briefPick(idea.window, RULES.current, m);
		const b = briefPick(idea.window, RULES[cand], m);
		if (vet0.length && !vet.length) emptied++;
		const gone = new Map<string, { w: W; where: string[] }>();
		for (const w of vet0)
			if (!vet.some((x) => x.id === w.id))
				gone.set(w.id, { w, where: ["vetIdea"] });
		for (const w of b0)
			if (!b.some((x) => x.id === w.id)) {
				const e = gone.get(w.id) ?? { w, where: [] };
				e.where.push("brief");
				gone.set(w.id, e);
			}
		for (const { w, where } of gone.values()) {
			removed[g(gr(w.id))]++;
			lines.push(
				`   removed ${idea.id} ${clean(w.name)} g=${g(gr(w.id))} (${where.join("+")})`,
			);
		}
		for (const w of b)
			if (!b0.some((x) => x.id === w.id)) {
				gained[g(gr(w.id))]++;
				lines.push(
					`   gained  ${idea.id} ${clean(w.name)} g=${g(gr(w.id))} (brief)`,
				);
			}
	}
	console.log(
		`\n[fresh] ${cand}: removed ${fmt(removed)}; brief gains ${fmt(gained)}; ideas whose vetIdea list empties ${emptied}`,
	);
	for (const l of lines) console.log(l);
	if (removed[2] > 0)
		verdict[cand].push(`fresh: ${removed[2]} removed graded 2`);
	if (removed[0] < removed[1])
		verdict[cand].push(`fresh: removed g0 ${removed[0]} < g1 ${removed[1]}`);
	if (removed[0] < 1) verdict[cand].push("fresh: no grade-0 build removed");
	if (removed["-"] > 0)
		verdict[cand].push(`fresh: ${removed["-"]} removed builds ungraded`);
}

// Earlier sets: vetIdea's five, and on the 40 ideas the brief within the top 20.
for (const [file, label] of [
	["windows-40.json", "40 ideas (1.9.91)"],
	["windows-short.json", "36 short ideas (1.9.87)"],
	["windows-tests.json", "34 test ideas (1.9.87)"],
]) {
	const data = readJson(`${earlierDir}/${file}`);
	const ideas = data.ideas as Idea[];
	for (const cand of ["current", "G1", "G2"]) {
		const listed = tally();
		const lost = tally();
		const lines: string[] = [];
		let emptied = 0;
		for (const idea of ideas) {
			// Every idea in these captures ran hybrid (buildsMode hybrid).
			const m = true;
			const vet0 = vetPick(idea.window, RULES.current, m);
			const vet = vetPick(idea.window, RULES[cand], m);
			if (vet0.length && !vet.length) emptied++;
			for (const w of vet) listed[g(w.grade)]++;
			for (const w of vet0)
				if (!vet.some((x) => x.id === w.id)) {
					lost[g(w.grade)]++;
					lines.push(
						`   lost ${idea.id.slice(0, 40)} ${clean(w.name)} g=${g(w.grade)} (vetIdea; matched ${w.matched.length}, textShare ${w.textShare ?? "-"})`,
					);
				}
		}
		console.log(
			`\n[${label}] ${cand}: vetIdea lists ${fmt(listed)}; lost ${fmt(lost)}; ideas emptied ${emptied}`,
		);
		for (const l of lines) console.log(l);
		if (cand !== "current" && lost[2] > 0)
			verdict[cand].push(`${label}: ${lost[2]} lost graded 2`);
	}
	if (file === "windows-40.json")
		for (const cand of ["G1", "G2"]) {
			const lost = tally();
			const lines: string[] = [];
			for (const idea of ideas) {
				const n = idea.words?.length || 1;
				const win = idea.window.map((w) => ({
					...w,
					share: w.matched.length / n,
				}));
				const b0 = briefPick(win, RULES.current, true);
				const b = briefPick(win, RULES[cand], true);
				for (const w of b0)
					if (!b.some((x) => x.id === w.id)) {
						lost[g(w.grade)]++;
						lines.push(
							`   brief lost ${idea.id} ${clean(w.name)} g=${g(w.grade)}`,
						);
					}
			}
			console.log(
				`\n[${label}, brief within the top 20] ${cand}: lost ${fmt(lost)}`,
			);
			for (const l of lines) console.log(l);
			if (lost[2] > 0)
				verdict[cand].push(`${label} brief: ${lost[2]} lost graded 2`);
		}
}

console.log("\nship criteria:");
for (const cand of ["G1", "G2"])
	console.log(
		`  ${cand}: ${verdict[cand].length ? `FAIL (${verdict[cand].join("; ")})` : "PASS"}`,
	);
