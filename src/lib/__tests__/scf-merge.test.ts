import { describe, expect, it } from "vitest";
import { fillScfFromDupe, type ScfRecord } from "../scf-merge";

/** The shadow row `lul` after the 2026-09-08 lul→lulpay merge: its SCF page
 * (communityfund.stellar.org/project/lul-serving-the-unbanked-ckz, read
 * 2026-09-14) verdicts SCF #38 Awarded $37,500 Build and SCF #29 Awarded
 * $20,500 "Legacy v5.0 Activation Award" — $58,000, the row's stored total. */
const SHADOW: ScfRecord = {
	awarded: true,
	lastAwardedRound: 38,
	slug: "lul-serving-the-unbanked-ckz",
	totalAwarded: 58000,
	awardedRounds: [29, 38],
	roundAwards: [
		{
			round: 38,
			awardName: null,
			amountUSD: 37500,
			awardType: "Build",
			id: "row-id-on-the-shadow-doc",
		},
		{
			round: 29,
			awardName: null,
			amountUSD: 20500,
			awardType: "Legacy v5.0 Activation Award",
			id: "row-id-2",
		},
	],
	basis: "official-record",
	asOf: "2026-09-06",
	sourceUrl:
		"https://communityfund.stellar.org/project/lul-serving-the-unbanked-ckz",
};

describe("copyScf absorbs the SCF record whole", () => {
	it("completes the canonical the three-field copy left stranded (lulpay)", () => {
		// exactly what /api/projects/search?q=lulpay served on 2026-09-14
		const canonical: ScfRecord = {
			awarded: true,
			totalAwarded: 58000,
			awardedRounds: [29, 38],
		};
		const moved = fillScfFromDupe(canonical, SHADOW);
		expect(moved).not.toBeNull();
		// the residual the completeness sweep reported: rounds, no round records
		expect(moved?.scf.roundAwards).toEqual([
			{ round: 38, awardName: null, amountUSD: 37500, awardType: "Build" },
			{
				round: 29,
				awardName: null,
				amountUSD: 20500,
				awardType: "Legacy v5.0 Activation Award",
			},
		]);
		// …and the award stops being uncitable
		expect(moved?.scf.sourceUrl).toBe(
			"https://communityfund.stellar.org/project/lul-serving-the-unbanked-ckz",
		);
		expect(moved?.scf.basis).toBe("official-record");
		// facts the canonical already holds are never rewritten
		expect(moved?.scf.totalAwarded).toBe(58000);
		expect(moved?.filled).not.toContain("totalAwarded");
	});

	it("moves every field of the record, so a new one cannot be stranded", () => {
		const moved = fillScfFromDupe({}, SHADOW);
		for (const key of Object.keys(SHADOW)) {
			expect(moved?.scf[key as keyof ScfRecord]).toBeTruthy();
		}
		// array-row ids belong to the shadow's document, not the canonical's
		expect(moved?.scf.roundAwards?.[0]).not.toHaveProperty("id");
	});

	it("never overwrites the canonical's own award or citation", () => {
		const own: ScfRecord = {
			awarded: true,
			slug: "usdc-swap-stellar-cctp-bridge-yv8",
			totalAwarded: 50000,
			awardedRounds: [26],
			roundAwards: [{ round: 26, amountUSD: 50000, awardType: "Build" }],
			basis: "human-verified",
		};
		// citation is atomic: a row with its own page keeps it, and does not
		// borrow the shadow's sourceUrl/asOf for its own awards
		const moved = fillScfFromDupe(own, SHADOW);
		expect(moved).toBeNull();
	});
});
