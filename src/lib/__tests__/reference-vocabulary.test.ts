/**
 * The pinned API reference and the OpenAPI spec must describe the SAME
 * vocabulary. sls-075 (stellar-raven) found `matchedOn` gaining a `repo` member
 * in the spec while the reference still listed four values, so an agent reading
 * our pinned reference would treat a real, documented response value as
 * impossible.
 *
 * Their recommendation was to generate both from one source. Generating prose
 * from an enum produces worse prose — the reference explains what each value
 * MEANS, which a spec enum cannot carry. So instead this test makes the two
 * provably agree: adding an enum member without documenting it fails here.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spec as openApiSpec } from "../openapi-spec";

const REFERENCE = readFileSync(
	join(process.cwd(), "public/skills/references/api-reference.md"),
	"utf8",
);

/**
 * The reference text for ONE endpoint's section.
 *
 * Scoping matters more than it looks: the first version of this test searched
 * the whole document, so `repo` matched an unrelated mention hundreds of lines
 * away and the test passed even with the sls-075 drift deliberately
 * reintroduced. A guard that cannot fail is worse than no guard — it reports
 * safety. Verified by re-running against the drift.
 */
function sectionFor(heading: string): string {
	const start = REFERENCE.indexOf(heading);
	if (start === -1)
		throw new Error(
			`api-reference.md has no "${heading}" section — this test cannot verify a section that moved or was renamed.`,
		);
	const next = REFERENCE.indexOf("\n## ", start + heading.length);
	return REFERENCE.slice(start, next === -1 ? undefined : next);
}

/** Pull an enum out of the built spec by walking to a named parameter/property. */
function enumFor(operationId: string, propertyName: string): string[] {
	const spec = openApiSpec as unknown as Record<string, unknown>;
	const found: string[] = [];
	const walk = (node: unknown, key: string | null, inOp: boolean) => {
		if (Array.isArray(node)) {
			for (const v of node) walk(v, key, inOp);
			return;
		}
		if (!node || typeof node !== "object") return;
		const obj = node as Record<string, unknown>;
		const nowInOp = inOp || obj.operationId === operationId;
		if (nowInOp && key === propertyName && Array.isArray(obj.enum))
			found.push(...(obj.enum as string[]));
		for (const [k, v] of Object.entries(obj)) walk(v, k, nowInOp);
	};
	walk(spec, null, false);
	return [...new Set(found)];
}

describe("pinned reference vocabulary matches the spec", () => {
	it("documents every matchedOn value resolveProject can return", () => {
		const values = enumFor("resolveProject", "matchedOn");
		// Guard the guard: if the enum ever stops being found, this test would
		// pass vacuously over an empty list. sls-075 was exactly a missing value.
		expect(values.length).toBeGreaterThanOrEqual(4);
		expect(values).toContain("repo");

		const section = sectionFor("`GET /api/projects/resolve`");
		const undocumented = values.filter((v) => !section.includes(`\`${v}\``));
		expect(
			undocumented,
			`OpenAPI lets resolveProject return matchedOn=${undocumented.join(", ")}, but the pinned API reference never mentions ${undocumented.length === 1 ? "it" : "them"}. An agent reading the reference would treat a real response value as impossible. Document it in public/skills/references/api-reference.md.`,
		).toEqual([]);
	});
});
