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

	it("an old renamed path answers with the repo where it lives now", async () => {
		const r = await buildTrustReport(
			payloadOf([CLI]),
			"theahaco/scaffold-stellar",
		);
		expect(r?.repo.fullName).toBe("stellar-scaffold/cli");
	});
});
