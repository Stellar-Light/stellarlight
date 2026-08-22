import { describe, expect, it } from "vitest";
import { buildContractsRegistry } from "../contracts-registry";

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
