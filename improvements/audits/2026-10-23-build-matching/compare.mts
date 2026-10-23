// Compares two replay outputs (replay.mts) against the labeled sets: per set
// and mode, where each labeled same-idea build (grade 2) sits in the matched
// list (anywhere, top 20, top 5), before and after, with every build lost or
// gained by name; then vetIdea's five and the brief's picks (and how many
// ideas' plain rankings differ at all), the frozen nonsense battery, the
// battery probe and the passkey checks.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-build-matching/compare.mts <live.json> <before.json> <after.json> [slimDir]
import { readFileSync, writeFileSync } from "node:fs";

const [, , livePath, beforePath, afterPath] = process.argv;
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const live = read(livePath);
const before = read(beforePath);
const after = read(afterPath);
const DIR = "improvements/audits";
const names = new Map<string, string>(
	(live.corpus as { id: string; name: string }[]).map((r) => [r.id, r.name]),
);
const nm = (id: string) =>
	(names.get(id) ?? id).replace(/[\u2013\u2014]/g, "-").slice(0, 60);

// Grades per set: `${ideaId}|${buildId}` -> grade.
const grades = new Map<string, number>();
for (const l of read(`${DIR}/2026-10-22-prior-art-precision/labels.json`)
	.labels)
	grades.set(`40|${l.ideaId}|${l.buildId}`, l.grade);
for (const [set, file] of [
	["short", "windows-short.json"],
	["tests", "windows-tests.json"],
]) {
	for (const i of read(`${DIR}/2026-10-22-prior-art-precision/${file}`).ideas)
		for (const w of i.window)
			if (w.grade != null) grades.set(`${set}|${i.id}|${w.id}`, w.grade);
}
// Two blind labelers; the stricter grade when they differ.
for (const g of read(`${DIR}/2026-10-22-words-need-meaning/grades.json`).grades)
	grades.set(
		`fresh|${g.ideaId}|${g.buildId}`,
		Math.min(g.labeler1, g.labeler2),
	);
const gradeOf = (set: string, idea: string, id: string) =>
	grades.get(`${set}|${idea}|${id}`);

type Idea = {
	set: string;
	id: string;
	idea: string;
	hybrid: { ids: string[] };
	keyword: { ids: string[] };
	vet: string[];
	brief: string[];
	/** Absent in replays written before the builds route's option. */
	plainHash?: string;
};
const byKey = (o: { ideas: Idea[] }) =>
	new Map(o.ideas.map((i) => [`${i.set}|${i.id}`, i]));
const B = byKey(before);
const A = byKey(after);
// The 40 ideas keep their split: every third idea is held out.
const slice = new Map<string, string>(
	read(`${DIR}/2026-10-22-prior-art-precision/ideas.json`).ideas.map(
		(i: { id: string; slice: string }) => [`40|${i.id}`, `40 ${i.slice}`],
	),
);
const groupOf = (k: string) => slice.get(k) ?? k.split("|")[0];
const SETS = ["40 working", "40 holdout", "short", "tests", "fresh"];
const DEPTHS: [string, number][] = [
	["matched", Infinity],
	["top 20", 20],
	["top 5", 5],
];

const lines: string[] = [];
const say = (s = "") => lines.push(s);
say(`before: ${before.label}; after: ${after.label}`);
say(
	`capture: api ${live.apiVersionStart} -> ${live.apiVersionEnd}, ${live.startedAt} to ${live.endedAt}; corpus ${before.corpus}`,
);
let failures = 0;
for (const grade of [2, 1]) {
	say();
	say(
		`== Labeled builds graded ${grade} (${grade === 2 ? "same idea" : "related"}): found in the matched list, top 20, top 5 ==`,
	);
	say("set | mode | labeled | matched before -> after | top 20 | top 5");
	const moves: string[] = [];
	for (const group of SETS) {
		const keys = [...B.keys()].filter((k) => groupOf(k) === group);
		for (const mode of ["keyword", "hybrid"] as const) {
			let labeled = 0;
			const cells = DEPTHS.map(() => [0, 0]);
			for (const k of keys) {
				const b = B.get(k) as Idea;
				const a = A.get(k) as Idea;
				const set = b.set;
				const ids = [...grades.keys()]
					.filter((g) => g.startsWith(`${set}|${b.id}|`))
					.map((g) => g.split("|")[2])
					.filter((id) => gradeOf(set, b.id, id) === grade);
				labeled += ids.length;
				for (const id of ids)
					DEPTHS.forEach(([depth, n], d) => {
						const ib = b[mode].ids.indexOf(id);
						const ia = a[mode].ids.indexOf(id);
						const inB = ib >= 0 && ib < n;
						const inA = ia >= 0 && ia < n;
						cells[d][0] += inB ? 1 : 0;
						cells[d][1] += inA ? 1 : 0;
						if (inB !== inA) {
							moves.push(
								`  ${inB ? "LOST" : "gained"} ${depth} | ${group} ${mode} | ${b.id} "${b.idea.slice(0, 50)}" | ${nm(id)} (rank ${ib + 1 || "none"} -> ${ia + 1 || "none"})`,
							);
							// The ship criterion reads the matched list and the top 20.
							if (inB && grade === 2 && n > 5) failures++;
						}
					});
			}
			say(
				`${group} | ${mode} | ${labeled} | ${cells.map(([x, y]) => `${x} -> ${y}`).join(" | ")}`,
			);
		}
	}
	say(moves.length ? moves.join("\n") : "  nothing lost or gained");
}

