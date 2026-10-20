import { describe, expect, it } from "vitest";
import { isPriorArtEvidence, rankPriorArt } from "../prior-art-rank";

// A judged set where "app" and "stellar" are everywhere, as in the real one.
const corpus = [
	{
		fullName: "a/remit-x",
		description: "Cross border remittance app on Stellar",
	},
	{
		fullName: "b/flare",
		description: "A mobile app where agents monitor flights on Stellar",
	},
	{ fullName: "c/game", description: "A zk game app on Stellar" },
	{
		fullName: "d/anchor-cashout",
		description: "Cash out remittances through local anchors on Stellar",
	},
	{
		fullName: "e/lend",
		description: "Borrow against collateral on Stellar",
		hackathonWinner: true,
	},
	{ fullName: "f/lend2", description: "Borrow against collateral on Stellar" },
	...Array.from({ length: 20 }, (_, i) => ({
		fullName: `z/app-${i}`,
		description: "An app on Stellar",
	})),
];
const names = (tokens: string[]) =>
	rankPriorArt(tokens, corpus).map((r) => r.fullName);

describe("prior art among judged repos", () => {
	it("ranks repos about the idea, not repos sharing one common word", () => {
		expect(
			names(["cross", "border", "remittance", "app", "local", "anchors"]),
		).toEqual(["a/remit-x", "d/anchor-cashout"]);
	});

	it("gives an idea with fewer than two words the set uses no prior art", () => {
		// Only "app" occurs in the set: one shared word is not prior art.
		expect(names(["app", "rosca", "tanda"])).toEqual([]);
	});

	it("matches plurals, and puts a winner first on a tie", () => {
		expect(names(["borrows", "collaterals"])).toEqual(["e/lend", "f/lend2"]);
	});

	it("matches -ies plurals to -y words", () => {
		const libs = [
			...corpus,
			{ fullName: "h/zk-lib", description: "A zk proof library for Soroban" },
		];
		expect(
			// Without the -ies rule "libraries" matches nothing, one word is left,
			// and an idea with one usable word gets no prior art.
			rankPriorArt(["proof", "libraries"], libs).map((r) => r.fullName),
		).toEqual(["h/zk-lib"]);
	});

	it("never lets common words stand in for the idea's missing ones", () => {
		// "rosca" and "tanda" are in no repo; "app" and "stellar" are in most.
		// Found by an outside review: dropping the missing words from the
		// weight let any app-on-Stellar repo cover the whole idea.
		expect(names(["app", "rosca", "tanda", "stellar"])).toEqual([]);
	});

	it("reads words through the tokenizer's punctuation", () => {
		// contentTokens keeps "(rosca," for "savings circle (ROSCA, tanda)".
		const withCircle = [
			...corpus,
			{
				fullName: "g/rosca",
				description: "A rosca where a tanda pays out by turns",
			},
		];
		expect(
			rankPriorArt(["savings", "(rosca,", "tanda)"], withCircle).map(
				(r) => r.fullName,
			),
		).toEqual(["g/rosca"]);
	});
});

describe("isPriorArtEvidence", () => {
	it("needs a meaning score at the floor or two matched words", () => {
		expect(isPriorArtEvidence({ similarity: 0.71, matched: [] })).toBe(true);
		expect(isPriorArtEvidence({ similarity: 0.7, matched: ["x"] })).toBe(true);
		expect(isPriorArtEvidence({ similarity: 0.69, matched: ["x"] })).toBe(
			false,
		);
		// Search by meaning down: no score, so one word is not enough.
		expect(isPriorArtEvidence({ matched: ["x", "y"] })).toBe(true);
		expect(isPriorArtEvidence({ matched: ["x"] })).toBe(false);
	});
});
