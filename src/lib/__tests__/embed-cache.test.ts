// @vitest-environment node

/**
 * One question fanned out across sources is embedded once per instance, and
 * a slow embedding upstream is abandoned instead of holding the request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
beforeEach(() => {
	process.env.VOYAGE_API_KEY = "test";
	calls.length = 0;
	vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
		const body = JSON.parse(String(init.body)) as { input: string };
		calls.push(body.input);
		if (body.input === "slow") {
			return new Promise((_, reject) => {
				init.signal?.addEventListener("abort", () =>
					reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })),
				);
			});
		}
		return {
			ok: true,
			json: async () => ({ data: [{ embedding: new Array(1024).fill(0.5) }] }),
		};
	});
});
afterEach(() => vi.unstubAllGlobals());

describe("embed", () => {
	it("memoises a query and coalesces concurrent identical calls", async () => {
		const { embed } = await import("../embed");
		const [a, b, c] = await Promise.all([
			embed("how do anchors work"),
			embed("how do anchors work"),
			embed("how do anchors work "),
		]);
		expect(a).toBe(b);
		expect(c).toHaveLength(1024);
		await embed("how do anchors work");
		expect(calls).toEqual(["how do anchors work"]);
	});

	it("passes an abort signal so a slow upstream cannot hold the request", async () => {
		const { embed, EMBED_TIMEOUT_MS } = await import("../embed");
		let seen: AbortSignal | null | undefined;
		vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
			seen = init.signal;
			return {
				ok: true,
				json: async () => ({
					data: [{ embedding: new Array(1024).fill(0.5) }],
				}),
			};
		});
		await embed("a query the cache has not seen");
		expect(seen).toBeInstanceOf(AbortSignal);
		expect(EMBED_TIMEOUT_MS).toBe(8_000);
	});
});
