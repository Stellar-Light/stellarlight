/** #1912 and #1914 (2026-11-04): /api/analyze served a TVL total with no
 * word that 84% of it was weeks older than its weekly refresh, and a funding
 * delta whose baseline was an empty snapshot that a failed project read had
 * written. A stale input must be named beside the total, and a failed, empty
 * or truncated read must never become a baseline, a stored snapshot or a
 * zero total. */
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { spec } from "@/lib/openapi-spec";
import {
	responseSchema,
	undeclaredInServed,
} from "../../../scripts/contract/served-shape";

type Doc = Record<string, unknown>;
const h = vi.hoisted(() => ({
	projects: [] as Record<string, unknown>[],
	snapshots: [] as Record<string, unknown>[],
	totalDocs: null as number | null,
	failProjects: false,
	storeDown: false,
}));
const find = vi.fn(
	async (args: { collection: string; where?: Doc; limit?: number }) => {
		if (args.collection === "projects") {
			if (h.failProjects) throw new Error("connection reset by peer");
			const want = (args.where?.slug as { in?: string[] } | undefined)?.in;
			const docs = want
				? h.projects.filter((p) => want.includes(String(p.slug)))
				: h.projects;
			return {
				docs,
				totalDocs: want ? docs.length : (h.totalDocs ?? docs.length),
			};
		}
		if (args.collection === "funding-snapshots") {
			// Newest first, cut at the limit; `where` is ignored on purpose, so the
			// route's own check on each stored row is what these tests measure.
			const docs = [...h.snapshots]
				.sort((a, b) =>
					String(b.computedAt).localeCompare(String(a.computedAt)),
				)
				.slice(0, args.limit ?? 10);
			return { docs, totalDocs: h.snapshots.length };
		}
		throw new Error(`unexpected collection ${args.collection}`);
	},
);
const create = vi.fn(async (args: { data: Doc }) => {
	h.snapshots.push({ ...args.data });
	return args.data;
});
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => (h.storeDown ? null : { find, create })),
}));
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/integrations/dorahacks", () => ({
	fetchAllDoraHacksHackathons: vi.fn(async () => []),
}));

const { GET } = await import("@/app/api/analyze/route");

/** The served projectSetHash: sha256 of the sorted slug set, 16 hex chars. */
const hashOf = (slugs: string[]) =>
	createHash("sha256")
		.update([...slugs].sort().join("\n"))
		.digest("hex")
		.slice(0, 16);
const EMPTY_HASH = "e3b0c44298fc1c14";

async function analyze(dimension: string) {
	const res = await GET(
		new NextRequest(
			`https://stellarlight.xyz/api/analyze?dimension=${dimension}`,
		),
	);
	return { status: res.status, body: (await res.json()) as Doc };
}

const snap = (
	slugs: string[],
	computedAt: string,
	usd = slugs.length * 100,
) => ({
	projectSetHash: hashOf(slugs),
	scfAwardedProjects: slugs.length,
	scfTotalDistributedUSD: usd,
	methodologyVersion: "funding-v2 (2026-07-05)",
	awardedSlugs: [...slugs].sort(),
	computedAt,
});
// What a request whose project read failed stored, four times in 0.7s on
// 2026-10-24 (and nine more times since July).
const empty = (computedAt: string) => ({
	...snap([], computedAt),
	projectSetHash: EMPTY_HASH,
});

const awarded = (slug: string) => ({
	id: slug,
	slug,
	name: slug,
	status: "Live",
	scf: { awarded: true, totalAwarded: 100, awardedRounds: [40] },
});

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-11-04T21:00:00.000Z"));
	h.projects = [];
	h.snapshots = [];
	h.totalDocs = null;
	h.failProjects = false;
	h.storeDown = false;
	find.mockClear();
	create.mockClear();
});
afterAll(() => vi.useRealTimers());

