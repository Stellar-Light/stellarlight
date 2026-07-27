import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Guard for lessons class 20 — the exit-code stomp.
 *
 *   if (failed) process.exitCode = 1;
 *   process.exit(0);            // ← discards it; the run reports GREEN
 *
 * This is the 2026-07-09 incident: one ValidationError killed 13 writes and the
 * failed re-run reported success. The lesson prescribed
 * `process.exit(process.exitCode ?? 0)` — but on 2026-07-26 a sweep found the
 * stomp still live in four writers, including `curate-projects.ts`, the script
 * the incident happened in. There the fix had been applied to the DRY-RUN exit
 * (with a comment naming the incident) and missed on the EXECUTE exit — the
 * only one that writes.
 *
 * The rule is narrow on purpose: `process.exit(0)` is only a bug when the
 * script can set `process.exitCode`. That is the exact defect, catches all four
 * real instances with no false positives, and — more usefully — fires the day
 * someone adds an exitCode assignment to one of the ~67 scripts that call
 * `exit(0)` harmlessly today.
 *
 * `process.exit(1)` inside a `.catch()` is correct and deliberately allowed.
 */
const SCRIPTS = join(process.cwd(), "scripts");

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) out.push(...walk(p));
		else if (p.endsWith(".ts")) out.push(p);
	}
	return out;
}

describe("scripts/ exit codes", () => {
	const files = walk(SCRIPTS);

	it("finds the scripts to check (guard is not vacuously passing)", () => {
		expect(files.length).toBeGreaterThan(50);
	});

	/** Comments must be stripped before matching. The first draft of this guard
	 * flagged enrich-repos.ts for the `process.exit(0)` inside the comment
	 * EXPLAINING the fix — and a guard that fires on its own documentation is one
	 * that gets suppressed or deleted rather than heeded. */
	const stripComments = (s: string) =>
		s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

	it("a script that sets process.exitCode never discards it with exit(0)", () => {
		const offenders: string[] = [];
		for (const p of files) {
			const s = stripComments(readFileSync(p, "utf-8"));
			if (!/process\.exitCode\s*=/.test(s)) continue;
			if (/process\.exit\(\s*0\s*\)/.test(s))
				offenders.push(
					`${p.replace(`${SCRIPTS}/`, "")} — use process.exit(process.exitCode ?? 0)`,
				);
		}
		expect(offenders).toEqual([]);
	});
});
