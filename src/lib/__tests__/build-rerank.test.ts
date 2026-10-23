// @vitest-environment node

/**
 * The rerank stage over hackathon build search (2026-10-23): the hybrid
 * ranking's top RERANK_TOP reordered by a cross-encoder, which reads
 * the query with each build's name and summary. If the reranker fails or is
 * slow, today's order is served and the caller says so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "../hackathon-builds";

vi.mock("@/lib/hackathon-build-semantic", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-build-semantic")>()),
	semanticBuildScores: vi.fn(async () => new Map<string, number>()),
}));

const row = (id: string, description: string | null = `about ${id}`) => ({
	b: { id, name: id, description },
});
type Body = { model: string; query: string; documents: string[] };
const calls: Body[] = [];
/** The reranker's score for a document; set per test. */
let scoreOf: (doc: string) => number = () => 0.5;
const answer = (body: Body) => ({
	ok: true,
	status: 200,
	json: async () => ({
		data: body.documents.map((d, index) => ({
			index,
			relevance_score: scoreOf(d),
		})),
	}),
});
beforeEach(() => {
	vi.stubEnv("VOYAGE_API_KEY", "test");
	calls.length = 0;
	scoreOf = () => 0.5;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url: string, init: RequestInit) => {
			const body = JSON.parse(String(init.body)) as Body;
			calls.push(body);
			return answer(body);
		}),
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

describe("rerankBuilds", () => {
	it("reorders the top candidates by the reranker's score and keeps the rest in order", async () => {
		const { rerankBuilds, RERANK_MODEL, RERANK_TOP } = await import(
			"../build-rerank"
		);
		const ranked = [
			...Array.from({ length: RERANK_TOP + 5 }, (_, i) => row(`r${i}`)),
		];
		ranked[3] = row("r3", null);
		// r7 reads best, r3 next; the rest tie and keep their order.
		scoreOf = (d) => (d.startsWith("r7.") ? 0.9 : d === "r3" ? 0.8 : 0.1);
		const out = await rerankBuilds("order query", ranked);
		expect(out.ranked.slice(0, 4).map((s) => s.b.id)).toEqual([
			"r7",
			"r3",
			"r0",
			"r1",
		]);
		expect(out.ranked.slice(RERANK_TOP).map((s) => s.b.id)).toEqual(
			ranked.slice(RERANK_TOP).map((s) => s.b.id),
		);
		expect(out.ranked).toHaveLength(ranked.length);
		expect(out.scores?.get("r7")).toBe(0.9);
		expect(calls).toHaveLength(1);
		expect(calls[0].model).toBe(RERANK_MODEL);
		expect(calls[0].query).toBe("order query");
		// The name and the one-line summary; a build with no summary is its name.
		expect(calls[0].documents).toHaveLength(RERANK_TOP);
		expect(calls[0].documents[0]).toBe("r0. about r0");
		expect(calls[0].documents[3]).toBe("r3");
	});

	it("serves today's order and null scores when the reranker answers an error", async () => {
		const { rerankBuilds } = await import("../build-rerank");
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: false,
			status: 503,
			json: async () => ({}),
		} as Response);
		const ranked = [row("a"), row("b")];
		const out = await rerankBuilds("error query", ranked);
		expect(out.ranked).toEqual(ranked);
		expect(out.scores).toBeNull();
	});

	it("serves today's order when the call throws", async () => {
		const { rerankBuilds } = await import("../build-rerank");
		vi.mocked(fetch).mockRejectedValueOnce(new Error("network"));
		const ranked = [row("a"), row("b")];
		const out = await rerankBuilds("throw query", ranked);
		expect(out.ranked).toEqual(ranked);
		expect(out.scores).toBeNull();
	});

	it("serves today's order when an answer leaves a candidate unscored", async () => {
		const { rerankBuilds } = await import("../build-rerank");
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({ data: [{ index: 1, relevance_score: 0.9 }] }),
		} as Response);
		const ranked = [row("a"), row("b")];
		const out = await rerankBuilds("partial query", ranked);
		expect(out.ranked).toEqual(ranked);
		expect(out.scores).toBeNull();
	});

	it("gives up after RERANK_TIMEOUT_MS and serves today's order", async () => {
		vi.useFakeTimers();
		const { rerankBuilds, RERANK_TIMEOUT_MS } = await import("../build-rerank");
		vi.mocked(fetch).mockImplementationOnce(
			(_url, init) =>
				new Promise((_, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
					);
				}),
		);
		const ranked = [row("a"), row("b")];
		let settled = false;
		const pending = rerankBuilds("slow query", ranked).finally(() => {
			settled = true;
		});
		await vi.advanceTimersByTimeAsync(RERANK_TIMEOUT_MS - 1);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		const out = await pending;
		expect(out.ranked).toEqual(ranked);
		expect(out.scores).toBeNull();
	});

	it("answers a repeated query over the same candidates from its cache", async () => {
		const { rerankBuilds } = await import("../build-rerank");
		scoreOf = (d) => (d.startsWith("b.") ? 0.9 : 0.1);
		const first = await rerankBuilds("cached query", [row("a"), row("b")]);
		const again = await rerankBuilds("cached query", [row("a"), row("b")]);
		expect(calls).toHaveLength(1);
		expect(again.ranked.map((s) => s.b.id)).toEqual(["b", "a"]);
		expect(again.scores).toEqual(first.scores);
		// Other candidates are another question.
		await rerankBuilds("cached query", [row("a"), row("c")]);
		expect(calls).toHaveLength(2);
	});

	it("is not attempted without a key: undefined scores, no call", async () => {
		vi.stubEnv("VOYAGE_API_KEY", "");
		const { rerankBuilds } = await import("../build-rerank");
		const ranked = [row("a"), row("b")];
		const out = await rerankBuilds("keyless query", ranked);
		expect(out.ranked).toEqual(ranked);
		expect(out.scores).toBeUndefined();
		expect(calls).toHaveLength(0);
	});

	it("reranks an empty list without a call", async () => {
		const { rerankBuilds } = await import("../build-rerank");
		const out = await rerankBuilds("empty query", []);
		expect(out.ranked).toEqual([]);
		expect(out.scores?.size).toBe(0);
		expect(calls).toHaveLength(0);
	});
});

