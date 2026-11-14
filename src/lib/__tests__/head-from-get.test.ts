/**
 * HEAD on a Payload REST route (2026-11-13): GET /api/media/file/<name>
 * answered 200 and HEAD on the same URL answered 404. Next hands a HEAD to
 * the route's GET handler when the route exports no HEAD, and Payload matches
 * an endpoint on the request's method, so "head" matched nothing. A link
 * checker that asks with HEAD read every logo as dead.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { headFromGet } from "../head-from-get";

const ctx = { params: Promise.resolve({ slug: ["media", "file", "a.png"] }) };

describe("headFromGet", () => {
	it("asks the GET handler as a GET, same URL, headers and context", async () => {
		const get = vi.fn(async (_req: Request, _ctx: typeof ctx) =>
			Response.json({ ok: true }),
		);
		await headFromGet(get)(
			new Request("https://example.invalid/api/media/file/a.png?x=1", {
				method: "HEAD",
				headers: { "if-none-match": '"abc"' },
			}),
			ctx,
		);
		const [req, passed] = get.mock.calls[0];
		expect(req.method).toBe("GET");
		expect(req.url).toBe("https://example.invalid/api/media/file/a.png?x=1");
		expect(req.headers.get("if-none-match")).toBe('"abc"');
		expect(passed).toBe(ctx);
	});

	it("answers with GET's status and headers and no body", async () => {
		let cancelled = false;
		const body = new ReadableStream({
			pull: (c) => c.enqueue(new Uint8Array(1024)),
			cancel: () => {
				cancelled = true;
			},
		});
		const res = await headFromGet(
			async () =>
				new Response(body, {
					status: 200,
					headers: { "content-type": "image/png", "content-length": "894062" },
				}),
		)(new Request("https://example.invalid/a.png", { method: "HEAD" }), ctx);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/png");
		expect(res.headers.get("content-length")).toBe("894062");
		expect(res.body).toBeNull();
		// the file is not streamed out of the store for a HEAD
		expect(cancelled).toBe(true);
	});

	it("keeps a 404 a 404", async () => {
		const res = await headFromGet(
			async () => new Response(null, { status: 404 }),
		)(new Request("https://example.invalid/gone.png", { method: "HEAD" }), ctx);
		expect(res.status).toBe(404);
	});

	it("is the Payload REST route's HEAD", () => {
		const route = readFileSync(
			"src/app/(payload)/api/[...slug]/route.ts",
			"utf8",
		);
		expect(route).toContain("export const HEAD = headFromGet(GET);");
	});
});
