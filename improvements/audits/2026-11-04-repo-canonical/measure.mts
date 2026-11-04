// Grades the base and branch replays against ./frozen-set.json and lists
// every rank move in every set, with the mechanism behind each change.
// Usage, from the repository root (the branch tree):
//   pnpm exec tsx improvements/audits/2026-11-04-repo-canonical/measure.mts \
//     <corpus.json> <live.json> <base.json> <branch.json> <report.txt>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renamedTo } from "../../../src/lib/repo-relations";
import { canonicalFor, explicitRepoName } from "../../../src/lib/repo-search";

const [, , corpusPath, livePath, basePath, branchPath, reportPath] =
	process.argv;
if (!reportPath)
	throw new Error(
		"usage: measure.mts <corpus> <live> <base> <branch> <report.txt>",
	);
const here = new URL(".", import.meta.url).pathname;
const old = join(here, "../2026-10-23-repos-ranking");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
// biome-ignore lint/suspicious/noExplicitAny: captured shapes
type Any = any;
const frozen = read(join(here, "frozen-set.json"));
const sets = read(join(old, "sets.json"));
const dev = read(join(old, "devset.json"));
const corpus: Any[] = read(corpusPath);
const live = read(livePath);
const key = (x: Any) => `${x.set}\u0000${x.id}`;
const baseBy = new Map(
	(read(basePath).results as Any[]).map((x) => [key(x), x]),
);
const branchBy = new Map(
	(read(branchPath).results as Any[]).map((x) => [key(x), x]),
);
const lc = (s: string) => s.toLowerCase();
const lines: string[] = [];
const say = (s = "") => lines.push(s);
const rankOf = (ranking: string[], names: string[]) => {
	const want = new Set(names.map(lc));
	const i = ranking.findIndex((n) => want.has(lc(n)));
	return i < 0 ? null : i + 1;
};
const byName = new Map(corpus.map((d) => [lc(d.fullName), d]));
const termRank = (ranking: string[], terms: string[]) => {
	const i = ranking.findIndex((n) => {
		const d = byName.get(lc(n));
		const hay = lc(`${n} ${d?.description ?? ""}`);
		return terms.some((t) => hay.includes(lc(t)));
	});
	return i < 0 ? null : i + 1;
};
const NEW_CANONICAL = [
	"stellar-scaffold/cli",
	"stellar/laboratory",
	"stellar/soroban-examples",
];
const mechanism = (q: string) => {
	const m: string[] = [];
	const fired = canonicalFor(q).filter((r) => NEW_CANONICAL.includes(r));
	if (fired.length) m.push(`canonical entry (${fired.join(", ")})`);
	const named = explicitRepoName(q);
	if (named && renamedTo(named) !== named)
		m.push(`rename alias (${named} -> ${renamedTo(named)})`);
	return m;
};
const fmt = (r: number | null) => (r === null ? "absent" : String(r));

say(`apiVersion during capture: ${JSON.stringify(live.versions)}`);
say(`corpus rows: ${corpus.length}; live pages: ${live.live.length}`);

// 1. Fidelity: the base replay's first page against live's.
let fid = 0;
const fidMiss: string[] = [];
for (const l of live.live as Any[]) {
	const b = baseBy.get(key(l));
	const same =
		JSON.stringify(l.repos) ===
			JSON.stringify(
				b.page.map((r: Any) => ({ fullName: r.fullName, score: r.score })),
			) &&
		l.matchMode === b.matchMode &&
		l.total === b.total;
	if (same) fid++;
	else fidMiss.push(`${l.set} ${l.id}`);
}
say(
	`fidelity: ${fid}/${live.live.length} base first pages identical to live (rows, order, scores, matchMode, total)${fidMiss.length ? `; differ: ${fidMiss.join(" | ")}` : ""}`,
);
say();

// 2. Expected repo per query, for every set that names one.
const expected = (x: Any): { names?: string[]; terms?: string[] } | null => {
	if (x.set === "dev")
		return {
			names: dev.questions.find((d: Any) => d.id === x.id).expect.anyOf,
		};
	if (x.set === "battery")
		return sets.battery.expected[x.id]
			? { names: sets.battery.expected[x.id] }
			: { terms: sets.battery.expectedTerm[x.id] };
	if (x.set === "exact-full" || x.set === "exact-name")
		return { names: [x.id] };
	if (x.set === "project-name")
		return {
			names: corpus
				.filter((d) => d.projectName === x.id)
				.map((d) => d.fullName as string),
		};
	const f = ["acceptance", "controls", "naturalLanguage"].includes(x.set)
		? frozen[x.set].find((y: Any) => y.id === x.id)
		: null;
	return f ? { names: [f.expect] } : null;
};
const rankIn = (x: Any, ranking: string[]) => {
	const e = expected(x);
	if (!e) return undefined;
	return e.names ? rankOf(ranking, e.names) : termRank(ranking, e.terms ?? []);
};

