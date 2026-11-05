import { describe, expect, it, vi } from "vitest";

// /api/status usage.byEndpoint counted the week's hits by grouping a
// `limit: 10_000` scan in memory, so past 10,000 weekly hits the breakdown
// summed to 10,000 beside the true last7d (25,806 vs 10,000 on 2026-11-04).
// The log holds createdAt as a Date (what payload.create writes) and, for
// some rows, as an ISO string; Mongo compares values of one type only, so a
// count bounded by a Date alone skips the string-stored rows. The double
// applies that rule, casts payload.count's bound to a Date as Payload does,
// caps a find at its limit, and runs $match + $group for the aggregate.

const DAY = 86_400_000;
type Row = { endpoint: string; uaBucket?: string; createdAt: Date | string };
const ago = (days: number) => new Date(Date.now() - days * DAY);
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
			createdAt: ago((i % 6) + 0.5),
		});
// hits stored with an ISO-string createdAt: 25 this week, 10 older
for (let i = 0; i < 25; i++)
	rows.push({
		endpoint: "/api/builders",
		uaBucket: "agent",
		createdAt: ago(0.25).toISOString(),
	});
for (let i = 0; i < 600; i++)
	rows.push({ endpoint: "/api/old", uaBucket: "agent", createdAt: ago(9) });
for (let i = 0; i < 10; i++)
	rows.push({
		endpoint: "/api/old",
		uaBucket: "agent",
		createdAt: ago(9).toISOString(),
	});
const time = (r: Row) => new Date(r.createdAt).getTime();
const WEEK = rows.filter((r) => time(r) > ago(7).getTime()).length;
const DAY1 = rows.filter((r) => time(r) > ago(1).getTime()).length;

// Mongo: a bound compares only against values of its own type
const gt = (v: unknown, bound: unknown) =>
	bound instanceof Date
		? v instanceof Date && v > bound
		: typeof bound === "string" && typeof v === "string" && v > bound;
type Match = Record<string, unknown>;
const matches = (d: Record<string, unknown>, m: Match): boolean =>
	Object.entries(m).every(([k, c]) => {
		if (k === "$or") return (c as Match[]).some((x) => matches(d, x));
		const op = c as { $gt?: unknown };
		if (!("$gt" in op)) throw new Error(`unsupported $match on ${k}`);
		return gt(d[k], op.$gt);
	});
type Stage = Record<string, Record<string, unknown>>;
const aggregate = async (pipeline: Stage[]) => {
	let docs: Array<Record<string, unknown>> = rows;
	for (const stage of pipeline) {
		if (stage.$match) docs = docs.filter((d) => matches(d, stage.$match));
		else if (stage.$group) {
			const id = stage.$group._id;
			const key = typeof id === "string" ? id.replace(/^\$/, "") : null;
			const acc = Object.keys(stage.$group).filter((k) => k !== "_id");
			const groups = new Map<unknown, Record<string, unknown>>();
			for (const d of docs) {
				const v = key ? (d[key] ?? null) : null;
				const g = groups.get(v) ?? { _id: v };
				for (const a of acc) g[a] = Number(g[a] ?? 0) + 1;
				groups.set(v, g);
			}
			docs = [...groups.values()];
		} else throw new Error(`unsupported stage ${Object.keys(stage)}`);
	}
	return docs;
};
type Where = { createdAt?: { greater_than?: string } };
// Payload casts a date bound to a Date before it reaches Mongo
const inWindow = (r: Row, w?: Where) =>
	!w?.createdAt?.greater_than ||
	gt(r.createdAt, new Date(w.createdAt.greater_than));
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
		expect(sum(stats?.byEndpoint ?? [])).toBe(stats?.last7d);
		expect(stats?.byEndpoint).toEqual([
			{ endpoint: "/api/projects/search", count: 6500 },
			{ endpoint: "/api/builders", count: 4025 },
			{ endpoint: "/api/status", count: 1500 },
		]);
	});

	it("counts a hit stored with a string createdAt, in last24h and last7d", async () => {
		const { getUsageStats } = await import("@/lib/api-usage");
		const stats = await getUsageStats();
		expect(stats?.last24h).toBe(DAY1);
		expect(stats?.last7d).toBe(12_025);
		expect(stats?.total).toBe(rows.length);
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
