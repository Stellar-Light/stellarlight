// Which builds G1 and G2 remove from vetIdea's five and from the brief's
// builds (winner slots included) on the fresh set, and what the brief gains
// when a winner slot frees up. Then the blind label sheet: every removed or
// gained build, plus as many kept builds drawn at random from vetIdea's
// lists for the same ideas (other fresh ideas when those run out), shuffled
// with a fixed seed. The sheet shows the idea, the build's name, its event
// and its description cut to 600 characters, nothing else; the key is a
// separate file.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-22-words-need-meaning/removals.mts <windows-fresh.json> <live-fresh.json> <labels.json with the v1 rubric> [<sheet.md> <key.json>]
import { writeFileSync } from "node:fs";
import {
	briefPick,
	clean,
	type Row,
	RULES,
	readJson,
	vetPick,
	type W,
} from "./lib.mts";

const [, , windowsPath, livePath, rubricPath, sheetPath, keyPath] =
	process.argv;
const data = readJson(windowsPath);
const live = readJson(livePath);
type Idea = {
	id: string;
	idea: string;
	buildsMode: string | null;
	window: (W & { rank: number })[];
};
const ideas = data.ideas as Idea[];

type Entry = {
	ideaId: string;
	buildId: string;
	status: "removed" | "gained" | "kept";
	candidates: string[];
	where: string[];
};
const entries = new Map<string, Entry>();
const note = (
	ideaId: string,
	buildId: string,
	status: Entry["status"],
	cand: string,
	where: string,
) => {
	const k = `${ideaId}::${buildId}`;
	const e = entries.get(k) ?? {
		ideaId,
		buildId,
		status,
		candidates: [],
		where: [],
	};
	if (!e.candidates.includes(cand)) e.candidates.push(cand);
	if (!e.where.includes(where)) e.where.push(where);
	entries.set(k, e);
};

const nameOf = new Map<string, string>();
const totals: Record<string, number> = {};
const bump = (k: string, n = 1) => {
	totals[k] = (totals[k] ?? 0) + n;
};
for (const idea of ideas) {
	const m = idea.buildsMode !== "keyword";
	for (const w of idea.window) nameOf.set(w.id, w.name);
	const vet0 = vetPick(idea.window, RULES.current, m);
	const brief0 = briefPick(idea.window, RULES.current, m);
	bump("vet current", vet0.length);
	bump("brief current", brief0.length);
	for (const cand of ["G1", "G2"]) {
		const vet = vetPick(idea.window, RULES[cand], m);
		const brief = briefPick(idea.window, RULES[cand], m);
		bump(`vet ${cand}`, vet.length);
		bump(`brief ${cand}`, brief.length);
		if (!vet.length && vet0.length) bump(`vet ${cand} ideas emptied`);
		for (const w of vet0)
			if (!vet.some((x) => x.id === w.id)) {
				note(idea.id, w.id, "removed", cand, "vetIdea");
				bump(`vet ${cand} removed`);
				console.log(
					`${cand} vetIdea ${idea.id} removes ${clean(w.name)} (rank ${w.rank}, matched ${w.matched.length}, textShare ${w.textShare ?? "-"}, no meaning score)`,
				);
			}
		for (const w of brief0)
			if (!brief.some((x) => x.id === w.id)) {
				note(idea.id, w.id, "removed", cand, "brief");
				bump(`brief ${cand} removed`);
				console.log(
					`${cand} brief ${idea.id} removes ${clean(w.name)} (rank ${w.rank}${w.isWinner ? ", winner" : ""})`,
				);
			}
		for (const w of brief)
			if (!brief0.some((x) => x.id === w.id)) {
				const k = `${idea.id}::${w.id}`;
				if (entries.get(k)?.status !== "removed")
					note(idea.id, w.id, "gained", cand, "brief");
				bump(`brief ${cand} gained`);
				console.log(
					`${cand} brief ${idea.id} gains ${clean(w.name)} (rank ${w.rank}${w.isWinner ? ", winner" : ""})`,
				);
			}
	}
}
console.log(JSON.stringify(totals));

if (sheetPath && keyPath) {
	// Deterministic choice and shuffle (mulberry32).
	let seed = 20261022;
	const rand = () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const shuffle = <T,>(xs: T[]) => {
		for (let i = xs.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[xs[i], xs[j]] = [xs[j], xs[i]];
		}
		return xs;
	};
	const removed = [...entries.values()].filter((e) => e.status === "removed");
	const changedIdeas = new Set([...entries.values()].map((e) => e.ideaId));
	// Kept: listed by vetIdea under the current rule and by both candidates.
	const keptOf = (idea: Idea) => {
		const m = idea.buildsMode !== "keyword";
		const g1 = new Set(vetPick(idea.window, RULES.G1, m).map((w) => w.id));
		const g2 = new Set(vetPick(idea.window, RULES.G2, m).map((w) => w.id));
		return vetPick(idea.window, RULES.current, m)
			.filter(
				(w) =>
					g1.has(w.id) && g2.has(w.id) && !entries.has(`${idea.id}::${w.id}`),
			)
			.map((w) => ({ ideaId: idea.id, buildId: w.id }));
	};
	const near = shuffle(
		ideas.filter((i) => changedIdeas.has(i.id)).flatMap(keptOf),
	);
	const far = shuffle(
		ideas.filter((i) => !changedIdeas.has(i.id)).flatMap(keptOf),
	);
	const decoys = [...near, ...far].slice(0, removed.length).map((d) => ({
		...d,
		status: "kept" as const,
		candidates: [],
		where: ["vetIdea"],
	}));
	const rows = shuffle([...entries.values(), ...decoys]);
	const rowOf = new Map<string, Row>();
	for (const r of live.corpus as Row[]) rowOf.set(r.id, r);
	for (const i of live.rows)
		for (const r of i.ranked as Row[]) rowOf.set(r.id, rowOf.get(r.id) ?? r);
	const ideaText = new Map(ideas.map((i) => [i.id, i.idea]));
	const rubric = readJson(rubricPath).rubric;
	const head = [
		"# Blind label sheet",
		"",
		`Rubric ${rubric.version}. ${rubric.question}`,
		"",
		`- 2: ${rubric["2"]}`,
		`- 1: ${rubric["1"]}`,
		`- 0: ${rubric["0"]}`,
		"",
		"Rules:",
		...rubric.rules.map((r: string) => `- ${r}`),
		"",
		"Answer one grade (2, 1 or 0) per row number.",
		"",
	].join("\n");
	const body = rows
		.map((e, i) => {
			const r = rowOf.get(e.buildId);
			const desc = (r?.description ?? "").replace(/\s+/g, " ").trim();
			return `### ${i + 1}\nIdea: ${ideaText.get(e.ideaId)}\nSubmission: ${r?.name ?? nameOf.get(e.buildId)}\nEvent: ${r?.hackathon ?? ""}\nSummary: ${desc.slice(0, 600) || "(none)"}\n`;
		})
		.join("\n");
	writeFileSync(sheetPath, `${head}\n${body}`);
	writeFileSync(
		keyPath,
		`${JSON.stringify(
			rows.map((e, i) => ({
				row: i + 1,
				buildId: e.buildId,
				ideaId: e.ideaId,
				status: e.status,
				candidates: e.candidates,
				where: e.where,
			})),
			null,
			1,
		)}\n`,
	);
	console.log(
		`sheet: ${rows.length} rows (${removed.length} removed, ${[...entries.values()].filter((e) => e.status === "gained").length} gained, ${decoys.length} kept decoys: ${Math.min(near.length, removed.length)} from the same ideas)`,
	);
}
