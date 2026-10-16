import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// sls-089 at the route: a candidate fetch cut by the real read timeout must
// serve a partial page whose total is unknown, never a confirmed count.
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async () => ({ repos: [], warnings: [] })),
}));

type FindArgs = {
	collection: string;
	limit?: number;
	where?: unknown;
	select?: { embedding?: boolean; name?: boolean };
};
/** What each read returns in the current test: rows, an Error to throw, or
 * "hang" for a read that never settles. */
let read: (args: FindArgs, call: number) => unknown[] | Error | "hang";
let candidateCalls = 0;
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(async (args: FindArgs) => {
			const out = read(args, isCandidate(args) ? ++candidateCalls : 0);
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
// The candidate fetch (and its retry): the whole match set, embedding left out.
const isCandidate = (a: FindArgs) =>
	a.collection === "projects" && a.limit === 0 && a.select?.embedding === false;

async function search(qs: string) {
	vi.resetModules();
	const { GET } = await import("../route");
	const t0 = Date.now();
	let ms = 0;
	const pending = GET(
		new NextRequest(`https://x.test/api/projects/search?${qs}`),
	).then((r) => {
		ms = Date.now() - t0;
		return r;
	});
	// Fake clock: every bounded read gets its full timeout at once.
	await vi.advanceTimersByTimeAsync(10_000);
	const res = await pending;
	return {
		status: res.status,
		headers: res.headers,
		body: await res.json(),
		ms,
	};
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
		const { status, headers, body, ms } = await search("q=soroswap");
		expect(status).toBe(503);
		// 4 s for the first read, the 2 s left of the 6 s budget for the retry.
		expect(ms).toBe(6_000);
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

	it("a search that finds nothing is a confirmed empty page, not partial", async () => {
		read = () => [];
		const { status, body } = await search("q=zzqxv");
		expect(status).toBe(200);
		expect(body.projects).toEqual([]);
		expect(body.meta).toMatchObject({ partial: false, failedReads: [] });
		expect(body.meta.counts.total).toBe(0);
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

// sls-094: a typo-distance name recovery served its rows at "strict" while
// meta.didYouMean said no project has the spelling asked for.
describe("GET /api/projects/search after a typo recovery (sls-094)", () => {
	const freighter = {
		id: "p2",
		name: "Freighter",
		slug: "freighter",
		category: "User-Facing App",
		shortDescription: "Browser extension wallet for Stellar.",
		status: "Live",
		types: ["Wallet"],
	};
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubEnv("VOYAGE_API_KEY", "");
		candidateCalls = 0;
		// The name registry holds Freighter; a candidate fetch finds it only
		// when its clauses name it (the typed spelling matches nothing).
		read = (a) => {
			if (a.collection === "projects" && a.select?.name)
				return [
					{ name: "Freighter", slug: "freighter" },
					{ name: "Soroswap", slug: "soroswap" },
				];
			if (isCandidate(a))
				return JSON.stringify(a.where).includes('"freighter"')
					? [freighter]
					: [];
			return [];
		};
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("labels the recovered page corrected and names the project", async () => {
		const { status, body } = await search("q=frieghter");
		expect(status).toBe(200);
		expect(body.projects.map((p: { slug: string }) => p.slug)).toEqual([
			"freighter",
		]);
		expect(body.meta.didYouMean).toMatchObject({
			from: "frieghter",
			to: "Freighter",
		});
		expect(body.meta.matchMode).toBe("corrected");
		expect(body.meta.matchModeLabel).toMatch(/'frieghter'.*'Freighter'/);
	});

	it("the right spelling stays strict, with no correction", async () => {
		const { body } = await search("q=freighter");
		expect(body.meta.didYouMean).toBeUndefined();
		expect(body.meta.matchMode).toBe("strict");
	});
});
