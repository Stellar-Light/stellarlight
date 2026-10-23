// Reads candidates.mts' base and score.mts' reranker scores against the
// labeled sets. Three commands:
//   pairs  <candidates> <scores>: per model, on the working ideas, the share of
//          differently graded labeled pairs among vetIdea's top N that the
//          reranker orders correctly (ties half), beside the base order's; and
//          where the working same-idea builds sit in the base ranking.
//   sheet  <candidates> <scores> <model> <sheet.md> <key.json>: every unlabeled
//          build in a top 5 (base or variant), shuffled, blind.
//   report <candidates> <scores> <model> [floor]: per set and variant, the
//          grades in the top 5 and every swap by name and grade. Without a
//          floor, (c)'s floor is chosen on working: the highest 0.01 step that
//          removes no build graded 2 from (a)'s top 5.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-rerank/evaluate.mts <command> ...
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isPriorArtEvidence } from "../../../src/lib/prior-art-rank";

type Slim = {
	id: string;
	similarity?: number;
	matched: string[];
	textShare?: number;
};
type Idea = {
	set: string;
	id: string;
	idea: string;
	plain: Slim[];
	route: Slim[];
	vet: string[];
	brief: string[];
	briefWinners: string[];
};
const [, , cmd, candPath, scoresPath, model, ...rest] = process.argv;
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const DIR = "improvements/audits";
const cand = read(candPath) as {
	ideas: Idea[];
	docs: Record<string, { doc: string; name: string; event: string }>;
	n: number;
};
const scores = read(scoresPath) as Record<
	string,
	Record<string, { tokens: number; scores: Record<string, number> }>
>;

// Grades: `${set}|${ideaId}|${buildId}` -> grade. Sources in order; when two
// disagree, the stricter grade.
const grades = new Map<string, number>();
const put = (k: string, g: number) =>
	grades.set(k, Math.min(g, grades.get(k) ?? g));
for (const l of read(`${DIR}/2026-10-22-prior-art-precision/labels.json`)
	.labels)
	put(`40|${l.ideaId}|${l.buildId}`, l.grade);
for (const [set, file] of [
	["short", "windows-short.json"],
	["tests", "windows-tests.json"],
])
	for (const i of read(`${DIR}/2026-10-22-prior-art-precision/${file}`).ideas)
		for (const w of i.window)
			if (w.grade != null) put(`${set}|${i.id}|${w.id}`, w.grade);
for (const g of read(`${DIR}/2026-10-22-words-need-meaning/grades.json`).grades)
	put(`fresh|${g.ideaId}|${g.buildId}`, Math.min(g.labeler1, g.labeler2));
for (const g of read(`${DIR}/2026-10-23-build-matching/grades.json`).grades)
	put(`${g.set}|${g.ideaId}|${g.buildId}`, g.grade);
const OWN = `${DIR}/2026-10-23-rerank/grades.json`;
if (existsSync(OWN))
	for (const g of read(OWN).grades)
		put(`${g.set}|${g.ideaId}|${g.buildId}`, g.grade);
const gradeOf = (i: Idea, id: string) => grades.get(`${i.set}|${i.id}|${id}`);

const held = new Set(
	read(`${DIR}/2026-10-22-prior-art-precision/ideas.json`)
		.ideas.filter((i: { slice: string }) => i.slice === "holdout")
		.map((i: { id: string }) => i.id),
);
const sliceOf = (i: Idea) =>
	i.set === "40" ? (held.has(i.id) ? "holdout" : "working") : i.set;
const SLICES = ["working", "holdout", "short", "tests", "fresh"];
/** Builds whose names carry a product name this repo's text rules bar: the
 * id stands in. */
const AS_ID = new Set(["dorahacks-buidl-42589"]);
const nm = (id: string) =>
	(AS_ID.has(id) ? id : (cand.docs[id]?.name ?? id))
		.replace(/[\u2013\u2014]/g, "-")
		.slice(0, 50);
const scoreOf = (m: string, i: Idea) => scores[m]?.[`${i.set}|${i.id}`]?.scores;
/** The list reordered by reranker score, best first; a tie keeps base order. */
const reranked = (list: Slim[], s: Record<string, number>) =>
	list
		.map((x, r) => ({ x, r }))
		.sort((a, b) => s[b.x.id] - s[a.x.id] || a.r - b.r)
		.map(({ x }) => x);

const lines: string[] = [];
const say = (s = "") => {
	lines.push(s);
	console.log(s);
};

