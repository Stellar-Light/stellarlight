/**
 * A project whose name IS a common word was losing to projects that merely
 * contain it: "tell me about Bridge" returned allbridge, axelar, spacewalk —
 * the record literally named Bridge was absent.
 *
 * The exact-name signal is the FIRST key in the result sort, but it was
 * computed against the RAW query string, so any ordinary phrasing destroyed
 * it. q="Bridge" scored 3 and ranked correctly; q="tell me about Bridge"
 * scored 0. Asking a natural question cost the record its own identity.
 *
 * Same failure family as the liveness-anchor bug (#1041): the machinery was
 * right, the input was wrong.
 */
import { describe, expect, it } from "vitest";
import { nameMatchScore, tokenize } from "../project-search-match";

const score = (name: string, slug: string, q: string, aliases?: string[]) =>
	nameMatchScore(name, slug, q, aliases ?? null, tokenize(q));

describe("exact identity survives natural phrasing", () => {
	it("scores an exact name hit through question filler", () => {
		expect(score("Bridge", "bridge", "tell me about Bridge")).toBe(3);
		expect(score("Bridge", "bridge", "is Bridge live")).toBe(3);
	});

	it("matches a multi-word name against a hyphenated slug", () => {
		expect(score("Blue Orion", "blue-orion", "Blue Orion on stellar")).toBe(3);
	});

	it("still scores the bare exact query (unchanged behaviour)", () => {
		expect(score("Bridge", "bridge", "Bridge")).toBe(3);
	});

	it("honours an exact former-name hit through filler (sls-050)", () => {
		expect(
			score("Newname", "newname", "tell me about Oldname", ["Oldname"]),
		).toBe(3);
	});

	it("does NOT promote a mere mention to an exact hit", () => {
		// The whole point: allbridge must not score 3 for a Bridge query, or we
		// would have swapped one wrong winner for another.
		expect(
			score("Allbridge", "allbridge", "tell me about Bridge"),
		).toBeLessThan(3);
		expect(score("Axelar", "axelar", "tell me about Bridge")).toBeLessThan(3);
	});

	it("does not manufacture a weaker prefix match from tokens", () => {
		// Token path promotes ONLY to exact(3). A topic query like "swap" must
		// not start ranking "SwapX" above flagship DEXes — the sls-009 recheck
		// regression that made prefix/word matches a late tiebreaker.
		expect(score("SwapX", "swapx", "best swap on stellar")).toBeLessThan(2);
	});
});
