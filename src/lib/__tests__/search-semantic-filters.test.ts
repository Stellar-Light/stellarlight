/**
 * GET /api/projects/search?q=ethena&scfAwarded=true served matchMode
 * "semantic", echoed meta.filters.scfAwarded true, and 7 of its 10 rows had
 * scfAwarded false (live, 2026-11-23). The keyword read carries every filter
 * in its where clause; the semantic rung held only status and type, and the
 * lineage fold and the served-row belt never checked category or scfAwarded.
 * Every structured filter must hold in every match mode, and a selective
 * filter must still fill the page when matching neighbours exist.
 *
 * Lives in src/lib so CI runs it; it drives the real route with Payload
 * mocked and a stand-in for Atlas that applies the pipeline's stages in
 * order ($vectorSearch keeps its `limit` nearest, then $match, then $limit).
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/embed", () => ({ embed: vi.fn(async () => [0.1, 0.2, 0.3]) }));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async () => ({ repos: [], warnings: [] })),
}));

type Doc = Record<string, unknown> & { slug: string };
/** 60 neighbours, best first, every one above the semantic floor. Only one
 * of the 30 nearest is SCF-awarded; the other awarded rows sit further out,
 * so a filter applied after a 30-row vector pool cannot fill a page of 10. */
const NEIGHBOURS: Doc[] = Array.from({ length: 60 }, (_, i) => ({
	_id: `n${i}`,
	name: `n${i}`,
	slug: `n${i}`,
	category: i % 2 ? "Asset" : "Anchor",
	shortDescription: "A stablecoin.",
	status: i % 7 === 3 ? "Inactive" : "Live",
	types: ["Stablecoin"],
	scf: { awarded: i === 4 || i >= 30 },
	score: 0.95 - i * 0.004,
}));
/** A lineage shadow that is awarded while its canonical is not: the fold
 * serves the canonical, so it is never an awarded row. */
const SHADOW: Doc = {
	_id: "oldfund",
	name: "oldfund",
	slug: "oldfund",
	category: "Anchor",
	shortDescription: "Old name.",
	status: "Inactive",
	types: ["Stablecoin"],
	scf: { awarded: true },
	canonicalSlug: "newfund",
	score: 0.99,
};
const CANONICAL: Doc = {
	...SHADOW,
	id: "newfund",
	name: "newfund",
	slug: "newfund",
	status: "Live",
	scf: { awarded: false },
	canonicalSlug: null,
};
let neighbours: Doc[] = NEIGHBOURS;

const at = (o: unknown, path: string) =>
	path
		.split(".")
		.reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], o);
const matches = (row: Doc, match: Record<string, unknown>) =>
	Object.entries(match).every(([path, want]) => {
		const v = at(row, path);
		if (want && typeof want === "object" && "$in" in want)
			return (want as { $in: unknown[] }).$in.includes(v);
		return Array.isArray(v) ? v.includes(want) : v === want;
	});
type Stage = {
	$vectorSearch?: { limit: number; numCandidates: number };
	$match?: Record<string, unknown>;
	$limit?: number;
};
const aggregate = vi.fn((pipeline: Stage[]) => {
	let rows = neighbours.slice(0, pipeline[0].$vectorSearch?.limit);
	for (const s of pipeline.slice(1)) {
		const m = s.$match;
		if (m) rows = rows.filter((r) => matches(r, m));
		if (s.$limit) rows = rows.slice(0, s.$limit);
	}
	return { toArray: async () => rows };
});
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		db: { connection: { db: { collection: () => ({ aggregate }) } } },
		// No keyword candidates: the page is the semantic rung's alone, as for
		// q=ethena live. A slug lookup is the fold reading canonicals.
		find: vi.fn(async (args: { where?: { slug?: { in?: string[] } } }) => {
			const wanted = args.where?.slug?.in;
			const docs = wanted?.includes("newfund") ? [CANONICAL] : [];
			return { docs, totalDocs: docs.length };
		}),
	})),
}));

