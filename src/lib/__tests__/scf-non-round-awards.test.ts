/** SCF grants awards outside the numbered rounds — Blend's $50,000 is a
 * "Liquidity Award - '24 Q1", status Awarded on SCF's own page. The parser
 * mapped awards onto numeric SCF #N rounds only, so that one was dropped and
 * the project surfaced $50,000 beside an empty scfAwardedRounds with nothing
 * to explain it. Shaped from the real communityfund.stellar.org payload. */
import { describe, expect, it } from "vitest";
import { parseRoundVerdicts } from "../../../scripts/eval/scf-official";

const card = (
	id: string,
	status: string,
	roundName: string,
	budget?: number,
) =>
	`{"id":"${id}","status":"${status}","project":"recX","roundName":"${roundName}","awardType":"Build"${budget !== undefined ? `,"budget":${budget}` : ""}}`;

describe("SCF awards outside the numbered rounds", () => {
	it("keeps a Liquidity Award, with its name as its identity", () => {
		const v = parseRoundVerdicts(
			card("rec1", "Awarded", "Liquidity Award - '24 Q1", 50000),
		);
		expect(v.awards).toEqual([
			{
				round: null,
				awardName: "Liquidity Award - '24 Q1",
				budgetUSD: 50000,
				awardType: "Build",
			},
		]);
		// The round SETS stay numeric-only: the never-accuse and no-resurrect
		// guards read them, and a named award is not a round verdict.
		expect([...v.awarded]).toEqual([]);
		expect(v.awardedAnyCount).toBe(1);
	});

	it("still reports numbered rounds, and sorts them before named awards", () => {
		const v = parseRoundVerdicts(
			[
				card("rec1", "Awarded", "SCF #23", 94000),
				card("rec2", "Awarded", "Liquidity Award - '24 Q1", 100000),
				card("rec3", "Awarded", "SCF #17", 147000),
			].join(","),
		);
		// A numbered award is identified by its round and carries no awardName;
		// a named one carries no round. Each has exactly one identity.
		expect(
			v.awards.map((a) => [a.round, a.awardName ?? null, a.budgetUSD]),
		).toEqual([
			[17, null, 147000],
			[23, null, 94000],
			[null, "Liquidity Award - '24 Q1", 100000],
		]);
		expect([...v.awarded].sort()).toEqual(["17", "23"]);
	});

	it("nulls the budget when one card of a named award has none — a partial sum lies", () => {
		const v = parseRoundVerdicts(
			[
				card("rec1", "Awarded", "Liquidity Award - '24 Q1", 50000),
				card("rec2", "Awarded", "Liquidity Award - '24 Q1"),
			].join(","),
		);
		expect(v.awards).toHaveLength(1);
		expect(v.awards[0].budgetUSD).toBeNull();
	});

	it("does not invent an award from a non-awarded named round", () => {
		const v = parseRoundVerdicts(
			card("rec1", "Not Awarded", "Liquidity Award - '24 Q1", 50000),
		);
		expect(v.awards).toEqual([]);
		expect(v.awardedAnyCount).toBe(0);
	});
});
