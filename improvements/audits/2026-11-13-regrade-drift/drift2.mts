// Decompose each move against the last full regrade (2026-09-15 02:02 UTC,
// "13260 read · 1 would change": every row then held its own grade).
import { readFileSync } from "node:fs";
import {
	gradeStoredRow,
	projectAuthority,
} from "../../../src/lib/repo-regrade";

const dir = process.argv[2];
const rows: any[] = JSON.parse(readFileSync(`${dir}/repos-all.json`, "utf8"));
const projects = new Map(
	JSON.parse(readFileSync(`${dir}/projects-all.json`, "utf8")).docs.map(
		(p: any) => [String(p.slug), projectAuthority(p)],
	),
);
const T0 = Date.parse("2026-09-15T02:02:27Z");
const real = Date.now;
const g = (r: any) => gradeStoredRow(r, projects);
const at = (t: number, r: any) => {
	Date.now = () => t;
	try {
		return g(r).score;
	} finally {
		Date.now = real;
	}
};
const tally = new Map<string, number>();
const add = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1);
const after = (iso?: string) => !!iso && Date.parse(iso) > T0;
let n = 0;
for (const r of rows) {
	const now = g(r);
	const from = Number(r.repoScore ?? -1);
	const lf = r.repoScoreLabel ?? "";
	if (now.score === from && now.label === lf) continue;
	n++;
	let cls: string;
	if (!lf)
		cls = `A never graded: created by enrich-builder-repos with no score`;
	else if (Date.parse(r.createdAt) > T0)
		cls = `B created after the last regrade, graded at create on partial inputs (${r.source})`;
	else {
		const t0 = at(T0, r);
		const timePart = now.score - t0,
			inputPart = t0 - from;
		if (inputPart === 0 && timePart !== 0)
			cls =
				"C time only (commit and release age) since 09-15, inputs unchanged";
		else if (inputPart === 0 && timePart === 0)
			cls = "D label only (score already right)";
		else {
			const w: string[] = [];
			if (after(r.activitySignals?.asOf)) w.push("activity");
			if (after(r.codeScannedAt)) w.push("scan");
			if (after(r.packagesCheckedAt)) w.push("packages");
			cls = `E inputs rewritten since 09-15 by a lane that does not grade (${w.join("+") || "other"})${timePart ? " + time" : ""}`;
		}
	}
	add(cls);
}
console.log(`moves: ${n}`);
for (const [k, v] of [...tally].sort())
	console.log(`${String(v).padStart(5)}  ${k}`);
