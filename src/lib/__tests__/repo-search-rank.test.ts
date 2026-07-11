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

/** sls-025: exact aliases/identifiers must not return silent zeros. */
describe("searchRepos sls-025 alias recall", () => {
	const trion = doc({
		fullName: "trionlabs/stellar-8004",
		description: "ERC-8004-style agent registries for Stellar",
	});
	const progax = doc({
		fullName: "progax01/stellar8004",
		description: "independent agent registry",
	});

	it("digit-joined form finds the hyphenated repo and vice versa (q=stellar8004)", async () => {
		const { repos } = await searchRepos(
			mockPayload([trion, progax]),
			"stellar8004",
			{ limit: 5 },
		);
		const names = repos.map((r) => r.fullName);
		expect(names).toContain("trionlabs/stellar-8004");
		expect(names).toContain("progax01/stellar8004");
	});

	it("raw owner segment matches (q=progax01)", async () => {
		const { repos } = await searchRepos(
			mockPayload([trion, progax]),
			"progax01",
			{ limit: 5 },
		);
		expect(repos[0]?.fullName).toBe("progax01/stellar8004");
	});

	it("standards identifier expands to its number (q=ERC-8004)", async () => {
		const { repos } = await searchRepos(
			mockPayload([trion, progax]),
			"ERC-8004",
			{ limit: 5 },
		);
		expect(repos.length).toBeGreaterThan(0);
	});

	it("owner/name full-path lookup resolves via alias identity", async () => {
		const target = doc({
			fullName: "subquery/stellar-subql-starter",
			description: "SubQuery starter project",
		});
		const noise = doc({
			fullName: "someone/indexer-tool",
			description: "a stellar indexer starter",
		});
		const { repos } = await searchRepos(
			mockPayload([target, noise]),
			"subquery/stellar-subql-starter",
			{ limit: 5 },
		);
		expect(repos[0]?.fullName).toBe("subquery/stellar-subql-starter");
	});

	it("hyphenated name lookup matches separator-insensitively (q=smart-account-kit)", async () => {
		const target = doc({
			fullName: "kalepail/smart-account-kit",
			description: "smart account tooling",
		});
		const { repos } = await searchRepos(
			mockPayload([target]),
			"smart-account-kit",
			{
				limit: 5,
			},
		);
		expect(repos[0]?.fullName).toBe("kalepail/smart-account-kit");
	});

	it("zero results still report what WAS searched (honest empty)", async () => {
		const { repos, searched } = await searchRepos(
			mockPayload([]),
			"erc-8004 registry",
			{ limit: 5 },
		);
		expect(repos).toHaveLength(0);
		expect(searched.tokens).toContain("erc-8004");
		expect(searched.expandedTerms).toContain("erc8004");
		expect(searched.expandedTerms).toContain("8004");
	});
});