if (cmd === "pairs") {
	const working = cand.ideas.filter((i) => sliceOf(i) === "working");
	const pairStats = (order: (i: Idea) => Map<string, number>) => {
		const t = { all: [0, 0], "2v0": [0, 0], "2v1": [0, 0], "1v0": [0, 0] };
		for (const i of working) {
			const o = order(i);
			const lab = i.plain
				.map((x) => ({ id: x.id, g: gradeOf(i, x.id) }))
				.filter((x): x is { id: string; g: number } => x.g != null);
			for (const a of lab)
				for (const b of lab) {
					if (a.g <= b.g) continue;
					const sa = o.get(a.id) as number;
					const sb = o.get(b.id) as number;
					const v = sa > sb ? 1 : sa === sb ? 0.5 : 0;
					for (const k of ["all", `${a.g}v${b.g}`] as const) {
						t[k as keyof typeof t][0] += v;
						t[k as keyof typeof t][1] += 1;
					}
				}
		}
		return Object.entries(t)
			.map(
				([k, [c, n]]) => `${k} ${((100 * c) / (n || 1)).toFixed(1)}% of ${n}`,
			)
			.join(" | ");
	};
	say(
		`Working ideas: ${working.length}; pairs among labeled builds in vetIdea's top ${cand.n}`,
	);
	say(
		`base order: ${pairStats((i) => new Map(i.plain.map((x, r) => [x.id, -r])))}`,
	);
	for (const m of Object.keys(scores))
		say(
			`${m}: ${pairStats((i) => new Map(Object.entries(scoreOf(m, i) ?? {})))}`,
		);
	// N: where the working same-idea builds sit in the plain ranking.
	let total = 0;
	const at = { "1-5": 0, "6-20": 0, "21-50": 0, "past 50 or unmatched": 0 };
	for (const i of working)
		for (const [k, g] of grades) {
			if (g !== 2 || !k.startsWith(`40|${i.id}|`)) continue;
			total++;
			const r = i.plain.findIndex((x) => x.id === k.split("|")[2]) + 1;
			if (r === 0) at["past 50 or unmatched"]++;
			else if (r <= 5) at["1-5"]++;
			else if (r <= 20) at["6-20"]++;
			else at["21-50"]++;
		}
	say(
		`working same-idea builds (${total}) by base rank: ${JSON.stringify(at)}`,
	);
	process.exit(0);
}

type Variant = { name: string; base: string; pick: (i: Idea) => string[] };
const s = (i: Idea) => scoreOf(model, i) as Record<string, number>;
const vetC = (i: Idea, floor: number) =>
	reranked(i.plain, s(i))
		.slice(0, 5)
		.filter((x) => s(i)[x.id] >= floor)
		.map((x) => x.id);
const variants = (floor: number): Variant[] => [
	{ name: "vetIdea base", base: "", pick: (i) => i.vet },
	{
		name: "vetIdea (a) reranked top 5",
		base: "vetIdea base",
		pick: (i) =>
			reranked(i.plain, s(i))
				.slice(0, 5)
				.map((x) => x.id),
	},
	{
		name: "vetIdea (b) reranked, evidence rule",
		base: "vetIdea base",
		pick: (i) =>
			reranked(i.plain, s(i))
				.slice(0, 5)
				.filter(isPriorArtEvidence)
				.map((x) => x.id),
	},
	{
		name: `vetIdea (c) reranked, score floor ${floor.toFixed(2)}`,
		base: "vetIdea base",
		pick: (i) => vetC(i, floor),
	},
	// hackathonBrief: its winner slots, then the builds vetIdea lists.
	{ name: "brief base", base: "", pick: (i) => i.brief },
	{
		name: "brief, winners then vetIdea (c)",
		base: "brief base",
		pick: (i) =>
			[
				...i.briefWinners,
				...vetC(i, floor).filter((x) => !i.briefWinners.includes(x)),
			].slice(0, 5),
	},
	{
		name: "route base top 5",
		base: "",
		pick: (i) => i.route.slice(0, 5).map((x) => x.id),
	},
	{
		name: "route (a) reranked top 5",
		base: "route base top 5",
		pick: (i) =>
			reranked(i.route, s(i))
				.slice(0, 5)
				.map((x) => x.id),
	},
];

const working = cand.ideas.filter((i) => sliceOf(i) === "working");
/** (c)'s floor: the highest 0.01 step that removes no build graded 2 from
 * (a)'s working top 5. A new grade 2 can only lower it. */
const chooseFloor = () => {
	const kept = working.flatMap((i) =>
		reranked(i.plain, s(i))
			.slice(0, 5)
			.filter((x) => gradeOf(i, x.id) === 2)
			.map((x) => s(i)[x.id]),
	);
	return {
		floor: Math.floor(Math.min(...kept) * 100) / 100,
		low: Math.min(...kept),
	};
};

