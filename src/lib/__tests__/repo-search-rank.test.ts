import { describe, expect, it } from "vitest";
import { searchRepos } from "../repo-search";

/** F4 (audit root #4): stellarness ranks above raw keyword score. */

const NOW = "2026-07-01T00:00:00Z";

function doc(over: Record<string, unknown>) {
	return {
		fullName: "x/x",
		description: "",
		primaryLanguage: "TypeScript",
		readmeExcerpt: "",
		topics: [],
		lastCommitAt: NOW,
		repoScore: 50,
		stars: 100,
		codeScanState: "unscanned",
		stellarProof: null,
		codeSymbols: [],
		...over,
	};
}

// biome-ignore lint/suspicious/noExplicitAny: mock payload
function mockPayload(docs: any[]): any {
	return { find: async () => ({ docs, totalDocs: docs.length }) };
}

describe("searchRepos F4 ranking", () => {
	it("a code-verified Stellar repo outranks a no-evidence repo with a stronger name hit", async () => {
		const alien = doc({
			// name-token hit (score 5) but ZERO Stellar evidence — the org-swept
			// other-chain repo class from the audit.
			fullName: "evmcorp/nft-marketplace",
			description: "NFT marketplace contracts for EVM chains",
			repoScore: 85,
			stars: 4000,
		});
		const stellar = doc({
			// only a description hit (score 3) but scanned + proven.
			fullName: "smallteam/market",
			description: "An nft marketplace on Soroban",
			codeScanState: "scanned",
			stellarProof: "soroban-sdk",
		});
		const { repos } = await searchRepos(
			mockPayload([alien, stellar]),
			"nft marketplace",
			{ limit: 5 },
		);
		expect(repos[0].fullName).toBe("smallteam/market");
	});

	it("a readme-only Stellar mention still beats zero evidence", async () => {
		const alien = doc({
			fullName: "other/indexer",
			description: "blockchain indexer",
			stars: 9000,
		});
		const viaReadme = doc({
			fullName: "team/chain-indexer",
			description: "an indexer",
			readmeExcerpt: "Indexes Stellar ledgers via Horizon.",
		});
		const { repos } = await searchRepos(
			mockPayload([alien, viaReadme]),
			"indexer",
			{ limit: 5 },
		);
		expect(repos[0].fullName).toBe("team/chain-indexer");
	});

	it("owner is searchable (q=allbridge reaches allbridge-io/*)", async () => {
		const target = doc({
			fullName: "allbridge-io/core-contracts",
			description: "Core bridge contracts on Soroban",
			codeScanState: "scanned",
			stellarProof: "soroban-sdk",
		});
		const other = doc({
			fullName: "someone/bridge-thing",
			description: "a stellar bridge experiment",
		});
		const { repos } = await searchRepos(
			mockPayload([target, other]),
			"allbridge",
			{ limit: 5 },
		);
		expect(repos[0]?.fullName).toBe("allbridge-io/core-contracts");
	});
});
