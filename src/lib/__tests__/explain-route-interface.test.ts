/**
 * explainRepo's codeVerified block (issue #1906): stellar/stellar-horizon
 * served six integration-test fixture interfaces with no path. Each entry now
 * carries its source path, read through the route's own `select` (a field the
 * select leaves out reads as undefined, so the mock applies the select the way
 * the database does). Also: a renamed repo's old path routes to the repo where
 * it lives now (issue #1901).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let ROWS: Array<Record<string, unknown>> = [];
const BASE_ROWS: Array<Record<string, unknown>> = [
	{
		fullName: "stellar/stellar-horizon",
		codeScanState: "scanned",
		stellarProof: "cargo-sdk",
		scannedRef: "597544b60c20f8536d532d32abca8462394874f3",
		contractInterface: ["Ingest.run(n: u32) -> u32"],
		contractInterfacePaths: ["services/ingest/src/lib.rs"],
	},
	{ fullName: "stellar-scaffold/cli", codeScanState: "unscanned" },
];

vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async (args: {
			where?: {
				fullName?: { like?: string };
				or?: Array<{ fullName?: { like?: string } }>;
			};
			select?: Record<string, boolean>;
		}) => {
			// `like` is a case-insensitive substring; `or` takes any branch.
			const likes = (args.where?.or ?? [args.where ?? {}]).map((w) =>
				String(w.fullName?.like ?? "").toLowerCase(),
			);
			const docs = ROWS.filter((r) =>
				likes.some((l) => String(r.fullName).toLowerCase().includes(l)),
			).map((r) =>
				args.select
					? Object.fromEntries(
							Object.entries(r).filter(([k]) => args.select?.[k]),
						)
					: r,
			);
			return { docs, totalDocs: docs.length };
		},
	})),
}));
vi.mock("@/lib/deepwiki", () => ({ askDeepWiki: vi.fn(async () => null) }));
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

const { GET } = await import("../../app/api/repos/explain/route");
beforeEach(() => {
	ROWS = [...BASE_ROWS];
});
const call = async (qs: string) =>
	(await GET(new NextRequest(`https://x.test/api/repos/explain?${qs}`))).json();

describe("explainRepo codeVerified interface paths", () => {
	it("serves each interface entry's source path, through the route's select", async () => {
		const body = await call(
			"q=how+does+ingest+run&repo=stellar/stellar-horizon",
		);
		expect(body.codeVerified.contractInterface).toEqual([
			"Ingest.run(n: u32) -> u32",
		]);
		expect(body.codeVerified.contractInterfacePaths).toEqual([
			"services/ingest/src/lib.rs",
		]);
	});

	it("a renamed repo's old path routes to the repo where it lives now, and says so", async () => {
		const pinned = await call(
			"q=how+do+clients+generate&repo=theahaco/scaffold-stellar",
		);
		expect(pinned.repo).toBe("stellar-scaffold/cli");
		// the route names what it did: not the explicit name, a rename of it
		expect(pinned.routedVia).toBe("renamed");
		expect(pinned.renamedFrom).toBe("theahaco/scaffold-stellar");
		const named = await call("q=theahaco/scaffold-stellar");
		expect(named.repo).toBe("stellar-scaffold/cli");
		expect(named.routedVia).toBe("renamed");
	});

	it("an old path the index holds a row for is explained as itself", async () => {
		ROWS.push({
			fullName: "theahaco/scaffold-stellar",
			codeScanState: "unscanned",
		});
		const body = await call(
			"q=how+do+clients+generate&repo=theahaco/scaffold-stellar",
		);
		expect(body.repo).toBe("theahaco/scaffold-stellar");
		expect(body.routedVia).toBe("explicit");
		expect(body.renamedFrom).toBeNull();
	});
});
