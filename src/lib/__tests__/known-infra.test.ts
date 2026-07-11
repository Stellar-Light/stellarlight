import { describe, expect, it } from "vitest";
import { isKnownInfraNotDeployable } from "../known-infra";

/** sls-046 negative fixtures: core protocol / RPC / SDK / tooling repos must
 * never classify as deployable Soroban contracts, while repos whose product
 * IS deployable contract code stay untouched. */
describe("isKnownInfraNotDeployable", () => {
	it("pins core protocol, RPC, SDK and tooling repos", () => {
		for (const full of [
			"stellar/stellar-core",
			"stellar/rs-soroban-env",
			"stellar/rs-soroban-sdk",
			"stellar/stellar-cli",
			"stellar/stellar-rpc",
			"stellar/soroban-rpc",
			"stellar/go",
			"stellar/js-stellar-sdk",
			"stellar/quickstart",
			"stellar/anchor-platform",
		]) {
			expect(isKnownInfraNotDeployable(full), full).toBe(true);
		}
	});

	it("is case-insensitive (GitHub owner/name casing varies)", () => {
		expect(isKnownInfraNotDeployable("Stellar/Stellar-Core")).toBe(true);
	});

	it("leaves real contract repos and example suites alone", () => {
		for (const full of [
			"soroswap/core",
			"blend-capital/blend-contracts-v2",
			"reflector-network/reflector-contract",
			// deployable example contracts are genuinely deployable — the pin is
			// for repos whose PRODUCT is the platform/SDK, not the contracts.
			"stellar/soroban-examples",
		]) {
			expect(isKnownInfraNotDeployable(full), full).toBe(false);
		}
	});
});
