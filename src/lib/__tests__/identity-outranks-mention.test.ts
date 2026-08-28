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

describe("proper-noun promotion (wave-5, the Hermes case)", () => {
	const score = (name: string, slug: string, q: string, aliases?: string[]) =>
		nameMatchScore(name, slug, q, aliases ?? null, tokenize(q));
	it("a capitalized mid-query proper noun matching an ALIAS promotes to exact", () => {
		expect(
			score("Zenex", "zenex", "what happened to Hermes exchange on Stellar", [
				"Hermes",
			]),
		).toBe(3);
	});
	it("a capitalized mid-query name match promotes too", () => {
		expect(score("Bridge", "bridge", "tell me what Bridge does")).toBe(3);
	});
	it("lowercase category words never fire it", () => {
		expect(
			score("Bridge", "bridge", "cross-chain bridge to stellar"),
		).toBeLessThan(3);
	});
	it("network names never fire it, even capitalized", () => {
		expect(
			score("Stellar Thing", "stellar", "payments on Stellar today"),
		).toBeLessThan(3);
	});
	it("the FIRST word never fires it (sentence case is not a signal)", () => {
		expect(
			score("Bridge", "bridge", "Bridge to other chains comparison"),
		).toBeLessThan(3);
	});
});
