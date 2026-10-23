import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { spec } from "@/lib/openapi-spec";
import { type IndexRow, rowKey, rowTerms } from "@/lib/source-locator";
import {
	responseSchema,
	undeclaredInServed,
} from "../../../../../../scripts/contract/served-shape";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

const REF = "0ff76e336a438370ba900db7f437dcbe5b90dda7";
const row = (
	repo: string,
	path: string,
	kind: IndexRow["locatorKind"],
	locator: string | null,
	line: number | null,
): IndexRow => ({
	key: rowKey(repo, path, kind, locator),
	repo,
	ref: REF,
	path,
	locatorKind: kind,
	locator,
	line,
	blobSha: "a".repeat(40),
	terms: rowTerms(kind, locator, path),
});

const store: {
	rows: IndexRow[];
	repos: Array<Record<string, unknown>>;
	fail: "none" | "payload" | "repos" | "rows";
	lastFilter: Record<string, unknown> | null;
	lastProjection: Record<string, number> | null;
} = {
	rows: [],
	repos: [],
	fail: "none",
	lastFilter: null,
	lastProjection: null,
};

/** A driver projection applied as Mongo would: inclusion keeps only the 1s, exclusion drops the 0s. */
function project(r: IndexRow, projection: Record<string, number> | undefined) {
	if (!projection) return r;
	const entries = Object.entries(r);
	const inclusion = Object.entries(projection).some(
		([k, v]) => k !== "_id" && v === 1,
	);
	return Object.fromEntries(
		entries.filter(([k]) =>
			inclusion ? projection[k] === 1 : projection[k] !== 0,
		),
	);
}

/** The driver calls the route makes, evaluated over the fixture rows. */
function matches(r: IndexRow, filter: Record<string, unknown>): boolean {
	const terms = (filter.terms as { $in: Array<string | RegExp> }).$in;
	const repoIn = (filter.repo as { $in: string[] }).$in;
	return (
		repoIn.includes(r.repo) &&
		(!filter.locatorKind || filter.locatorKind === r.locatorKind) &&
		r.terms.some((t) =>
			terms.some((x) => (typeof x === "string" ? x === t : x.test(t))),
		)
	);
}

vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () =>
		store.fail === "payload"
			? null
			: {
					db: {
						connection: {
							db: {
								collection: (name: string) => ({
									find: (
										filter: Record<string, unknown>,
										opts?: { projection?: Record<string, number> },
									) => {
										if (name === "source-locator-repos")
											return {
												toArray: async () => {
													if (store.fail === "repos") throw new Error("boom");
													return store.repos;
												},
											};
										store.lastFilter = filter;
										store.lastProjection = opts?.projection ?? null;
										return {
											limit: (n: number) => ({
												toArray: async () => {
													if (store.fail === "rows") throw new Error("boom");
													return store.rows
														.filter((r) => matches(r, filter))
														.slice(0, n)
														.map((r) => project(r, opts?.projection));
												},
											}),
										};
									},
								}),
							},
						},
					},
				},
	),
}));

const { GET } = await import("../route");
const get = async (qs: string) => {
	const res = await GET(
		new NextRequest(`https://x.test/api/sources/locate?${qs}`),
	);
	return { status: res.status, body: await res.json(), res };
};
const declared = (body: unknown) =>
	undeclaredInServed(spec, responseSchema(spec, "/api/sources/locate"), body);

const built = (repo: string) => ({
	repo,
	ref: REF,
	builtAt: new Date("2026-10-23T13:41:00Z"),
	pointers: 410,
});

beforeEach(() => {
	store.fail = "none";
	store.lastFilter = null;
	store.repos = [built("stellar/quickstart"), built("stellar/stellar-rpc")];
	store.rows = [
		row("stellar/quickstart", "start", "file", null, null),
		row(
			"stellar/quickstart",
			"start",
			"symbol",
			"ENABLE_CORE_MANUAL_CLOSE",
			47,
		),
		row(
			"stellar/quickstart",
			"start",
			"symbol",
			"--enable-core-manual-close",
			201,
		),
		row("stellar/quickstart", "README.md", "heading", "Ephemeral mode", 437),
		row(
			"stellar/stellar-rpc",
			"cmd/config/options.go",
			"symbol",
			"default-transactions-limit",
			358,
		),
	];
});

