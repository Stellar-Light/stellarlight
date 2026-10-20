import { describe, expect, it } from "vitest";
import {
	isPriorArtEvidence,
	priorArtTop,
	rankPriorArt,
} from "../prior-art-rank";

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

	it("matches -ies plurals to -ie words too (movies, movie)", () => {
		const films = [
			...corpus,
			{ fullName: "m/film", description: "Movie tickets with resale" },
		];
		expect(
			rankPriorArt(["movies", "tickets"], films).map((r) => r.fullName),
		).toEqual(["m/film"]);
	});

	it("matches short -y words to their -ies plurals (try, tries)", () => {
		const tried = [
			...corpus,
			{ fullName: "y/retry", description: "Retry failed payment tries" },
		];
		expect(
			rankPriorArt(["payment", "try"], tried).map((r) => r.fullName),
		).toEqual(["y/retry"]);
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

	it("keeps real matches when the idea also has words no repo uses", () => {
		// Outside review: weighting the missing words most let "hawala" and
		// "informal" hide a repo matching both words the set does use.
		const big = [
			{
				fullName: "r/remit-pay",
				description: "Remittance payments for families abroad",
			},
			{ fullName: "r/two", description: "Remittance corridor" },
			{ fullName: "r/three", description: "Merchant payments" },
			...Array.from({ length: 37 }, (_, i) => ({
				fullName: `s/app-${i}`,
				description: "An app on Stellar",
			})),
		];
		expect(
			rankPriorArt(["remittance", "payments", "hawala", "informal"], big).map(
				(r) => r.fullName,
			),
		).toEqual(["r/remit-pay"]);
	});

	it("gives an idea made only of common words no repo prior art", () => {
		// Both words are in most repos: a match on them says nothing.
		expect(names(["app", "stellar"])).toEqual([]);
	});

	it("keeps a match on one common word plus one rare one", () => {
		const mixed = [
			...corpus,
			{ fullName: "q/qr-shop", description: "QR app for corner shops" },
		];
		expect(
			rankPriorArt(["qr", "app", "shops"], mixed).map((r) => r.fullName),
		).toEqual(["q/qr-shop"]);
	});

	it("does not call a word common in a tiny set for being in two repos", () => {
		const tiny = [
			{ fullName: "t/a", description: "Remittance over hawala networks" },
			{ fullName: "t/b", description: "Hawala remittance ledger" },
			...Array.from({ length: 7 }, (_, i) => ({
				fullName: `t/x-${i}`,
				description: "An app on Stellar",
			})),
		];
		expect(
			rankPriorArt(["remittance", "hawala"], tiny).map((r) => r.fullName),
		).toEqual(["t/a", "t/b"]);
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

describe("priorArtTop", () => {
	it("filters the top five without pulling in lower-ranked builds", () => {
		const strong = (id: string) => ({ id, similarity: 0.8, matched: [] });
		const ranked = [
			{ id: "weak", similarity: 0.69, matched: ["x"] },
			strong("b"),
			strong("c"),
			strong("d"),
			strong("e"),
			strong("sixth"),
		];
		expect(priorArtTop(ranked).map((r) => r.id)).toEqual(["b", "c", "d", "e"]);
	});
});
