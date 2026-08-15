import { describe, expect, it } from "vitest";
import { GAP_VERTICALS } from "../ecosystem-gaps";
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
