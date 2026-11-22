import { describe, expect, it } from "vitest";
import {
	addressesIn,
	repoContractJoins,
	repoInUrl,
	rollupRepoOf,
	verifiedRepoOf,
} from "@/lib/onchain-join";

const C1 = "CDQ6I65CP3JHLNGMEHWE4BP2OMLWOUMZ77U53JPAURFZPZBVH6PYEXPN";
const C2 = "CCV4RALFBEE2QLKPK6H5ZX24CYMKIFN3723J5J4TMDEFWAFLELGYODNI";
const C3 = "CA7IBD266HIHFDUIBZLPIAITJUA3DVY4JAG6K3QMGBKLZCXXLP5E2F7A";
const G1 = "GALLBRBQHAPW5FOVXXHYWR6J4ZDAQ35BMSNADYGBW25VOUHUYRZM4XIL";

describe("addressesIn: the artifacts a curator's note names", () => {
	it("finds contract and account addresses, whole words only", () => {
		expect([
			...addressesIn(
				`the joined contract ${C1} is PayLoop's; issuer ${G1}; not X${C2} and not ${C2.slice(0, 20)}`,
			),
		]).toEqual([C1, G1]);
		expect(addressesIn(null).size).toBe(0);
	});
});

describe("repoContractJoins: whose contract a repo's own contract is", () => {
	const row = (
		fullName: string,
		projectSlug: string,
		mainnetContractId: string,
		mainnetContractBasis: string | null = "source-matched",
		codeScanState = "scanned",
	) => ({
		fullName,
		projectSlug,
		mainnetContractId,
		mainnetContractBasis,
		codeScanState,
	});
	const none = {
		seedOwner: new Map<string, string>(),
		heldBack: () => new Set<string>(),
	};

	it("joins a repo's own contract to its row, and names the repo only where its source was proved", () => {
		const { joins } = repoContractJoins(
			[
				row("team/contracts", "team", C1, "source-matched"),
				row("team/attested", "team", C2, "self-validated"),
				row("team/docs", "team", C3, "sibling-matched"),
			],
			none,
		);
		expect(joins).toEqual([
			{
				slug: "team",
				address: C1,
				repo: "team/contracts",
				sourceRepo: "team/contracts",
			},
			{
				slug: "team",
				address: C2,
				repo: "team/attested",
				sourceRepo: "team/attested",
			},
			// a docs repo joins the contract to the project, not to itself
			{ slug: "team", address: C3, repo: "team/docs" },
		]);
	});

	it("joins an id not judged yet, and never one the scan judged cited or a repo that is gone", () => {
		const { joins } = repoContractJoins(
			[
				row("a/published", "a", C1, "published"),
				row("a/unjudged", "a", C2, null),
				row("b/cites", "b", C3, "cited"),
				row("c/gone", "c", C3, "source-matched", "gone"),
			],
			none,
		);
		expect(joins.map((j) => j.repo)).toEqual(["a/published", "a/unjudged"]);
		expect(joins.every((j) => j.sourceRepo === undefined)).toBe(true);
	});

	// PayLoop's contract under the IDE row, AgentSmith's under the timelock
	// row, the CredioLabs policy builder's under Untangled's (2026-11-22).
	it("holds back exactly the contract a curator named, and still joins the row's own", () => {
		const { joins, retracted } = repoContractJoins(
			[
				row("WebSoroban/payloop", "websoroban-ide", C1),
				row("WebSoroban/ide-contracts", "websoroban-ide", C2),
			],
			{
				seedOwner: new Map(),
				heldBack: (slug) =>
					slug === "websoroban-ide" ? new Set([C1]) : new Set(),
			},
		);
		expect(retracted.map((j) => j.repo)).toEqual(["WebSoroban/payloop"]);
		expect(joins.map((j) => j.repo)).toEqual(["WebSoroban/ide-contracts"]);
	});

	it("gives a seeded contract to its seed's row only", () => {
		const { joins } = repoContractJoins(
			[row("blend/contracts", "blend", C1), row("other/sdk", "other", C1)],
			{ seedOwner: new Map([[C1, "blend"]]), heldBack: () => new Set() },
		);
		expect(joins.map((j) => j.slug)).toEqual(["blend"]);
	});

	it("joins an id two rows' repos both hold to neither, unless one of them was held back", () => {
		const two = [row("x/app", "x", C1), row("y/app", "y", C1)];
		const split = repoContractJoins(two, none);
		expect(split.joins).toEqual([]);
		expect(split.shared.map((s) => [s.repo, s.slugs])).toEqual([
			["x/app", ["x", "y"]],
			["y/app", ["x", "y"]],
		]);
		// A row a curator took the id from is no claimant: the other keeps it.
		const settled = repoContractJoins(two, {
			seedOwner: new Map(),
			heldBack: (slug) => (slug === "x" ? new Set([C1]) : new Set()),
		});
		expect(settled.joins.map((j) => j.slug)).toEqual(["y"]);
		expect(settled.shared).toEqual([]);
	});

	it("lets two repos of one row hold the same id: one row is one claimant", () => {
		const { joins, shared } = repoContractJoins(
			[
				row("team/contracts", "team", C1),
				row("team/sdk", "team", C1, "sibling-matched"),
			],
			none,
		);
		expect(shared).toEqual([]);
		// both joins reach the lane, which files the contract once
		expect(joins.map((j) => [j.slug, j.repo, j.sourceRepo])).toEqual([
			["team", "team/contracts", "team/contracts"],
			["team", "team/sdk", undefined],
		]);
	});

	it("skips a row with no slug, no repo name or no id", () => {
		expect(
			repoContractJoins(
				[
					{ fullName: "a/b", projectSlug: null, mainnetContractId: C1 },
					{ fullName: null, projectSlug: "a", mainnetContractId: C1 },
					{ fullName: "a/b", projectSlug: "a", mainnetContractId: null },
				],
				none,
			).joins,
		).toEqual([]);
	});
});