describe("tvl: a reading older than the weekly refresh is named beside the total", () => {
	// The live rows on 2026-11-02, by value and date.
	const rows = [
		["spiko", 1653789314, "2026-09-14T10:30:21.591Z"],
		["blend", 129334939, "2026-11-02T13:19:15.688Z"],
		["aquarius", 38081272, "2026-11-02T13:19:15.688Z"],
		["sentora", 10393904, "2026-08-10T06:16:01.283Z"],
		["etherfuse", 2, "2026-09-14T10:30:21.591Z"],
	] as const;
	const tvlRow = ([slug, tvlUSD, tvlAsOf]: (typeof rows)[number]) => ({
		id: slug,
		slug,
		name: slug,
		status: "Live",
		tvlUSD,
		tvlAsOf,
	});

	it("serves the stale part, its rows, the oldest date and a warning", async () => {
		h.projects = [
			...rows.map(tvlRow),
			{ id: "x", slug: "x", status: "Live", tvlUSD: null },
		];
		const { status, body } = await analyze("tvl");
		expect(status).toBe(200);
		const tvl = body.tvl as Doc;
		expect(tvl.totalTvlUSD).toBe(
			1653789314 + 129334939 + 38081272 + 10393904 + 2,
		);
		// asOf keeps its meaning (the newest reading); oldestAsOf dates the rest.
		expect(tvl.asOf).toBe("2026-11-02T13:19:15.688Z");
		expect(tvl.oldestAsOf).toBe("2026-08-10T06:16:01.283Z");
		expect(tvl.staleTvlUSD).toBe(1653789314 + 10393904 + 2);
		expect((tvl.staleProjects as Doc[]).map((p) => p.slug)).toEqual([
			"spiko",
			"sentora",
			"etherfuse",
		]);
		expect(tvl.staleWarning).toMatch(/3 of 5/);
		expect(tvl.staleWarning).toMatch(/older than 14 days/);
		expect(tvl.staleWarning).toMatch(/2026-08-10/);
		const top = Object.fromEntries(
			(tvl.top10 as Doc[]).map((p) => [p.slug, p.tvlStale]),
		);
		expect(top).toEqual({
			spiko: true,
			blend: false,
			aquarius: false,
			sentora: true,
			etherfuse: true,
		});
		expect(String(tvl.basis)).toMatch(/refreshed weekly/);
		expect(
			undeclaredInServed(spec, responseSchema(spec, "/api/analyze"), body),
		).toEqual([]);
	});

	it("an all-fresh total carries no warning and an empty stale list", async () => {
		h.projects = rows
			.filter(([, , at]) => at.startsWith("2026-11"))
			.map(tvlRow);
		const tvl = (await analyze("tvl")).body.tvl as Doc;
		expect(tvl.staleTvlUSD).toBe(0);
		expect(tvl.staleProjects).toEqual([]);
		expect(tvl.staleWarning).toBeNull();
		expect(tvl.oldestAsOf).toBe("2026-11-02T13:19:15.688Z");
	});
});

