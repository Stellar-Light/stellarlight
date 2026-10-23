// Compare base and lane replays (lane DQ1, criterion 3 and the linked rows).
//
//   node improvements/audits/2026-10-23-dead-protocol-guard/compare.mjs \
//     <dir holding replay-{base,lane}-{A,B,C}.json> <results.json>
//
// For each scenario: every served row WITHOUT a DefiLlama link must be
// byte-identical between base and lane, and every page with no linked row
// must be byte-identical as a whole body. Linked rows: the keys that changed.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, outPath] = process.argv.slice(2);
const load = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
const linked = (json) => {
	const r = JSON.parse(json);
	return Array.isArray(r.llamaSlugs) && r.llamaSlugs.length > 0;
};

const results = {};
for (const sc of ["A", "B", "C"]) {
	const base = load(`replay-base-${sc}.json`);
	const lane = load(`replay-lane-${sc}.json`);
	const r = {
		queries: 0,
		rowsServed: 0,
		unlinkedRows: 0,
		unlinkedIdentical: 0,
		unlinkedChanged: [],
		pagesWithoutLinkedRow: 0,
		pagesWithoutLinkedRowIdentical: 0,
		pagesChanged: [],
		rowSetsDiffer: [],
		linkedRows: {},
	};
	for (const [q, b] of Object.entries(base)) {
		const l = lane[q];
		r.queries++;
		const slugsB = Object.keys(b.rows);
		const slugsL = Object.keys(l.rows);
		if (slugsB.join("|") !== slugsL.join("|")) r.rowSetsDiffer.push(q);
		r.rowsServed += slugsB.length;
		let anyLinked = false;
		for (const slug of slugsB) {
			const jb = b.rows[slug];
			const jl = l.rows[slug];
			if (linked(jb)) {
				anyLinked = true;
				const ob = JSON.parse(jb);
				const ol = JSON.parse(jl ?? "{}");
				const keys = [...new Set([...Object.keys(ob), ...Object.keys(ol)])];
				const changed = keys.filter(
					(k) => JSON.stringify(ob[k]) !== JSON.stringify(ol[k]),
				);
				r.linkedRows[slug] ??= {
					changedKeys: changed,
					status: ol.status,
					statusConfidence: {
						base: ob.statusConfidence,
						lane: ol.statusConfidence,
					},
					statusCaveat: ol.statusCaveat ?? null,
					statusChecks: (ol.statusChecks ?? []).map(
						(c) => `${c.check}: ${c.result}`,
					),
				};
				continue;
			}
			r.unlinkedRows++;
			if (jb === jl) r.unlinkedIdentical++;
			else r.unlinkedChanged.push(`${q} / ${slug}`);
		}
		if (!anyLinked) {
			r.pagesWithoutLinkedRow++;
			if (b.sha256 === l.sha256) r.pagesWithoutLinkedRowIdentical++;
			else r.pagesChanged.push(q);
		}
	}
	results[sc] = r;
}
// Base sanity: the base code never reads llamaListing, so its A and B
// outputs must match byte for byte.
const bA = load("replay-base-A.json");
const bB = load("replay-base-B.json");
results.baseIgnoresListing = Object.keys(bA).every(
	(q) => bA[q].sha256 === bB[q].sha256,
);
writeFileSync(outPath, `${JSON.stringify(results, null, 1)}\n`);
for (const sc of ["A", "B", "C"]) {
	const r = results[sc];
	console.log(
		`${sc}: ${r.queries} queries, ${r.rowsServed} rows; unlinked ${r.unlinkedIdentical}/${r.unlinkedRows} identical; pages without a linked row ${r.pagesWithoutLinkedRowIdentical}/${r.pagesWithoutLinkedRow} identical; row sets differ on ${r.rowSetsDiffer.length}; linked rows ${Object.keys(r.linkedRows).length}`,
	);
}
console.log(`base ignores llamaListing: ${results.baseIgnoresListing}`);
