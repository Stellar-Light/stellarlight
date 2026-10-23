// Grades the narrow ship (D1 plus D3, no D2) against the bars written in the
// ledger at 21:31Z (../../rounds/2026-10-23-repos-ranking.md, "Narrow ship").
// Inputs are replay.mts outputs: base, the variant, and the variant over a
// corpus copy with codeInUse cleared (bar 3: does a used row's lead depend on
// usage?). Writes a report and a JSON summary.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-repos-ranking/measure-narrow.mts \
//     <corpus.json> <base.json> <variant.json> <variant-nousage.json> <report.txt> <results.json>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , corpusPath, basePath, varPath, noUsePath, reportPath, jsonPath] =
	process.argv;
if (!jsonPath)
	throw new Error(
		"usage: measure-narrow.mts <corpus> <base> <variant> <variant-nousage> <report.txt> <results.json>",
	);
const here = new URL(".", import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
// biome-ignore lint/suspicious/noExplicitAny: captured shapes
type Any = any;
const sets = read(join(here, "sets.json"));
const dev = read(join(here, "devset.json"));
const held = new Set<string>(read(join(here, "FREEZE.json")).heldOut);
const corpus: Any[] = read(corpusPath);
const lc = (s: string) => s.toLowerCase();
const byName = new Map(corpus.map((d) => [lc(d.fullName), d]));
const key = (x: Any) => `${x.set}\u0000${x.id}`;
const index = (p: string) =>
	new Map((read(p).results as Any[]).map((x) => [key(x), x]));
const base = index(basePath);
const vari = index(varPath);
const noUse = index(noUsePath);
const used = (n: string) => (byName.get(lc(n))?.codeInUse?.events ?? 0) > 0;
const successorOf = (n: string): string | null => {
	const d = byName.get(lc(n));
	return d?.successorRepo ?? d?.supersededBy ?? null;
};
const lines: string[] = [];
const say = (s = "") => lines.push(s);
const rankOf = (ranking: string[], names: string[]) => {
	const want = new Set(names.map(lc));
	const i = ranking.findIndex((n) => want.has(lc(n)));
	return i < 0 ? null : i + 1;
};
const first = (x: Any) => x.page[0] ?? { fullName: null, score: null };
const fmt = (r: Any) => (r.fullName ? `${r.fullName} (${r.score})` : "none");

// (1) Exact names.
const projectSlugs = new Map<string, Set<string>>();
for (const d of corpus)
	if (d.projectName && d.projectSlug) {
		const s = projectSlugs.get(d.projectName) ?? new Set<string>();
		s.add(d.projectSlug);
		projectSlugs.set(d.projectName, s);
	}
const exact: Any[] = [];
for (const [k, b] of base) {
	if (!["exact-full", "exact-name", "project-name"].includes(b.set)) continue;
	const v = vari.get(k);
	const isFirst = (ranking: string[]) =>
		b.set === "project-name"
			? projectSlugs
					.get(b.id)
					?.has(byName.get(lc(ranking[0] ?? ""))?.projectSlug ?? "\u0000") ===
				true
			: lc(ranking[0] ?? "") === lc(b.id);
	exact.push({
		set: b.set,
		q: b.q,
		base1: isFirst(b.ranking),
		variant1: isFirst(v.ranking),
		baseTop: b.ranking[0] ?? null,
		variantTop: v.ranking[0] ?? null,
	});
}
const lookups = exact.filter((r) => r.set !== "project-name");
const lookupLosses = lookups.filter((r) => r.base1 && !r.variant1);
const projectRows = exact.filter((r) => r.set === "project-name");
say(
	`(1) EXACT NAMES: ${lookups.length} lookups, rank 1 base ${lookups.filter((r) => r.base1).length}, variant ${lookups.filter((r) => r.variant1).length}; losses ${lookupLosses.length} -> ${lookupLosses.length === 0 ? "HOLDS" : "FAILS"}`,
);
for (const r of lookupLosses)
	say(`    loss: "${r.q}" ${r.baseTop} -> ${r.variantTop}`);
for (const r of projectRows)
	say(
		`    project "${r.q}": base ${r.baseTop} (${r.base1 ? "project repo" : "other"}) -> variant ${r.variantTop} (${r.variant1 ? "project repo" : "other"})`,
	);
say();

// (2) Keyword queries: byte-identical record unless a mechanism is present.
const record = (x: Any) =>
	JSON.stringify({
		page: x.page,
		matchMode: x.matchMode,
		total: x.total,
		tokens: x.tokens,
		warnings: x.warnings,
		ranking: x.ranking,
	});
const kw: Any[] = [];
for (const [k, b] of base) {
	if (b.set !== "keyword") continue;
	const v = vari.get(k);
	const pool = new Set<string>([...b.ranking, ...v.ranking].map(lc));
	const usedRows = [...pool].filter(used);
	const pairs = [...pool].filter((p) => {
		const s = successorOf(p);
		return s !== null && pool.has(lc(s));
	});
	kw.push({
		q: b.q,
		mechanism: usedRows.length > 0 || pairs.length > 0,
		usedRows,
		pairs,
		identical: record(b) === record(v),
		pageIdentical: JSON.stringify(b.page) === JSON.stringify(v.page),
	});
}
const free = kw.filter((r) => !r.mechanism);
const freeFails = free.filter((r) => !r.identical);
say(
	`(2) KEYWORD REPLAY: ${free.length} of ${kw.length} queries hold no used row and no successor pair; byte-identical ${free.length - freeFails.length} of ${free.length} -> ${freeFails.length === 0 ? "HOLDS" : "FAILS"}`,
);
for (const r of freeFails) say(`    not identical: "${r.q}"`);
for (const r of kw.filter((r) => r.mechanism))
	say(
		`    with a mechanism: "${r.q}" (used ${r.usedRows.length}, successor pairs ${r.pairs.length}): ${r.identical ? "identical" : r.pageIdentical ? "first page identical, ranking changed" : "first page changed"}`,
	);
say();

// (3) The visible bug.
const USED = [
	"blend-capital/blend-contracts",
	"reflector-network/reflector-contract",
];
const leads: Any[] = [];
const changedFirst: Any[] = [];
for (const [k, b] of base) {
	const v = vari.get(k);
	const n = noUse.get(k);
	const f = first(v);
	if (lc(first(b).fullName ?? "") !== lc(f.fullName ?? ""))
		changedFirst.push({
			set: b.set,
			id: b.id,
			base: first(b),
			variant: f,
		});
	if (!f.fullName || !used(f.fullName)) continue;
	const nf = first(n);
	const sameWithoutUsage = lc(nf.fullName ?? "") === lc(f.fullName);
	// Without usage another row leads: allowed only when it ties on score.
	const tie = !sameWithoutUsage && nf.score === f.score;
	const higherOnPage = v.page.filter((r: Any) => r.score > f.score);
	leads.push({
		set: b.set,
		id: b.id,
		row: f,
		sameWithoutUsage,
		tie,
		violation: !sameWithoutUsage && !tie,
		higherOnPage: higherOnPage.map((r: Any) => `${r.fullName} (${r.score})`),
	});
}
const violations = leads.filter((r) => r.violation);
say(
	`(3) VISIBLE BUG: a used row is rank 1 on ${leads.length} of ${base.size} variant pages; leads that depend on usage beyond a score tie: ${violations.length} -> ${violations.length === 0 ? "HOLDS" : "FAILS"}`,
);
for (const r of leads)
	say(
		`    ${r.set} "${r.id}": ${fmt(r.row)} leads ${r.sameWithoutUsage ? "with usage removed too (a tier above the score or the best score)" : r.tie ? "by usage on a score tie" : "THROUGH USAGE"}${r.higherOnPage.length ? `; higher-scored rows on the page (a tier above the score puts them below): ${r.higherOnPage.join(", ")}` : ""}`,
	);
const named = [
	["battery", "hm26-sc-04"],
	["battery", "hm26-sa-04"],
	["keyword", "smart account"],
];
for (const [set, id] of named) {
	const b = base.get(`${set}\u0000${id}`);
	const v = vari.get(`${set}\u0000${id}`);
	const pos = (x: Any, n: string) => {
		const i = x.page.findIndex((r: Any) => lc(r.fullName) === n);
		return i < 0 ? "off page" : `rank ${i + 1} (${x.page[i].score})`;
	};
	say(
		`    named ${id}: first row ${fmt(first(b))} -> ${fmt(first(v))}; ${USED.map((u) => `${u} ${pos(b, u)} -> ${pos(v, u)}`).join("; ")}`,
	);
}
say(`    first rows that change (${changedFirst.length}):`);
for (const c of changedFirst)
	say(`      ${c.set} "${c.id}": ${fmt(c.base)} -> ${fmt(c.variant)}`);
say();

// (4) Battery: no question worse than base.
const battery: Any[] = [];
for (const id of sets.battery.ids) {
	const b = base.get(`battery\u0000${id}`);
	const v = vari.get(`battery\u0000${id}`);
	const named: string[] | undefined = sets.battery.expected[id];
	const terms: string[] = sets.battery.expectedTerm?.[id] ?? [];
	const rank = (ranking: string[]) => {
		if (named) return rankOf(ranking, named);
		const i = ranking.findIndex((name) => {
			const d = byName.get(lc(name));
			return terms.some((t) =>
				lc(`${name} ${d?.description ?? ""}`).includes(t),
			);
		});
		return i < 0 ? null : i + 1;
	};
	const br = rank(b.ranking);
	const vr = rank(v.ranking);
	battery.push({
		id,
		base: br,
		variant: vr,
		baseTotal: b.total,
		variantTotal: v.total,
		worse: br !== null && (vr === null || vr > br),
		baseFirst: first(b),
		variantFirst: first(v),
	});
}
const worse = battery.filter((r) => r.worse);
say(
	`(4) BATTERY: worse than base ${worse.length} of ${battery.length} -> ${worse.length === 0 ? "HOLDS" : "FAILS"}`,
);
for (const r of battery)
	say(
		`    ${r.id}: rank ${r.base ?? "-"} of ${r.baseTotal} -> ${r.variant ?? "-"} of ${r.variantTotal}; first row ${fmt(r.baseFirst)} -> ${fmt(r.variantFirst)}`,
	);
say();

// (5) Dev set, no bar.
const devRows = dev.questions.map((q: Any) => {
	const b = base.get(`dev\u0000${q.id}`);
	const v = vari.get(`dev\u0000${q.id}`);
	return {
		id: q.id,
		slice: held.has(q.id) ? "held-out" : "tuning",
		base: rankOf(b.ranking, q.expect.anyOf),
		variant: rankOf(v.ranking, q.expect.anyOf),
	};
});
const top5 = (r: number | null) => r !== null && r <= 5;
const count = (rows: Any[], f: "base" | "variant") =>
	rows.filter((r) => top5(r[f])).length;
const tune = devRows.filter((r: Any) => r.slice === "tuning");
const hold = devRows.filter((r: Any) => r.slice === "held-out");
say(
	`(5) DEV SET (no bar): expected repo in the top 5, base ${count(devRows, "base")} -> variant ${count(devRows, "variant")} of 25 (tuning ${count(tune, "base")} -> ${count(tune, "variant")}, held-out ${count(hold, "base")} -> ${count(hold, "variant")})`,
);
say(
	`    ${devRows.map((r: Any) => `${r.id}:${r.base ?? "-"}->${r.variant ?? "-"}`).join(" ")}`,
);

writeFileSync(reportPath, `${lines.join("\n")}\n`);
writeFileSync(
	jsonPath,
	`${JSON.stringify(
		{
			bar1: { lookups: lookups.length, losses: lookupLosses.length, exact },
			bar2: {
				mechanismFree: free.length,
				identical: free.length - freeFails.length,
				rows: kw,
			},
			bar3: { leads, violations: violations.length, changedFirst },
			bar4: { worse: worse.length, battery },
			dev: devRows,
		},
		null,
		"\t",
	)}\n`,
);
console.log(lines.join("\n"));
