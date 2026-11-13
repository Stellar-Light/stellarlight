// Prints what `scripts/regrade-repos.ts --only-file=unlinked-38.txt` (dry run)
// would print, from the public rows, through the script's own runRegrade.
import { readFileSync } from "node:fs";
import {
	parseRegradeArgs,
	projectAuthority,
	runRegrade,
} from "../../../src/lib/repo-regrade";

const dir = process.argv[2];
// biome-ignore lint/suspicious/noExplicitAny: public API rows
const rows: any[] = JSON.parse(readFileSync(`${dir}/repos-all.json`, "utf8"));
const projects = new Map(
	JSON.parse(readFileSync(`${dir}/projects-all.json`, "utf8")).docs.map(
		// biome-ignore lint/suspicious/noExplicitAny: public API rows
		(p: any) => [String(p.slug), projectAuthority(p)],
	),
);
const ARGS = parseRegradeArgs([`--only-file=${dir}/unlinked-38.txt`], (p) =>
	readFileSync(p, "utf8"),
);
const ONLY = ARGS.only as Set<string>;
async function* pages() {
	yield rows;
}
const run = await runRegrade(pages(), projects, ARGS, async () => null);
console.log(`projects read: ${projects.size}`);
console.log(`scoped to ${ONLY.size} named rows`);
console.log("\nmoves:");
for (const d of [...run.moves].sort((a, b) =>
	a.fullName.localeCompare(b.fullName),
))
	console.log(
		`  ${d.fullName.padEnd(46)} ${String(d.from).padStart(3)} → ${String(d.to).padStart(3)}  (${d.to - d.from >= 0 ? "+" : ""}${d.to - d.from})  ${d.labelFrom || "none"} → ${d.labelTo}`,
	);
for (const p of run.problems) console.log(`\nREFUSED, nothing written: ${p}`);
console.log(
	`\nDRY RUN: ${run.read} read · ${run.matched.length} of ${ONLY.size} named matched · ${run.moves.length} would change`,
);
