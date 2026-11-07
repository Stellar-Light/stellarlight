// @vitest-environment node

/**
 * The last three partner surfaces under the round's rules (#1908, #1909):
 * the changes feed counts a stellar.toml read only when it is recorded (its
 * source URL and its date, hasTomlRead); submitPartnerListing's outage is the
 * documented 503 RetryableError, not an undocumented `unavailable` a consumer
 * reads as "do not retry"; matchPartners documents the body fields it reads.
 */
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { spec } from "@/lib/openapi-spec";
import { PARTNER_TYPES } from "@/lib/partner-match";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/rate-limit", async (orig) => ({
	...(await orig<typeof import("@/lib/rate-limit")>()),
	rateLimit: vi.fn(() => ({
		allowed: true,
		limit: 20,
		remaining: 19,
		resetAt: Date.now() + 60_000,
	})),
}));

const partners = [
	{
		slug: "anchor-read",
		updatedAt: "2026-10-01T00:00:00.000Z",
		tomlFetchedAt: "2026-10-01",
		tomlSourceUrl: "https://read.example/.well-known/stellar.toml",
	},
	{
		slug: "anchor-date-only",
		updatedAt: "2026-10-01T00:00:00.000Z",
		tomlFetchedAt: "2026-10-01",
		tomlSourceUrl: null,
	},
];
type Where = Record<string, unknown>;
/** The where operators the changes feed sends, evaluated on a row. */
const holds = (d: Record<string, unknown>, w: Where): boolean =>
	Object.entries(w).every(([k, c]) => {
		if (k === "and") return (c as Where[]).every((x) => holds(d, x));
		const op = c as { greater_than?: string; contains?: string };
		const v = d[k];
		if (op.greater_than !== undefined)
			return (
				typeof v === "string" && Date.parse(v) > Date.parse(op.greater_than)
			);
		if (op.contains !== undefined)
			return typeof v === "string" && v.includes(op.contains);
		throw new Error(`unsupported where on ${k}`);
	});
let database: "partners" | "none" = "partners";
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () =>
		database === "none"
			? null
			: {
					find: async ({
						collection,
						where,
					}: {
						collection: string;
						where: Where;
					}) => {
						const rows =
							collection === "partner-accounts"
								? partners.filter((d) => holds(d, where))
								: [];
						return { docs: rows, totalDocs: rows.length };
					},
				},
	),
}));

beforeAll(async () => {
	await import("@/app/api/changes/route");
	await import("@/app/api/partners/submit-listing/route");
}, 60_000);

describe("the changes feed counts a stellar.toml read only when it is recorded", () => {
	it("tags and counts the toml facet for a recorded read, never for a date alone", async () => {
		database = "partners";
		const { GET } = await import("@/app/api/changes/route");
		const res = await GET(
			new NextRequest(
				"https://x.test/api/changes?since=2026-09-01&surfaces=partners",
			),
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		const facets = Object.fromEntries(
			body.changes.map((c: { slug: string; facets: string[] }) => [
				c.slug,
				c.facets,
			]),
		);
		expect(facets["anchor-read"]).toEqual(["toml"]);
		expect(facets["anchor-date-only"]).toEqual(["row"]);
		expect(body.meta.byFacet.partners.toml).toBe(1);
	});
});

describe("submitPartnerListing's outage is the documented 503", () => {
	it("answers RetryableError with Retry-After, never unavailable", async () => {
		database = "none";
		const { POST } = await import("@/app/api/partners/submit-listing/route");
		const res = await POST(
			new NextRequest("https://x.test/api/partners/submit-listing", {
				method: "POST",
				body: JSON.stringify({
					orgName: "Ramp Co",
					contactEmail: "team@ramp.example",
				}),
				headers: { "content-type": "application/json" },
			}),
		);
		expect(res.status).toBe(503);
		const body = await res.json();
		expect(body.unavailable).toBeUndefined();
		expect(body.retryAfterSeconds).toBe(2);
		expect(res.headers.get("Retry-After")).toBe("2");
		const doc = (
			spec.paths["/api/partners/submit-listing"] as {
				post: {
					responses: Record<
						string,
						{ content?: Record<string, { schema: unknown }> }
					>;
				};
			}
		).post.responses["503"];
		expect(doc?.content?.["application/json"].schema).toEqual({
			$ref: "#/components/schemas/RetryableError",
		});
	});
});

describe("matchPartners documents the body fields it reads", () => {
	it("declares type, sector, region and limit, with type's own vocabulary", () => {
		const body = (
			spec.paths["/api/partners/match"] as {
				post: {
					requestBody: {
						content: Record<
							string,
							{ schema: { properties: Record<string, { enum?: string[] }> } }
						>;
					};
				};
			}
		).post.requestBody.content["application/json"].schema.properties;
		for (const field of ["need", "type", "sector", "region", "limit"])
			expect(body, field).toHaveProperty(field);
		expect(body.type.enum).toEqual([...PARTNER_TYPES]);
	});
});
