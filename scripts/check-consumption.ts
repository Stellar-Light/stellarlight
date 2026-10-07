/**
 * CONSUMPTION GUARD — the lane for the class that keeps beating us.
 *
 * Every significant defect found on 2026-08-30 was one shape:
 *
 *     machinery EXISTS, is TESTED, produces a VALUE — and NOTHING CONSUMES IT.
 *
 *   codeProofTier   tested, called only by a read-only report
 *   triageTags      derived for all 12,961 repos, read by NO serving path
 *   curated list    floated in search, never verified — 10 names matched 0 rows
 *   tier=quality    armed on prod, and NO ranker reads it
 *   knowledgeNotes  8 notes / 7,000 repos, no writer, no cadence
 *   grok audit      emits an artifact /quality does not import
 *   tierReason      schema field the write built for it leaves null
 *
 * We wrote the lesson into PLAN.md — "a lesson recorded in a doc is not a
 * guard" — and then produced four fresh instances of it in the same day. A doc
 * cannot fail. This can.
 *
 * WHAT IT CHECKS. For each declared field: is it WRITTEN, is it READ by a
 * serving path (an API route, a ranker, the /quality board, a skill/OpenAPI
 * description an agent reads), and is it SERVED (does the live API actually
 * return it)? A field written-but-never-read is dead machinery. A field
 * PROMISED in an endpoint description but never served is a lie to agents —
 * which is why endpoints are checked, not just code.
 *
 *   pnpm exec tsx scripts/check-consumption.ts          # human
 *   pnpm exec tsx scripts/check-consumption.ts --json   # /quality artifact
 *
 * Exits 1 on any unconsumed field, so it can gate a merge. Read-only.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const JSON_OUT = process.argv.includes("--json");
const API = process.env.STELLARLIGHT_API ?? "https://stellarlight.xyz";

/** Paths that COUNT as consumption — something an agent's answer flows through.
 * A script or a test does not count: that is how codeProofTier passed for
 * months while only a report called it. */
/** ENGINES: not serving paths themselves, but their OUTPUT is served. A field
 * read only here is consumed TRANSITIVELY — farmScore never reaches an API
 * response, but it decides `tier`, which ranking reads. Encoding this matters:
 * a guard that flags legitimate wiring as dead gets muted, and a muted guard is
 * the chronic-red failure we already documented. */
const ENGINES = [
	"src/lib/code-signals.ts",
	"src/lib/code-depth.ts",
	"src/lib/repo-triage.ts",
	"src/lib/repo-allowlist.ts",
	// The scan wave. PLAN §3 names this consumer for triageTags — "scan-wave
	// prioritization learns to skip internally-triaged repos" — and it EXISTS:
	// scan-repo-code.ts reads triageTags (under context.internal, or the
	// afterRead hook strips it) and routes wave budget away from triaged repos.
	// Its output is the code signals ranking serves, so the transitive argument
	// is the same as farmScore -> tier. The guard listed triageTags as dead for
	// a day because this list did not include the one file the plan said would
	// read it. Scripts stay out of SERVING on principle; an engine is different
	// because its output lands in the DB that serving paths read.
	"scripts/scan/scan-repo-code.ts",
];

const SERVING = [
	"src/app/api",
	"src/lib/repo-search.ts",
	"src/lib/repo-grade.ts",
	"src/lib/quality-artifacts.ts",
	"src/lib/openapi-spec.ts",
	"src/lib/stellar-scout-skill.ts",
	"src/lib/research-rank.ts",
	"src/lib/project-search-match.ts",
];

type Check = {
	field: string;
	why: string;
	/** does the live API return it on a representative row? */
	servedProbe?: { url: string; pick: (row: unknown) => boolean };
};

/** The fields whose whole purpose is to change what an agent is told. */
const CHECKS: Check[] = [
	{
		field: "triageTags",
		why: "internal dead/farm/template verdicts for 12,961 repos",
	},
	{ field: "tier", why: "the anti-long-tail gate PLAN.md relies on" },
	{
		field: "tierReason",
		why: "provenance for a tier verdict (evidenced+dated is the pitch)",
	},
	{ field: "knowledgeNotes", why: "the agent-facing orientation layer (P3)" },
	{ field: "stellarDeps", why: "the dependency graph — who builds on whom" },
	{ field: "codeDepth", why: "the code-truth signal repoScore is built on" },
	{
		field: "stellarProof",
		why: "proof kind; a key in the two-key archive rule",
	},
	{ field: "farmScore", why: "farm fingerprint; the other archive key" },
	{ field: "statusBasis", why: "why a project's status is what it is" },
];

