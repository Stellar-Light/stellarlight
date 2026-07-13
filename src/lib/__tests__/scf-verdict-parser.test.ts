/**
 * parseRoundVerdicts negative-vocabulary regression (sls-026 residual).
 *
 * The 2026-07-11 membership postwave left 13 records "unverdictable" ONLY
 * because the parser read "Awarded"/"Not Awarded" and nothing else, while the
 * official pages mark losing submissions "Prescreen Failed", "Panel Review
 * Failed", "Ineligible", or "Rejected - timeout" (each hand-verified on the
 * ambiguous-13 wave — see SCF_FIX in scripts/data/curate-projects.ts). These
 * tests pin the full negative vocabulary AND that neutral in-flight statuses
 * ("Information Collection", "Ready for Payment", "Pending", "Test
 * Transaction" — the GT-17 class) verdict NOTHING: ambiguity never accuses.
 */
import { describe, expect, it } from "vitest";
import {
	isNegativeVerdict,
	parseRoundVerdicts,
} from "../../../scripts/eval/scf-official";

/** Build a minimal detail-page blob the parser's regex reads: one
 * {"status":…,"roundName":…} object per submission card. */
const page = (cards: Array<{ status: string; round: string }>) =>
	cards
		.map(
			(c) =>
				`{"id":"x","status":"${c.status}","amount":1,"roundName":"${c.round}"}`,
		)
		.join("\n");

describe("isNegativeVerdict", () => {
	it("recognizes all four sls-054-era negative statuses plus Rejected variants", () => {
		expect(isNegativeVerdict("Not Awarded")).toBe(true);
		expect(isNegativeVerdict("Prescreen Failed")).toBe(true);
		expect(isNegativeVerdict("Panel Review Failed")).toBe(true);
		expect(isNegativeVerdict("Ineligible")).toBe(true);
		// alternun's #40 card carries the suffixed form verbatim.
		expect(isNegativeVerdict("Rejected - timeout")).toBe(true);
		expect(isNegativeVerdict("Rejected")).toBe(true);
	});

	it("treats Awarded and in-flight statuses as non-negative", () => {
		expect(isNegativeVerdict("Awarded")).toBe(false);
		expect(isNegativeVerdict("Information Collection")).toBe(false);
		expect(isNegativeVerdict("Ready for Payment")).toBe(false);
		expect(isNegativeVerdict("Pending")).toBe(false);
		expect(isNegativeVerdict("Test Transaction")).toBe(false);
		// prefix rule must not overmatch mid-string mentions.
		expect(isNegativeVerdict("Not Rejected")).toBe(false);
	});
});

describe("parseRoundVerdicts", () => {
	it("classifies the extended negative vocabulary into notAwarded", () => {
		// The alternun-16y shape: #27 Awarded, #30 Prescreen Failed,
		// #37 Not Awarded, #40 Rejected - timeout.
		const v = parseRoundVerdicts(
			page([
				{ status: "Awarded", round: "SCF #27" },
				{ status: "Prescreen Failed", round: "SCF #30" },
				{ status: "Not Awarded", round: "SCF #37" },
				{ status: "Rejected - timeout", round: "SCF #40" },
			]),
		);
		expect([...v.awarded]).toEqual(["27"]);
		expect([...v.notAwarded].sort()).toEqual(["30", "37", "40"]);
		expect(v.submissions).toBe(4);
		expect(v.awardedAnyCount).toBe(1);
	});

	it("keeps neutral in-flight statuses out of BOTH sets (never accuse)", () => {
		// The GT-17 class: populated Build submissions in Test Transaction /
		// Ready for Payment / Information Collection must not imply a verdict.
		const v = parseRoundVerdicts(
			page([
				{ status: "Awarded", round: "SCF #33" },
				{ status: "Information Collection", round: "Kickstart #9" },
				{ status: "Ready for Payment", round: "SCF #44" },
				{ status: "Test Transaction", round: "SCF #45" },
			]),
		);
		expect([...v.awarded]).toEqual(["33"]);
		expect(v.notAwarded.size).toBe(0);
		// Neutral cards are NOT decisive submissions — submissions===0 must
		// still mean "the page verdicts nothing" for the skip guards.
		expect(v.submissions).toBe(1);
	});

	it("returns submissions=0 on a page with only neutral cards", () => {
		const v = parseRoundVerdicts(
			page([{ status: "Information Collection", round: "Kickstart #10" }]),
		);
		expect(v.submissions).toBe(0);
		expect(v.awarded.size).toBe(0);
		expect(v.notAwarded.size).toBe(0);
	});

	it("any awarded submission in a round beats a negative in the same round", () => {
		// Projects resubmit within a round (the phoenix Liquidity precedent).
		const v = parseRoundVerdicts(
			page([
				{ status: "Prescreen Failed", round: "SCF #31" },
				{ status: "Awarded", round: "SCF #31" },
			]),
		);
		expect([...v.awarded]).toEqual(["31"]);
		expect(v.notAwarded.size).toBe(0);
	});

	it("non-numeric rounds count toward awardedAnyCount but not round sets", () => {
		const v = parseRoundVerdicts(
			page([{ status: "Awarded", round: "Liquidity Award '24 Q1" }]),
		);
		expect(v.awarded.size).toBe(0);
		expect(v.awardedAnyCount).toBe(1);
		expect(v.submissions).toBe(1);
	});
});
