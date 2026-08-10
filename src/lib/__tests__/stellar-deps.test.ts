/** extractStellarDeps — the dependency-graph leg. Allowlist-only, manifests
 * only, unparseable contributes nothing. */
import { describe, expect, it } from "vitest";
import { extractStellarDeps } from "../stellar-deps";

describe("extractStellarDeps", () => {
	it("collects allowlisted npm deps across dep maps, ignores noise", () => {
		const pkg = JSON.stringify({
			dependencies: {
				"@stellar/stellar-sdk": "^12.0.0",
				"passkey-kit": "0.4.1",
				lodash: "4.17.21",
				react: "18.0.0",
			},
			devDependencies: { "@creit.tech/stellar-wallets-kit": "1.0.0" },
		});
		expect(
			extractStellarDeps([{ path: "package.json", text: pkg }]),
		).toEqual([
			"@creit.tech/stellar-wallets-kit",
			"@stellar/stellar-sdk",
			"passkey-kit",
		]);
	});

	it("collects Cargo deps in all three declaration forms", () => {
		const cargo = `
[package]
name = "my-contract"

[dependencies]
soroban-sdk = { version = "22.0.4" }
sep-41-token.workspace = true
serde = "1.0"

[dependencies.blend-contract-sdk]
version = "2.0"

[dev-dependencies]
soroban-sdk = { features = ["testutils"] }
`;
		expect(
			extractStellarDeps([{ path: "contracts/a/Cargo.toml", text: cargo }]),
		).toEqual(["blend-contract-sdk", "sep-41-token", "soroban-sdk"]);
	});

	it("unparseable package.json and null blobs contribute nothing", () => {
		expect(
			extractStellarDeps([
				{ path: "package.json", text: "{not json" },
				{ path: "Cargo.toml", text: null },
			]),
		).toEqual([]);
	});
});
