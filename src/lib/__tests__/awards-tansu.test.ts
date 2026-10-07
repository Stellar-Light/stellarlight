// @vitest-environment node

/**
 * Tansu anchoring — the pure parts. The project key is keccak256, which is
 * NOT sha3-256 (FIPS padding differs); the known-answer test below is what
 * catches someone "fixing" the import to node:crypto's sha3.
 */

import { keccak_256, sha3_256 } from "@noble/hashes/sha3";
import { contract, Networks } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
	anchorVerdict,
	COMMIT_HASH,
	classifyChainError,
	TANSU_NETWORK_PASSPHRASE,
	tansuProjectKey,
	tansuProjectPageUrl,
	unwrapResult,
} from "../awards/tansu";

const hex = (b: Uint8Array | Buffer) => Buffer.from(b).toString("hex");

describe("tansuProjectKey", () => {
	it("is Keccak-256, not SHA3-256 (published empty-string vectors)", () => {
		expect(hex(keccak_256(""))).toBe(
			"c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
		);
		expect(hex(sha3_256(""))).toBe(
			"a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
		);
	});

	it("pins our project keys (cross-checked on-chain: get_project(key('tansu')).name === 'tansu')", () => {
		expect(hex(tansuProjectKey("stellarlight"))).toBe(
			"fa6a09dfe504e8d7bc26b1d7438a1bd50b88ce4e2fdbdd261ca51a7db7159a40",
		);
		expect(hex(tansuProjectKey("tansu"))).toBe(
			"37ae83c06fde1043724743335ac2f3919307892ee6307cce8c0c63eaa549e156",
		);
		expect(tansuProjectKey()).toHaveLength(32);
	});

	it("refuses names register() would panic on", () => {
		expect(() => tansuProjectKey("stellar-light")).toThrow(/A-Za-z0-9/);
		expect(() => tansuProjectKey("a".repeat(31))).toThrow();
		expect(() => tansuProjectKey("")).toThrow();
	});
});

describe("COMMIT_HASH", () => {
	it("accepts git SHA-1 and SHA-256 object names only", () => {
		expect(COMMIT_HASH.test("bc92939d".padEnd(40, "0"))).toBe(true);
		expect(COMMIT_HASH.test("f".repeat(64))).toBe(true);
		expect(COMMIT_HASH.test("F".repeat(40))).toBe(false);
		expect(COMMIT_HASH.test("a".repeat(39))).toBe(false);
		expect(COMMIT_HASH.test("HEAD")).toBe(false);
	});
});

describe("anchorVerdict", () => {
	const sha = "1".repeat(40);
	it("covers every state exactly once", () => {
		expect(anchorVerdict(sha, sha, "ok")).toEqual({ anchored: true, sha });
		expect(anchorVerdict(null, sha, "ok")).toEqual({
			anchored: false,
			reason: "not-anchored",
		});
		expect(anchorVerdict(sha, "2".repeat(40), "ok")).toEqual({
			anchored: false,
			reason: "superseded",
		});
		expect(anchorVerdict(sha, null, "unregistered")).toEqual({
			anchored: false,
			reason: "not-registered",
		});
		expect(anchorVerdict(sha, null, "error")).toEqual({
			anchored: false,
			reason: "unreadable",
		});
	});

	it("tells the contract saying no from the network failing", () => {
		expect(
			classifyChainError(
				new Error("simulation failed: HostError: Error(Contract, #7)"),
			),
		).toBe("unregistered");
		expect(classifyChainError(new Error("fetch failed: ECONNRESET"))).toBe(
			"error",
		);
	});
});

describe("links", () => {
	it("points at the dApp's project page", () => {
		expect(tansuProjectPageUrl()).toBe(
			"https://tansu.dev/project?name=stellarlight",
		);
	});
});

describe("unwrapResult", () => {
	it("treats the SDK's Err wrapper as 'the contract said no', everything else as a value", () => {
		// What the deployed get_project/get_commit return for an unknown project.
		expect(unwrapResult(new contract.Err({ message: "" }))).toEqual({
			ok: false,
			err: { message: "" },
		});
		expect(unwrapResult(new contract.Ok("7de4027c"))).toEqual({
			ok: true,
			value: "7de4027c",
		});
		expect(unwrapResult({ name: "tansu", maintainers: [] })).toEqual({
			ok: true,
			value: { name: "tansu", maintainers: [] },
		});
		expect(unwrapResult(null)).toEqual({ ok: true, value: null });
	});
});

describe("network", () => {
	it("is TESTNET — everything about the i³ vote is, by the owner's rule", () => {
		expect(TANSU_NETWORK_PASSPHRASE).toBe(Networks.TESTNET);
	});
});
