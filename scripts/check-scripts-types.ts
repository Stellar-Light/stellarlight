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

/** Strip the presentation incidentals tsc embeds in a message, so identity
 * survives them:
 *
 *  - The "... N more ..." elision in an inferred structural type carries a
 *    MEMBER COUNT, and three baseline entries embed one — enrich-repos.ts's
 *    TS2339 on a 15-field object literal among them. Adding one field to that
 *    object turns "... 7 more ..." into "... 8 more ...", so the old signature
 *    lands in `fixed` and the new one in `added`, and a PR that introduced no
 *    error at all goes RED naming a pre-existing one.
 *  - Literal-union member ORDER (`"createdAt" | "sizes"` vs `"sizes" |
 *    "createdAt"`) tracks tsc's internal type-id allocation, which shifts
 *    with unrelated edits and across fresh node_modules — observed 2026-08-31
 *    on curate-projects.ts's TS2322: same error, same tsc 5.7.3, opposite
 *    order, read as one fixed + one new. Unions are sorted into one canonical
 *    order; within a single run tsc prints them consistently, so two errors
 *    this collapses would already share a signature.
 *
 * Both are incidental to the error's identity. */
const normalizeMsg = (s: string): string =>
	s
		.replace(/\.\.\. \d+ more \.\.\./g, "... N more ...")
		.replace(/"[^"]*"(?: \| "[^"]*")+/g, (u) =>
			u.split(" | ").sort().join(" | "),
		);

/** file + TS code + message, without positions. */
function signature(line: string): string | null {
	const m = /^(.+?)\(\d+,\d+\): (error TS\d+): (.*)$/.exec(line.trim());
	if (!m) return null;
	return `${m[1]} :: ${m[2]} :: ${normalizeMsg(m[3] as string)}`;
}

/** Apply the same message normalisations to a STORED signature.
 *
 * A change to `signature()` rewrites every affected entry, which the
 * growth check would read as new errors — the ratchet blocking its own
 * format migration. Normalising both sides compares like with like, and it
 * needs no escape hatch, which is the point: a hatch that lets the baseline
 * grow is the ratchet gone. */
const renorm = normalizeMsg;

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
	// pretty-printer default, a colour flag, a version change — errors drop out
	// of `parsed` silently. Dropped means the baselined error "no longer
	// occurs", so the guard would report fixes it cannot justify, or, worse,
	// report GREEN on a tree full of errors. The original guard only fired when
	// EVERY line failed to parse; a MIXED old/new format (some lines parse,
	// some don't) sailed through with the unparsed errors invisibly "fixed".
	// The tell is per-line: any line that carries `error TS` but did not parse
	// is a shortfall, and a shortfall is inconclusive — never a result.
	const unparsed = lines.filter(
		(l) => /error TS\d+/.test(l) && signature(l) === null,
	);
	if (unparsed.length > 0) {
		console.error(
			`INCONCLUSIVE: ${unparsed.length} line(s) contain "error TS" but this parser could not read them. Output format has drifted:`,
		);
		console.error(unparsed.slice(0, 3).join("\n"));
		process.exit(2);
	}
	return parsed;
}

const found = run();
const unique = [...new Set(found)].sort();
/** How many times each signature occurs. Set-dedup alone made a SECOND
 * occurrence of an already-baselined error free: two `Cannot find name
 * 'BUILT_BY_FIXES'` lines in curation-maps.ts collapse to one signature, so a
 * fresh instance of the exact bug class this guard was built for — an undefined
 * identifier in a prod-writing script — would land green as long as that file
 * already had one. Counts are compared, not just membership. */
const counts = new Map<string, number>();
for (const f of found) counts.set(f, (counts.get(f) ?? 0) + 1);

