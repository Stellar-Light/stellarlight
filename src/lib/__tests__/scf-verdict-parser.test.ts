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
			(c, i) =>
				`{"id":"card-${i}","status":"${c.status}","amount":1,"roundName":"${c.round}"}`,
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

/** sls-058 defect 2: per-awarded-round official record (budget + award type)
 * off the same submission cards. Object shape verbatim from fluxity-mez
 * (2026-08-03): status … roundName … awardType … budget, one object per card. */
describe("parseRoundVerdicts awards (sls-058)", () => {
	const fluxityish =
		'{"id":"recDXtqYuR8g9FMXt","status":"Awarded","project":"recM61","projectName":"$22","round":"recig1","roundName":"SCF #21","awardType":"Legacy v5.0 Community Award","title":"Fluxity","budget":68000,"entityType":"SUBMISSION"}\n' +
		'{"id":"recKUE","status":"Not Awarded","project":"recM61","projectName":"$26","round":"recVMT","roundName":"SCF #18","awardType":"Legacy v4.0 Award","title":"Fluxity","budget":52000,"entityType":"SUBMISSION"}';

	it("captures budget + awardType for awarded rounds only", () => {
		const v = parseRoundVerdicts(fluxityish);
		expect(v.awards).toEqual([
			{ round: 21, budgetUSD: 68000, awardType: "Legacy v5.0 Community Award" },
		]);
		// the Not-Awarded card's budget must NOT leak in
		expect([...v.notAwarded]).toEqual(["18"]);
	});

	it("a card without budget/awardType yields nulls, never a bleed from the next card", () => {
		const v = parseRoundVerdicts(
			'{"id":"a1","status":"Awarded","roundName":"SCF #16"}\n' +
				'{"id":"a2","status":"Awarded","roundName":"SCF #24","awardType":"Legacy v5.0 Activation Award","budget":50000}',
		);
		expect(v.awards).toEqual([
			{ round: 16, budgetUSD: null, awardType: null },
			{
				round: 24,
				budgetUSD: 50000,
				awardType: "Legacy v5.0 Activation Award",
			},
		]);
	});

	it("multiple awarded submissions in one round SUM their budgets (bondhive #29)", () => {
		const v = parseRoundVerdicts(
			'{"id":"b1","status":"Awarded","roundName":"SCF #31","awardType":"Build Award","budget":90000}\n' +
				'{"id":"b2","status":"Awarded","roundName":"SCF #31","awardType":"Build Award","budget":15000}',
		);
		expect(v.awards).toEqual([
			{ round: 31, budgetUSD: 105000, awardType: "Build Award" },
		]);
	});

	it("the page's double-embed of the SAME card never double-counts", () => {
		const card =
			'{"id":"dup1","status":"Awarded","roundName":"SCF #29","awardType":"Legacy v5.0 Community Award","budget":100000}';
		const v = parseRoundVerdicts(`${card}\n${card}`);
		expect(v.awards).toEqual([
			{
				round: 29,
				budgetUSD: 100000,
				awardType: "Legacy v5.0 Community Award",
			},
		]);
	});

	it("disagreeing embeds of ONE card keep the MAX budget (bondhive #29: reference form truncates)", () => {
		const v = parseRoundVerdicts(
			'{"id":"e1","status":"Awarded","projectName":"$26","roundName":"SCF #29","awardType":"Legacy v5.0 Community Award","budget":100}\n' +
				'{"id":"e1","status":"Awarded","projectName":["BondHive"],"roundName":"SCF #29","awardType":"Legacy v5.0 Community Award","budget":100000}',
		);
		expect(v.awards).toEqual([
			{
				round: 29,
				budgetUSD: 100000,
				awardType: "Legacy v5.0 Community Award",
			},
		]);
	});

	it("one budget-less awarded card nulls the round's sum (partial sums lie)", () => {
		const v = parseRoundVerdicts(
			'{"id":"c1","status":"Awarded","roundName":"SCF #29","budget":100000}\n' +
				'{"id":"c2","status":"Awarded","roundName":"SCF #29"}',
		);
		expect(v.awards).toEqual([{ round: 29, budgetUSD: null, awardType: null }]);
	});

	it("an RSC chunk-split PREFIX-fragment id merges into its full card, never sums (prism-dxb #44)", () => {
		// The resolved embed's id was cut at a stream boundary and re-matched as
		// "r" — same round, type and budget as the intact embed. Before the fix
		// this summed #44 to exactly 2× the page's own Total awarded.
		const v = parseRoundVerdicts(
			'{"id":"recpWygA3kmg3NsZx","status":"Awarded","roundName":"SCF #44","awardType":"Build","budget":124600}\n' +
				'{"id":"r","status":"Awarded","roundName":"SCF #44","awardType":"Build","budget":124600}',
		);
		expect(v.awards).toEqual([
			{ round: 44, budgetUSD: 124600, awardType: "Build" },
		]);
		expect(v.awardedAnyCount).toBe(1);
		expect(v.submissions).toBe(1);
	});

	it("distinct same-round cards whose ids do NOT prefix each other still sum", () => {
		const v = parseRoundVerdicts(
			'{"id":"recAAAAAAAAAAAAAA","status":"Awarded","roundName":"SCF #31","awardType":"Build Award","budget":90000}\n' +
				'{"id":"recBBBBBBBBBBBBBB","status":"Awarded","roundName":"SCF #31","awardType":"Build Award","budget":15000}',
		);
		expect(v.awards).toEqual([
			{ round: 31, budgetUSD: 105000, awardType: "Build Award" },
		]);
		expect(v.awardedAnyCount).toBe(2);
	});

	it("a page whose own Awarded-Submissions counter disagrees with the parse nulls budgets (never a summed guess)", () => {
		// Two well-formed awarded cards but the rendered page says 1 — some
		// embed slipped past dedup, so award DETAIL is unreliable: membership
		// stays, budgets/types null.
		const v = parseRoundVerdicts(
			'{"id":"recAAAAAAAAAAAAAA","status":"Awarded","roundName":"SCF #36","awardType":"Build","budget":85000}\n' +
				'{"id":"recCCCCCCCCCCCCCC","status":"Awarded","roundName":"SCF #36","awardType":"Build","budget":85000}\n' +
				'<div class="mb-2">Awarded Submissions</div><div class="font-schabo">1</div>',
		);
		expect(v.awards).toEqual([{ round: 36, budgetUSD: null, awardType: null }]);
		expect([...v.awarded]).toEqual(["36"]);
	});

	it("a page whose counter AGREES keeps the parsed budgets", () => {
		const v = parseRoundVerdicts(
			'{"id":"recAAAAAAAAAAAAAA","status":"Awarded","roundName":"SCF #44","awardType":"Build","budget":120000}\n' +
				'<div class="mb-2">Awarded Submissions</div><div class="font-schabo">1</div>',
		);
		expect(v.awards).toEqual([
			{ round: 44, budgetUSD: 120000, awardType: "Build" },
		]);
	});
});

