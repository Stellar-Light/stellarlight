/**
 * `awarded` and `awardedAnyCount` answer DIFFERENT questions — pinned because
 * reading only the count under-reported funding by 7 of 8 rows.
 *
 * scripts/eval/scf-absence-diff.ts asks one thing of an SCF detail page: is
 * this absent project funded? The obvious field, `awardedAnyCount`, counts
 * submission cards whose status literally reads "Awarded". But SCF leaves a
 * funded project's card in a DISBURSEMENT status ("Information Collection",
 * "Panel Review") long after the award, and the parser recovers those from the
 * page's own awarded/lastAwardedRound/totalAwarded summary into `awarded` —
 * deliberately without touching `awardedAnyCount`, which stays an accusation
 * counter. On 2026-09-14 all 8 standing absences were of exactly that shape,
 * so a count-only test called every one of them an unfunded applicant.
 *
 * The sibling half: a badge is a round ENTERED. A page badges rounds it lost,
 * so award ROUNDS must come from the verdicts, never from page text.
 */
import { describe, expect, it } from "vitest";
import { parseRoundVerdicts } from "../../../scripts/eval/scf-official";

const card = (c: {
	id: string;
	status: string;
	round: string;
	budget?: number;
}) =>
	`{"id":"${c.id}","status":"${c.status}","roundName":"${c.round}","awardType":"Build"${
		c.budget === undefined ? "" : `,"budget":${c.budget}`
	}}`;

/** A funded project whose card still sits in a post-award pipeline status —
 *  catlog-ygy, verbatim shape (SCF #45, $97,000, "Information Collection"). */
const disbursing = [
	card({
		id: "rec-catlog",
		status: "Information Collection",
		round: "SCF #45",
		budget: 97000,
	}),
	'{"awarded":true,"lastAwardedRound":45,"totalAwarded":97000}',
].join("\n");

describe("award status of an absent SCF project", () => {
	it("counts a post-award disbursement card as funded via `awarded`", () => {
		const v = parseRoundVerdicts(disbursing);
		expect([...v.awarded]).toEqual(["45"]);
		// The trap: the count stays 0 because no card says "Awarded".
		expect(v.awardedAnyCount).toBe(0);
		// So the funded test must read BOTH — this is the expression
		// scf-absence-diff.ts uses for ScfEntry.awardedAny.
		expect(v.awarded.size > 0 || v.awardedAnyCount > 0).toBe(true);
	});

	it("does not credit a round the project entered and lost", () => {
		// enable-duq: won #45 (disbursing), lost #43 outright. A badge scrape
		// of this page yields both numbers; only #45 is an award.
		const v = parseRoundVerdicts(
			[
				card({
					id: "rec-enable-45",
					status: "Information Collection",
					round: "SCF #45",
					budget: 76000,
				}),
				card({
					id: "rec-enable-43",
					status: "Panel Review Failed",
					round: "SCF #43",
					budget: 100000,
				}),
				'{"awarded":true,"lastAwardedRound":45,"totalAwarded":76000}',
			].join("\n"),
		);
		expect([...v.awarded]).toEqual(["45"]);
		expect([...v.notAwarded]).toEqual(["43"]);
	});

	it("leaves a genuinely unfunded page unfunded", () => {
		const v = parseRoundVerdicts(
			[
				card({
					id: "rec-loser",
					status: "Not Awarded",
					round: "SCF #44",
					budget: 90000,
				}),
				'{"awarded":false,"totalAwarded":0}',
			].join("\n"),
		);
		expect(v.awarded.size).toBe(0);
		expect(v.awardedAnyCount).toBe(0);
		expect([...v.notAwarded]).toEqual(["44"]);
	});
});