const bars: Record<string, { pass: number; total: number; fails: string[] }> =
	{};
const bar = (name: string, ok: boolean, what: string) => {
	bars[name] ??= { pass: 0, total: 0, fails: [] };
	bars[name].total++;
	if (ok) bars[name].pass++;
	else bars[name].fails.push(what);
};

// 3. Every query: rank of the expected repo, whole-ranking and first-page
// changes, and the mechanism that explains a change.
const moves: string[] = [];
let identical = 0;
let changed = 0;
let unexplained = 0;
const down: string[] = [];
for (const l of live.live as Any[]) {
	const b = baseBy.get(key(l));
	const r = branchBy.get(key(l));
	const pageSame =
		JSON.stringify(b.page) === JSON.stringify(r.page) &&
		b.matchMode === r.matchMode &&
		b.total === r.total;
	const rankingSame = JSON.stringify(b.ranking) === JSON.stringify(r.ranking);
	const rb = rankIn(l, b.ranking);
	const rr = rankIn(l, r.ranking);
	const label = `[${l.set}] ${l.id}${l.id === l.q ? "" : ` (q="${l.q}")`}`;
	if (l.set === "acceptance")
		bar("acceptance: expected repo first on the branch", rr === 1, label);
	if (l.set === "controls")
		bar(
			"controls: expected repo first on base and branch",
			rb === 1 && rr === 1,
			label,
		);
	if (l.set === "unchanged")
		bar("unchanged: same first page, matchMode and total", pageSame, label);
	if (pageSame && rankingSame) {
		identical++;
		continue;
	}
	changed++;
	const mech = mechanism(l.q);
	if (!mech.length) unexplained++;
	if (
		rb !== undefined &&
		rb !== rr &&
		(rr === null || (rb !== null && rr > rb))
	)
		down.push(`${label}: ${fmt(rb)} -> ${fmt(rr)}`);
	const pageMoves: string[] = [];
	const bn = b.page.map((x: Any) => x.fullName);
	const rn = r.page.map((x: Any) => x.fullName);
	for (const [i, n] of rn.entries()) {
		const j = bn.indexOf(n);
		if (j !== i) pageMoves.push(`${n} ${j < 0 ? "new" : j + 1}->${i + 1}`);
	}
	for (const n of bn)
		if (!rn.includes(n)) pageMoves.push(`${n} ${bn.indexOf(n) + 1}->off page`);
	moves.push(
		`${label}\n    mechanism: ${mech.join("; ") || "NONE (unexplained)"}${rb === undefined ? "" : `\n    expected repo rank: ${fmt(rb)} -> ${fmt(rr)}`}\n    first page: ${pageMoves.join(", ") || "unchanged"}${rankingSame ? "" : `\n    whole ranking: ${b.ranking.length} -> ${r.ranking.length} rows, changed`}`,
	);
}

say("Bars (frozen-set.json)");
for (const [name, v] of Object.entries(bars))
	say(
		`  ${v.pass === v.total ? "HOLDS" : "FAILS"}  ${name}: ${v.pass}/${v.total}${v.fails.length ? `; failing: ${v.fails.join(" | ")}` : ""}`,
	);
say(
	`  ${down.length ? "REVIEW" : "HOLDS"}  no expected repo moves down: ${down.length ? down.join(" | ") : "none moved down"}`,
);
say(
	`  ${unexplained ? "FAILS" : "HOLDS"}  every change has a mechanism of the change: ${changed - unexplained}/${changed}`,
);
say();
say(
	`Queries: ${live.live.length}; identical (first page and whole ranking): ${identical}; changed: ${changed}`,
);
say();
say("Expected-repo ranks, base -> branch (every query that names a repo)");
for (const l of live.live as Any[]) {
	const rb = rankIn(l, baseBy.get(key(l)).ranking);
	if (rb === undefined) continue;
	const rr = rankIn(l, branchBy.get(key(l)).ranking);
	say(
		`  ${rb === rr ? " " : rr !== null && (rb === null || rr < rb) ? "+" : "-"} [${l.set}] ${l.id}: ${fmt(rb)} -> ${fmt(rr)}`,
	);
}
say();
say("Every changed query");
for (const m of moves) say(`  ${m}`);
writeFileSync(reportPath, `${lines.join("\n")}\n`);
console.log(lines.slice(0, 16).join("\n"));
