import { describe, expect, it } from "vitest";
import {
	distanceBudget,
	editDistance,
	findNameMatch,
	normalizeName,
} from "../fuzzy-name";

/**
 * A slice of the real directory, chosen for danger rather than coverage: the
 * four projects that actually failed in production, plus the short asset
 * tickers that are one edit from each other and would be the first thing a
 * careless threshold destroyed.
 */
const DIRECTORY = [
	{ name: "Blend", slug: "blend" },
	{ name: "Soroswap", slug: "soroswap" },
	{ name: "Aquarius", slug: "aquarius" },
	{ name: "Reflector", slug: "reflector" },
	{ name: "Hito Wallet", slug: "hito-wallet" },
	{ name: "Passkey Kit", slug: "passkey-kit" },
	{ name: "DeFindex", slug: "defindex" },
	// short tickers — the false-positive minefield
	{ name: "KES", slug: "kes" },
	{ name: "ARS", slug: "ars" },
	{ name: "BRL", slug: "brl" },
	{ name: "BRZ", slug: "brz" },
	{ name: "TZS", slug: "tzs" },
	{ name: "gYEN", slug: "gyen" },
	{ name: "EURx", slug: "eurx" },
];

describe("editDistance", () => {
	it("is 0 for identical strings", () => {
		expect(editDistance("blend", "blend")).toBe(0);
	});

	it("counts a single substitution, insertion or deletion as 1", () => {
		expect(editDistance("blendd", "blend")).toBe(1); // insertion
		expect(editDistance("reflecter", "reflector")).toBe(1); // substitution
		expect(editDistance("aquarious", "aquarius")).toBe(1); // deletion
	});

	it("counts an adjacent transposition as 1, not 2", () => {
		// This is the whole reason for Damerau over plain Levenshtein: plain
		// would score 2 and fall outside a tight budget.
		expect(editDistance("teh", "the")).toBe(1);
		expect(editDistance("soroswpa", "soroswap")).toBe(1);
	});

	it("short-circuits above max without lying about small distances", () => {
		expect(editDistance("blendd", "blend", 1)).toBe(1);
		expect(editDistance("completely", "different", 1)).toBeGreaterThan(1);
	});
});

describe("distanceBudget", () => {
	it("refuses any tolerance for 3-4 character tickers", () => {
		expect(distanceBudget(3)).toBe(0);
		expect(distanceBudget(4)).toBe(0);
	});

	it("allows one edit for mid-length names and two for long ones", () => {
		expect(distanceBudget(5)).toBe(1);
		expect(distanceBudget(7)).toBe(1);
		expect(distanceBudget(8)).toBe(2);
		expect(distanceBudget(20)).toBe(2);
	});
});

describe("normalizeName", () => {
	it("folds case, spaces and punctuation to one form", () => {
		expect(normalizeName("Hito Wallet")).toBe("hitowallet");
		expect(normalizeName("hito-wallet")).toBe("hitowallet");
		expect(normalizeName("Passkey Kit")).toBe("passkeykit");
	});
});

describe("findNameMatch — the production failures", () => {
	// Each of these returned unrelated projects on prod 2026-07-26.
	it.each([
		["blendd", "Blend"],
		["soroswapp", "Soroswap"],
		["aquarious", "Aquarius"],
		["reflecter", "Reflector"],
	])("%s → %s", (typo, expected) => {
		expect(findNameMatch(typo, DIRECTORY)?.name).toBe(expected);
	});

	it("recovers a slug-form typo too", () => {
		expect(findNameMatch("hito-wallett", DIRECTORY)?.name).toBe("Hito Wallet");
	});
});

describe("findNameMatch — refusals (the part that makes it safe)", () => {
	it("never corrects a short ticker, even one edit away", () => {
		// BRL/BRZ/ARS/KES are all within one edit of each other and of noise.
		// Correcting any of them would invent a confident wrong answer.
		expect(findNameMatch("brk", DIRECTORY)).toBeNull();
		expect(findNameMatch("krs", DIRECTORY)).toBeNull();
		expect(findNameMatch("eurr", DIRECTORY)).toBeNull();
	});

	it("declines when two candidates tie — ambiguity is not a correction", () => {
		const tied = [
			{ name: "Steller", slug: "steller" },
			{ name: "Stellad", slug: "stellad" },
		];
		// "stellar" is one edit from BOTH; guessing either would be a coin flip.
		expect(findNameMatch("stellar", tied)).toBeNull();
	});

	it("declines a multi-word query — a sentence is not a misspelled name", () => {
		// A 3+ token question that matched nothing is a coverage gap; correcting
		// one word of it answers something the user never asked.
		expect(findNameMatch("how does blendd work", DIRECTORY)).toBeNull();
	});

	it("declines an exact match — that path belongs to the keyword ladder", () => {
		expect(findNameMatch("blend", DIRECTORY)).toBeNull();
		expect(findNameMatch("Soroswap", DIRECTORY)).toBeNull();
	});

	it("declines a genuinely unknown entity rather than reaching for a neighbour", () => {
		// These are the #726 cases: real queries for things we do not hold. They
		// must keep falling through to the semantic path + advisory, NOT get
		// silently rewritten into some unrelated project.
		expect(findNameMatch("octoplace", DIRECTORY)).toBeNull();
		expect(findNameMatch("hypertron", DIRECTORY)).toBeNull();
		expect(findNameMatch("kutana", DIRECTORY)).toBeNull();
		expect(findNameMatch("saleem", DIRECTORY)).toBeNull();
	});

	it("declines queries too short to correct safely", () => {
		expect(findNameMatch("bl", DIRECTORY)).toBeNull();
		expect(findNameMatch("", DIRECTORY)).toBeNull();
	});

	it("handles an empty directory without throwing", () => {
		expect(findNameMatch("blendd", [])).toBeNull();
	});
});
