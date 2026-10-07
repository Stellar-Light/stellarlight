/**
 * A row whose slug differs from its display name was unfindable by its own
 * slug: q="gate-io" scored 1 of 3 tokens against name "Gate" (haystack =
 * name+description+category+types, no slug) and fell through to semantic
 * neighbours — served as posted-app and steexp, which two separate probes
 * then misread as gate-io's own (stale) provenance. Guard-D's E slice kept
 * failing until the root was chased here.
 */
import { describe, expect, it } from "vitest";
import { buildHaystack, scoreTokens, tokenize } from "../project-search-match";

const GATE = {
	name: "Gate",
	slug: "gate-io",
	shortDescription: "Gate is a centralized exchange that lists XLM",
	category: "User-Facing App",
	types: ["Exchange"],
};

describe("the slug is identity vocabulary", () => {
	it("a row is findable by its own hyphenated slug", () => {
		const hay = buildHaystack(GATE);
		const toks = tokenize("gate-io");
		// majority bar for 3 tokens is 2 — the row must clear it
		expect(scoreTokens(hay, toks)).toBeGreaterThanOrEqual(2);
	});

	it("and by the slug's space-split phrasing", () => {
		const hay = buildHaystack(GATE);
		expect(scoreTokens(hay, tokenize("gate io"))).toBeGreaterThanOrEqual(1);
	});

	it("rows without a slug still build a haystack", () => {
		expect(buildHaystack({ name: "X", shortDescription: "y" })).toContain("x");
	});
});
