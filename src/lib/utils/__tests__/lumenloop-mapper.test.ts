import { describe, expect, it } from "vitest";
import {
	extractEntryId,
	type LumenloopEntry,
	mapLumenloopEntry,
} from "../lumenloop-mapper";

describe("lumenloop-mapper", () => {
	// Matches the actual YAML schema from stellar-ecosystem-db
	const sampleEntry1: LumenloopEntry = {
		title: "Stellar Wallet",
		parent: "Stellar Dev Co",
		description: "A secure wallet for Stellar assets",
		links: {
			website: ["stellarwallet.com"],
			github: ["github.com/stellar/wallet"],
			x: ["stellarwallet"],
			discord: ["discord.gg/abc123"],
		},
		attributes: {
			category: "Applications",
			tags: ["Wallet", "SDK"],
		},
	};

	const sampleEntry2: LumenloopEntry = {
		title: "Anchor Service",
		description: "Payment anchor for XLM",
		attributes: {
			category: "Infrastructure & Services",
			tags: ["Anchor", "Payments"],
		},
		links: {
			website: ["anchor.example.com"],
		},
	};

	const sampleEntry3: LumenloopEntry = {
		title: "DEX Protocol",
		parent: "Some Labs",
		description: "Decentralized exchange",
		attributes: {
			category: "Financial Protocols",
			tags: ["DEX"],
		},
		links: {
			website: ["dex.stellar.com"],
			github: ["github.com/somelabs/dex-protocol"],
		},
		mainnet: {
			contracts: ["CAAA...", "CBBB..."],
		},
	};

	describe("mapLumenloopEntry", () => {
		it("should map a complete entry correctly", () => {
			const { project, parentEntity, githubRepos } = mapLumenloopEntry(
				sampleEntry1,
				"stellar-wallet",
			);

			expect(project.name).toBe("Stellar Wallet");
			expect(project.shortDescription).toBe(
				"A secure wallet for Stellar assets",
			);
			expect(project.category).toBe("User-Facing App"); // "Applications" → "User-Facing App"
			expect(project.types).toContain("Wallet");
			expect(project.types).toContain("SDK");
			expect(project.status).toBe("Live");
			expect(project.links?.website).toBe("https://stellarwallet.com");
			expect(project.links?.github).toBe("https://github.com/stellar/wallet");
			expect(project.links?.twitter).toBe("https://x.com/stellarwallet");
			expect(project.links?.discord).toBe("https://discord.gg/abc123");
			expect(project.provenance?.source).toBe("LumenloopSeed");
			expect(project.provenance?.sourceId).toBe("stellar-wallet");
			expect(parentEntity).toBe("Stellar Dev Co");
			expect(githubRepos).toEqual([{ owner: "stellar", name: "wallet" }]);
		});

		it("should map github repos to github.repos array", () => {
			const { project } = mapLumenloopEntry(sampleEntry1, "stellar-wallet");

			expect(project.github?.repos).toEqual([
				{ owner: "stellar", name: "wallet" },
			]);
		});

		it("should handle Infrastructure & Services category", () => {
			const { project, parentEntity } = mapLumenloopEntry(
				sampleEntry2,
				"anchor-service",
			);

			expect(project.name).toBe("Anchor Service");
			expect(project.shortDescription).toBe("Payment anchor for XLM");
			expect(project.category).toBe("Infrastructure");
			expect(project.types).toContain("Anchor");
			expect(project.types).toContain("Payments"); // "Payments" → "Payments"
			expect(project.links?.website).toBe("https://anchor.example.com");
			expect(parentEntity).toBeNull();
		});

		it("should map contracts array correctly", () => {
			const { project } = mapLumenloopEntry(sampleEntry3, "dex-protocol");

			expect(project.onchain?.contracts).toBeDefined();
			expect(Array.isArray(project.onchain?.contracts)).toBe(true);
			if (project.onchain?.contracts) {
				expect(project.onchain.contracts.length).toBe(2);
				expect(project.onchain.contracts[0].address).toBe("CAAA...");
			}
		});

		it("should extract parent entity name", () => {
			const { parentEntity } = mapLumenloopEntry(sampleEntry3, "dex-protocol");
			expect(parentEntity).toBe("Some Labs");
		});

		it("should set default values when fields are missing", () => {
			const minimalEntry: LumenloopEntry = { title: "Minimal Project" };
			const { project } = mapLumenloopEntry(minimalEntry, "minimal");

			expect(project.name).toBe("Minimal Project");
			expect(project.verificationLevel).toBe("Unverified");
			expect(project.provenance?.source).toBe("LumenloopSeed");
			expect(project.status).toBe("Live"); // lumenloop entries default to Live
			expect(project.category).toBe("Infrastructure"); // null category defaults
		});

		it("should handle Financial Protocols category", () => {
			const { project } = mapLumenloopEntry(sampleEntry3, "dex-protocol");
			expect(project.category).toBe("Protocol/Contract");
			expect(project.types).toContain("DEX");
		});

		it("should extract multiple GitHub repos", () => {
			const entry: LumenloopEntry = {
				title: "Multi Repo",
				links: {
					github: ["github.com/org/repo1", "github.com/org/repo2"],
				},
			};
			const { githubRepos, project } = mapLumenloopEntry(entry, "multi-repo");
			expect(githubRepos).toEqual([
				{ owner: "org", name: "repo1" },
				{ owner: "org", name: "repo2" },
			]);
			expect(project.github?.orgLogin).toBe("org");
		});
	});

	describe("extractEntryId", () => {
		it("should create slug from title", () => {
			const id = extractEntryId({ title: "My Awesome Project" });
			expect(id).toBe("my-awesome-project");
		});

		it("should handle missing title", () => {
			const id = extractEntryId({});
			expect(id).toBe("unknown");
		});

		it("should handle special characters", () => {
			const id = extractEntryId({ title: "Protocol/Contract (v2)" });
			expect(id).toBe("protocolcontract-v2");
		});
	});
});
