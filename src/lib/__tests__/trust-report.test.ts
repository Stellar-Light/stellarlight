/**
 * The trust report's interface block is a codegen guard ("verify generated
 * calls against it"), so each entry carries the file it was read from
 * (issue #1906), and a renamed repo's old path finds the repo where it lives
 * now (issue #1901: the docs still link github.com/theahaco/scaffold-stellar).
 */
import { describe, expect, it } from "vitest";
import { buildTrustReport } from "../trust-report";

const CLI = {
	fullName: "stellar-scaffold/cli",
	codeScanState: "scanned",
	stellarProof: "cargo-sdk",
	contractInterface: ["Counter.bump(n: u32) -> u32"],
	contractInterfacePaths: ["examples/counter/src/lib.rs"],
};

// Answers repos reads by exact fullName, like the Mongo adapter's `equals`.
function payloadOf(rows: Array<Record<string, unknown>>) {
	return {
		find: async (args: {
			collection: string;
			where?: { fullName?: { equals?: string } };
		}) => {
			const want = args.where?.fullName?.equals;
			return {
				docs:
					args.collection === "repos" && want
						? rows.filter((r) => r.fullName === want)
						: [],
			};
		},
	} as unknown as Parameters<typeof buildTrustReport>[0];
}

describe("trust report interface paths and renamed paths", () => {
	it("serves each interface entry's source path beside it", async () => {
		const r = await buildTrustReport(payloadOf([CLI]), "stellar-scaffold/cli");
		expect(r?.codeTruth.contractInterface).toEqual([
			"Counter.bump(n: u32) -> u32",
		]);
		expect(r?.codeTruth.contractInterfacePaths).toEqual([
			"examples/counter/src/lib.rs",
		]);
	});

	it("null paths when the scan predates them", async () => {
		const { contractInterfacePaths: _p, ...old } = CLI;
		const r = await buildTrustReport(payloadOf([old]), "stellar-scaffold/cli");
		expect(r?.codeTruth.contractInterfacePaths).toBeNull();
	});

	it("an old renamed path answers with the repo where it lives now, and says so", async () => {
		const r = await buildTrustReport(
			payloadOf([CLI]),
			"theahaco/scaffold-stellar",
		);
		expect(r?.repo.fullName).toBe("stellar-scaffold/cli");
		expect(r?.repo.renamedFrom).toBe("theahaco/scaffold-stellar");
	});

	it("an old path the index holds a row for is served as itself", async () => {
		const OLD = { ...CLI, fullName: "theahaco/scaffold-stellar" };
		const r = await buildTrustReport(
			payloadOf([OLD, CLI]),
			"theahaco/scaffold-stellar",
		);
		expect(r?.repo.fullName).toBe("theahaco/scaffold-stellar");
		expect(r?.repo.renamedFrom).toBeNull();
	});
});

/** 2026-11-11: reflector-network/reflector-stellar-connector held the
 * SushiSwap factory its README gives as a config default, and the report
 * signalled publishes-contract-id for it beside a bare id. */
describe("trust report contract basis", () => {
	const row = (fullName: string, basis: string | null) => ({
		fullName,
		codeScanState: "scanned",
		mainnetContractId:
			"CD3KRKGDRVWPXVB3VXLUMQKMX6XZ6Q2H334IVZD4XXNAMKSRVQL5GLYF",
		mainnetContractBasis: basis,
	});
	const report = async (basis: string | null) =>
		buildTrustReport(payloadOf([row("acme/app", basis)]), "acme/app");

	it("serves the basis beside the id, and a cited id signals cites-contract-id", async () => {
		const r = await report("cited");
		expect(r?.codeTruth.mainnetContractBasis).toBe("cited");
		expect(r?.signals).toContain("cites-contract-id");
		expect(r?.signals).not.toContain("publishes-contract-id");
	});

	it("a basis not judged yet is served as before, with the basis visible", async () => {
		for (const basis of ["published", null]) {
			const r = await report(basis);
			expect(r?.signals).toContain("publishes-contract-id");
			expect(r?.signals).not.toContain("cites-contract-id");
			expect(r?.codeTruth.mainnetContractBasis).toBe(basis);
		}
	});

	it("source-matched and sibling-matched publish the id; self-validated verifies it", async () => {
		for (const basis of ["source-matched", "sibling-matched"])
			expect((await report(basis))?.signals).toContain("publishes-contract-id");
		expect((await report("self-validated"))?.signals).toContain(
			"verified-contract-id",
		);
	});
});
