// @vitest-environment node

/**
 * Every failure the partner AI routes serve is a response their operation
 * documents, in the documented shape (#1908). POST /api/partners/match
 * answered an undocumented 502 for hours: the model call failed and the
 * spec listed only 200, 429 and 503. The assistant and onboard routes
 * carried the same undocumented 502, and all three served 400s (and two of
 * them 422s) the spec never listed.
 *
 * A failed model call is classified by the SDK's error class and HTTP
 * status, never by its wording: the provider refusing our request or our
 * account (any 4xx but 429) is the documented 503 `unavailable: true`, with
 * no Retry-After because a resend cannot help; a provider failure of one
 * call (5xx, no connection, timeout) is the documented 502; anything that is
 * not a provider error is this service's own documented 500. A directory
 * read that fails is an outage, never an empty answer.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { spec } from "@/lib/openapi-spec";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", async (orig) => {
	const actual = await orig<typeof import("@anthropic-ai/sdk")>();
	// The real client and error classes, with the model call stubbed.
	class Client extends actual.default {
		constructor(opts?: ConstructorParameters<typeof actual.default>[0]) {
			super(opts);
			Object.assign(this, { messages: { create } });
		}
	}
	return { ...actual, default: Client };
});
vi.mock("@/lib/rate-limit", async (orig) => ({
	...(await orig<typeof import("@/lib/rate-limit")>()),
	rateLimit: vi.fn(() => ({
		allowed: true,
		limit: 20,
		remaining: 19,
		resetAt: Date.now() + 60_000,
	})),
}));
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

/** The partner directory as the routes see it on this request. */
let directory: "ok" | "empty" | "no-handle" | "throws" = "ok";
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () =>
		directory === "no-handle"
			? null
			: {
					find: async () => {
						if (directory === "throws") throw new Error("socket closed");
						const docs =
							directory === "empty"
								? []
								: [
										{
											slug: "ramp-mx",
											name: "Ramp MX",
											partnerType: "anchor",
											status: "published",
											tagline: "USDC off-ramp in Mexico",
											regions: ["latam"],
										},
									];
						return { docs, totalDocs: docs.length };
					},
					create: async () => ({}),
				},
	),
}));

