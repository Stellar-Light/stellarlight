import { beforeEach, describe, expect, it } from "vitest";
import {
	buildContractsRegistry,
	resetContractsRegistryCache,
} from "../contracts-registry";

// biome-ignore lint/suspicious/noExplicitAny: mock payload
function mockPayload(repos: any[], audits: any[] = []): any {
	return {
		find: async ({ collection }: { collection: string }) =>
			collection === "repos"
				? { docs: repos, totalDocs: repos.length }
				: { docs: audits, totalDocs: audits.length },
	};
}

const verified = {
	fullName: "proto/contracts",
	url: "https://github.com/proto/contracts",
	mainnetContractId: "CABC123",
	mainnetContractBasis: "source-matched",
	projectSlug: "proto",
	projectName: "Proto",
	stellarProof: "cargo-sdk",
	codeDepth: 0.8,
	codeDomains: ["defi-lending"],
	contractInterface: [
		"Pool.borrow(a: Address) -> i128",
		"Pool.repay(a: Address) -> i128",
	],
	codeInUse: { contracts: 2, events: 500, eventsDelta: 40, asOf: "2026-08-10" },
	successorRepo: null,
	codeScannedAt: "2026-08-14",
};

describe("buildContractsRegistry", () => {
	// The registry is memoized per instance; each case reads its own fixture.
	beforeEach(() => resetContractsRegistryCache());
	it("joins repo truth + audits into contract rows, most-evidenced first", async () => {
		const idOnly = {
			...verified,
			fullName: "x/other",
			mainnetContractId: "CXYZ",
			codeInUse: null,
			projectSlug: null,
			codeDomains: [],
		};
		const { contracts, total } = await buildContractsRegistry(
			mockPayload(
				[idOnly, verified],
				[
					{
						projectSlug: "proto",
						auditor: "OtterSec",
						publishedAt: "2026-05-01",
					},
					{
						projectSlug: "proto",
						auditor: "Veridise",
						publishedAt: "2026-07-01",
					},
				],
			),
		);
		expect(total).toBe(2);
		expect(contracts[0].repo.fullName).toBe("proto/contracts");
		expect(contracts[0].audits).toEqual({
			count: 2,
			latestAuditor: "Veridise",
			latestPublishedAt: "2026-07-01",
		});
		expect(contracts[0].interfaceSize).toBe(2);
	});
	it("domain filter and q filter narrow honestly", async () => {
		const p = mockPayload([verified]);
		expect((await buildContractsRegistry(p, { domain: "oracle" })).total).toBe(
			0,
		);
		expect(
			(await buildContractsRegistry(p, { domain: "defi-lending" })).total,
		).toBe(1);
		expect((await buildContractsRegistry(p, { q: "cabc" })).total).toBe(1);
		expect((await buildContractsRegistry(p, { q: "nope" })).total).toBe(0);
	});
});

/** 2026-11-11: every one of 125 published ids was served as its repo's
 * contract, the SushiSwap factory under Reflector's connector and one Blend
 * pool under three unrelated repos among them. */
describe("an id a repo only cites is not listed as its contract", () => {
	beforeEach(() => resetContractsRegistryCache());
	const row = (fullName: string, basis: string | null, extra = {}) => ({
		...verified,
		fullName,
		mainnetContractId: `C${fullName.length}`,
		mainnetContractBasis: basis,
		codeInUse: null,
		projectSlug: null,
		...extra,
	});
	it("never lists an id judged cited; one not judged yet is served as before", async () => {
		const { contracts, total } = await buildContractsRegistry(
			mockPayload([
				row("reflector-network/reflector-contract", "self-validated"),
				row("soroswap/core", "source-matched"),
				row("Lobster-Protocol/stellar-integrations", "sibling-matched"),
				row("reflector-network/reflector-stellar-connector", "cited"),
				row("lumenmap/lumenmap", "published"),
				row("jamesbachini/Blend-Vault", null),
			]),
			{ limit: 10 },
		);
		expect(total).toBe(5);
		expect(
			contracts.map((c) => [c.repo.fullName, c.contractBasis]).sort(),
		).toEqual(
			[
				["reflector-network/reflector-contract", "self-validated"],
				["soroswap/core", "source-matched"],
				["Lobster-Protocol/stellar-integrations", "sibling-matched"],
				// Not judged yet: the deploy moves no row, a rescan does.
				["lumenmap/lumenmap", "published"],
				["jamesbachini/Blend-Vault", null],
			].sort(),
		);
	});
	it("keeps a row with live usage but never names it by the id it cites", async () => {
		const { contracts } = await buildContractsRegistry(
			mockPayload([
				row("someone/app", "cited", {
					codeInUse: {
						contracts: 1,
						events: 5,
						eventsDelta: 1,
						asOf: "2026-11-01",
					},
				}),
			]),
		);
		expect(contracts).toHaveLength(1);
		expect(contracts[0].contractId).toBeNull();
		expect(contracts[0].contractBasis).toBeNull();
	});
});
