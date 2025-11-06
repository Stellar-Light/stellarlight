import { describe, it, expect } from "vitest";
import { mapLumenloopEntry, extractEntryId } from "../lumenloop-mapper";

describe("lumenloop-mapper", () => {
	const sampleEntry1 = {
		name: "Stellar Wallet",
		description: "A secure wallet for Stellar assets",
		category: "Infrastructure",
		types: ["Wallet", "SDK"],
		status: "Live",
		links: {
			website: "https://stellarwallet.com",
			github: "https://github.com/stellar/wallet",
		},
		onchain: {
			assetCode: "XLM",
			issuer: "GDQERENWDDSQZSZX",
		},
	};

	const sampleEntry2 = {
		title: "Anchor Service",
		summary: "Payment anchor for XLM",
		type: "Anchor",
		tags: ["Anchor", "Payment Rail"],
		stage: "Pre-Release",
		urls: {
			homepage: "http://www.anchor.example",
		},
	};

	const sampleEntry3 = {
		name: "DEX Protocol",
		description: "Decentralized exchange",
		category: "Protocol/Contract",
		status: "Development",
		links: {
			website: "https://www.dex.stellar",
		},
		onchain: {
			contracts: ["CAAA...", "CBBB..."],
		},
	};

	describe("mapLumenloopEntry", () => {
		it("should map a complete entry correctly", () => {
			const mapped = mapLumenloopEntry(sampleEntry1, "stellar-wallet");

			expect(mapped.name).toBe("Stellar Wallet");
			expect(mapped.shortDescription).toBe(
				"A secure wallet for Stellar assets",
			);
			expect(mapped.category).toBe("Infrastructure");
			expect(mapped.types).toContain("Wallet");
			expect(mapped.types).toContain("SDK");
			expect(mapped.status).toBe("Live");
			expect(mapped.links?.website).toBeTruthy();
			expect(mapped.links?.github).toBeTruthy();
			expect(mapped.onchain?.assetCode).toBe("XLM");
			expect(mapped.onchain?.issuer).toBe("GDQERENWDDSQZSZX");
			expect(mapped.provenance?.source).toBe("LumenloopSeed");
			expect(mapped.provenance?.sourceId).toBe("stellar-wallet");
		});

		it("should handle alternative field names", () => {
			const mapped = mapLumenloopEntry(sampleEntry2, "anchor-service");

			expect(mapped.name).toBe("Anchor Service");
			expect(mapped.shortDescription).toBe("Payment anchor for XLM");
			expect(mapped.category).toBe("Anchor");
			expect(mapped.types).toContain("Anchor");
			expect(mapped.types).toContain("Payment Rail");
			expect(mapped.status).toBe("Pre-Release");
			expect(mapped.links?.website).toBeTruthy();
		});

		it("should map contracts array correctly", () => {
			const mapped = mapLumenloopEntry(sampleEntry3, "dex-protocol");

			expect(mapped.onchain?.contracts).toBeDefined();
			expect(Array.isArray(mapped.onchain?.contracts)).toBe(true);
			if (mapped.onchain?.contracts) {
				expect(mapped.onchain.contracts.length).toBe(2);
				expect(mapped.onchain.contracts[0].address).toBe("CAAA...");
			}
		});

		it("should set default values when fields are missing", () => {
			const minimalEntry = { name: "Minimal Project" };
			const mapped = mapLumenloopEntry(minimalEntry, "minimal");

			expect(mapped.name).toBe("Minimal Project");
			expect(mapped.verificationLevel).toBe("Unverified");
			expect(mapped.provenance?.source).toBe("LumenloopSeed");
			expect(mapped.status).toBe("Development"); // default
			expect(mapped.category).toBe("Infrastructure"); // default
		});
	});

	describe("extractEntryId", () => {
		it("should extract domain from website URL", () => {
			const id = extractEntryId(
				{
					links: { website: "https://www.example.com/path" },
				},
				0,
			);
			expect(id).toBe("example.com");
		});

		it("should fallback to slug from name when no website", () => {
			const id = extractEntryId({ name: "My Awesome Project" }, 0);
			expect(id).toBe("my-awesome-project");
		});

		it("should handle index fallback for unnamed entries", () => {
			const id = extractEntryId({}, 42);
			expect(id).toBe("entry-42");
		});
	});
});
