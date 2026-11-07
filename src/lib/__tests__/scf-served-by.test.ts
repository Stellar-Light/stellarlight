/**
 * The SCF absence diff's identity rule (scripts/eval/scf-absence-diff.ts).
 * In an absence report a false hit is not a mislabel: it deletes a real gap.
 * The old rules took the first row sharing a prefix, a 5-letter substring or
 * a word, and on 2026-11-04 that hid two SCF #45 awardees we do not list:
 * Onboard (inside "Onboarding Club") and AgentSmith x402 (the word x402 is a
 * row of ours).
 */
import { describe, expect, it } from "vitest";
import { servedBy } from "../../../scripts/eval/scf-official";

const row = (slug: string, name: string, aliases: string[] = []) => ({
	slug,
	name,
	aliases,
});

describe("servedBy (SCF absence diff)", () => {
	it("a shared substring, prefix or word is not an identity", () => {
		expect(
			servedBy("onboard", [row("onboarding-club", "Onboarding Club")]),
		).toBeUndefined();
		expect(
			servedBy("agentsmith-x402-stellar-facilitator-and-bazaar-discovery", [
				row("x402", "x402"),
			]),
		).toBeUndefined();
		expect(
			servedBy("unstoppable-money", [row("lemon", "Lemon")]),
		).toBeUndefined();
		expect(servedBy("velocity-wallet", [row("velo", "Velo")])).toBeUndefined();
	});

	it("an exact slug, name or alias, or the single best title prefix, is", () => {
		expect(servedBy("pollar", [row("pollar", "Pollar")])?.slug).toBe("pollar");
		expect(servedBy("hermes", [row("zenex", "ZENEX", ["Hermes"])])?.slug).toBe(
			"zenex",
		);
		expect(
			servedBy("rumble-fish-software-development-rfp", [
				row("velo", "Velo"),
				row("rumble-fish", "Rumble Fish"),
			])?.slug,
		).toBe("rumble-fish");
	});

	it("two equally good rows serve nothing", () => {
		expect(
			servedBy("nest-protocol-labs", [
				row("a", "Nest Protocol"),
				row("b", "Nest-Protocol"),
			]),
		).toBeUndefined();
	});
});
