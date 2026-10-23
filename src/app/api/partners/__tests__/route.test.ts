import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

// The live shape (GET /api/partners?all=1, 2026-10-23): ramp providers are
// typed anchor and carry rampTypes; an anchor with no ramp recorded stores [].
const row = (
	slug: string,
	partnerType: string,
	rampTypes: string[],
	regions: string[],
) => ({
	slug,
	name: slug,
	partnerType,
	rampTypes,
	regions,
	status: "published",
	tagline: `${slug} tagline`,
	websiteUrl: `https://${slug}.example`,
});
const docs = [
	row("ramp-latam", "anchor", ["on-ramp", "off-ramp"], ["latam"]),
	row("offramp-latam", "anchor", ["off-ramp"], ["latam"]),
	row("anchor-no-ramp", "anchor", [], ["latam"]),
	row("ramp-global", "anchor", ["on-ramp", "off-ramp"], ["global"]),
	row("protocol-x", "protocol", [], ["global", "latam"]),
	row("issuer-x", "asset-issuer", [], ["latam"]),
];

// A small evaluator for the Payload where operators the route uses. hasMany
// fields are arrays: `in` matches an element exactly, `contains` matches a
// substring of an element (the Payload behaviour).
type Where = Record<string, unknown>;
const matches = (d: Record<string, unknown>, w: Where): boolean =>
	Object.entries(w).every(([k, c]) => {
		if (k === "and") return (c as Where[]).every((x) => matches(d, x));
		if (k === "or") return (c as Where[]).some((x) => matches(d, x));
		const v = d[k];
		const vs = Array.isArray(v) ? v.map(String) : [String(v)];
		const op = c as { equals?: unknown; in?: unknown[]; contains?: string };
		if ("equals" in op) return vs.includes(String(op.equals));
		if (op.in) return op.in.some((x) => vs.includes(String(x)));
		if (op.contains !== undefined)
			return vs.some((x) => x.includes(String(op.contains)));
		throw new Error(`unsupported where on ${k}: ${JSON.stringify(c)}`);
	});
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async ({ where }: { where: Where }) => {
			const hit = docs.filter((d) => matches(d, where));
			return { docs: hit, totalDocs: hit.length };
		},
	})),
}));

const get = async (qs: string) => {
	const { GET } = await import("../route");
	const res = await GET(new NextRequest(`https://x.test/api/partners?${qs}`));
	return { status: res.status, body: await res.json() };
};
const slugs = (body: { partners: Array<{ slug: string }> }) =>
	body.partners.map((p) => p.slug).sort();

describe("GET /api/partners?type=on-off-ramp", () => {
	it("also lists anchors whose rampTypes record a ramp, and says what it leaves out", async () => {
		const { status, body } = await get("type=on-off-ramp&region=latam");
		expect(status).toBe(200);
		expect(slugs(body)).toEqual(["offramp-latam", "ramp-latam"]);
		expect(body.meta.warnings.join(" ")).toContain("type=anchor");
		const both = await get("type=on-off-ramp&ramps=on-ramp");
		expect(slugs(both.body)).toEqual(["ramp-global", "ramp-latam"]);
	});

	it("leaves other types exact", async () => {
		const { body } = await get("type=anchor&region=latam");
		expect(slugs(body)).toEqual([
			"anchor-no-ramp",
			"offramp-latam",
			"ramp-latam",
		]);
	});

	it("points an empty ramp answer at type=anchor", async () => {
		const { body } = await get("type=on-off-ramp&region=asia");
		expect(body.partners).toEqual([]);
		expect(body.meta.advisory.summary).toContain("type=anchor");
	});
});