describe("funding: an empty or incomplete snapshot is never the baseline", () => {
	const cur = ["a", "b", "c"];

	it("skips the empty rows a failed read stored and finds the real baseline", async () => {
		h.projects = cur.map(awarded);
		h.snapshots = [
			snap(["a", "b"], "2026-10-03T07:36:46.465Z"),
			snap(cur, "2026-10-03T08:00:19.683Z"),
			empty("2026-10-24T13:59:01.064Z"),
			empty("2026-10-24T13:59:01.097Z"),
			empty("2026-10-24T13:59:01.124Z"),
			empty("2026-10-24T13:59:01.772Z"),
			snap(cur, "2026-10-24T13:59:04.410Z"),
		];
		const f = (await analyze("funding")).body.funding as Doc;
		expect(create).not.toHaveBeenCalled();
		expect((f.previousSnapshot as Doc).projectSetHash).toBe(hashOf(["a", "b"]));
		expect(f.snapshotDelta).toMatchObject({
			addedProjects: ["c"],
			addedCount: 1,
			removedCount: 0,
			totalUSDDelta: 100,
		});
		// First observed: the set held from 10-03; the 10-24 row re-recorded it
		// after the empty rows.
		expect(f.snapshotAsOf).toBe("2026-10-03T08:00:19.683Z");
		expect(f.deltaUnavailable).toBeNull();
	});

	it("with only empty rows behind the current set, says no valid baseline remains", async () => {
		h.projects = cur.map(awarded);
		h.snapshots = [
			empty("2026-10-24T13:59:01.064Z"),
			snap(cur, "2026-10-24T13:59:04.410Z"),
		];
		const f = (await analyze("funding")).body.funding as Doc;
		expect(f.previousSnapshot).toBeNull();
		expect(f.snapshotDelta).toBeNull();
		expect(f.deltaUnavailable).toMatch(/empty or incomplete/);
	});

	it("skips a stored row whose slug list does not reproduce its own hash", async () => {
		h.projects = cur.map(awarded);
		h.snapshots = [
			snap(["a", "b"], "2026-10-01T00:00:00.000Z"),
			// Claims the set {a, b, x} but stored no slugs: diffing against it
			// would list every current project as added.
			{
				...snap(["a", "b", "x"], "2026-10-02T00:00:00.000Z"),
				awardedSlugs: [],
			},
			snap(cur, "2026-10-24T13:59:04.410Z"),
		];
		const f = (await analyze("funding")).body.funding as Doc;
		expect((f.previousSnapshot as Doc).computedAt).toBe(
			"2026-10-01T00:00:00.000Z",
		);
		expect((f.snapshotDelta as Doc).addedProjects).toEqual(["c"]);
	});

	it("a new set is stored once and compared against the latest valid row", async () => {
		h.projects = cur.map(awarded);
		h.snapshots = [
			snap(["a", "b"], "2026-10-03T07:36:46.465Z"),
			empty("2026-10-24T13:59:01.064Z"),
		];
		const f = (await analyze("funding")).body.funding as Doc;
		expect(create).toHaveBeenCalledTimes(1);
		expect(create.mock.calls[0][0].data).toMatchObject({
			projectSetHash: hashOf(cur),
			scfAwardedProjects: 3,
		});
		expect((f.previousSnapshot as Doc).projectSetHash).toBe(hashOf(["a", "b"]));
		expect(f.snapshotAsOf).toBe("2026-11-04T21:00:00.000Z");
		expect(
			undeclaredInServed(spec, responseSchema(spec, "/api/analyze"), {
				funding: f,
			}),
		).toEqual([]);
	});

	it("a window holding only the current set says older history was not read", async () => {
		h.projects = cur.map(awarded);
		h.snapshots = [
			snap(["a", "b"], "2026-09-01T00:00:00.000Z"),
			...Array.from({ length: 10 }, (_, i) =>
				snap(cur, `2026-10-${String(10 + i).padStart(2, "0")}T00:00:00.000Z`),
			),
		];
		const f = (await analyze("funding")).body.funding as Doc;
		expect(f.previousSnapshot).toBeNull();
		expect(f.deltaUnavailable).toMatch(/older history was not read/);
		expect(f.snapshotAsOf).toBe("2026-10-10T00:00:00.000Z");
	});

	it("a truncated read is neither stored nor compared", async () => {
		h.projects = cur.map(awarded);
		h.totalDocs = 9; // 3 of 9 matching rows came back
		h.snapshots = [snap(["a", "b"], "2026-10-03T07:36:46.465Z")];
		const f = (await analyze("funding")).body.funding as Doc;
		expect(create).not.toHaveBeenCalled();
		expect(f.snapshotAsOf).toBeNull();
		expect(f.previousSnapshot).toBeNull();
		expect(f.snapshotDelta).toBeNull();
		expect(f.deltaUnavailable).toMatch(/3 of 9/);
	});

	it("an empty awarded set from a read that succeeded is not stored", async () => {
		h.projects = [{ ...awarded("a"), scf: { awarded: false } }];
		h.snapshots = [snap(["a", "b"], "2026-10-03T07:36:46.465Z")];
		const f = (await analyze("funding")).body.funding as Doc;
		expect(create).not.toHaveBeenCalled();
		expect(f.previousSnapshot).toBeNull();
		expect(f.deltaUnavailable).toMatch(/no awarded project/);
	});
});

describe("a failed project read is an outage, never a zero total or a snapshot", () => {
	for (const dimension of ["funding", "tvl", "categories", "gaps", "all"])
		it(`dimension=${dimension}: the read threw, so 503 and nothing stored`, async () => {
			h.failProjects = true;
			h.snapshots = [snap(["a", "b"], "2026-10-03T07:36:46.465Z")];
			const { status, body } = await analyze(dimension);
			expect(status).toBe(503);
			expect(body.retryAfterSeconds).toBe(2);
			expect(String(body.advisory)).toMatch(/NOT a claim/);
			expect(create).not.toHaveBeenCalled();
		});

	it("the store itself is down: 503, not totalTvlUSD 0", async () => {
		h.storeDown = true;
		const { status, body } = await analyze("tvl");
		expect(status).toBe(503);
		expect(body.tvl).toBeUndefined();
	});

	it("the spec declares the 503 as a RetryableError", () => {
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const r: any = (spec as any).paths["/api/analyze"].get.responses["503"];
		expect(r.content["application/json"].schema.$ref).toBe(
			"#/components/schemas/RetryableError",
		);
	});

	it("dimensions that never read projects still answer", async () => {
		h.failProjects = true;
		const { status, body } = await analyze("developers");
		expect(status).toBe(200);
		expect(body.developers).toBeDefined();
	});
});
