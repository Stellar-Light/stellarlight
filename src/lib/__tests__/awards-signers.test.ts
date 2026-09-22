// @vitest-environment node

/**
 * Who is allowed to sign a ballot, and in what envelope.
 *
 * Both of these started as availability bugs — a real Pilot turning up on the
 * day and being refused — but the fix touches signature verification, so the
 * refusals matter at least as much as the permits and are pinned here too.
 */
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
	type BallotNominee,
	type BallotRound,
	ballotSourceOf,
	buildBallotTx,
	validateSignedBallot,
} from "../awards/ballot";
import { AWARDS_NETWORK_PASSPHRASE } from "../awards/stellar";

const round = {
	slug: "i3-2026-test",
	status: "open",
	ballotMode: "one-per-category",
	picksPerCategory: 1,
	categories: [
		{ key: "impact", name: "Impact", tagline: null },
		{ key: "innovation", name: "Innovation", tagline: null },
	],
	opensAt: null,
	closesAt: null,
} as unknown as BallotRound;

const nominees: BallotNominee[] = [
	{ category: "impact", slug: "decaf", name: "Decaf" },
	{ category: "innovation", slug: "blend", name: "Blend" },
];
const selections = { impact: ["decaf"], innovation: ["blend"] };

const voter = Keypair.random();
const whitelist = new Set([voter.publicKey()]);

function unsigned() {
	return buildBallotTx({
		round,
		address: voter.publicKey(),
		sequence: "1",
		selections,
		existingKeys: new Set<string>(),
	});
}

describe("fee-bumped ballots", () => {
	it("accepts one, crediting the inner source and not the fee payer", () => {
		// some wallet kits return a fee-bump when sponsorship is on; who paid
		// has no bearing on whether the ballot is valid
		const inner = unsigned();
		inner.sign(voter);
		const payer = Keypair.random();
		const bumped = TransactionBuilder.buildFeeBumpTransaction(
			payer,
			"100000",
			inner,
			AWARDS_NETWORK_PASSPHRASE,
		);
		bumped.sign(payer);

		const verdict = validateSignedBallot(bumped.toXDR(), {
			round,
			nominees,
			whitelist,
		});
		expect(verdict.ok ? null : verdict.errors).toBeNull();
		expect(verdict.ok && verdict.source).toBe(voter.publicKey());
		expect(ballotSourceOf(bumped.toXDR())).toBe(voter.publicKey());
	});

	it("still refuses one whose inner source is not a whitelisted voter", () => {
		const stranger = Keypair.random();
		const inner = buildBallotTx({
			round,
			address: stranger.publicKey(),
			sequence: "1",
			selections,
			existingKeys: new Set<string>(),
		});
		inner.sign(stranger);
		const bumped = TransactionBuilder.buildFeeBumpTransaction(
			stranger,
			"100000",
			inner,
			AWARDS_NETWORK_PASSPHRASE,
		);
		bumped.sign(stranger);
		const verdict = validateSignedBallot(bumped.toXDR(), {
			round,
			nominees,
			whitelist,
		});
		expect(verdict.ok).toBe(false);
	});

	it("refuses one the voter never signed, however it is wrapped", () => {
		// the fee payer signing the WRAPPER is not the voter signing the ballot
		const inner = unsigned();
		const payer = Keypair.random();
		const bumped = TransactionBuilder.buildFeeBumpTransaction(
			payer,
			"100000",
			inner,
			AWARDS_NETWORK_PASSPHRASE,
		);
		bumped.sign(payer);
		const verdict = validateSignedBallot(bumped.toXDR(), {
			round,
			nominees,
			whitelist,
		});
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.errors.join(" ")).toMatch(/not signed/);
	});
});

describe("delegated and multisig accounts", () => {
	const delegate = Keypair.random();

	function signedByDelegate() {
		const tx = unsigned();
		tx.sign(delegate);
		return tx.toXDR();
	}

	it("accepts a signer the account actually lists", () => {
		const verdict = validateSignedBallot(signedByDelegate(), {
			round,
			nominees,
			whitelist,
			signers: [delegate.publicKey()],
		});
		expect(verdict.ok ? null : verdict.errors).toBeNull();
		// the BALLOT still belongs to the account, not to whoever signed it
		expect(verdict.ok && verdict.source).toBe(voter.publicKey());
	});

	it("refuses that same ballot when the signer set is unknown", () => {
		// no signer set supplied → master key only, the old behaviour
		const verdict = validateSignedBallot(signedByDelegate(), {
			round,
			nominees,
			whitelist,
		});
		expect(verdict.ok).toBe(false);
	});

	it("refuses a key the account does not list", () => {
		// the security property: widening to the signer set must not widen to
		// anyone at all
		const impostor = Keypair.random();
		const tx = unsigned();
		tx.sign(impostor);
		const verdict = validateSignedBallot(tx.toXDR(), {
			round,
			nominees,
			whitelist,
			signers: [delegate.publicKey()],
		});
		expect(verdict.ok).toBe(false);
	});

	it("still accepts the master key when it is among the signers", () => {
		const tx = unsigned();
		tx.sign(voter);
		const verdict = validateSignedBallot(tx.toXDR(), {
			round,
			nominees,
			whitelist,
			signers: [voter.publicKey(), delegate.publicKey()],
		});
		expect(verdict.ok).toBe(true);
	});

	it("ignores a malformed key in the signer set rather than throwing", () => {
		const tx = unsigned();
		tx.sign(voter);
		const verdict = validateSignedBallot(tx.toXDR(), {
			round,
			nominees,
			whitelist,
			signers: ["not-a-key", voter.publicKey()],
		});
		expect(verdict.ok).toBe(true);
	});
});
