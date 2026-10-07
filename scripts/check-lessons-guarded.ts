/**
 * Every lesson names its guard — or says it has none.
 *
 * improvements/lessons/*.md are written after incidents and the board lists
 * them as "the written reasoning". The owner's question was "are we even
 * applying the lessons? more mistakes keep happening." A lesson only counts
 * when it became a check: a test, a guard script, or a workflow step that
 * goes red when the class comes back. Prose does not fail a build.
 *
 * The convention (improvements/lessons/README.md, "Guard lines"): one or more
 * lines anywhere in a lesson file of the form
 *
 *   Guard: <repo path of a test / guard script / workflow> — <what it asserts>
 *   Guard: none — <what a guard would check>
 *
 * Per lesson file, in order of precedence:
 *   guard missing   a Guard line names a path that does not exist — a claim
 *                   of coverage nothing backs; worse than admitting none
 *   unguarded       no Guard line at all, or any line says `none`
 *   guarded         every Guard line resolves to a real file
 *
 * A `none` line beside real guards still reads unguarded on purpose: the file
 * itself says one of its lessons has no check, and a file-level "guarded"
 * would be the overclaim this check exists to end.
 *
 *   pnpm exec tsx scripts/check-lessons-guarded.ts
 *
 * Pure repo read — no DB, no network. Exits 1 when any lesson is unguarded or
 * names a missing guard. build-progress-artifact.ts imports auditLessons() so
 * the board shows the same count this check prints.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LESSONS_DIR = "improvements/lessons";

export type LessonGuardStatus = "guarded" | "unguarded" | "guard missing";

export interface LessonGuardRow {
	/** repo-relative lesson path */
	lesson: string;
	/** every Guard line's target, verbatim (`none` kept as written) */
	guards: string[];
	/** targets that do not exist in the repo */
	missing: string[];
	status: LessonGuardStatus;
}

/** `Guard: <target> — <note>` → target. Backticks tolerated; the note after
 *  an em dash / hyphen-dash is dropped. */
const GUARD_LINE = /^Guard:\s*(.+?)\s*$/;
export function parseGuardTarget(line: string): string | null {
	const m = GUARD_LINE.exec(line.trim());
	if (!m) return null;
	return m[1]
		.split(/\s+(?:—|--)\s+/)[0]
		.replace(/`/g, "")
		.trim();
}

export function auditLessons(root: string = ROOT): {
	rows: LessonGuardRow[];
	total: number;
	guarded: number;
	unguarded: number;
	guardMissing: number;
} {
	const files = readdirSync(join(root, LESSONS_DIR))
		.filter((f) => f.endsWith(".md") && /^\d{4}-\d{2}-\d{2}-/.test(f))
		.sort();
	const rows: LessonGuardRow[] = files.map((f) => {
		const body = readFileSync(join(root, LESSONS_DIR, f), "utf8");
		const guards = body
			.split("\n")
			.map(parseGuardTarget)
			.filter((g): g is string => g !== null);
		const paths = guards.filter((g) => g.toLowerCase() !== "none");
		const missing = paths.filter((p) => !existsSync(join(root, p)));
		const status: LessonGuardStatus = missing.length
			? "guard missing"
			: guards.length === 0 || paths.length < guards.length
				? "unguarded"
				: "guarded";
		return { lesson: `${LESSONS_DIR}/${f}`, guards, missing, status };
	});
	return {
		rows,
		total: rows.length,
		guarded: rows.filter((r) => r.status === "guarded").length,
		unguarded: rows.filter((r) => r.status === "unguarded").length,
		guardMissing: rows.filter((r) => r.status === "guard missing").length,
	};
}

function main() {
	const a = auditLessons();
	if (a.total === 0) {
		// A sweep that read nothing must not print "0 unguarded" and exit green.
		console.error(`INCONCLUSIVE: no lesson files found under ${LESSONS_DIR}`);
		process.exit(2);
	}
	console.log("lesson · guard · status");
	for (const r of a.rows) {
		const name = r.lesson.slice(LESSONS_DIR.length + 1);
		const guard = r.guards.length
			? r.guards
					.map((g) => (r.missing.includes(g) ? `${g} (MISSING)` : g))
					.join(" · ")
			: "(no Guard line)";
		console.log(`  ${name} · ${guard} · ${r.status}`);
	}
	console.log(
		`\n${a.guarded}/${a.total} guarded · ${a.unguarded} unguarded · ${a.guardMissing} guard missing`,
	);
	if (a.unguarded + a.guardMissing > 0) {
		console.error(
			"\nRED: a lesson only counts when it became a check. Write the guard and name it with a `Guard:` line, or keep `Guard: none — <what it would check>` and accept this red as the signal it is.",
		);
		process.exit(1);
	}
	console.log("\nGREEN: every lesson names a guard that exists.");
}

// Runs only when invoked directly, so the progress builder can import
// auditLessons() without triggering a check (or an exit).
if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
	main();