const KEY = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
	create.mockReset();
	directory = "ok";
	process.env.ANTHROPIC_API_KEY = "test-key-not-real";
});
afterAll(() => {
	if (KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
	else process.env.ANTHROPIC_API_KEY = KEY;
});

const providerError = (status: number, type: string, message: string) =>
	Anthropic.APIError.generate(
		status,
		{ type: "error", error: { type, message } },
		undefined,
		new Headers({ "retry-after": "20" }),
	);
/** What the model call can throw, and the status each one must answer. */
const MODEL_FAILURES: Array<[string, () => unknown, number]> = [
	[
		"model rate limit",
		() => providerError(429, "rate_limit_error", "Too many requests"),
		429,
	],
	[
		"no credit",
		() =>
			providerError(
				400,
				"invalid_request_error",
				"Your credit balance is too low to access the Anthropic API.",
			),
		503,
	],
	[
		"request the model rejects",
		() => providerError(400, "invalid_request_error", "max_tokens: too large"),
		503,
	],
	[
		"bad key",
		() => providerError(401, "authentication_error", "invalid x-api-key"),
		503,
	],
	[
		"no permission",
		() => providerError(403, "permission_error", "not allowed"),
		503,
	],
	[
		"retired model",
		() => providerError(404, "not_found_error", "model: claude-x"),
		503,
	],
	[
		"provider 500",
		() => providerError(500, "api_error", "Internal error"),
		502,
	],
	[
		"overloaded",
		() => providerError(529, "overloaded_error", "Overloaded"),
		502,
	],
	[
		"offline",
		() => new Anthropic.APIConnectionError({ message: "offline" }),
		502,
	],
	["timeout", () => new Anthropic.APIConnectionTimeoutError(), 502],
	// Wording is not a classifier: the credit text outside a provider error
	// is this service's own failure, not an account the provider refused.
	[
		"plain Error with credit wording",
		() => new Error("Your credit balance is too low"),
		500,
	],
	["non-Error throw", () => "boom", 500],
];

const user = (content: string) => [{ role: "user", content }];
const ROUTES = {
	"/api/partners/match": { need: "USDC off-ramp in Mexico" },
	"/api/partners/assistant": { messages: user("I need a MXN off-ramp") },
	"/api/partners/onboard": { mode: "chat", messages: user("We are a ramp") },
} as const;
type Path = keyof typeof ROUTES;

const post = async (path: Path, body: unknown) => {
	const mod = await import(`@/app${path}/route`);
	const res: Response = await mod.POST(
		new NextRequest(`https://x.test${path}`, {
			method: "POST",
			body: typeof body === "string" ? body : JSON.stringify(body),
			headers: { "content-type": "application/json" },
		}),
	);
	return { status: res.status, headers: res.headers, body: await res.json() };
};

type Schema = {
	$ref?: string;
	required?: string[];
	properties?: Record<string, unknown>;
	allOf?: Schema[];
	oneOf?: Schema[];
};
const components = (spec.components as { schemas: Record<string, Schema> })
	.schemas;
const resolve = (s: Schema): Schema =>
	s.$ref ? resolve(components[s.$ref.split("/").pop() as string]) : s;
/** The shapes a body may take: each oneOf branch, an allOf merged. */
const shapes = (s: Schema): Schema[] => {
	const r = resolve(s);
	if (r.oneOf) return r.oneOf.flatMap(shapes);
	if (r.allOf) {
		const parts = r.allOf.map(resolve);
		return [
			{
				required: parts.flatMap((p) => p.required ?? []),
				properties: Object.assign({}, ...parts.map((p) => p.properties ?? {})),
			},
		];
	}
	return [r];
};

/** The documented response for this status, and the body checked against it. */
function expectDocumented(
	path: Path,
	res: { status: number; body: Record<string, unknown> },
) {
	const op = (spec.paths[path] as { post: { responses: object } }).post;
	const doc = (op.responses as Record<string, Record<string, unknown>>)[
		String(res.status)
	];
	expect(
		doc,
		`${path} served ${res.status}, which its operation does not document`,
	).toBeDefined();
	const schema = (doc.content as Record<string, { schema: Schema }>)[
		"application/json"
	].schema;
	const fits = (s: Schema) =>
		(s.required ?? []).every((k) => k in res.body) &&
		Object.keys(res.body).every((k) => k in (s.properties ?? {}));
	expect(
		shapes(schema).some(fits),
		`${path} ${res.status} body ${JSON.stringify(res.body)} fits no documented shape`,
	).toBe(true);
	expect(typeof res.body.error).toBe("string");
}

describe("partner AI routes: every model failure is a documented response", () => {
	for (const path of Object.keys(ROUTES) as Path[]) {
		for (const [name, failure, status] of MODEL_FAILURES) {
			it(`${path}: ${name} answers ${status}`, async () => {
				create.mockRejectedValue(failure());
				const res = await post(path, ROUTES[path]);
				expect(res.status).toBe(status);
				expectDocumented(path, res);
				if (status === 503) {
					// Off until we fix it: the documented do-not-retry answer, and
					// no Retry-After inviting the resend that cannot help.
					expect(res.body.unavailable).toBe(true);
					expect(res.headers.get("Retry-After")).toBeNull();
				} else expect(res.body.unavailable).toBeUndefined();
			});
		}
	}

	it("the no-key 503 carries no Retry-After either", async () => {
		delete process.env.ANTHROPIC_API_KEY;
		for (const path of Object.keys(ROUTES) as Path[]) {
			const res = await post(path, ROUTES[path]);
			expect(res.status).toBe(503);
			expect(res.body.unavailable).toBe(true);
			expect(res.headers.get("Retry-After")).toBeNull();
			expectDocumented(path, res);
		}
	});
});

describe("partner AI routes: bad input and unusable model output are documented", () => {
	it.each([
		["/api/partners/match", "{not json"],
		["/api/partners/match", { need: "  " }],
		["/api/partners/assistant", "{not json"],
		["/api/partners/assistant", { messages: [] }],
		["/api/partners/onboard", "{not json"],
		["/api/partners/onboard", { mode: "extract", messages: [] }],
		["/api/partners/onboard", { mode: "summarize", messages: user("hi") }],
	] as Array<[Path, unknown]>)("%s 400 for %j", async (path, body) => {
		const res = await post(path, body);
		expect(res.status).toBe(400);
		expectDocumented(path, res);
		expect(create).not.toHaveBeenCalled();
	});

	it("an unknown match type answers the documented 400 with validTypes", async () => {
		const res = await post("/api/partners/match", {
			need: "USDC off-ramp",
			type: "nope",
		});
		expect(res.status).toBe(400);
		expect(res.body.validTypes).toContain("anchor");
		expectDocumented("/api/partners/match", res);
	});

	const extract = { mode: "extract", messages: user("We are a ramp") };
	it.each([
		["/api/partners/match", ROUTES["/api/partners/match"], "end_turn", 502],
		["/api/partners/match", ROUTES["/api/partners/match"], "refusal", 422],
		["/api/partners/onboard", extract, "end_turn", 502],
		["/api/partners/onboard", extract, "refusal", 422],
	] as Array<[Path, unknown, string, number]>)(
		"%s: model output that cannot be used (%j, %s) answers a documented %i",
		async (path, body, stop_reason, status) => {
			create.mockResolvedValue({
				stop_reason,
				content: [{ type: "text", text: "not json" }],
			});
			const res = await post(path, body);
			expect(res.status).toBe(status);
			expectDocumented(path, res);
		},
	);
});

describe("a failed directory read is an outage, never an empty answer", () => {
	it.each(["no-handle", "throws"] as const)(
		"match: %s answers the documented 503 RetryableError",
		async (state) => {
			directory = state;
			const res = await post(
				"/api/partners/match",
				ROUTES["/api/partners/match"],
			);
			expect(res.status).toBe(503);
			expect(res.body.unavailable).toBeUndefined();
			expect(res.body.retryAfterSeconds).toBe(2);
			expect(res.headers.get("Retry-After")).toBe("2");
			expectDocumented("/api/partners/match", res);
			expect(create).not.toHaveBeenCalled();
		},
	);

	it("match: a read that finds no partner is still the checked-empty 200", async () => {
		directory = "empty";
		const res = await post(
			"/api/partners/match",
			ROUTES["/api/partners/match"],
		);
		expect(res.status).toBe(200);
		expect(res.body.matches).toEqual([]);
		expect(res.body.meta.candidatesConsidered).toBe(0);
	});

	it("assistant: a failed search tells the model it could not read, and serves no matches", async () => {
		directory = "throws";
		create
			.mockResolvedValueOnce({
				stop_reason: "tool_use",
				content: [
					{
						type: "tool_use",
						id: "t1",
						name: "search_partners",
						input: { need: "MXN off-ramp" },
					},
				],
			})
			.mockResolvedValueOnce({
				stop_reason: "end_turn",
				content: [{ type: "text", text: "The directory is down." }],
			});
		const res = await post(
			"/api/partners/assistant",
			ROUTES["/api/partners/assistant"],
		);
		expect(res.status).toBe(200);
		expect(res.body.matches).toBeUndefined();
		const toolTurn = JSON.stringify(create.mock.calls[1][0].messages.at(-1));
		expect(toolTurn).toContain("could not be read");
		expect(toolTurn).not.toContain("No published partners match");
	});
});
