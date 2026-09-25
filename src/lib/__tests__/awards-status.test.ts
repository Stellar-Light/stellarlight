// @vitest-environment node

/**
 * The signed status check: the owner's signature over "this round" lets the
 * server tell them, and only them, whether they voted. A ballot authorization
 * must not pass as a check and a check must not pass as a ballot.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
	buildAuthorizationTx,
	buildStatusTx,
	verifyAuthorization,
	verifyStatusCheck,
} from "../awards/ballot";

const voter = Keypair.random();
const stranger = Keypair.random();
const round = {
	slug: "i3-2026-nominations",
	title: "t",
	status: "open",
	ballotMode: "one-per-category",
	picksPerCategory: 4,
	categories: [{ key: "impact", name: "Impact" }],
	opensAt: null,
	closesAt: null,
	testMode: false,
	// biome-ignore lint/suspicious/noExplicitAny: test fixture
} as any;
const whitelist = new Set([voter.publicKey()]);
const sign = (kp: Keypair, tx: ReturnType<typeof buildStatusTx>) => {
	tx.sign(kp);
	return tx.toXDR();
};

describe("signed status check", () => {
	it("verifies the owner's signature for a funded and an unfunded account", () => {
		for (const sequence of ["12345", null]) {
			const xdr = sign(
				voter,
				buildStatusTx({ round, address: voter.publicKey(), sequence }),
			);
			expect(verifyStatusCheck(xdr, { round, whitelist, sequence })).toEqual({
				ok: true,
				source: voter.publicKey(),
			});
		}
	});

	it("rejects a stranger's signature and a non-whitelisted source", () => {
		const forged = sign(
			stranger,
			buildStatusTx({ round, address: voter.publicKey(), sequence: null }),
		);
		const v = verifyStatusCheck(forged, { round, whitelist, sequence: null });
		expect(v.ok).toBe(false);
		const outsider = sign(
			stranger,
			buildStatusTx({ round, address: stranger.publicKey(), sequence: null }),
		);
		expect(
			verifyStatusCheck(outsider, { round, whitelist, sequence: null }).ok,
		).toBe(false);
	});

	it("expires after ten minutes", () => {
		const built = buildStatusTx({
			round,
			address: voter.publicKey(),
			sequence: null,
			now: new Date("2026-09-25T10:00:00Z"),
		});
		const xdr = sign(voter, built);
		expect(
			verifyStatusCheck(xdr, {
				round,
				whitelist,
				sequence: null,
				now: new Date("2026-09-25T10:11:00Z"),
			}).ok,
		).toBe(false);
	});

	it("a check is not a ballot and a ballot is not a check", () => {
		const selections = { impact: ["a", "b", "c", "d"] };
		const check = sign(
			voter,
			buildStatusTx({ round, address: voter.publicKey(), sequence: null }),
		);
		expect(
			verifyAuthorization(check, {
				round,
				whitelist,
				selections,
				sequence: null,
			}).ok,
		).toBe(false);
		const ballot = sign(
			voter,
			buildAuthorizationTx({
				round,
				address: voter.publicKey(),
				sequence: null,
				selections,
			}),
		);
		expect(
			verifyStatusCheck(ballot, { round, whitelist, sequence: null }).ok,
		).toBe(false);
		expect(
			verifyAuthorization(ballot, {
				round,
				whitelist,
				selections,
				sequence: null,
			}).ok,
		).toBe(true);
	});
});
