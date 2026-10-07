/**
 * Two defects from the 2026-08-27 through-Raven battery (44 probes, 29 ops).
 *
 * 1. A camelCase word the tokenizer split (FlurboSwap -> flurbo+swap+
 *    flurboswap) satisfied the F2 anchor gate through a lone FRAGMENT, so a
 *    fabricated name containing a real word returned that word's whole
 *    category at a keyword tier: "is FlurboSwap live" -> soroswap, sushi,
 *    alchemy — confidently, guards bypassed. A split word is ONE identity.
 *
 * 2. The final liveness float re-computed exact-name WITHOUT the tokens
 *    subject path (#1043), so a phrased query for an Inactive project sank
 *    it: "Blue Orion on stellar" -> bluechip, orion, reblue, then blue-orion
 *    fourth. Route-side; pinned here at the function level.
 */
import { describe, expect, it } from "vitest";
import {
	hitsWordToken,
	nameMatchScore,
	splitIdentityGroups,
	tokenize,
} from "../project-search-match";

describe("splitIdentityGroups", () => {
	it("groups a camelCase word as one identity", () => {
		expect(splitIdentityGroups("is FlurboSwap live")).toEqual([
			{ joined: "flurboswap", fragments: ["flurbo", "swap"] },
		]);
	});

	it("returns no groups for plain-word queries (behaviour unchanged)", () => {
		expect(splitIdentityGroups("non-custodial wallet for Stellar")).toEqual([]);
		expect(splitIdentityGroups("AMM decentralized exchange Soroban")).toEqual(
			[],
		);
	});

	it("keeps a real split name findable by its joined form", () => {
		const g = splitIdentityGroups("is SoroSwap live");
		expect(g).toEqual([{ joined: "soroswap", fragments: ["soro", "swap"] }]);
		// soroswap's haystack carries the joined form -> the group is satisfiable
		expect("soroswap amm on stellar".includes(g[0].joined)).toBe(true);
		// a row that only says "swap" does NOT satisfy the identity
		const rowHay = "sushi cross-chain swap live on stellar";
		const satisfied =
			rowHay.includes(g[0].joined) ||
			g[0].fragments.every((f) => rowHay.includes(f));
		expect(satisfied).toBe(false);
	});
});

describe("battery day-2 cases (2026-08-27 --all run)", () => {
	it("a fragment hits as a word, never a substring", () => {
		// "block" substring-hit "blockchain", so every crypto row satisfied the
		// GetBlockCard group and the gate excluded nothing.
		expect(hitsWordToken("stablecoin blockchain payments", "block")).toBe(
			false,
		);
		expect(hitsWordToken("the block explorer for stellar", "block")).toBe(true);
	});

	it("a camelCase subject is an exact-name hit via its joined form", () => {
		// "tell me about GetBlockCard" ranked bridge #1 while we HELD the row.
		expect(
			nameMatchScore(
				"GetBlockCard",
				"getblockcard",
				"tell me about GetBlockCard",
				null,
				tokenize("tell me about GetBlockCard"),
			),
		).toBe(3);
		// and the group path must not promote a different card project
		expect(
			nameMatchScore(
				"Bridge",
				"bridge",
				"tell me about GetBlockCard",
				null,
				tokenize("tell me about GetBlockCard"),
			),
		).toBeLessThan(3);
	});
});

describe("float exact-name keeps the #1043 subject path", () => {
	it("an Inactive project asked about in a sentence is still an exact hit", () => {
		expect(
			nameMatchScore(
				"Blue Orion",
				"blue-orion",
				"Blue Orion on stellar",
				null,
				tokenize("Blue Orion on stellar"),
			),
		).toBe(3);
	});
});
