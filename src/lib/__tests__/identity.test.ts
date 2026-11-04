import { describe, expect, it } from "vitest";
import {
	cleanTitle,
	findTitlePrefixMatch,
	normSpaced,
	normSpaceless,
	stemSlugHash,
	titlePrefixMatch,
} from "../identity";

describe("identity primitives — every past trap is a fixture", () => {
	it("documents WHY spaceless containment is banned (the 18-row poisoning)", () => {
		// word seams vanish: soro·band·issassembler — containment "matches"
		expect(
			normSpaceless("Soroban Disassembler").includes(normSpaceless("Band")),
		).toBe(true);
		// …and the rule that replaced it correctly refuses:
		expect(titlePrefixMatch("Soroban Disassembler", "Band Protocol")).toBe(
			false,
		);
	});

	it("titlePrefixMatch accepts the legitimate prefix family", () => {
		expect(titlePrefixMatch("Band Protocol", "Band")).toBe(true);
		expect(titlePrefixMatch("DIA Oracles", "DIA")).toBe(true);
		expect(titlePrefixMatch("Huma", "Huma")).toBe(true);
		expect(titlePrefixMatch("band protocol", "BAND")).toBe(true); // case
	});

	it("rejects the audited poison shapes", () => {
		// generic one-word name mid-title (word-boundary is not enough)
		expect(
			titlePrefixMatch("Basilic — Stablecoin Rails on Fiat networks", "Rails"),
		).toBe(false);
		// name embedded in a longer word ("Unstoppab·lemon·ey")
		expect(titlePrefixMatch("Unstoppable Money", "Lemon")).toBe(false);
		// the four projects "ars" absorbed
		expect(titlePrefixMatch("StellarSurge", "ARS")).toBe(false);
		// mid-title mention, not identity (a title STARTING with the name is
		// the accept case by design — override/rejection-log triage guards the
		// generic-leading-word risk, not the rule)
		expect(titlePrefixMatch("Escrow built on Trust rails", "Trust")).toBe(
			false,
		);
	});

	it("casualty class goes to overrides, never loosened rules", () => {
		// same entity, different spelling — the rule refuses (correctly);
		// SCF_SLUG_OVERRIDES carries these, page-verified
		expect(titlePrefixMatch("Greep POS + Greep Pay", "Greeppay")).toBe(false);
		expect(titlePrefixMatch("zkCrossDEX", "zkCross")).toBe(false);
	});

	it("a rejected containment candidate does not end the partial search", () => {
		// de·velo·pment: our Velo row is a spaceless substring of SCF's
		// "Rumble Fish Software Development - RFP" and loads first. Stopping
		// at that rejected candidate kept Rumble Fish's #41, #42 and #45
		// awards off its row on every run (enrich-scf log, 2026-10-03).
		const rows = new Map([
			["velo", { name: "Velo" }],
			["rumblefish", { name: "Rumble Fish" }],
		]);
		const rejected: unknown[] = [];
		expect(
			findTitlePrefixMatch(
				"Rumble Fish Software Development - RFP",
				rows,
				(row) => rejected.push(row.name),
			),
		).toEqual({ name: "Rumble Fish" });
		expect(rejected).toEqual(["Velo"]);
	});

	it("the partial search still refuses when no candidate passes the rule", () => {
		const rows = new Map([
			["band", { name: "Band" }],
			["sorobandisassemblerx", { name: "Soroban Disassemblerx" }],
		]);
		expect(findTitlePrefixMatch("Soroban Disassembler", rows)).toBeUndefined();
	});

	it("cleanTitle strips parenthetical noise", () => {
		expect(cleanTitle("Soroban Optimistic Oracle  (SOO) ")).toBe(
			"Soroban Optimistic Oracle",
		);
	});

	it("stemSlugHash strips listing hashes only", () => {
		expect(stemSlugHash("warp-drive-7tk")).toBe("warp-drive");
		expect(stemSlugHash("band-protocol-2ob")).toBe("band-protocol");
	});

	it("normSpaced collapses separators for token-boundary logic", () => {
		expect(normSpaced("Cash—Abroad  Smart_Treasury")).toBe(
			"cash abroad smart treasury",
		);
	});
});
