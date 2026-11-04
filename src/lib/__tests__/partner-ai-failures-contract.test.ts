// @vitest-environment node

/**
 * Every failure the partner AI routes serve is a response their operation
 * documents, in the documented shape (#1908). POST /api/partners/match
 * answered an undocumented 502 for hours: the model call failed and the
 * spec listed only 200, 429 and 503. The assistant and onboard routes
 * carried the same undocumented 502, and all three served 400s (and two of
 * them 422s) the spec never listed.
 *
 * The model's failures split two ways, as the assistant and onboard routes
 * already split them: our account cannot call the model (bad key, no
 * permission, no credit) answers the documented 503 `unavailable: true`,
 * which a consumer reads as "fall back, do not retry"; any other provider
 * failure is a 502 for one call, which a later resend can clear.
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
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async () => ({
			docs: [
				{
					slug: "ramp-mx",
					name: "Ramp MX",
					partnerType: "anchor",
					status: "published",
					tagline: "USDC off-ramp in Mexico",
					regions: ["latam"],
				},
			],
			totalDocs: 1,
		}),
		create: async () => ({}),
	})),
}));

const KEY = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
	create.mockReset();
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
/** What the model can throw, and the status class each one must answer. */
const MODEL_FAILURES = {
	overloaded: () => providerError(529, "overloaded_error", "Overloaded"),
	"provider 500": () => providerError(500, "api_error", "Internal error"),
	offline: () => new Anthropic.APIConnectionError({ message: "offline" }),
	"model rate limit": () =>
		providerError(429, "rate_limit_error", "Too many requests"),
	"no credit": () =>
		providerError(
			400,
			"invalid_request_error",
			"Your credit balance is too low to access the Anthropic API.",
		),
	"bad key": () =>
		providerError(401, "authentication_error", "invalid x-api-key"),
	"no permission": () => providerError(403, "permission_error", "not allowed"),
};
const ACCOUNT_FAILURES = new Set(["no credit", "bad key", "no permission"]);

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
	return { status: res.status, body: await res.json() };
};

type Schema = {
	$ref?: string;
	required?: string[];
	properties?: Record<string, unknown>;
};
const components = (spec.components as { schemas: Record<string, Schema> })
	.schemas;
const resolve = (s: Schema): Schema =>
	s.$ref ? resolve(components[s.$ref.split("/").pop() as string]) : s;

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
	const schema = resolve(
		(doc.content as Record<string, { schema: Schema }>)["application/json"]
			.schema,
	);
	for (const key of schema.required ?? []) expect(res.body).toHaveProperty(key);
	for (const key of Object.keys(res.body))
		expect(schema.properties, `${path} ${res.status}`).toHaveProperty(key);
	expect(typeof res.body.error).toBe("string");
}

describe("partner AI routes: every model failure is a documented response", () => {
	for (const path of Object.keys(ROUTES) as Path[]) {
		for (const [name, failure] of Object.entries(MODEL_FAILURES)) {
			it(`${path}: ${name}`, async () => {
				create.mockRejectedValue(failure());
				const res = await post(path, ROUTES[path]);
				expectDocumented(path, res);
				if (name === "model rate limit") expect(res.status).toBe(429);
				else if (ACCOUNT_FAILURES.has(name)) {
					// The feature is off until the account is fixed: the
					// documented do-not-retry answer, never a retryable 502.
					expect(res.status).toBe(503);
					expect(res.body.unavailable).toBe(true);
				} else {
					expect(res.status).toBe(502);
					expect(res.body.unavailable).toBeUndefined();
				}
			});
		}
	}
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
