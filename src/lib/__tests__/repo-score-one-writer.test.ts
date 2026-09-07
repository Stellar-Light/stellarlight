import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `repoScore` has more than one writer, and on 2026-09-07 they disagreed about
 * what to feed the formula:
 *
 *   enrich-repos passed  builderReputation  regrade-repos did not  (2 rows)
 *   regrade-repos passed judgeScore         enrich-repos did not  (10 rows)
 *
 * So twelve rows changed score depending on which lane touched them last, and
 * would keep alternating forever — the one-field-one-writer lane fight that
 * flipped 11 SCF rows on every execute.
 *
 * The rule is not "one writer" here (a formula change must be able to reach
 * rows no lane owns, which is why regrade-repos exists). The rule is that every
 * writer feeds the formula the SAME inputs, so whoever writes last lands on the
 * same number. This asserts that by reading both call sites — a comparison no
 * unit test of the formula itself can make.
 */
const ROOT = join(__dirname, "../../..");

function gradeCallKeys(file: string, marker: string): Set<string> {
	const src = readFileSync(join(ROOT, file), "utf8");
	const i = src.indexOf(marker);
	if (i < 0) throw new Error(`marker not found in ${file}: ${marker}`);
	const start = src.indexOf("{", i);
	let depth = 0;
	let j = start;
	for (;;) {
		if (src[j] === "{") depth++;
		else if (src[j] === "}") depth--;
		if (depth === 0) break;
		j++;
	}
	const body = src.slice(start, j);
	const keys = new Set<string>();
	// `key:` and the shorthand `key,` — missing the shorthand is how the
	// builderReputation gap survived a first look. The literals are the price
	// of accepting the shorthand: a wrapped ternary ends its line on `null,`,
	// which is indistinguishable from a shorthand property to this regex.
	const LITERALS = new Set(["null", "undefined", "true", "false"]);
	for (const m of body.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*[,:]/gm))
		if (!LITERALS.has(m[1])) keys.add(m[1]);
	return keys;
}

describe("every repoScore writer feeds the formula the same inputs", () => {
	it("regrade-repos and enrich-repos pass an identical input key set", () => {
		const regrade = gradeCallKeys(
			"scripts/regrade-repos.ts",
			"const grade = repoGrade(",
		);
		const enrich = gradeCallKeys("scripts/enrich-repos.ts", "? repoGrade(");
		expect(regrade.size).toBeGreaterThan(15); // the parse actually found the call
		expect([...regrade].filter((k) => !enrich.has(k)).sort()).toEqual([]);
		expect([...enrich].filter((k) => !regrade.has(k)).sort()).toEqual([]);
	});
});