describe("verifiedRepoOf and rollupRepoOf: one rule for a contract's source repo", () => {
	it("serves the attested repo first", () => {
		const e = {
			attested: "blend-capital/blend-contracts-v2",
			sourceRepo: "blend-capital/docs-v2",
		};
		expect(verifiedRepoOf(e)).toBe(
			"https://github.com/blend-capital/blend-contracts-v2",
		);
		// the attestation outranks the repo a scan inferred
		expect(rollupRepoOf(e)).toBe("blend-capital/blend-contracts-v2");
	});

	it("serves the repo a seed names where the code names none", () => {
		const e = {
			attested: null,
			curatedRepo: "blend-capital/blend-contracts",
			sourceRepo: "blend-capital/blend-contracts",
		};
		expect(verifiedRepoOf(e)).toBe(
			"https://github.com/blend-capital/blend-contracts",
		);
		expect(rollupRepoOf(e)).toBe("blend-capital/blend-contracts");
	});

	it("serves null where the code was read and nothing names a repo, whatever the row held", () => {
		const e = { attested: null, stored: "https://github.com/old/claim" };
		expect(verifiedRepoOf(e)).toBeNull();
		expect(rollupRepoOf(e)).toBeNull();
		// the scan's proof still rolls the use up to its repo
		expect(rollupRepoOf({ ...e, sourceRepo: "Team/Contracts" })).toBe(
			"team/contracts",
		);
	});

	it("keeps what the row holds where the code could not be read", () => {
		const e = {
			attested: undefined,
			stored: "https://github.com/Reflector-Network/reflector-contract",
		};
		expect(verifiedRepoOf(e)).toBe(
			"https://github.com/Reflector-Network/reflector-contract",
		);
		// and the stored attestation still outranks the scan's repo
		expect(rollupRepoOf({ ...e, sourceRepo: "someone/docs" })).toBe(
			"reflector-network/reflector-contract",
		);
		expect(verifiedRepoOf({ attested: undefined })).toBeNull();
		expect(rollupRepoOf({ attested: undefined, sourceRepo: "a/b" })).toBe(
			"a/b",
		);
	});

	it("reads owner/name out of a GitHub URL", () => {
		expect(repoInUrl("https://github.com/a/b.git")).toBe("a/b");
		expect(repoInUrl("https://github.com/a/b/tree/main")).toBe("a/b");
		expect(repoInUrl("https://example.com/a/b")).toBeNull();
		expect(repoInUrl(null)).toBeNull();
	});
});