// Cross-vendor audit 2026-08-31: the wrong-host class. A bare fragment like
// "r" prefixes EVERY Airtable rec-id, so with two same-round/type awarded
// cards the fragment of the larger merged into the SMALLER host and
// Math.max-inflated its budget — while the count gate read 2 = 2 and passed.
describe("fragment hardening (wrong-host + reconciliation gates)", () => {
	it("a fragment merges only into a budget-AGREEING host, never inflates the other card", () => {
		const v = parseRoundVerdicts(
			'{"id":"recAAAAAAAAAAAAAA","status":"Awarded","roundName":"SCF #31","awardType":"Build","budget":15000}\n' +
				'{"id":"recBBBBBBBBBBBBBB","status":"Awarded","roundName":"SCF #31","awardType":"Build","budget":124600}\n' +
				'{"id":"r","status":"Awarded","roundName":"SCF #31","awardType":"Build","budget":124600}\n' +
				'<div class="mb-2">Awarded Submissions</div><div class="font-schabo">2</div>\n' +
				'<div class="mb-2">Total awarded</div><div class="font-schabo">$139.6K</div>',
		);
		expect(v.awards).toEqual([
			{ round: 31, budgetUSD: 139600, awardType: "Build" },
		]);
		expect(v.awardedAnyCount).toBe(2);
	});

	it("a short-id card with no prefix-host in its round stays a real card", () => {
		// "re" prefixes recAAAA… but the rounds differ, so it is nobody's
		// fragment twin — it keeps its own count, budget, and membership.
		const v = parseRoundVerdicts(
			'{"id":"recAAAAAAAAAAAAAA","status":"Awarded","roundName":"SCF #30","awardType":"Build","budget":50000}\n' +
				'{"id":"re","status":"Awarded","roundName":"SCF #29","awardType":"Build","budget":75000}',
		);
		expect([...v.awarded].sort()).toEqual(["29", "30"]);
		expect(v.awardedAnyCount).toBe(2);
	});

	it("a same-round fragment with a budget-DISAGREEING host proves membership only", () => {
		// Fragment "r" (budget 99999) prefixes the host but their budgets
		// disagree and neither is null → no merge, no own card: membership
		// stays, count and budget exclude it.
		const v = parseRoundVerdicts(
			'{"id":"recAAAAAAAAAAAAAA","status":"Awarded","roundName":"SCF #30","awardType":"Build","budget":50000}\n' +
				'{"id":"r","status":"Awarded","roundName":"SCF #30","awardType":"Build","budget":99999}',
		);
		expect([...v.awarded]).toEqual(["30"]);
		expect(v.awardedAnyCount).toBe(1);
		expect(v.awards).toEqual([
			{ round: 30, budgetUSD: 50000, awardType: "Build" },
		]);
	});

	it("count reconciliation nulls only on OVER-count; a page counting neutral cards keeps budgets", () => {
		const under = parseRoundVerdicts(
			'{"id":"recAAAAAAAAAAAAAA","status":"Awarded","roundName":"SCF #44","awardType":"Build","budget":120000}\n' +
				'<div class="mb-2">Awarded Submissions</div><div class="font-schabo">2</div>',
		);
		expect(under.awards).toEqual([
			{ round: 44, budgetUSD: 120000, awardType: "Build" },
		]);
	});

	it("the rendered Total-awarded dollar gate nulls budgets that sum past display slack", () => {
		const v = parseRoundVerdicts(
			'{"id":"recAAAAAAAAAAAAAA","status":"Awarded","roundName":"SCF #36","awardType":"Build","budget":85000}\n' +
				'{"id":"recCCCCCCCCCCCCCC","status":"Awarded","roundName":"SCF #36","awardType":"Build","budget":85000}\n' +
				'<div class="mb-2">Total awarded</div><div class="font-schabo">$85.0K</div>',
		);
		expect(v.awards).toEqual([{ round: 36, budgetUSD: null, awardType: null }]);
		// membership untouched by the nulling
		expect([...v.awarded]).toEqual(["36"]);
	});
});

// Cross-vendor audit round 2: a type-less fragment must land on the
// budget-matching host, never smear its merge across award types.
describe("fragment host preference (round-2 audit)", () => {
	it("a null-type fragment merges into the budget-matching host across types", () => {
		const v = parseRoundVerdicts(
			'{"id":"recAAAAAAAAAAAAAA","status":"Awarded","roundName":"SCF #33","awardType":"Build","budget":50000}\n' +
				'{"id":"recBBBBBBBBBBBBBB","status":"Awarded","roundName":"SCF #33","awardType":"Audit","budget":90000}\n' +
				'{"id":"r","status":"Awarded","roundName":"SCF #33","budget":90000}\n' +
				'<div class="mb-2">Awarded Submissions</div><div class="font-schabo">2</div>\n' +
				'<div class="mb-2">Total awarded</div><div class="font-schabo">$140.0K</div>',
		);
		expect(v.awardedAnyCount).toBe(2);
		expect(v.awards).toEqual([
			{ round: 33, budgetUSD: 140000, awardType: "Build" },
		]);
	});
});
