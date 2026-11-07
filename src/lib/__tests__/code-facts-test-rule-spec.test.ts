/**
 * Re-check item 5: the spec says exactly which code facts leave test code out.
 * Interfaces, symbols and capability tags apply the shared test-path rule;
 * the other code facts do not yet (a measured follow-up in
 * improvements/TODO.md), so the published text must not claim more.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SPEC = readFileSync(join(process.cwd(), "specs/openapi.json"), "utf8");

describe("the spec names which code facts leave test code out", () => {
	it("says interfaces, symbols and capability tags do, and the other facts not yet", () => {
		expect(SPEC).toContain(
			"Only contractInterface, symbols and sdkCapabilities leave test code out",
		);
		expect(SPEC).toContain(
			"stellarProof, codeDepth, isDeployableContract and stellarDeps still read every fetched file",
		);
	});
});
