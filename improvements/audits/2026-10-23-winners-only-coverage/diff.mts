/**
 * Criterion (a): compare the base and lane replays (replay.test.ts).
 *
 *   pnpm exec tsx improvements/audits/2026-10-23-winners-only-coverage/diff.mts replay-base.json replay-lane.json
 *
 * Exit 1 when any request naming only full (or unstored) events differs.
 */
import { readFileSync } from "node:fs";

type Replay = {
	results: Record<
		string,
		{ class: string; status: number; chars: number; sha256: string }
	>;
};
const [basePath, lanePath] = process.argv.slice(2);
const base = JSON.parse(readFileSync(basePath, "utf8")) as Replay;
const lane = JSON.parse(readFileSync(lanePath, "utf8")) as Replay;

const keys = Object.keys(base.results);
const missing = keys.filter((k) => !lane.results[k]);
const tally: Record<string, { same: number; changed: string[] }> = {};
for (const k of keys) {
	const b = base.results[k];
	const l = lane.results[k];
	if (!l) continue;
	tally[b.class] ??= { same: 0, changed: [] };
	const t = tally[b.class];
	if (b.sha256 === l.sha256 && b.status === l.status) t.same++;
	else t.changed.push(`${k} (${b.chars} -> ${l.chars} chars)`);
}
const route = (k: string) => k.split(/[?/]/)[0];
for (const [cls, t] of Object.entries(tally)) {
	const byRoute: Record<string, number> = {};
	for (const k of keys)
		if (base.results[k].class === cls)
			byRoute[route(k)] = (byRoute[route(k)] ?? 0) + 1;
	console.log(
		`${cls}: ${t.same} identical, ${t.changed.length} changed, of ${t.same + t.changed.length} (${Object.entries(
			byRoute,
		)
			.map(([r, n]) => `${r} ${n}`)
			.join(", ")})`,
	);
	for (const c of t.changed) console.log(`  changed: ${c}`);
}
if (missing.length) console.log(`missing in lane: ${missing.join(", ")}`);
const broken = (tally["full-or-none"]?.changed.length ?? 0) + missing.length;
console.log(
	broken ? `FAIL: ${broken}` : "PASS: every full-or-none request identical",
);
process.exitCode = broken ? 1 : 0;
