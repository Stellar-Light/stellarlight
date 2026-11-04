import { describe, expect, it, vi } from "vitest";

// /api/status usage.byEndpoint counted the week's hits by grouping a
// `limit: 10_000` scan in memory, so past 10,000 weekly hits the breakdown
// summed to 10,000 beside the true last7d (25,806 vs 10,000 on 2026-11-04).
// The double stores createdAt as a Date (what Payload writes), caps a find
// at its limit like Payload, and runs $match + $group for the model's
// aggregate.

const DAY = 86_400_000;
type Row = { endpoint: string; uaBucket?: string; createdAt: Date };
const ENDPOINTS = {
	"/api/projects/search": 6500,
	"/api/builders": 4000,
	"/api/status": 1500,
};
const rows: Row[] = [];
for (const [endpoint, n] of Object.entries(ENDPOINTS))
	for (let i = 0; i < n; i++)
		rows.push({
			endpoint,
			uaBucket: i % 3 === 0 ? undefined : i % 2 ? "agent" : "human",
			createdAt: new Date(Date.now() - ((i % 6) + 0.5) * DAY),
		});
for (let i = 0; i < 600; i++)
	rows.push({
		endpoint: "/api/old",
		uaBucket: "agent",
		createdAt: new Date(Date.now() - 9 * DAY),
	});
const WEEK = 12_000;

type Where = { createdAt?: { greater_than?: string } };
const inWindow = (r: Row, w?: Where) =>
	!w?.createdAt?.greater_than ||
	r.createdAt > new Date(w.createdAt.greater_than);
type Stage = Record<string, Record<string, unknown>>;
const aggregate = async (pipeline: Stage[]) => {
	let docs: Array<Record<string, unknown>> = rows;
	for (const stage of pipeline) {
		if (stage.$match) {
			const gt = (stage.$match.createdAt as { $gt?: unknown })?.$gt;
			if (!(gt instanceof Date))
				throw new Error("$match createdAt must be a Date, as stored");
			docs = docs.filter((d) => (d.createdAt as Date) > gt);
		} else if (stage.$group) {
			const key = String(stage.$group._id).replace(/^\$/, "");
			const acc = Object.keys(stage.$group).filter((k) => k !== "_id");
			const groups = new Map<unknown, Record<string, unknown>>();
			for (const d of docs) {
				const id = d[key] ?? null;
				const g = groups.get(id) ?? { _id: id };
				for (const a of acc) g[a] = Number(g[a] ?? 0) + 1;
				groups.set(id, g);
			}
			docs = [...groups.values()];
		} else throw new Error(`unsupported stage ${Object.keys(stage)}`);
	}
	return docs;
};
const fakePayload = {
	count: async ({ where }: { where?: Where }) => ({
		totalDocs: rows.filter((r) => inWindow(r, where)).length,
	}),
	find: async ({ where, limit }: { where?: Where; limit?: number }) => {
		const hit = rows.filter((r) => inWindow(r, where));
		return { docs: limit ? hit.slice(0, limit) : hit, totalDocs: hit.length };
	},
	db: { collections: { "api-usage": { aggregate } } },
};
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => fakePayload),
}));

const sum = (xs: Array<{ count: number }>) =>
	xs.reduce((n, x) => n + x.count, 0);

describe("usage counts per value cover the whole week", () => {
	it("byEndpoint sums to last7d past 10,000 weekly hits", async () => {
		const { getUsageStats } = await import("@/lib/api-usage");
		const stats = await getUsageStats();
		expect(stats?.last7d).toBe(WEEK);
		expect(stats?.byEndpoint).toEqual(
			Object.entries(ENDPOINTS).map(([endpoint, count]) => ({
				endpoint,
				count,
			})),
		);
		expect(sum(stats?.byEndpoint ?? [])).toBe(stats?.last7d);
	});

	it("the agent/human split counts the same week", async () => {
		const { getUsageUaSplit } = await import("@/lib/api-usage");
		const split = await getUsageUaSplit();
		expect(sum(split ?? [])).toBe(WEEK);
		// a row with no uaBucket counts as "other", as before
		const other = rows.filter(
			(r) => !r.uaBucket && r.endpoint !== "/api/old",
		).length;
		expect(split?.find((b) => b.bucket === "other")?.count).toBe(other);
	});
});
