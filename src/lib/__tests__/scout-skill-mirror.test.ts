import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderMirror } from "../../../scripts/sync-scout-skill-mirror";
import { STELLAR_SCOUT_SKILL } from "../stellar-scout-skill";

// The Scout skill exists twice on purpose — public/skills/stellar-scout.md is
// what a user downloads and what the distribution repo mirrors, while the TS
// constant is inlined so the /scout Copy button can write to the clipboard
// synchronously. The TS file always CLAIMED to be a mirror; nothing enforced
// it, and by 2026-07-23 they had drifted in both directions: the markdown
// carried an /api/people row and better audits guidance the constant lacked,
// while the constant carried an SCF cross-link the downloadable file lacked.
// The skill our API served and the skill a user installed were different
// documents, and no test noticed for as long as that took.
describe("stellar-scout skill mirror", () => {
	const md = readFileSync(
		join(process.cwd(), "public/skills/stellar-scout.md"),
		"utf8",
	);

	it("the inlined constant matches the canonical markdown", () => {
		// Compare the CONTENT, not the file text, so this reads as a real
		// statement about the skill rather than about codegen formatting.
		const expected = renderMirror(md);
		const actual = readFileSync(
			join(process.cwd(), "src/lib/stellar-scout-skill.ts"),
			"utf8",
		);
		expect(
			actual,
			"run: pnpm exec tsx scripts/sync-scout-skill-mirror.ts",
		).toBe(expected);
	});

	it("the exported constant is the markdown, byte for byte", () => {
		expect(STELLAR_SCOUT_SKILL.trim()).toBe(md.trim());
	});

	it("is a real skill, not an empty or truncated file", () => {
		expect(STELLAR_SCOUT_SKILL.length).toBeGreaterThan(20_000);
		expect(STELLAR_SCOUT_SKILL).toContain("name: stellar-scout");
	});
});