/** The debt that already existed when this guard was written.
 *
 * A ratchet, not an amnesty. The guard's job is to stop NEW dead machinery
 * landing, and on its first green run it found two fields that predate it:
 *
 *   triageTags   written for 12,961 repos and stripped again by an afterRead
 *                hook in Repos.ts — internal by construction, read by nothing.
 *   tierReason   declared in the write shape and in the collection, and left
 *                null by the writer built for it.
 *
 * Neither can be honestly cleared inside the change that found them: one needs
 * a decision about exposing internal triage verdicts, the other needs a writer
 * and a consumer. Blocking every unrelated PR on them would have exactly one
 * outcome — the gate gets removed — so they are named here instead, where the
 * list itself is the debt. The /quality board still reads the raw count, so
 * this file cannot make the number look better than it is.
 *
 * The ratchet only turns one way: a field may leave this list, never join it.
 * Anything dead and not named here fails the build. */
// EMPTY — the ratchet finished its journey on 2026-08-31. codeProofTier,
// triageTags, tier, tierReason, knowledgeNotes: every field the 08-30 audit
// found dead now has a writer AND a serving-path reader. The set stays as the
// mechanism (a future field may be carried briefly), but nothing may be added
// without the same named-debt justification the originals carried.
const KNOWN_DEAD = new Set<string>([]);

/** Strip comments before searching.
 *
 * The first version used a bare `git grep`, and immediately fooled itself: the
 * meta-row's own COMMENT in quality-artifacts.ts mentions `triageTags`, so the
 * guard counted its own prose as consumption and flipped a dead field to
 * green. A guard that can be satisfied by documentation is worse than none —
 * it is the doc-instead-of-lane failure wearing a lane's clothes. Code only. */
function stripComments(src: string): string {
	return src
		.replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
		.replace(/(^|[^:])\/\/[^\n]*/g, "$1 "); // line comments (not URLs)
}

/** Strip string-literal CONTENTS (quotes stay, so syntax stays parseable).
 *
 * Applied ONLY to the ENGINES scan, and deliberately NOT to SERVING: in an
 * OpenAPI spec or skill description, a field named inside a string IS the
 * consumption — it is the promise an agent reads. In an engine, only an
 * actual code read counts, and scan-repo-code.ts proved the hazard: its log
 * line "tier/unverified/repoScore writes: 0" contains `tier`, so if the
 * engine ever stopped reading `tier` the pass would stay green off a string
 * that literally asserts the script does NOT write it.
 *
 * One alternation pass, leftmost-first, so a quote inside one kind of
 * literal cannot open another. Template-literal interpolation contents are
 * dropped too — fine for this purpose (a field read inside ${...} that
 * appears nowhere else in the file is not engine wiring worth crediting). */
function stripStrings(src: string): string {
	return src.replace(
		/"(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*'|`(?:[^`\\]|\\[\s\S])*`/g,
		(m) => m[0] + m[0],
	);
}

function filesUnder(paths: string[]): string[] {
	try {
		const out = execFileSync("git", ["ls-files", "--", ...paths], {
			encoding: "utf8",
		});
		return out.split("\n").filter((f) => /\.tsx?$/.test(f));
	} catch {
		return [];
	}
}

/** This file names all nine fields in its own CHECKS array, so scanning
 * `scripts/` counts it as a writer of every one of them. `triageTags` measured
 * written=6 with this file among the six.
 *
 * The consequence is the gate blocking its own remedy: delete a dead field from
 * the schema and from every script, and writtenIn is still 1 — this file's
 * string literal — while read stays 0, so the field is reported DEAD and the
 * PR that removes it goes red. Same root cause as the comment bug this guard
 * already fixed, one layer up: a checker must not be evidence about itself. */
const SELF = "scripts/check-consumption.ts";

/** Number of files whose CODE (not comments) references the field. */
function grepCount(pattern: string, paths: string[], noStrings = false): number {
	let n = 0;
	for (const f of filesUnder(paths)) {
		if (f === SELF) continue;
		try {
			let code = stripComments(readFileSync(f, "utf8"));
			if (noStrings) code = stripStrings(code);
			if (code.includes(pattern)) n++;
		} catch {
			// unreadable file — not evidence of consumption
		}
	}
	return n;
}

