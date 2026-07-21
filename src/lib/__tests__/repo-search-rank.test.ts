import { describe, expect, it } from "vitest";
import { flagshipsFor, searchRepos } from "../repo-search";

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

describe("staleness vs org authority (2026-07-19 answer-key eval)", () => {
	it("a live flagship outranks a 4-year-dead SDF MVP at equal relevance", async () => {
		const deadSdfMvp = doc({
			// The moneygram-access-wallet-mvp class: SDF-org, name-token hit,
			// last commit 49 months ago.
			fullName: "stellar/payments-access-mvp",
			description: "MVP demo",
			lastCommitAt: "2022-06-24T00:00:00Z",
			stellarProof: "soroban-sdk",
			codeScanState: "scanned",
		});
		const liveFlagship = doc({
			fullName: "kalepail/payments-kit",
			description: "kit",
			lastCommitAt: "2026-06-13T00:00:00Z",
			stellarProof: "soroban-sdk",
			codeScanState: "scanned",
		});
		const { repos } = await searchRepos(
			mockPayload([deadSdfMvp, liveFlagship]),
			"payments",
			{ limit: 5 },
		);
		expect(repos[0].fullName).toBe("kalepail/payments-kit");
	});

	it("unknown lastCommitAt is NOT treated as dead", async () => {
		const unknownAge = doc({
			fullName: "team/unknown-age",
			description: "a payments tool on Soroban",
			lastCommitAt: null,
			stellarProof: "soroban-sdk",
			codeScanState: "scanned",
		});
		const stale = doc({
			fullName: "team/old-thing",
			description: "a payments tool on Soroban",
			lastCommitAt: "2021-01-01T00:00:00Z",
			stellarProof: "soroban-sdk",
			codeScanState: "scanned",
		});
		const { repos } = await searchRepos(
			mockPayload([stale, unknownAge]),
			"payments",
			{ limit: 5 },
		);
		expect(repos[0].fullName).toBe("team/unknown-age");
	});
});

describe("vertical flagships — wallet + anchor (2026-07-19 answer-key eval)", () => {
	it("q=wallet floats the verified flagship wallets", () => {
		const f = flagshipsFor("wallet");
		expect(f).toContain("stellar/freighter");
		expect(f).toContain("creit-tech/xbull-wallet");
		expect(f).toContain("kalepail/passkey-kit");
	});
	it("smart wallet queries hit the wallet vertical too", () => {
		expect(flagshipsFor("smart wallet passkeys")).toContain(
			"kalepail/passkey-kit",
		);
	});
	it("q=anchor floats the open anchor tooling (operators are closed-source)", () => {
		const f = flagshipsFor("anchor integration");
		expect(f).toContain("stellar/anchor-platform");
		expect(f).toContain("stellar/stellar-anchor-tests");
	});
	it("off-vertical queries stay untouched", () => {
		expect(flagshipsFor("zk proofs")).toEqual([]);
	});

	// Query-aware order within the float (2026-07-21 persona battery): the
	// curated order is the default for the bare vertical noun, but a query
	// naming a specific flagship's own identity puts that flagship first.
	it("bare vertical noun keeps the curated order (freighter leads)", () => {
		expect(flagshipsFor("wallet")[0]).toBe("stellar/freighter");
	});
	it("a query naming a flagship's identity floats that flagship first", () => {
		expect(flagshipsFor("passkey smart wallet kit")[0]).toBe(
			"kalepail/passkey-kit",
		);
		expect(flagshipsFor("xbull wallet")[0]).toBe("creit-tech/xbull-wallet");
	});
	it("identity tokens absent → curated order holds on the tie", () => {
		expect(flagshipsFor("anchor integration")[0]).toBe(
			"stellar/anchor-platform",
		);
	});
});

