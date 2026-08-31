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

// The other half of the same judgement, found 2026-08-30 by replaying /quality's
// open findings against the live directory: the proper-noun path above decides
// SINGLE words, and nothing decided multi-word ones. nameMatchScore reduced the
// QUERY through anchorTokens ("is Stellar Tools live" -> "tools") and then
// compared that against the UNREDUCED name ("stellar tools"), so a name whose
// own words include a reduced token could never match itself. "is Stellar
// Wallets Kit live" ranked hot-wallet, hana and albedo above the record the
// question names.
//
// Multi-word is the whole safety argument, and these two blocks are the pair
// that pins it: a single word in a question is a MENTION (guarded above), while
// several words appearing intact and in order are not a coincidence. Both
// directions are asserted here so a future widening of one breaks the other.
describe("multi-word names identify themselves (wave-6, the recall misses)", () => {
	const q = (name: string, slug: string, question: string) =>
		nameMatchScore(name, slug, question, null, tokenize(question));

	it.each([
		["Stellar Wallets Kit", "stellar-wallets-kit", "is Stellar Wallets Kit live"],
		["Stellar Tools", "stellar-tools", "is Stellar Tools live"],
		["Rise In", "rise-in", "what is Rise In"],
		["Block by Block", "block-by-block", "tell me about Block by Block"],
		[
			"Stellar Asset Sandbox",
			"stellar-asset-sandbox",
			"is the Stellar Asset Sandbox maintained",
		],
	])("%s is found by the question that names it", (name, slug, question) => {
		expect(q(name as string, slug as string, question as string)).toBe(3);
	});

	it("matches on word boundaries, not substrings", () => {
		// "Rise In" must not be claimed by "surprise incident" — the containment
		// test is anchored, so a name buried inside longer words does not count.
		expect(q("Rise In", "rise-in", "a surprise incident report")).toBeLessThan(3);
	});

	it("tolerates the hyphen/space split the slug and the name disagree on", () => {
		expect(q("Stellar Wallets Kit", "stellar-wallets-kit", "does stellar-wallets-kit still build")).toBe(3);
	});
});
