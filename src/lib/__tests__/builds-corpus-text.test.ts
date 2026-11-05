import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STELLAR_SCOUT_SKILL } from "../stellar-scout-skill";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// Audit 2026-11-04: the MCP tool and the skill described the builds corpus
// as every DoraHacks submission while it also holds curated rows from events
// off DoraHacks, HackMeridian 2026's partial list among them.
describe("the builds corpus is described with every source it holds", () => {
	const skillRow = (md: string) =>
		md.split("\n").find((l) => l.startsWith("| `/api/hackathons/builds`")) ??
		"";

	it("the skill's endpoint row names the curated rows and their basis", () => {
		for (const row of [
			skillRow(read("public/skills/stellar-scout.md")),
			skillRow(STELLAR_SCOUT_SKILL),
		]) {
			expect(row).toMatch(
				/every DoraHacks submission plus curated ones from events off it/,
			);
			expect(row).toMatch(/entryBasis/);
		}
	});

	it("the MCP tool's description names them too", () => {
		const mcp = read("scout-mcp/src/index.ts");
		const desc = mcp.slice(
			mcp.indexOf('"search_hackathon_builds"'),
			mcp.indexOf("inputSchema", mcp.indexOf('"search_hackathon_builds"')),
		);
		expect(desc).toMatch(/curated ones from events off DoraHacks/);
		expect(desc).toMatch(/entryBasis/);
	});
});
