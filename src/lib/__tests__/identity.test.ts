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
		const skipped: unknown[] = [];
		expect(
			findTitlePrefixMatch(
				"Rumble Fish Software Development - RFP",
				[{ name: "Velo" }, { name: "Rumble Fish" }],
				(row) => skipped.push(row.name),
			),
		).toEqual({ name: "Rumble Fish" });
		expect(skipped).toEqual(["Velo"]);
	});

	it("the partial match is the single best row, never the first hit", () => {
		// Row order must not decide: Nest is a token prefix too, but Nest
		// Protocol shares the longer prefix with the title.
		const rows = [
			{ name: "Velo" },
			{ name: "Nest" },
			{ name: "Nest Protocol" },
		];
		expect(findTitlePrefixMatch("Nest Protocol Development", rows)).toEqual({
			name: "Nest Protocol",
		});
		// Two rows equally good (one name, two spellings) is no match at all.
		expect(
			findTitlePrefixMatch("Nest Protocol Development", [
				{ name: "Nest Protocol" },
				{ name: "Nest-Protocol" },
			]),
		).toBeUndefined();
		// A title that is the start of two different names names neither.
		expect(
			findTitlePrefixMatch("Nest", [
				{ name: "Nest Wallet" },
				{ name: "Nest Protocol" },
			]),
		).toBeUndefined();
	});

	it("accents fold rather than vanish", () => {
		// "José" used to read as "jos", so a row named JOS took it.
		expect(
			findTitlePrefixMatch("José Development", [{ name: "JOS" }]),
		).toBeUndefined();
		expect(findTitlePrefixMatch("Cafés Network", [{ name: "Cafés" }])).toEqual({
			name: "Cafés",
		});
		expect(normSpaced("José  Café")).toBe("jose cafe");
		expect(normSpaceless("Cryptoconexión")).toBe("cryptoconexion");
	});

	it("a name under three letters never joins by prefix", () => {
		// "Op" is a token prefix of "Op Stack Development" but identifies
		// nothing; three letters (the BWB, CTX and DIA rows) still join.
		expect(
			findTitlePrefixMatch("Op Stack Development", [{ name: "Op" }]),
		).toBeUndefined();
		expect(findTitlePrefixMatch("DIA Oracles", [{ name: "DIA" }])).toEqual({
			name: "DIA",
		});
	});

	it("an exact name wins outright over a longer name the title starts", () => {
		// Both share the whole title as prefix; the row named exactly that is
		// the match, not a tie.
		expect(
			findTitlePrefixMatch("Nest Protocol", [
				{ name: "Nest Protocol Labs" },
				{ name: "Nest Protocol" },
			]),
		).toEqual({ name: "Nest Protocol" });
		// two different rows with that exact name are still no match
		expect(
			findTitlePrefixMatch("Nest Protocol", [
				{ name: "Nest Protocol Labs" },
				{ name: "Nest Protocol" },
				{ name: "NEST PROTOCOL" },
			]),
		).toBeUndefined();
	});

	it("a name of three or four letters joins by prefix only as an acronym", () => {
		// Lend and Pay are words that start many titles; BWB, CTX, DIA and LINK
		// are written as acronyms and join (live #45 row BWB).
		expect(
			findTitlePrefixMatch("Lend Wallet for Remittances", [{ name: "Lend" }]),
		).toBeUndefined();
		expect(
			findTitlePrefixMatch("Pay Anywhere Stablecoin Card", [{ name: "Pay" }]),
		).toBeUndefined();
		expect(
			findTitlePrefixMatch("BWB: Brazilian Real Estate Yields on Stellar", [
				{ name: "BWB" },
			]),
		).toEqual({ name: "BWB" });
		expect(findTitlePrefixMatch("LINK IO", [{ name: "LINK" }])).toEqual({
			name: "LINK",
		});
		// Five letters and up are not filtered: live #45 rows are named Haven,
		// Bridge and Balance. Vault would join "Vault Kit for RWA" on its own;
		// what guards it is the single best rule (a longer name the title
		// starts with wins) and the dry run a person reads.
		expect(
			findTitlePrefixMatch("Vault Kit for RWA", [
				{ name: "Vault" },
				{ name: "Vault Kit" },
			]),
		).toEqual({ name: "Vault Kit" });
		expect(
			findTitlePrefixMatch("Vault Kit for RWA", [{ name: "Vault" }]),
		).toEqual({ name: "Vault" });
	});

	it("two rows that are one identity are not a tie", () => {
		// A Draft lineage shadow and its canonical row carry one name; the
		// enrich re-keys a shadow match to the canonical row anyway.
		const rows = [
			{ name: "Liqvid", slug: "liqvid", canonicalSlug: "liqvidxyz" },
			{ name: "Liqvid", slug: "liqvidxyz", canonicalSlug: undefined },
		];
		const identity = (row: (typeof rows)[number]) =>
			row.canonicalSlug ?? row.slug;
		const hit = findTitlePrefixMatch(
			"Liqvid X Stellar RWA Lending Market",
			rows,
			undefined,
			identity,
		);
		expect(hit && identity(hit)).toBe("liqvidxyz");
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
