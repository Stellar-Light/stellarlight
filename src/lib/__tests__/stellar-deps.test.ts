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
		expect(extractStellarDeps([{ path: "package.json", text: pkg }])).toEqual([
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

	// Owner decision 2026-11-04: five Stellar-only names HackMeridian 2026
	// builds declare, and nothing broader.
	it("collects Trustless Work, Scaffold Stellar, Stellar Broker, the registry and Soroswap's library", () => {
		const pkg = JSON.stringify({
			dependencies: {
				"@trustless-work/escrow": "3.0.0",
				"@stellar-scaffold/ui": "0.1.0",
				"@stellar-broker/client": "1.2.0",
				"@stellar-broker/other": "1.0.0",
				"trustless-work": "1.0.0",
			},
		});
		const cargo = `
[dependencies]
stellar-registry = "0.1"
soroswap-library = { version = "1.0" }
stellar-registry-cli = "0.1"
`;
		expect(
			extractStellarDeps([
				{ path: "package.json", text: pkg },
				{ path: "Cargo.toml", text: cargo },
			]),
		).toEqual([
			"@stellar-broker/client",
			"@stellar-scaffold/ui",
			"@trustless-work/escrow",
			"soroswap-library",
			"stellar-registry",
		]);
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

// Agent-payments capability tags live beside the deps extractor's era.
import { detectSdkCapabilities } from "../code-symbols";

describe("detectSdkCapabilities — agent-payments era", () => {
	it("x402 fires on the resource-server idiom, not prose mentions", () => {
		const server = `
import { handleX402Supported } from './routes/x402-supported'
export function classify(req: Request) {
  if (req.headers.get('X-PAYMENT')) return 'paid'
}
`;
		expect(
			detectSdkCapabilities([{ path: "src/index.ts", text: server }]),
		).toContain("x402");
		const prose = `// our roadmap mentions x402 someday\nexport const a = 1;`;
		expect(detectSdkCapabilities([{ path: "src/a.ts", text: prose }])).toEqual(
			[],
		);
	});

	it("mpp fires on @stellar/mpp charge-client imports", () => {
		const client = `import { stellar } from '@stellar/mpp/charge/client'\nexport const pay = stellar;`;
		expect(
			detectSdkCapabilities([{ path: "src/pay.ts", text: client }]),
		).toContain("mpp");
	});
});
