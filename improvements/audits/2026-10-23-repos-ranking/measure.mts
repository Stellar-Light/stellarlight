// Grades the base and branch replays against the bars fixed in the ledger
// (../../rounds/2026-10-23-repos-ranking.md) and checks the base replay
// against live. Writes a report and a JSON summary.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-repos-ranking/measure.mts \
//     <corpus.json> <live.json> <base.json> <branch.json> <report.txt> <results.json>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , corpusPath, livePath, basePath, branchPath, reportPath, jsonPath] =
	process.argv;
if (!jsonPath)
	throw new Error(
		"usage: measure.mts <corpus> <live> <base> <branch> <report.txt> <results.json>",
	);
const here = new URL(".", import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const sets = read(join(here, "sets.json"));
const dev = read(join(here, "devset.json"));
const freeze = read(join(here, "FREEZE.json"));
// biome-ignore lint/suspicious/noExplicitAny: captured shapes
type Any = any;
const corpus: Any[] = read(corpusPath);
const live = read(livePath);
const base = read(basePath).results as Any[];
const branch = read(branchPath).results as Any[];

const lc = (s: string) => s.toLowerCase();
const byName = new Map(corpus.map((d) => [lc(d.fullName), d]));
const key = (x: Any) => `${x.set}\u0000${x.id}`;
const baseBy = new Map(base.map((x) => [key(x), x]));
const branchBy = new Map(branch.map((x) => [key(x), x]));
const liveBy = new Map(live.live.map((x: Any) => [key(x), x]));
const lines: string[] = [];
const say = (s = "") => lines.push(s);
const rankOf = (ranking: string[], names: string[]) => {
	const want = new Set(names.map(lc));
	const i = ranking.findIndex((n) => want.has(lc(n)));
	return i < 0 ? null : i + 1;
};
const inUse = (n: string) => (byName.get(lc(n))?.codeInUse?.events ?? 0) > 0;
const successorOf = (n: string): string | null => {
	const d = byName.get(lc(n));
	return d?.successorRepo ?? d?.supersededBy ?? null;
};

say(`apiVersion during capture: ${JSON.stringify(live.versions)}`);
say(`corpus rows: ${corpus.length}; live pages: ${live.live.length}`);
say();

// 1. Fidelity: the base replay's first page against live's.
const fidelity = { exact: 0, total: 0, mismatches: [] as Any[] };
for (const l of live.live as Any[]) {
	const b = baseBy.get(key(l));
	if (!b) continue;
	fidelity.total++;
	const ln = l.repos.map((r: Any) => r.fullName);
	const bn = b.page.map((r: Any) => r.fullName);
	if (JSON.stringify(ln) === JSON.stringify(bn)) fidelity.exact++;
	else {
		const at = ln.findIndex((n: string, i: number) => n !== bn[i]);
		fidelity.mismatches.push({
			set: l.set,
			id: l.id,
			firstDiffRank: at < 0 ? Math.min(ln.length, bn.length) + 1 : at + 1,
			live: ln.slice(Math.max(0, at), Math.max(0, at) + 3),
			replay: bn.slice(Math.max(0, at), Math.max(0, at) + 3),
			sameSet:
				JSON.stringify([...ln].sort()) === JSON.stringify([...bn].sort()),
			liveWarnings: l.warnings.filter((w: string) => !w.includes("r4")),
		});
	}
}
say(
	`FIDELITY base replay vs live, first page (20): ${fidelity.exact}/${fidelity.total} identical`,
);
for (const m of fidelity.mismatches)
	say(
		`  ${m.set} ${m.id}: first difference at rank ${m.firstDiffRank}${m.sameSet ? " (same rows, other order)" : ""}; live ${m.live.join(", ")} | replay ${m.replay.join(", ")}${m.liveWarnings.length ? ` | live warnings: ${m.liveWarnings.join("; ")}` : ""}`,
	);
say();

// 2. Dev set: an expected repo in the top 5.
const held = new Set<string>(freeze.heldOut);
const devRows = dev.questions.map((q: Any) => {
	const b = baseBy.get(`dev\u0000${q.id}`);
	const n = branchBy.get(`dev\u0000${q.id}`);
	const exp: string[] = q.expect.anyOf;
	return {
		id: q.id,
		slice: held.has(q.id) ? "held-out" : "tuning",
		expected: exp,
		indexed: exp.filter((e) => byName.has(lc(e))),
		baseRank: rankOf(b.ranking, exp),
		branchRank: rankOf(n.ranking, exp),
		baseTop: b.ranking.slice(0, 3),
		branchTop: n.ranking.slice(0, 3),
		baseTokens: b.tokens,
		branchTokens: n.tokens,
	};
});
const top5 = (r: number | null) => r !== null && r <= 5;
const tally = (rows: Any[]) => ({
	n: rows.length,
	base: rows.filter((r) => top5(r.baseRank)).length,
	branch: rows.filter((r) => top5(r.branchRank)).length,
	gained: rows.filter((r) => !top5(r.baseRank) && top5(r.branchRank)).length,
	lost: rows.filter((r) => top5(r.baseRank) && !top5(r.branchRank)).length,
});
const devAll = tally(devRows);
const devTune = tally(devRows.filter((r: Any) => r.slice === "tuning"));
const devHeld = tally(devRows.filter((r: Any) => r.slice === "held-out"));
say("DEV SET: expected repo in the top 5 (base -> branch)");
say(
	`  all ${devAll.n}: ${devAll.base} -> ${devAll.branch} (gained ${devAll.gained}, lost ${devAll.lost}); bar: +6`,
);
say(
	`  tuning ${devTune.n}: ${devTune.base} -> ${devTune.branch} (gained ${devTune.gained}, lost ${devTune.lost})`,
);
say(
	`  held-out ${devHeld.n}: ${devHeld.base} -> ${devHeld.branch} (gained ${devHeld.gained}, lost ${devHeld.lost})`,
);
for (const r of devRows)
	say(
		`  ${r.id} [${r.slice}] ${r.expected.join(" | ")}${r.indexed.length ? "" : " (NOT INDEXED)"}: rank ${r.baseRank ?? "-"} -> ${r.branchRank ?? "-"}; base top ${r.baseTop.join(", ")}; branch top ${r.branchTop.join(", ")}`,
	);
say();

// 3. Exact names and project names: rank 1 kept.
const projectSlugs = new Map<string, Set<string>>();
for (const d of corpus)
	if (d.projectName && d.projectSlug) {
		const s = projectSlugs.get(d.projectName) ?? new Set<string>();
		s.add(d.projectSlug);
		projectSlugs.set(d.projectName, s);
	}
const exactRows: Any[] = [];
for (const b of base.filter((x) =>
	["exact-full", "exact-name", "project-name"].includes(x.set),
)) {
	const n = branchBy.get(key(b));
	const l = liveBy.get(key(b)) as Any;
	const first = (ranking: string[]) =>
		b.set === "project-name"
			? projectSlugs
					.get(b.id)
					?.has(byName.get(lc(ranking[0] ?? ""))?.projectSlug ?? "\u0000") ===
				true
			: lc(ranking[0] ?? "") === lc(b.id);
	exactRows.push({
		set: b.set,
		q: b.q,
		id: b.id,
		indexed: b.set === "project-name" ? true : byName.has(lc(b.id)),
		live1: first((l?.repos ?? []).map((r: Any) => r.fullName)),
		base1: first(b.ranking),
		branch1: first(n.ranking),
		baseTop: b.ranking[0] ?? null,
		branchTop: n.ranking[0] ?? null,
	});
}
const exactLosses = exactRows.filter((r) => r.base1 && !r.branch1);
const exactGains = exactRows.filter((r) => !r.base1 && r.branch1);
say("EXACT NAMES: rank 1 (base -> branch); bar: 0 losses");
for (const s of ["exact-full", "exact-name", "project-name"]) {
	const rows = exactRows.filter((r) => r.set === s);
	say(
		`  ${s}: ${rows.length} lookups; rank 1 live ${rows.filter((r) => r.live1).length}, base ${rows.filter((r) => r.base1).length}, branch ${rows.filter((r) => r.branch1).length}; losses ${rows.filter((r) => r.base1 && !r.branch1).length}; gains ${rows.filter((r) => !r.base1 && r.branch1).length}`,
	);
}
for (const r of exactRows.filter((r) => !r.base1 || !r.branch1))
	say(
		`  ${r.set} "${r.q}"${r.indexed ? "" : " (NOT INDEXED)"}: base top ${r.baseTop} -> branch top ${r.branchTop}${r.base1 && !r.branch1 ? "  LOSS" : !r.base1 && r.branch1 ? "  GAIN" : ""}`,
	);
say();

// 4. Keyword queries: the default first page, base vs branch.
const kwRows: Any[] = [];
for (const b of base.filter((x) => x.set === "keyword")) {
	const n = branchBy.get(key(b));
	const pool = new Set([...b.ranking, ...n.ranking]);
	const usedInPool = [...pool].filter(inUse);
	const supersededPairs = [...pool].filter((p) => {
		const s = successorOf(p);
		return s !== null && [...pool].some((x) => lc(x) === lc(s));
	});
	const samePage =
		JSON.stringify(b.page) === JSON.stringify(n.page) &&
		b.matchMode === n.matchMode;
	kwRows.push({
		q: b.q,
		identical: samePage,
		tokensChanged: JSON.stringify(b.tokens) !== JSON.stringify(n.tokens),
		usedInPool,
		supersededPairs,
		mechanismFree: usedInPool.length === 0 && supersededPairs.length === 0,
		base: b.page.map((r: Any) => r.fullName),
		branch: n.page.map((r: Any) => r.fullName),
	});
}
const kwFree = kwRows.filter((r) => r.mechanismFree && !r.tokensChanged);
const kwFail = kwFree.filter((r) => !r.identical);
say(
	`KEYWORD QUERIES (default page, 20): ${kwRows.filter((r) => r.identical).length}/${kwRows.length} identical; bar: every query with no used row, no successor pair and unchanged tokens identical (${kwFree.length - kwFail.length}/${kwFree.length})`,
);
for (const r of kwRows.filter((r) => !r.identical)) {
	const moved = r.base
		.map((name: string, i: number) => ({
			name,
			from: i + 1,
			to: r.branch.indexOf(name) + 1 || null,
		}))
		.filter((m: Any) => m.from !== m.to);
	say(
		`  "${r.q}": changed; used rows in pool ${r.usedInPool.length}, successor pairs ${r.supersededPairs.length}, tokens changed ${r.tokensChanged}${r.mechanismFree && !r.tokensChanged ? "  FAIL (no mechanism)" : ""}`,
	);
	for (const m of moved.slice(0, 8))
		say(
			`      ${m.name}${inUse(m.name) ? " [used]" : ""}${successorOf(m.name) ? ` [successor ${successorOf(m.name)}]` : ""}: ${m.from} -> ${m.to ?? "off page"}`,
		);
	for (const name of r.branch.filter((x: string) => !r.base.includes(x)))
		say(`      ${name}: off page -> ${r.branch.indexOf(name) + 1}`);
}
say();

// 5. Battery tools questions, not tuned on.
const batteryRows: Any[] = [];
for (const id of sets.battery.ids) {
	const b = baseBy.get(`battery\u0000${id}`);
	const n = branchBy.get(`battery\u0000${id}`);
	const named: string[] | undefined = sets.battery.expected[id];
	const terms: string[] | undefined = sets.battery.expectedTerm?.[id];
	const rank = (ranking: string[]) => {
		if (named) return rankOf(ranking, named);
		const i = ranking.findIndex((name) => {
			const d = byName.get(lc(name));
			const hay = lc(`${name} ${d?.description ?? ""}`);
			return (terms ?? []).some((t) => hay.includes(t));
		});
		return i < 0 ? null : i + 1;
	};
	batteryRows.push({
		id,
		expected: named ?? terms?.map((t) => `text: ${t}`),
		indexed: named ? named.filter((e) => byName.has(lc(e))) : null,
		baseRank: rank(b.ranking),
		branchRank: rank(n.ranking),
		baseTotal: b.total,
		branchTotal: n.total,
		baseTop: b.ranking.slice(0, 5),
		branchTop: n.ranking.slice(0, 5),
		baseTokens: b.tokens,
		branchTokens: n.tokens,
	});
}
say("BATTERY tools questions (not tuned on): rank of the expected repo");
for (const r of batteryRows) {
	say(
		`  ${r.id} ${r.expected.join(" | ")}${r.indexed && !r.indexed.length ? " (NOT INDEXED)" : ""}: ${r.baseRank ?? "-"} of ${r.baseTotal} -> ${r.branchRank ?? "-"} of ${r.branchTotal}`,
	);
	say(`      base top 5: ${r.baseTop.join(", ")}`);
	say(`      branch top 5: ${r.branchTop.join(", ")}`);
	say(`      tokens: ${r.baseTokens.join(" ")} -> ${r.branchTokens.join(" ")}`);
}

writeFileSync(reportPath, `${lines.join("\n")}\n`);
writeFileSync(
	jsonPath,
	`${JSON.stringify(
		{
			versions: live.versions,
			corpusRows: corpus.length,
			fidelity: {
				exact: fidelity.exact,
				total: fidelity.total,
				mismatches: fidelity.mismatches,
			},
			dev: { all: devAll, tuning: devTune, heldOut: devHeld, rows: devRows },
			exact: {
				losses: exactLosses.length,
				gains: exactGains.length,
				rows: exactRows,
			},
			keyword: {
				identical: kwRows.filter((r) => r.identical).length,
				total: kwRows.length,
				barFailures: kwFail.map((r) => r.q),
				rows: kwRows,
			},
			battery: batteryRows,
		},
		null,
		1,
	)}\n`,
);
console.log(lines.join("\n"));
