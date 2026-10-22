import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spec } from "@/lib/openapi-spec";

// The skill reference Raven's agents read must say what the winner fields
// mean; it described winnersNote as hidden winners only after 1.9.91 widened
// it.
const REFERENCE = readFileSync(
	join(process.cwd(), "public/skills/references/api-reference.md"),
	"utf8",
);
const section = (heading: string) => {
	const start = REFERENCE.indexOf(heading);
	expect(start, heading).toBeGreaterThan(-1);
	const next = REFERENCE.indexOf("\n## ", start + heading.length);
	return REFERENCE.slice(start, next === -1 ? undefined : next);
};

describe("the skill reference on winners", () => {
	it("says what winnersNote and winnerSource mean on an event page", () => {
		const s = section("## `GET /api/hackathons/{slug}`");
		expect(s).toMatch(/`\.hackathon\.stats\.winnersNote` says why the winners/);
		expect(s).toMatch(/not announced upstream/);
		expect(s).toMatch(/could not be checked/);
		expect(s).toMatch(/never a claim that no one won/);
		expect(s).toMatch(
			/`\.winners\[\*\]\.winnerSource` is present only when a page off DoraHacks/,
		);
	});

	it("lists winnerSource on a submission's detail, and the meaning-search gap", () => {
		expect(section("## `GET /api/hackathons/builds/{id}`")).toMatch(
			/winnerSource/,
		);
		expect(section("## `GET /api/hackathons/builds`\n")).toMatch(
			/winner named off DoraHacks is left out/,
		);
		// The spec's winnersOnly, shared by search and analyze, says it too.
		const search = spec.paths["/api/hackathons/builds"] as {
			get: { parameters: Array<{ name: string; description?: string }> };
		};
		const winnersOnly = search.get.parameters.find(
			(p) => p.name === "winnersOnly",
		);
		expect(winnersOnly?.description).toMatch(
			/with mode=meaning a winner named off DoraHacks is left out/,
		);
	});
});