describe("GET /api/sources/locate", () => {
	it("serves ranked pointers in the SourcePointer shape, every field declared", async () => {
		const { status, body } = await get("q=--enable-core-manual-close start");
		expect(status).toBe(200);
		expect(body.total).toBe(3);
		expect(body.pointers[0]).toMatchObject({
			id: "s1",
			rank: 1,
			repo: "stellar/quickstart",
			ref: REF,
			path: "start",
			locatorKind: "symbol",
			locator: "ENABLE_CORE_MANUAL_CLOSE",
			line: 47,
			authorityRole: "implementation",
			blobSha: "a".repeat(40),
			verifiedAt: "2026-10-23T13:41:00.000Z",
			verificationUrl: `https://github.com/stellar/quickstart/blob/${REF}/start#L47`,
		});
		expect(body.pointers[0].score).toBeGreaterThan(body.pointers[2].score);
		expect(body.pointers[0].matchReason.length).toBeLessThanOrEqual(100);
		expect(body.pointers.at(-1).locatorKind).toBe("file");
		expect(body.pointers.at(-1).verificationUrl).not.toContain("#L");
		expect(body.meta.matchMode).toBe("expanded");
		expect(declared(body)).toEqual([]);
	});

	it("reads candidates by term, only from indexed repos", async () => {
		await get("q=ENABLE_CORE_MANUAL_CLOSE&kind=symbol");
		expect(store.lastFilter).toMatchObject({
			repo: { $in: ["stellar/stellar-rpc", "stellar/quickstart"] },
			locatorKind: "symbol",
		});
	});

	it("reads only the fields it ranks and serves, never key or terms", async () => {
		const { body } = await get("q=ENABLE_CORE_MANUAL_CLOSE");
		expect(store.lastProjection).toEqual({
			_id: 0,
			repo: 1,
			ref: 1,
			path: 1,
			locatorKind: 1,
			locator: 1,
			line: 1,
			blobSha: 1,
		});
		expect(body.pointers[0]).toMatchObject({
			locator: "ENABLE_CORE_MANUAL_CLOSE",
			line: 47,
			blobSha: "a".repeat(40),
		});
		expect(declared(body)).toEqual([]);
	});

	it("no match is a data-shaped empty: pointers [] and total 0", async () => {
		const { status, body } = await get("q=quantum llama sandwich");
		expect(status).toBe(200);
		expect(body.pointers).toEqual([]);
		expect(body.total).toBe(0);
		expect(declared(body)).toEqual([]);
	});

	it("an index that cannot be read is null with a note, never []", async () => {
		for (const fail of ["payload", "repos", "rows"] as const) {
			store.fail = fail;
			const { status, body, res } = await get("q=limits");
			expect(status).toBe(503);
			expect(body.pointers).toBeNull();
			expect(body.total).toBeNull();
			expect(body.advisory).toContain("NOT a claim");
			expect(res.headers.get("Retry-After")).toBe("2");
		}
	});

	it("a repo not indexed yet is null with a note, not an empty list", async () => {
		const { status, body } = await get("q=transfer&repo=soroban-examples");
		expect(status).toBe(200);
		expect(body.pointers).toBeNull();
		expect(body.total).toBeNull();
		expect(body.meta.note).toContain("not indexed yet");
		expect(declared(body)).toEqual([]);
		store.repos = [];
		expect((await get("q=transfer")).body.pointers).toBeNull();
	});

	it("names the repos it could not search when the index is partial", async () => {
		const { body } = await get("q=limit");
		expect(body.meta.warnings.join(" ")).toContain("stellar/stellar-core");
		expect(
			body.meta.index.find(
				(r: { repo: string }) => r.repo === "stellar/stellar-core",
			),
		).toEqual({
			repo: "stellar/stellar-core",
			ref: null,
			builtAt: null,
			pointers: null,
		});
	});

	it("filters by repo (owner/name or name) and pages ten at a time", async () => {
		store.rows = Array.from({ length: 23 }, (_, i) =>
			row(
				"stellar/stellar-rpc",
				`cmd/config/f${i}.go`,
				"symbol",
				`transfer_${i}`,
				i + 1,
			),
		);
		const p1 = await get("q=transfer&repo=stellar-rpc");
		expect(p1.body.total).toBe(23);
		expect(p1.body.pointers).toHaveLength(10);
		expect(p1.body.truncated).toBe(true);
		const p3 = await get("q=transfer&repo=stellar/stellar-rpc&page=3");
		expect(p3.body.pointers).toHaveLength(3);
		expect(p3.body.pointers[0].rank).toBe(21);
		expect(p3.body.truncated).toBe(false);
	});

	it("a full page stays far under an agent's 24,000-character output cap", async () => {
		const long = "x".repeat(120);
		store.rows = Array.from({ length: 10 }, (_, i) =>
			row(
				"stellar/stellar-rpc",
				`cmd/${"deep/".repeat(30)}transfer${i}.go`,
				"symbol",
				`transfer_${long}${i}`,
				99999,
			),
		);
		const { body } = await get(`q=transfer ${"word ".repeat(40)}`);
		expect(body.pointers).toHaveLength(10);
		expect(JSON.stringify(body).length).toBeLessThan(12_000);
	});

	it("rejects what it cannot honour with 400 and the valid values", async () => {
		const cases: Array<[string, string]> = [
			["", "q"],
			["q=limit&repo=stellar/horizon", "stellar/stellar-core"],
			["q=limit&kind=line", "heading"],
			["q=limit&page=0", "page"],
			["q=limit&page=1e2", "1 to 2000"],
			["q=limit&page=0x2", "1 to 2000"],
			["q=limit&page=%2B1", "1 to 2000"],
			["q=limit&page=%201", "1 to 2000"],
			["q=limit&page=1.5", "1 to 2000"],
			["q=limit&page=99999999999999999999", "1 to 2000"],
			["q=limit&page=2001", "1 to 2000"],
			["q=limit&page=", "1 to 2000"],
			["q=limit&limit=5", "limit"],
			["q=where is the", "q"],
			[`q=${"a".repeat(301)}`, "300"],
		];
		for (const [qs, mention] of cases) {
			const { status, body } = await get(qs);
			expect(status, qs).toBe(400);
			expect(JSON.stringify(body), qs).toContain(mention);
		}
	});
});
