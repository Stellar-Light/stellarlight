import { describe, expect, it } from "vitest";
import { GAP_VERTICALS } from "../ecosystem-gaps";
import { buildHaystack, scoreTokens, tokenize } from "../project-search-match";
import { VERTICAL_TOKENS } from "../vet-idea";

describe("vet-idea vertical map", () => {
	it("every VERTICAL_TOKENS value is a real GAP_VERTICALS member", () => {
		for (const [token, vertical] of Object.entries(VERTICAL_TOKENS)) {
			expect(GAP_VERTICALS as readonly string[], `token '${token}'`).toContain(
				vertical,
			);
		}
	});

	it("porter + core entry points map (2026-08-15 lesson)", () => {
		expect(VERTICAL_TOKENS["erc-3643"]).toBe("RWA");
		expect(VERTICAL_TOKENS.amm).toBe("DEX");
		expect(VERTICAL_TOKENS.ramp).toBe("Anchor");
	});
});

/**
 * sls-073 regression. vet-idea returned an EMPTY competitors.projects array for
 * "perpetuals / derivatives trading protocol on Stellar" while the directory
 * returned 25 rows for the identical string — because vet-idea's no-vertical
 * fallback hand-rolled its own `includes` pass over an arbitrary 400-row window
 * and over `description`, while the directory ranks the whole active set with
 * the shared matcher over `shortDescription` + structured fields.
 *
 * These rows are the real ones the directory returned that day. If the two
 * surfaces ever diverge on the same matcher again, this fails.
 */
describe("vet-idea competitor consistency with the directory (sls-073)", () => {
	// Real shapes: these carry NO perpetuals type — the vertical does not exist
	// — so they can only be found by the prose matcher.
	const rows = [
		{
			slug: "noether",
			name: "Noether",
			types: [],
			shortDescription:
				"A decentralized perpetual futures exchange on Stellar/Soroban.",
		},
		{
			slug: "zenex",
			name: "Zenex",
			types: [],
			shortDescription:
				"A decentralized perpetual trading exchange on Stellar/Soroban.",
		},
		{
			slug: "turbolong",
			name: "TurboLong",
			types: [],
			shortDescription: "A leveraged trading platform on Stellar.",
		},
		{
			slug: "stellars-finance",
			name: "Stellars Finance",
			types: ["DEX"],
			shortDescription: "A perpetual trading protocol on Stellar.",
		},
	];

	it("the shared matcher finds the perps rows the directory returns", () => {
		const tokens = tokenize(
			"perpetuals / derivatives trading protocol on Stellar",
		);
		const matched = rows.filter(
			(r) => scoreTokens(buildHaystack(r), tokens) > 0,
		);
		expect(matched.map((r) => r.slug)).toEqual([
			"noether",
			"zenex",
			"turbolong",
			"stellars-finance",
		]);
	});

	it("the OLD naive fallback missed them — proving the matcher swap matters", () => {
		// What vet-idea used to do: raw includes over name + description.
		const naive = ["perpetuals", "derivatives", "trading"];
		const missed = rows.filter((r) => {
			const hay = `${r.name} ${""}`.toLowerCase(); // description was unset on these rows
			return !naive.some((t) => hay.includes(t));
		});
		expect(missed.length).toBe(rows.length);
	});
});
