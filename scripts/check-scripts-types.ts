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
		// `pnpm exec`, not `npx`: every other script in this repo is invoked that
		// way, and it resolves the workspace's own typescript rather than
		// whatever npx decides to fetch. `--pretty false` pins the output format
		// the parser below depends on — colourised, boxed output would match the
		// regex zero times.
		out = execFileSync(
			"pnpm",
			["exec", "tsc", "--noEmit", "--pretty", "false", "-p", "tsconfig.scripts.json"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6 },
		);
	} catch (e: any) {
		// tsc exits non-zero when it finds errors; the report is on stdout.
		out = `${e?.stdout ?? ""}${e?.stderr ?? ""}`;
	}
	const lines = out.split("\n");
	const parsed = lines
		.map(signature)
		.filter((s): s is string => !!s);
	// A PARSE FAILURE MUST NOT LOOK LIKE SUCCESS.
	//
	// If tsc's output format ever drifts from what `signature()` expects — a
	// pretty-printer default, a colour flag, a version change — this returns an
	// empty list. Empty means every baselined error "no longer occurs", so the
	// guard would report 63 fixes and demand a baseline it cannot justify, or,
	// worse, report GREEN on a tree full of errors. The tell is unambiguous:
	// output that clearly contains errors but parsed to none.
	if (parsed.length === 0 && /error TS\d+/.test(out)) {
		console.error(
			"INCONCLUSIVE: tsc reported errors this parser could not read. Output format has drifted:",
		);
		console.error(
			lines.filter((l) => l.includes("error TS")).slice(0, 3).join("\n"),
		);
		process.exit(2);
	}
	return parsed;
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

// Same guard from the other side. Going from 63 known errors to zero in one
// run is not plausible as a real result; it is what a broken invocation looks
// like — tsc failing to start, the config not resolving, an empty file list.
if (known.size > 0 && unique.length === 0) {
	console.error(
		`INCONCLUSIVE: ${known.size} baselined errors and tsc reported none at all. That is a broken invocation, not a clean tree — check that tsconfig.scripts.json resolves and tsc ran.`,
	);
	process.exit(2);
}

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
