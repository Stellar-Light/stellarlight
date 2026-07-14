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

	// sls-047: "scanned" alone is not Stellar proof. The live defect: noir-lang/
	// noir (scanned, stellarProof "none", topic hit "zero-knowledge", repoScore
	// 60) ranked #1 for q=zero-knowledge above deployable cargo-sdk Stellar
	// repos — the tier-2 check read `codeVerified !== null`, and a proof-"none"
	// scan still serializes a codeVerified object.
	it("a scanned repo with stellarProof 'none' does NOT outrank code-proven Stellar repos", async () => {
		const toolchain = doc({
			fullName: "noir-lang/noir",
			description: "The universal language of zero-knowledge",
			topics: ["zero-knowledge"],
			codeScanState: "scanned",
			stellarProof: "none",
			repoScore: 60,
			stars: 5000,
		});
		const stellarZk = doc({
			fullName: "team/zk-verifier-soroban",
			description: "zero-knowledge proof verifier contract",
			codeScanState: "scanned",
			stellarProof: "cargo-sdk",
			isDeployableContract: true,
			repoScore: 40,
			stars: 10,
		});
		const { repos } = await searchRepos(
			mockPayload([toolchain, stellarZk]),
			"zero-knowledge",
			{ limit: 5 },
		);
		expect(repos[0]?.fullName).toBe("team/zk-verifier-soroban");
		// transparency: the toolchain is still returned, but labeled.
		const noir = repos.find((r) => r.fullName === "noir-lang/noir");
		expect(noir?.stellarEvidence).toBe("none");
		expect(repos[0]?.stellarEvidence).toBe("code-verified");
	});

	// sls-046: known platform/SDK/tooling repos are pinned NOT-deployable at
	// serving time even when the stored scan row says otherwise (their cdylib
	// crates are runtime/fixtures, not a deployable contract product).
	it("pins isDeployableContract false for known infra repos, leaves real contracts alone", async () => {
		const core = doc({
			fullName: "stellar/stellar-core",
			description:
				"stellar-core is the reference implementation for the peer-to-peer agent that manages the Stellar network",
			codeScanState: "scanned",
			stellarProof: "cargo-sdk",
			isDeployableContract: true,
			repoScore: 90,
		});
		const realContract = doc({
			fullName: "soroswap/core",
			description: "Core smart contracts of the Soroswap.Finance protocol",
			codeScanState: "scanned",
			stellarProof: "cargo-sdk",
			isDeployableContract: true,
			repoScore: 80,
		});
		const { repos } = await searchRepos(
			mockPayload([core, realContract]),
			"core",
			{ limit: 5 },
		);
		const coreRow = repos.find((r) => r.fullName === "stellar/stellar-core");
		const contractRow = repos.find((r) => r.fullName === "soroswap/core");
		expect(coreRow?.codeVerified?.isDeployableContract).toBe(false);
		expect(contractRow?.codeVerified?.isDeployableContract).toBe(true);
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

describe("streaming-payments vertical flagships (golden repos-streaming-payments)", () => {
	it("floats the thin-description streaming repos above generic payment repos", async () => {
		// Live shape 2026-07-14: fluxity-v1-core's description is "Soroban
		// contract V1" and sstream's is empty — neither carries a
		// streaming/payments token, so generic x402/MPP repos filled the page.
		const flagship = doc({
			fullName: "luanlabs/fluxity-v1-core",
			description: "Soroban contract V1",
			repoScore: 47,
		});
		const generic = doc({
			fullName: "big/generic-payments",
			description: "payments platform on Stellar with streaming access",
			repoScore: 85,
			stars: 900,
		});
		const { repos } = await searchRepos(
			mockPayload([generic, flagship]),
			"streaming payments",
			{ limit: 5 },
		);
		expect(repos[0]?.fullName).toBe("luanlabs/fluxity-v1-core");
		expect(repos[0]?.stellarEvidence).toBe("curated");
	});

	it("fires on the vertical's word orders, not on unrelated payment queries", async () => {
		const flagship = doc({
			fullName: "rahimklaber/sstream",
			description: "",
			repoScore: 46,
		});
		const other = doc({
			fullName: "x/x402-market",
			description: "x402 payments marketplace on Stellar",
			repoScore: 80,
		});
		for (const q of [
			"payment streaming",
			"token streaming",
			"money streaming",
		]) {
			const { repos } = await searchRepos(mockPayload([other, flagship]), q, {
				limit: 5,
			});
			expect(repos[0]?.fullName, `query: ${q}`).toBe("rahimklaber/sstream");
		}
		// A plain payments query must NOT float the streaming vertical.
		const { repos } = await searchRepos(
			mockPayload([other, flagship]),
			"payments",
			{
				limit: 5,
			},
		);
		expect(repos[0]?.fullName).toBe("x/x402-market");
	});
});
