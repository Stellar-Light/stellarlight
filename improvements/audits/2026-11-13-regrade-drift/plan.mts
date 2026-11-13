// Replays scripts/regrade-repos.ts's plan over public /api/repos + /api/projects rows.
import { readFileSync, writeFileSync } from "node:fs";
import {
	gradeStoredRow,
	parseRegradeArgs,
	planRegrade,
	projectAuthority,
} from "../../../src/lib/repo-regrade";

const dir = process.argv[2];
const rows = JSON.parse(readFileSync(`${dir}/repos-all.json`, "utf8"));
const projs = JSON.parse(readFileSync(`${dir}/projects-all.json`, "utf8")).docs;
const projects = new Map(
	projs.map((p: any) => [String(p.slug), projectAuthority(p)]),
);
const full = planRegrade(rows, projects, null);
console.log(`full: ${rows.length} read · ${full.moves.length} would change`);
const top = [...full.moves]
	.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
	.slice(0, 20);
for (const d of top)
	console.log(
		`  ${d.fullName.padEnd(46)} ${String(d.from).padStart(3)} → ${String(d.to).padStart(3)}  (${d.to - d.from >= 0 ? "+" : ""}${d.to - d.from})`,
	);
// every row's new grade, for the ranking measurement
const after: Record<
	string,
	{ from: number; to: number; labelFrom: string; labelTo: string }
> = {};
for (const r of rows) {
	const g = gradeStoredRow(r, projects);
	after[r.fullName.toLowerCase()] = {
		from: Number(r.repoScore ?? -1),
		to: g.score,
		labelFrom: r.repoScoreLabel ?? "",
		labelTo: g.label,
	};
}
writeFileSync(`${dir}/after-grades.json`, JSON.stringify(after));
const only = parseRegradeArgs([`--only-file=${dir}/unlinked-38.txt`], (p) =>
	readFileSync(p, "utf8"),
).only as Set<string>;
const scoped = planRegrade(rows, projects, only);
console.log(
	`\nscoped: ${scoped.matched.length} of ${only.size} named matched · ${scoped.moves.length} would change`,
);
for (const d of [...scoped.moves].sort((a, b) =>
	a.fullName.localeCompare(b.fullName),
))
	console.log(
		`  ${d.fullName.padEnd(46)} ${String(d.from).padStart(3)} → ${String(d.to).padStart(3)}  (${d.to - d.from >= 0 ? "+" : ""}${d.to - d.from})  ${d.labelFrom || "none"} → ${d.labelTo}`,
	);
console.log(
	"missing:",
	[...only].filter((n) => !scoped.matched.includes(n)),
);