// ── Mention-vs-identity (#590/#592 port) ────────────────────────────────
// A repo whose prose merely MENTIONS the anchor noun (plus a secondary
// token and the ×1.3 coverage multiplier) must not outrank the repo that
// IS the thing — within the same stellarness tier, never across tiers.
describe("mention-vs-identity ranking", () => {
	const scanned = {
		codeScanState: "scanned",
		stellarProof: "cargo-sdk",
	};

	it("identity beats a two-token mentioner at equal stellarness", async () => {
		// mentioner: desc mention past char 60 + "staking" → 3+3=6×1.3=7.8
		// identity holder: name hit only → 5. Pre-port the mentioner won.
		const docs = [
			doc({
				fullName: "team/yield-vault",
				description:
					"Automated vault strategies turning any token held in qualified custody into staking assets",
				...scanned,
			}),
			doc({ fullName: "team/custody-kit", ...scanned }),
		];
		const { repos } = await searchRepos(mockPayload(docs), "custody staking", {
			limit: 5,
		});
		expect(repos[0].fullName).toBe("team/custody-kit");
	});

	it("identity does NOT override stellarness (F4 contract)", async () => {
		const docs = [
			doc({ fullName: "evmcorp/custody-kit" }), // name identity, NO evidence
			doc({
				fullName: "stellarteam/vault",
				description: "Custody infrastructure for Stellar asset issuers",
				...scanned,
			}),
		];
		const { repos } = await searchRepos(mockPayload(docs), "custody", {
			limit: 5,
		});
		expect(repos[0].fullName).toBe("stellarteam/vault");
	});

	it("description LEAD is identity; the same term past char 60 is not", async () => {
		const docs = [
			doc({
				fullName: "team/generic-a",
				description:
					"A broad multi-purpose asset toolkit for many chains that also supports escrow flows for marketplaces",
				stars: 500,
				...scanned,
			}),
			doc({
				fullName: "team/generic-b",
				description: "Escrow contracts for Soroban with milestone release",
				...scanned,
			}),
		];
		const { repos } = await searchRepos(mockPayload(docs), "escrow", {
			limit: 5,
		});
		expect(repos[0].fullName).toBe("team/generic-b");
	});

	it("negation guard: non-custodial lead is not custodial identity", async () => {
		// The hyphen is a word boundary, so \bcustodial\b matches inside
		// "non-custodial" — the guard must reject that as identity while the
		// term still scores as a plain match.
		const docs = [
			doc({
				fullName: "team/dex-app",
				description: "Non-custodial swap interface for traders",
				stars: 999,
				...scanned,
			}),
			doc({
				fullName: "team/vault-b",
				description: "Custodial vault for institutions",
				...scanned,
			}),
		];
		const { repos } = await searchRepos(mockPayload(docs), "custodial", {
			limit: 5,
		});
		expect(repos[0].fullName).toBe("team/vault-b");
	});

	it("all-generic query: rule off, ordering falls through unchanged", async () => {
		const docs = [
			doc({
				fullName: "team/alpha",
				description: "Payments app for merchants",
				repoScore: 90,
				...scanned,
			}),
			doc({
				fullName: "team/beta",
				description: "Payments app for consumers",
				repoScore: 40,
				...scanned,
			}),
		];
		// "app" is generic → no anchors → identity rule off; equal score, so
		// the pre-port tiebreak (repoScore) must still decide.
		const { repos } = await searchRepos(mockPayload(docs), "app", { limit: 5 });
		expect(repos[0].fullName).toBe("team/alpha");
	});

	it("a pub symbol named for the term counts as identity", async () => {
		const docs = [
			doc({
				fullName: "team/contract-lib",
				description:
					"General Soroban contract utilities for many application patterns including payment escrow helpers",
				stars: 800,
				...scanned,
			}),
			doc({
				fullName: "team/milestone-pay",
				codeSymbols: ["release_escrow", "EscrowState"],
				...scanned,
			}),
		];
		const { repos } = await searchRepos(mockPayload(docs), "escrow", {
			limit: 5,
		});
		expect(repos[0].fullName).toBe("team/milestone-pay");
	});
});

describe("contentTokens hyphen split (real-demand 2026-07-21: zk-snark 22 asks)", () => {
	it("splits hyphenated queries into fragments AND keeps the hyphenated form", async () => {
		const { contentTokens } = await import("../repo-search");
		const toks = contentTokens("zk-snark");
		expect(toks).toContain("zk");
		expect(toks).toContain("snark");
		expect(toks).toContain("zk-snark"); // hyphen-keyed vocabulary still hits
	});

	it("finds a repo whose text carries the space-separated form for a hyphenated query", async () => {
		const docs = [
			doc({
				fullName: "zkorg/zk-proofs",
				description: "zk snark proving system for Soroban",
				codeScanState: "scanned",
				stellarProof: "cargo-sdk",
			}),
			doc({ fullName: "x/unrelated", description: "wallet sdk" }),
		];
		const { repos } = await searchRepos(mockPayload(docs), "zk-snark", {
			limit: 5,
		});
		expect(repos.map((r) => r.fullName)).toContain("zkorg/zk-proofs");
	});
});
