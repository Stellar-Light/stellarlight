import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// sls-089 at the route: a candidate fetch cut by the real read timeout must
// serve a partial page whose total is unknown, never a confirmed count.
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async () => ({ repos: [], warnings: [] })),
}));

type FindArgs = { collection: string; limit?: number };
/** What each read returns in the current test: rows, an Error to throw, or
 * "hang" for a read that never settles. */
let read: (args: FindArgs, call: number) => unknown[] | Error | "hang";
let candidateCalls = 0;
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(async (args: FindArgs) => {
			const isCandidate = args.collection === "projects" && args.limit === 0;
			const out = read(args, isCandidate ? ++candidateCalls : 0);
			if (out === "hang") return new Promise(() => {});
			if (out instanceof Error) throw out;
			return { docs: out, totalDocs: out.length };
		}),
	})),
}));

const soroswap = {
	id: "p1",
	name: "Soroswap",
	slug: "soroswap",
	category: "Protocol/Contract",
	shortDescription: "AMM decentralized exchange on Soroban.",
	status: "Live",
	types: [],
};
const isCandidate = (a: FindArgs) =>
	a.collection === "projects" && a.limit === 0;

async function search(qs: string) {
	vi.resetModules();
	const { GET } = await import("../route");
	const pending = GET(
		new NextRequest(`https://x.test/api/projects/search?${qs}`),
	);
	// Fake clock: every bounded read gets its full timeout at once.
	await vi.advanceTimersByTimeAsync(10_000);
	const res = await pending;
	return { status: res.status, headers: res.headers, body: await res.json() };
}

describe("GET /api/projects/search when a read fails (sls-089)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubEnv("VOYAGE_API_KEY", "");
		candidateCalls = 0;
		read = (a) => (isCandidate(a) ? [soroswap] : []);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("a timed-out candidate fetch, retried, serves a partial page with no total", async () => {
		read = (a, call) =>
			isCandidate(a) ? (call === 1 ? "hang" : [soroswap]) : [];
		const { status, body } = await search("q=soroswap");
		expect(status).toBe(200);
		expect(body.projects.map((p: { slug: string }) => p.slug)).toEqual([
			"soroswap",
		]);
		expect(body.meta.partial).toBe(true);
		expect(body.meta.counts).toMatchObject({
			returned: 1,
			total: null,
			totalBasis: "partial-read",
		});
		expect(body.meta.failedReads).toEqual([
			{ read: "projects candidate fetch", cause: "timeout after 4000ms" },
		]);
	});

	it("both candidate fetches timed out: a 503 to retry, not an empty page", async () => {
		read = (a) => (isCandidate(a) ? "hang" : []);
		const { status, headers, body } = await search("q=soroswap");
		expect(status).toBe(503);
		expect(body.retryAfterSeconds).toBe(2);
		expect(headers.get("Retry-After")).toBe("2");
		expect(body.advisory).toMatch(/NOT a claim that no project matches/);
	});

	it("a failed decoration read leaves the page partial but its total known", async () => {
		read = (a) =>
			a.collection === "audits"
				? new Error("audits down")
				: isCandidate(a)
					? [soroswap]
					: [];
		const { status, body } = await search("q=soroswap");
		expect(status).toBe(200);
		expect(body.meta.partial).toBe(true);
		expect(body.meta.counts.total).toBe(1);
		expect(body.meta.counts.totalBasis).toBeUndefined();
		expect(body.meta.failedReads.map((f: { read: string }) => f.read)).toEqual([
			"projects audits rollup",
		]);
	});

	it("a complete page says so: partial false, total counted", async () => {
		const { status, body } = await search("q=soroswap");
		expect(status).toBe(200);
		expect(body.meta).toMatchObject({ partial: false, failedReads: [] });
		expect(body.meta.counts.total).toBe(1);
	});

	it("an ignored param is a warning, not a failed read", async () => {
		const { body } = await search("q=soroswap&country=NG");
		expect(body.meta.warnings[0]).toMatch(
			/Unknown parameter\(s\) ignored: country/,
		);
		expect(body.meta).toMatchObject({ partial: false, failedReads: [] });
		expect(body.meta.counts.total).toBe(1);
	});
});