describe("queryBuilds with rerank", () => {
	const build = (id: string, description: string): IndexedBuild => ({
		id,
		name: id,
		description,
		githubUrl: null,
		demoUrl: null,
		videoUrl: null,
		track: null,
		hackathonPlacement: null,
		award: null,
		isWinner: false,
		voteCount: null,
		url: `https://dorahacks.io/buidl/${id}`,
		source: "dorahacks",
		hackathon: { title: "E", slug: "e", endedAt: "2025-01-15" },
		haystack: `${id} ${description}`.toLowerCase(),
	});
	const index = [
		build("alpha", "remittance remittance corridor"),
		build("beta", "remittance app"),
	];
	const filters = (mode: "hybrid" | "keyword") => ({
		q: "remittance",
		mode,
		winnersOnly: false,
		hackathons: [],
	});

	it("reorders hybrid results and returns the scores", async () => {
		const { queryBuilds } = await import("../hackathon-build-query");
		scoreOf = (d) => (d.startsWith("beta.") ? 0.9 : 0.2);
		const plain = await queryBuilds(index, filters("hybrid"));
		const out = await queryBuilds(index, filters("hybrid"), { rerank: true });
		expect(plain.rerank).toBeUndefined();
		expect(out.scored.map((s) => s.b.id)).toEqual(["beta", "alpha"]);
		expect(out.rerank?.get("beta")).toBe(0.9);
		expect(out.warnings).toEqual([]);
	});

	it("says so and keeps the hybrid order when the reranker fails", async () => {
		const { queryBuilds } = await import("../hackathon-build-query");
		vi.mocked(fetch).mockRejectedValueOnce(new Error("network"));
		// Another q than the test above, so the cache cannot answer.
		const f = { ...filters("hybrid"), q: "remittance corridor" };
		const out = await queryBuilds(index, f, { rerank: true });
		const plain = await queryBuilds(index, f);
		expect(out.scored.map((s) => s.b.id)).toEqual(["alpha", "beta"]);
		expect(out.scored.map((s) => s.b.id)).toEqual(
			plain.scored.map((s) => s.b.id),
		);
		expect(out.rerank).toBeNull();
		expect(out.warnings).toEqual([
			"the reranker could not run this request (failed or slower than 2 s), so rows are in hybrid order",
		]);
	});

	it("is not attempted when meaning did not run", async () => {
		const { queryBuilds } = await import("../hackathon-build-query");
		const out = await queryBuilds(index, filters("keyword"), { rerank: true });
		expect(out.rerank).toBeUndefined();
		expect(calls).toHaveLength(0);
	});
});