say();
say("== vetIdea's five and the brief's picks (hybrid), every change ==");
const differ = { vet: 0, brief: 0, plain: 0 };
for (const k of B.keys()) {
	const b = B.get(k) as Idea;
	const a = A.get(k) as Idea;
	for (const field of ["vet", "brief"] as const) {
		const lost = b[field].filter((id) => !a[field].includes(id));
		const gained = a[field].filter((id) => !b[field].includes(id));
		if (b[field].join() !== a[field].join()) differ[field]++;
		const g = (id: string) => gradeOf(b.set, b.id, id) ?? "unlabeled";
		for (const id of lost)
			say(`  ${field} lost | ${b.set} ${b.id} | ${nm(id)} (grade ${g(id)})`);
		for (const id of gained)
			say(`  ${field} gained | ${b.set} ${b.id} | ${nm(id)} (grade ${g(id)})`);
	}
	if (b.plainHash !== a.plainHash) differ.plain++;
}
say(
	`ideas that differ from before, of ${B.size}: vetIdea's five ${differ.vet}, the brief's picks ${differ.brief}, the plain rankings prior art and analyze read (every row and field) ${differ.plain}`,
);

type Extra = {
	kind: string;
	q: string;
	winnersOnly: boolean;
	keyword: { id: string; name: string; matched: string[] }[];
	hybrid: { id: string; name: string; matched: string[] }[];
};
const xb = before.extra as Extra[];
const xa = after.extra as Extra[];
for (const kind of ["nonsense", "probe", "passkey"]) {
	say();
	say(`== ${kind}: builds returned, before -> after ==`);
	const tot = { keyword: [0, 0], hybrid: [0, 0] };
	xb.forEach((b, i) => {
		if (b.kind !== kind) return;
		const a = xa[i];
		const q = `${b.q}${b.winnersOnly ? " (winnersOnly)" : ""}`;
		for (const mode of ["keyword", "hybrid"] as const) {
			tot[mode][0] += b[mode].length;
			tot[mode][1] += a[mode].length;
			const ids = new Set(a[mode].map((x) => x.id));
			const was = new Set(b[mode].map((x) => x.id));
			const lost = b[mode].filter((x) => !ids.has(x.id));
			const gained = a[mode].filter((x) => !was.has(x.id));
			say(
				`${q} | ${mode} | ${b[mode].length} -> ${a[mode].length}${lost.length ? ` | removed: ${lost.map((x) => `${nm(x.id)} [${x.matched.join(",")}]`).join("; ")}` : ""}${gained.length ? ` | added: ${gained.map((x) => `${nm(x.id)} [${x.matched.join(",")}]`).join("; ")}` : ""}`,
			);
			if (kind !== "nonsense")
				say(
					`    after, top 5: ${a[mode]
						.slice(0, 5)
						.map((x) => `${nm(x.id)} [${x.matched.join(",")}]`)
						.join("; ")}`,
				);
		}
	});
	if (kind === "nonsense")
		say(
			`total | keyword ${tot.keyword[0]} -> ${tot.keyword[1]} | hybrid ${tot.hybrid[0]} -> ${tot.hybrid[1]}`,
		);
}
say();
say(
	`grade-2 builds lost from the matched list or the top 20 (the ship criterion): ${failures}`,
);
console.log(lines.join("\n"));

// With a fifth argument, each replay slimmed for committing: per idea and
// mode the matched count, the top 20 and the rank of every graded build (null
// when not matched); the extra queries in full. Upstream dashes escaped.
const slimDir = process.argv[5];
const slim = (o: { label: string; ideas: Idea[]; extra: Extra[] }) => ({
	label: o.label,
	apiVersionStart: live.apiVersionStart,
	apiVersionEnd: live.apiVersionEnd,
	ideas: o.ideas.map((i) => {
		const graded = [...grades.keys()]
			.filter((g) => g.startsWith(`${i.set}|${i.id}|`))
			.map((g) => g.split("|")[2]);
		const mode = (m: "keyword" | "hybrid") => ({
			matched: i[m].ids.length,
			top20: i[m].ids.slice(0, 20),
			gradedRanks: Object.fromEntries(
				graded.map((id) => [id, i[m].ids.indexOf(id) + 1 || null]),
			),
		});
		return {
			set: i.set,
			id: i.id,
			keyword: mode("keyword"),
			hybrid: mode("hybrid"),
			vet: i.vet,
			brief: i.brief,
			plainHash: i.plainHash,
		};
	}),
	extra: o.extra,
});
if (slimDir)
	for (const [file, o] of [
		["before.json", before],
		["after.json", after],
	])
		writeFileSync(
			`${slimDir}/${file}`,
			`${JSON.stringify(slim(o), null, 1).replace(
				/[\u2013\u2014]/g,
				(c) => `\\u${c.charCodeAt(0).toString(16)}`,
			)}\n`,
		);