async function search(qs: string) {
	vi.resetModules();
	const { GET } = await import("../../app/api/projects/search/route");
	const pending = GET(
		new NextRequest(`https://x.test/api/projects/search?${qs}`),
	);
	await vi.advanceTimersByTimeAsync(10_000);
	const res = await pending;
	return { status: res.status, body: await res.json() };
}
type Row = {
	slug: string;
	category: string;
	status: string;
	scfAwarded: boolean;
	via: string;
};
const rows = (body: { projects: Row[] }) => body.projects;
/** The counts must describe the served array, whatever the fold dropped. */
const countsHonest = (body: {
	projects: Row[];
	meta: { counts: { returned: number; semantic: number } };
}) => {
	expect(body.meta.counts.returned).toBe(body.projects.length);
	expect(body.meta.counts.semantic).toBe(
		body.projects.filter((p) => p.via === "semantic").length,
	);
};

describe("project search: every filter holds on the semantic rung", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubEnv("VOYAGE_API_KEY", "test-key");
		neighbours = NEIGHBOURS;
		aggregate.mockClear();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("control: with no filter the page is the rung's neighbours, awarded or not", async () => {
		const { body } = await search("q=ethena&limit=10");
		expect(body.meta.matchMode).toBe("semantic");
		expect(rows(body).some((p) => !p.scfAwarded)).toBe(true);
	});

	for (const flag of ["scfAwarded=true", "scfAwardedOnly=1"]) {
		it(`${flag}: every row is awarded and a full page still returns`, async () => {
			const { status, body } = await search(`q=ethena&${flag}&limit=10`);
			expect(status).toBe(200);
			expect(body.meta.matchMode).toBe("semantic");
			expect(body.meta.filters.scfAwarded).toBe(true);
			expect(rows(body).filter((p) => !p.scfAwarded)).toEqual([]);
			// 31 awarded neighbours exist; a page of 10 must not come back short.
			expect(rows(body)).toHaveLength(10);
			countsHonest(body);
		});
	}

	it("category: every row is in the category", async () => {
		const { body } = await search("q=ethena&category=Anchor&limit=10");
		expect(rows(body).filter((p) => p.category !== "Anchor")).toEqual([]);
		expect(rows(body)).toHaveLength(10);
		countsHonest(body);
	});

	it("status: every row has the status and the page fills", async () => {
		// 9 Inactive neighbours exist, 4 of them among the 30 nearest.
		const { body } = await search("q=ethena&status=Inactive&limit=5");
		expect(rows(body).filter((p) => p.status !== "Inactive")).toEqual([]);
		expect(rows(body)).toHaveLength(5);
		countsHonest(body);
	});

	it("filters combine on the same rows", async () => {
		const { body } = await search(
			"q=ethena&category=Anchor&scfAwarded=true&status=Live&limit=10",
		);
		expect(rows(body).length).toBeGreaterThan(0);
		for (const p of rows(body)) {
			expect(p.category).toBe("Anchor");
			expect(p.scfAwarded).toBe(true);
			expect(p.status).toBe("Live");
		}
		countsHonest(body);
	});

	it("the filter reaches the vector read itself, not only the served page", async () => {
		await search("q=ethena&scfAwarded=true&category=Anchor&limit=10");
		const pipeline = JSON.stringify(aggregate.mock.calls[0]?.[0]);
		expect(pipeline).toContain('"scf.awarded":true');
		expect(pipeline).toContain('"category":"Anchor"');
	});

	it("a shadow's canonical swapped in by the fold is held to the filter", async () => {
		neighbours = [SHADOW, ...NEIGHBOURS];
		const { body } = await search("q=ethena&scfAwarded=true&limit=10");
		expect(rows(body).map((p) => p.slug)).not.toContain("newfund");
		expect(rows(body).filter((p) => !p.scfAwarded)).toEqual([]);
		countsHonest(body);
	});
});