if (cmd === "sheet") {
	// Only builds that change a count: those a variant gains or loses against
	// its base. (c) is read at the floor the current labels give; a build
	// labeled 2 later can only lower the floor, so (c) can then only lose
	// fewer of the builds it shares with the base. The brief rows were added
	// after the sheet was labeled and are not on it.
	const [sheetPath, keyPath] = rest;
	const V = variants(chooseFloor().floor);
	const rows = new Map<string, { i: Idea; id: string }>();
	for (const i of cand.ideas)
		for (const v of V.filter((x) => x.base && !x.name.startsWith("brief"))) {
			const b = (V.find((x) => x.name === v.base) as Variant).pick(i);
			const a = v.pick(i);
			for (const id of [
				...b.filter((x) => !a.includes(x)),
				...a.filter((x) => !b.includes(x)),
			])
				if (gradeOf(i, id) == null)
					rows.set(`${i.set}|${i.id}|${id}`, { i, id });
		}
	// Seeded shuffle (mulberry32), so the sheet can be rebuilt.
	let seed = 20261023;
	const rand = () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const list = [...rows.values()];
	for (let k = list.length - 1; k > 0; k--) {
		const j = Math.floor(rand() * (k + 1));
		[list[k], list[j]] = [list[j], list[k]];
	}
	const r = read(`${DIR}/2026-10-22-prior-art-precision/labels.json`).rubric;
	const out = [
		"# Blind label sheet",
		"",
		`Rubric ${r.version}. ${r.question}`,
		"",
		`- 2: ${r["2"]}`,
		`- 1: ${r["1"]}`,
		`- 0: ${r["0"]}`,
		"",
		"Rules:",
		...r.rules.map((x: string) => `- ${x}`),
		"",
		"Answer one grade (2, 1 or 0) per row number.",
	];
	const key: unknown[] = [];
	list.forEach(({ i, id }, k) => {
		const d = cand.docs[id];
		const summary = d.doc.startsWith(`${d.name}. `)
			? d.doc.slice(d.name.length + 2)
			: "";
		out.push(
			"",
			`### ${k + 1}`,
			`Idea: ${i.idea}`,
			`Submission: ${d.name}`,
			`Event: ${d.event}`,
			`Summary: ${summary.slice(0, 600)}`,
		);
		key.push({ row: k + 1, set: i.set, ideaId: i.id, buildId: id });
	});
	writeFileSync(sheetPath, `${out.join("\n")}\n`);
	writeFileSync(keyPath, JSON.stringify(key, null, 1));
	const by = new Map<string, number>();
	for (const { i } of list) by.set(sliceOf(i), (by.get(sliceOf(i)) ?? 0) + 1);
	console.log(`${list.length} rows: ${JSON.stringify(Object.fromEntries(by))}`);
	process.exit(0);
}

if (cmd !== "report") throw new Error(`unknown command ${cmd}`);
let floor = rest[0] != null ? Number(rest[0]) : Number.NaN;
if (Number.isNaN(floor)) {
	const f = chooseFloor();
	floor = f.floor;
	say(
		`floor for (c), chosen on working: ${floor.toFixed(2)} (lowest same-idea score in (a)'s working top 5: ${f.low.toFixed(4)})`,
	);
}
let calls = 0;
let tokens = 0;
for (const v of Object.values(scores))
	for (const x of Object.values(v)) {
		calls++;
		tokens += x.tokens;
	}
say(
	`model ${model}; N ${cand.n}; all models scored: ${calls} calls, ${tokens} tokens`,
);
const V = variants(floor);
for (const slice of SLICES) {
	const ideas = cand.ideas.filter((i) => sliceOf(i) === slice);
	say();
	say(`== ${slice} (${ideas.length} ideas): top 5 ==`);
	say(
		"variant | listed | same idea (2) | related (1) | wrong (0) | unlabeled | ideas with none",
	);
	for (const v of V) {
		const c = [0, 0, 0, 0, 0, 0];
		for (const i of ideas) {
			const picked = v.pick(i);
			if (!picked.length) c[5]++;
			for (const id of picked) {
				const g = gradeOf(i, id);
				c[0]++;
				c[g == null ? 4 : 3 - g]++;
			}
		}
		say(`${v.name} | ${c.join(" | ")}`);
	}
	for (const v of V.filter((x) => x.base)) {
		const base = V.find((x) => x.name === v.base) as Variant;
		const moves: string[] = [];
		for (const i of ideas) {
			const b = base.pick(i);
			const a = v.pick(i);
			const g = (id: string) => gradeOf(i, id) ?? "?";
			const lost = b.filter((id) => !a.includes(id));
			const gained = a.filter((id) => !b.includes(id));
			if (lost.length || gained.length)
				moves.push(
					`  ${i.id.slice(0, 40)}: ${[
						...lost.map((id) => `-${nm(id)} (${g(id)})`),
						...gained.map((id) => `+${nm(id)} (${g(id)})`),
					].join(", ")}`,
				);
		}
		say(`-- swaps, ${v.name} against ${v.base}: ${moves.length} ideas`);
		for (const m of moves) say(m);
	}
}
if (rest[1]) writeFileSync(rest[1], `${lines.join("\n")}\n`);
