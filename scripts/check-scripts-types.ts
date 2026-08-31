/**
 * Type-check scripts/, against a frozen baseline of what was already broken.
 *
 * The gap: tsconfig excludes scripts/**, so `tsc --noEmit` says the tree is
 * clean while ~200 node-side scripts — including the ones that write to the
 * production database — are never checked. On 2026-08-30 two broken scripts
 * shipped in consecutive commits behind a fully green CI run: an undefined
 * identifier in enrich-repos.ts, and an import that never landed in an eval
 * probe. Both were one-line mistakes that a compiler catches for free.
 *
 * A RATCHET, not a cleanup. Turning the check on cold means 91 pre-existing
 * errors and a red build on day one, which ends the same way every such gate
 * ends — deleted. The baseline freezes today's errors by identity, so:
 *
 *   a NEW error anywhere      -> red
 *   a baselined error fixed   -> the baseline must shrink, in that PR
 *   a fixed error traded for  -> red, because identity is per file+code+text,
 *   a new one elsewhere          not a total that can be gamed
 *
 * Identity deliberately excludes line and column numbers. Inserting a line
 * above an untouched error would otherwise read as "one fixed, one new" and
 * make every unrelated edit red.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BASELINE = "scripts/scripts-types-baseline.json";
const UPDATE = process.argv.includes("--update");
const JSON_OUT = process.argv.includes("--json");
const ARTIFACT = "improvements/audits/scripts-types-latest.json";

/** file + TS code + message, without positions. */
function signature(line: string): string | null {
	const m = /^(.+?)\(\d+,\d+\): (error TS\d+): (.*)$/.exec(line.trim());
	if (!m) return null;
	return `${m[1]} :: ${m[2]} :: ${m[3]}`;
}

function run(): string[] {
	let out = "";
	try {
		out = execFileSync(
			"npx",
			["tsc", "--noEmit", "-p", "tsconfig.scripts.json"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6 },
		);
	} catch (e: any) {
		// tsc exits non-zero when it finds errors; the report is on stdout.
		out = `${e?.stdout ?? ""}${e?.stderr ?? ""}`;
	}
	return out
		.split("\n")
		.map(signature)
		.filter((s): s is string => !!s);
}

const found = run();
const unique = [...new Set(found)].sort();

if (UPDATE) {
	writeFileSync(
		BASELINE,
		`${JSON.stringify(
			{
				$comment:
					"Type errors in scripts/ that predate the guard. A ratchet: entries may be REMOVED (in the PR that fixes them) and never added. Regenerate: pnpm exec tsx scripts/check-scripts-types.ts --update",
				updatedAt: new Date().toISOString(),
				count: unique.length,
				errors: unique,
			},
			null,
			"\t",
		)}\n`,
	);
	console.log(`baseline written: ${unique.length} known errors`);
	process.exit(0);
}

const baseline: { errors: string[] } = existsSync(BASELINE)
	? JSON.parse(readFileSync(BASELINE, "utf8"))
	: { errors: [] };
const known = new Set(baseline.errors);

const added = unique.filter((s) => !known.has(s));
const fixed = [...known].filter((s) => !unique.includes(s));

if (JSON_OUT) {
	writeFileSync(
		ARTIFACT,
		`${JSON.stringify(
			{
				asOf: new Date().toISOString(),
				source: "scripts/check-scripts-types.ts",
				total: unique.length,
				baselined: known.size,
				added,
				fixed,
			},
			null,
			"\t",
		)}\n`,
	);
	console.log(`wrote ${ARTIFACT}`);
}

if (fixed.length)
	console.log(
		`${fixed.length} baselined error(s) no longer occur — run with --update and commit:\n${fixed.map((s) => `  - ${s}`).join("\n")}`,
	);

if (added.length) {
	console.error(
		`\nRED: ${added.length} NEW type error(s) in scripts/:\n${added.map((s) => `  ${s}`).join("\n")}`,
	);
	process.exit(1);
}

console.log(
	`GREEN: no new type errors in scripts/. ${unique.length} baselined error(s) carried as debt.`,
);
// A shrunk baseline is a real change to a committed file; failing here is what
// keeps the ratchet honest, since a silently-stale baseline hides regressions
// behind an old excuse.
if (fixed.length) process.exit(1);
