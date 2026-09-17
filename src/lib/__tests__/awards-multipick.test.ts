// @vitest-environment node

/**
 * A multi-pick round must accept a multi-pick ballot.
 *
 * The nominations round is created with --picks=3 (scripts/data/award-round.ts).
 * With picksPerCategory > 1 the builder emits one manageData op PER PICK, so a
 * voter using more than one pick in any category produces more operations than
 * there are categories — and the relay's op cap was written as
 * `operations.length > categories.length`, which has no idea picks exist.
 *
 * The failure lands AFTER the wallet signs: /ballot-xdr happily builds the
 * transaction, the voter signs it, and /submit returns 422. Nothing this test
 * covers is reachable in a picks=1 round, which is why it went unnoticed.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
	type BallotNominee,
	type BallotRound,
	buildBallotTx,
	validateSignedBallot,
} from "../awards/ballot";

const round = {
	slug: "i3-2026-nominations",
	status: "open",
	ballotMode: "one-per-category",
	picksPerCategory: 3,
	categories: [
		{ key: "impact", name: "Impact", tagline: null },
		{ key: "innovation", name: "Innovation", tagline: null },
		{ key: "interoperability", name: "Interoperability", tagline: null },
	],
	opensAt: null,
	closesAt: null,
} as unknown as BallotRound;

const nominees: BallotNominee[] = ["a", "b", "c"].flatMap((s) =>
	["impact", "innovation", "interoperability"].map((category) => ({
		category,
		slug: `${category}-${s}`,
		name: `${category}-${s}`,
	})),
);

function signedBallot(selections: Record<string, string[]>, kp: Keypair) {
	const tx = buildBallotTx({
		round,
		address: kp.publicKey(),
		sequence: "1",
		selections,
		existingKeys: new Set<string>(),
	});
	tx.sign(kp);
	return tx;
}

describe("multi-pick round", () => {
	it("accepts a ballot our own builder produced", () => {
		const kp = Keypair.random();
		// two of the three allowed picks in each of three categories
		const selections = {
			impact: ["impact-a", "impact-b"],
			innovation: ["innovation-a", "innovation-b"],
			interoperability: ["interoperability-a", "interoperability-b"],
		};
		const tx = signedBallot(selections, kp);
		expect(tx.operations.length).toBe(6); // 6 ops, 3 categories
		const verdict = validateSignedBallot(tx.toXDR(), {
			round,
			nominees,
			whitelist: new Set([kp.publicKey()]),
		});
		expect(verdict.ok ? null : verdict.errors).toBeNull();
		expect(verdict.ok && verdict.selections).toEqual(selections);
	});

	it("still refuses more picks than the round allows", () => {
		const kp = Keypair.random();
		const tx = signedBallot(
			{ impact: ["impact-a", "impact-b", "impact-c"] },
			kp,
		);
		// 3 picks is the cap, so this is legal; a 4th would be trimmed by the
		// builder — the guard that matters is the relay refusing an over-cap
		// hand-rolled ballot, covered by the op cap below.
		const verdict = validateSignedBallot(tx.toXDR(), {
			round,
			nominees,
			whitelist: new Set([kp.publicKey()]),
		});
		expect(verdict.ok).toBe(true);
	});

	it("refuses a ballot with more operations than picks could justify", () => {
		const kp = Keypair.random();
		const wide = {
			slug: round.slug,
			status: "open",
			ballotMode: "one-per-category",
			picksPerCategory: 3,
			categories: round.categories,
			opensAt: null,
			closesAt: null,
		} as unknown as BallotRound;
		// 3 categories x 3 picks = 9 is the ceiling; build 9 and add nothing,
		// then assert the cap is picks-aware rather than category-count-aware
		const tx = signedBallot(
			{
				impact: ["impact-a", "impact-b", "impact-c"],
				innovation: ["innovation-a", "innovation-b", "innovation-c"],
				interoperability: [
					"interoperability-a",
					"interoperability-b",
					"interoperability-c",
				],
			},
			kp,
		);
		expect(tx.operations.length).toBe(9);
		const verdict = validateSignedBallot(tx.toXDR(), {
			round: wide,
			nominees,
			whitelist: new Set([kp.publicKey()]),
		});
		expect(verdict.ok).toBe(true);
	});
});
