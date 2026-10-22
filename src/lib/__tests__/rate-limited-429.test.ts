import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { modelRateLimited } from "@/lib/api-error";

// Every window spent, with 37 seconds left: the number each body must state.
vi.mock("@/lib/rate-limit", async (orig) => ({
	...(await orig<typeof import("@/lib/rate-limit")>()),
	rateLimit: vi.fn(() => ({
		allowed: false,
		limit: 60,
		remaining: 0,
		resetAt: Date.now() + 37_000,
	})),
}));
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

/** Every route that answers 429, and the method that checks its window. */
const ROUTES: Record<string, "GET" | "POST"> = {
	"ask/answer": "POST",
	audits: "GET",
	"awards/anchor": "GET",
	"awards/ballot-status": "POST",
	"awards/ballot-xdr": "POST",
	"awards/eligibility": "GET",
	"awards/results": "GET",
	"awards/round": "GET",
	"awards/submit": "POST",
	changes: "GET",
	"community-skills": "POST",
	contracts: "GET",
	feedback: "POST",
	"hackathon-brief": "GET",
	"idea-submissions": "POST",
	lifecycle: "GET",
	"partners/assistant": "POST",
	"partners/magic-link": "POST",
	"partners/match": "POST",
	"partners/onboard": "POST",
	"partners/submit-listing": "POST",
	"repos/trust": "GET",
	research: "GET",
	"scf-pitch": "GET",
	"vet-idea": "GET",
};

const API = join(process.cwd(), "src/app/api");
const routeFiles = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory()
			? routeFiles(join(dir, e.name))
			: e.name === "route.ts"
				? [join(dir, e.name)]
				: [],
	);

describe("every 429 states the wait where any consumer keeps it", () => {
	it("covers every route that checks a rate window", () => {
		const limited = routeFiles(API)
			.filter((f) => readFileSync(f, "utf8").includes("rateLimit("))
			.map((f) => relative(API, f).replace(/\/route\.ts$/, ""))
			.sort();
		expect(limited).toEqual(Object.keys(ROUTES).sort());
	});

	it.each(Object.entries(ROUTES))(
		"%s puts the wait and the next step in hint",
		async (path, method) => {
			const mod = await import(`@/app/api/${path}/route`);
			const res: Response = await mod[method](
				new NextRequest(`https://x.test/api/${path}`, {
					method,
					...(method === "POST"
						? { body: "{}", headers: { "content-type": "application/json" } }
						: {}),
				}),
			);
			expect(res.status).toBe(429);
			const body = await res.json();
			expect(body.hint).toBe("Wait 37 seconds, then resend the same request.");
			expect(body.retryAfterSeconds).toBe(37);
			expect(res.headers.get("Retry-After")).toBe("37");
		},
	);
});

describe("modelRateLimited", () => {
	it("passes the model's own wait on, in seconds", async () => {
		const res = modelRateLimited("20");
		expect(res.status).toBe(429);
		expect(await res.json()).toMatchObject({
			hint: "Wait 20 seconds, then resend the same request.",
			retryAfterSeconds: 20,
		});
		expect(res.headers.get("Retry-After")).toBe("20");
		expect((await modelRateLimited("1").json()).hint).toBe(
			"Wait 1 second, then resend the same request.",
		);
	});

	it("waits a minute when the model sent no wait it can read", async () => {
		for (const sent of [null, undefined, "", "soon"])
			expect((await modelRateLimited(sent).json()).retryAfterSeconds).toBe(60);
	});
});