if (UPDATE) {
	// A RATCHET ONLY TURNS ONE WAY, and until now nothing enforced that: a PR
	// could introduce five errors, run --update, commit the bigger baseline, and
	// go green with a JSON diff as the only defence. Refuse to write a baseline
	// that adds signatures; removing them is the whole point.
	if (existsSync(BASELINE)) {
		const prev: { errors?: string[]; occurrences?: Record<string, number> } =
			JSON.parse(readFileSync(BASELINE, "utf8"));
		const before = new Set((prev.errors ?? []).map(renorm));
		const growth = unique.filter((x) => !before.has(x));
		if (growth.length > 0) {
			console.error(
				`REFUSED: --update would ADD ${growth.length} signature(s) to the baseline. The ratchet only removes. Fix these instead:\n${growth.map((g) => `  ${g}`).join("\n")}`,
			);
			process.exit(1);
		}
		// Counts ratchet too. Refusing new SIGNATURES but writing whatever
		// occurrence counts this run measured left --update as the loophole for
		// the exact class the occurrence map was added to catch: a SECOND
		// instance of an already-baselined error (another `Cannot find name
		// 'BUILT_BY_FIXES'` in the same file) is invisible to the signature set,
		// so --update would commit the higher count and CI goes green on a fresh
		// bug. Decreases are the point of the ratchet and stay allowed.
		const prevCounts: Record<string, number> = Object.fromEntries(
			Object.entries(prev.occurrences ?? {}).map(([k, v]) => [renorm(k), v]),
		);
		const swelled = unique.filter(
			(x) => (counts.get(x) ?? 1) > (prevCounts[x] ?? 1),
		);
		if (swelled.length > 0) {
			console.error(
				`REFUSED: --update would INCREASE the occurrence count of ${swelled.length} baselined signature(s) — a fresh instance of a known error. The ratchet only removes. Fix these instead:\n${swelled
					.map((s) => `  ${prevCounts[s] ?? 1} -> ${counts.get(s) ?? 1}  ${s}`)
					.join("\n")}`,
			);
			process.exit(1);
		}
	}
	writeFileSync(
		BASELINE,
		`${JSON.stringify(
			{
				$comment:
					"Type errors in scripts/ that predate the guard. A ratchet: entries may be REMOVED (in the PR that fixes them) and never added. Regenerate: pnpm exec tsx scripts/check-scripts-types.ts --update",
				updatedAt: new Date().toISOString(),
				count: unique.length,
				errors: unique,
				occurrences: Object.fromEntries(
					unique.map((u) => [u, counts.get(u) ?? 1]),
				),
			},
			null,
			"\t",
		)}\n`,
	);
	console.log(`baseline written: ${unique.length} known errors`);
	process.exit(0);
}

// A MISSING BASELINE IS NOT AN EMPTY ONE. Defaulting to `{errors: []}` also
// disabled the broken-invocation guard below (which requires known.size > 0),
// so a dropped baseline plus a failed tsc invocation printed "GREEN: no new
// type errors, 0 baselined" and exited 0. The baseline file is exactly what a
// bad merge loses.
if (!existsSync(BASELINE)) {
	console.error(
		`INCONCLUSIVE: ${BASELINE} is missing. Without it there is nothing to compare against — restore it, or regenerate with --update if that is genuinely intended.`,
	);
	process.exit(2);
}
const baseline: { errors: string[]; occurrences?: Record<string, number> } =
	JSON.parse(readFileSync(BASELINE, "utf8"));
const known = new Set(baseline.errors.map(renorm));
const knownCounts: Record<string, number> = Object.fromEntries(
	Object.entries(baseline.occurrences ?? {}).map(([k, v]) => [renorm(k), v]),
);

const added = unique.filter((s) => !known.has(s));
/** A baselined error that now occurs MORE often than it did. */
const multiplied = unique.filter(
	(s) => known.has(s) && (counts.get(s) ?? 1) > (knownCounts[s] ?? 1),
);
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

if (added.length || multiplied.length) {
	if (added.length)
		console.error(
			`\nRED: ${added.length} NEW type error(s) in scripts/:\n${added.map((s) => `  ${s}`).join("\n")}`,
		);
	if (multiplied.length)
		console.error(
			`\nRED: ${multiplied.length} baselined error(s) now occur MORE often — a fresh instance of an error already on the list:\n${multiplied
				.map(
					(s) => `  ${knownCounts[s] ?? 1} -> ${counts.get(s) ?? 1}  ${s}`,
				)
				.join("\n")}`,
		);
	process.exit(1);
}

// Printed only when the run is actually green. `fixed` exits 1 below, and a
// red step whose last log line reads GREEN is how a gate loses its audience.
if (!fixed.length)
	console.log(
		`GREEN: no new type errors in scripts/. ${unique.length} baselined error(s) carried as debt.`,
	);
// A shrunk baseline is a real change to a committed file; failing here is what
// keeps the ratchet honest, since a silently-stale baseline hides regressions
// behind an old excuse.
if (fixed.length) process.exit(1);