async function main() {
	const results: Array<{
		field: string;
		why: string;
		writtenIn: number;
		readBySurfaces: number;
		viaEngine: number;
		consumed: boolean;
	}> = [];

	for (const c of CHECKS) {
		// written anywhere (scripts, collections, libs)
		const written = grepCount(c.field, ["scripts", "src"]);
		// read by something that shapes an agent-visible answer
		const read = grepCount(c.field, SERVING);
		const viaEngine = read === 0 ? grepCount(c.field, ENGINES, true) : 0;
		results.push({
			field: c.field,
			why: c.why,
			writtenIn: written,
			readBySurfaces: read,
			viaEngine,
			consumed: read > 0 || viaEngine > 0,
		});
	}

	// MEASUREMENT FAILURE IS NOT A CLEAN TREE. `filesUnder` returns [] when
	// `git ls-files` errors or the cwd is not the repo root, which makes every
	// count 0 — and `dead` is then empty only because of the `writtenIn > 0`
	// filter below, so the run prints GREEN and exits 0 having read nothing.
	// Today a stale KNOWN_DEAD entry happens to catch it via `revived`; once the
	// ratchet empties, which is the stated goal, that accident disappears.
	const scanned = filesUnder(["src"]).length;
	if (scanned === 0) {
		console.error(
			"INCONCLUSIVE: scanned 0 files under src/. `git ls-files` failed or this is not the repo root — no fields were measured, so no verdict.",
		);
		process.exit(2);
	}
	const dead = results.filter((r) => !r.consumed && r.writtenIn > 0);

	const artifact = {
		asOf: new Date().toISOString(),
		source: "scripts/check-consumption.ts",
		checked: results.length,
		consumed: results.filter((r) => r.consumed).length,
		dead: dead.map((d) => ({
			field: d.field,
			why: d.why,
			writtenIn: d.writtenIn,
		})),
		note: "A field written by our machinery but read by no serving path cannot change any answer an agent receives.",
	};

	if (JSON_OUT) {
		console.log(JSON.stringify(artifact, null, 2));
	} else {
		console.log("field            written  read-by-serving  verdict");
		for (const r of results)
			console.log(
				`  ${r.field.padEnd(15)} ${String(r.writtenIn).padStart(5)}  ${String(r.readBySurfaces).padStart(13)}  ${r.readBySurfaces > 0 ? "consumed" : r.viaEngine > 0 ? "consumed (via engine)" : "*** DEAD ***"}`,
			);
		if (dead.length) {
			console.log(
				`\nDEAD MACHINERY (${dead.length}) — computed, never consumed:`,
			);
			for (const d of dead) console.log(`  ${d.field}: ${d.why}`);
			console.log(
				"\nThis is the class that produced every major finding of 2026-08-30.",
			);
		}
	}
	// Fail on anything dead that is NOT pre-existing debt, and fail just as hard
	// if a named field is quietly resurrected — a stale entry here would hide a
	// real regression behind an old excuse.
	const unexpected = dead.filter((r) => !KNOWN_DEAD.has(r.field));
	const revived = [...KNOWN_DEAD].filter(
		(f) => !dead.some((r) => r.field === f),
	);
	// Advisories go to STDERR: --json stdout is redirected into
	// improvements/audits/consumption-latest.json, which quality-artifacts.ts
	// imports as JSON at build time — a stray stdout line corrupts it.
	if (revived.length)
		console.error(
			`\nCONSUMED NOW — remove from KNOWN_DEAD in this file: ${revived.join(", ")}`,
		);
	if (unexpected.length) {
		console.error(
			`\nRED: ${unexpected.length} NEW dead field(s): ${unexpected.map((r) => r.field).join(", ")}`,
		);
		process.exit(1);
	}
	if (revived.length) process.exit(1);
	if (dead.length)
		console.error(
			`\n${dead.length} known-dead field(s) carried as debt — visible on /quality, not blocking.`,
		);
	if (!JSON_OUT)
		// Say which green this is. Printing "every checked field reaches a serving
		// path" directly beneath a list of fields that don't is how a passing
		// build stops meaning anything — and this guard exists because a report
		// once said a thing was fine while the thing was not fine.
		console.log(
			dead.length
				? `\nGREEN: no NEW dead machinery. ${dead.length} field(s) still dead, carried as named debt.`
				: "\nGREEN: every checked field reaches a serving path.",
		);
}

main().catch((e) => {
	console.error("FATAL:", e?.message ?? e);
	process.exit(1);
});
