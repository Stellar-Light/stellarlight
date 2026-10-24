import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { modelRateLimited } from "@/lib/api-error";
import { tooManyMessage } from "@/lib/rate-limit-message";

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
	"hackathons/review": "GET",
	"idea-submissions": "POST",
	lifecycle: "GET",
	"partners/assistant": "POST",
	"partners/magic-link": "POST",
	"partners/match": "POST",
	"partners/onboard": "POST",
	"partners/submit-listing": "POST",
	"repos/trust": "GET",
	"sources/locate": "GET",
	research: "GET",
	"scf-pitch": "GET",
	"vet-idea": "GET",
};

/** The query a route needs before it checks its window: reviewSubmission
 * checks one only for a request with hackathon. */
const QUERY: Record<string, string> = {
	"hackathons/review": "?link=github.com/team/app&hackathon=hackmeridian-2026",
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
				new NextRequest(`https://x.test/api/${path}${QUERY[path] ?? ""}`, {
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
	// The route's own window, not spent: the model is what said no.
	const window = {
		allowed: true,
		limit: 10,
		remaining: 9,
		resetAt: Date.now() + 60_000,
	};
	const wait = async (sent: string | null | undefined) =>
		(await modelRateLimited(sent, window).json()).retryAfterSeconds;

	it("passes the model's own wait on, in seconds, with the window's headers", async () => {
		const res = modelRateLimited("20", window);
		expect(res.status).toBe(429);
		expect(await res.json()).toMatchObject({
			hint: "Wait 20 seconds, then resend the same request.",
			retryAfterSeconds: 20,
		});
		expect(res.headers.get("Retry-After")).toBe("20");
		expect(res.headers.get("X-RateLimit-Scope")).toBe("instance");
		expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
		expect((await modelRateLimited("1", window).json()).hint).toBe(
			"Wait 1 second, then resend the same request.",
		);
	});

	it("rounds a fraction up and caps a huge wait at an hour", async () => {
		expect(await wait("0.2")).toBe(1);
		expect(await wait("1e9")).toBe(3600);
	});

	it("waits a minute when the model sent no positive finite number", async () => {
		for (const sent of [null, undefined, "", "abc", "-5", "Infinity"])
			expect(await wait(sent)).toBe(60);
	});
});

describe("tooManyMessage", () => {
	it("gives people the wait from retryAfterSeconds, never the agent hint", () => {
		expect(tooManyMessage({ retryAfterSeconds: 37 }, "submissions")).toBe(
			"Too many submissions. Try again in 37 seconds.",
		);
		expect(tooManyMessage({ retryAfterSeconds: 1 }, "submissions")).toBe(
			"Too many submissions. Try again in 1 second.",
		);
	});

	it("says shortly when the body carries no usable wait", () => {
		for (const body of [null, {}, { retryAfterSeconds: "37" }])
			expect(tooManyMessage(body, "requests")).toBe(
				"Too many requests. Try again shortly.",
			);
	});
});
