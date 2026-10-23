/**
 * GET /api/admin/demand-report is admin-only. Payload sets req.user for a
 * token from ANY auth collection, partners included, so the gate is the
 * collection the user came from, not the presence of a user.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let user: { collection?: string } | null = null;
const pipelines: unknown[][] = [];
const aggregateOptions: unknown[] = [];
const groups = [
	{
		_id: {
			cfWorker: "stellar.buzz",
			uaBucket: "other",
			endpoint: "/api/research",
			query: "fee bump transactions in detail",
			status: 200,
			empty: false,
			partial: false,
		},
		n: 6,
	},
];
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		auth: async () => ({ user }),
		count: async () => ({ totalDocs: 6 }),
		db: {
			connection: {
				db: {
					collection: (name: string) => {
						if (name !== "api-usage") throw new Error(name);
						return {
							aggregate: (p: unknown[], o?: unknown) => {
								pipelines.push(p);
								aggregateOptions.push(o);
								return { toArray: async () => groups };
							},
						};
					},
				},
			},
		},
	})),
}));

const get = async (qs = "") => {
	const { GET } = await import("../route");
	return GET(new NextRequest(`https://x.test/api/admin/demand-report${qs}`));
};

beforeEach(() => {
	pipelines.length = 0;
	aggregateOptions.length = 0;
});

describe("GET /api/admin/demand-report", () => {
	it("is a 404 with no signed-in user", async () => {
		user = null;
		const res = await get();
		expect(res.status).toBe(404);
		expect(pipelines).toHaveLength(0);
	});

	it("is a 404 for a signed-in partner account", async () => {
		user = { collection: "partner-accounts" };
		const res = await get("?from=2026-10-01&to=2026-10-07");
		expect(res.status).toBe(404);
		expect(pipelines).toHaveLength(0);
	});

	it("serves the report to an admin, uncached", async () => {
		user = { collection: "users" };
		const res = await get("?from=2026-10-01&to=2026-10-07&minTermCount=5");
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toContain("no-store");
		const body = await res.json();
		expect(body.meta).toMatchObject({
			from: "2026-10-01",
			to: "2026-10-07",
			callsCounted: 6,
			callsInRange: 6,
			minTermCount: 5,
		});
		expect(body.clients[0]).toMatchObject({
			client: "cf-worker:stellar.buzz",
			calls: 6,
		});
		expect(body.clients[0].operations[0].topTerms).toEqual([
			{ term: "bump", calls: 6 },
			{ term: "detail", calls: 6 },
			{ term: "fee", calls: 6 },
			{ term: "transactions", calls: 6 },
		]);
		expect(JSON.stringify(body)).not.toContain(
			"fee bump transactions in detail",
		);
		// The window is the whole of both named days, in UTC.
		const match = (pipelines[0][0] as { $match: unknown }).$match;
		expect(JSON.stringify(match)).toContain("2026-10-01T00:00:00.000Z");
		expect(JSON.stringify(match)).toContain("2026-10-08T00:00:00.000Z");
		// A $group keyed on query over a long window may pass 100 MB in memory.
		expect(aggregateOptions[0]).toEqual({ allowDiskUse: true });
	});

	it("holds minTermCount at its floor of 2", async () => {
		user = { collection: "users" };
		const body = await (await get("?minTermCount=0")).json();
		expect(body.meta.minTermCount).toBe(2);
	});

	it("answers 400 to an admin for a bad or oversized window", async () => {
		user = { collection: "users" };
		expect((await get("?from=yesterday")).status).toBe(400);
		expect((await get("?from=2026-10-08&to=2026-10-01")).status).toBe(400);
		expect((await get("?from=2026-01-01&to=2026-10-01")).status).toBe(400);
	});
});
