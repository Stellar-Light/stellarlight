// @vitest-environment node

/**
 * GET /api/partners/{slug} serves the same row as GET /api/partners for the
 * same partner (#1909). The detail kept its own copy of the row and of its
 * schema, and the copy drifted: it served `seps: []` and curated `assets`
 * for anchors whose stellar.toml was never fetched, where the list serves
 * null, and `caseStudies: []` where the list serves null. `[]` asserts
 * "we read their SEP-1 file and it lists none"; null admits "not checked".
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { spec } from "@/lib/openapi-spec";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

const base = {
	partnerType: "anchor",
	status: "published",
	tagline: "Fiat ramp",
	websiteUrl: "https://ramp.example",
	contactEmail: "team@ramp.example",
	acceptingClients: true,
	freshnessStatus: "aging",
	regions: ["latam"],
	sectors: ["payments"],
	services: [{ tag: "usdc" }],
	caseStudies: [],
};
const docs = [
	// Curated capabilities, no stellar.toml ever fetched (Bitso, Honey Coin).
	{
		...base,
		slug: "anchor-curated",
		name: "Curated",
		assets: [{ code: "USDC" }],
		seps: [],
		rampTypes: ["on-ramp", "off-ramp"],
		tomlSourceUrl: null,
		tomlFetchedAt: null,
	},
	// Read from its stellar.toml (Anclap).
	{
		...base,
		slug: "anchor-read",
		name: "Read",
		assets: [{ code: "PEN" }, { code: "ARS" }],
		seps: ["sep-6", "sep-24"],
		rampTypes: ["on-ramp", "off-ramp"],
		tomlSourceUrl: "https://read.example/.well-known/stellar.toml",
		tomlFetchedAt: "2026-09-29",
	},
	// Fetched, and the file lists no SEPs or currencies: [] is earned here.
	{
		...base,
		slug: "anchor-read-none",
		name: "Read none",
		assets: [],
		seps: [],
		rampTypes: [],
		tomlSourceUrl: "https://none.example/.well-known/stellar.toml",
		tomlFetchedAt: "2026-09-29",
	},
];

/** The slug a where clause pins, if any. */
const pinnedSlug = (w: unknown): string | undefined => {
	if (!w || typeof w !== "object") return undefined;
	const o = w as Record<string, unknown>;
	const eq = (o.slug as { equals?: string } | undefined)?.equals;
	if (eq) return eq;
	for (const v of Object.values(o)) {
		const hit = Array.isArray(v)
			? v.map(pinnedSlug).find(Boolean)
			: pinnedSlug(v);
		if (hit) return hit;
	}
	return undefined;
};
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async ({ where }: { where: unknown }) => {
			const slug = pinnedSlug(where);
			const hit = slug ? docs.filter((d) => d.slug === slug) : docs;
			return { docs: hit, totalDocs: hit.length };
		},
	})),
}));

const listRows = async () => {
	const { GET } = await import("@/app/api/partners/route");
	const res = await GET(new NextRequest("https://x.test/api/partners?all=1"));
	expect(res.status).toBe(200);
	const body = await res.json();
	return new Map<string, Record<string, unknown>>(
		body.partners.map((p: { slug: string }) => [p.slug, p]),
	);
};
const detail = async (slug: string) => {
	const { GET } = await import("@/app/api/partners/[slug]/route");
	const res = await GET(
		new NextRequest(`https://x.test/api/partners/${slug}`),
		{
			params: Promise.resolve({ slug }),
		},
	);
	expect(res.status).toBe(200);
	return (await res.json()).partner as Record<string, unknown>;
};

describe("GET /api/partners/{slug} serves the list's row", () => {
	it.each(docs.map((d) => d.slug))("%s: detail equals list", async (slug) => {
		const list = await listRows();
		expect(await detail(slug)).toEqual(list.get(slug));
	});

	it("keeps unknown toml facts null, and curated ramps as recorded", async () => {
		const p = await detail("anchor-curated");
		expect(p.seps).toBeNull();
		expect(p.assets).toBeNull();
		expect(p.tomlConfidence).toBeNull();
		expect(p.caseStudies).toBeNull();
		expect(p.rampTypes).toEqual(["on-ramp", "off-ramp"]);
	});

	it("serves [] only when the fetch found none", async () => {
		const p = await detail("anchor-read-none");
		expect(p.seps).toEqual([]);
		expect(p.assets).toEqual([]);
		expect((await detail("anchor-read")).seps).toEqual(["sep-6", "sep-24"]);
	});

	it("declares the detail row with the list's Partner schema", () => {
		const s = spec as unknown as {
			paths: Record<
				string,
				{
					get: {
						responses: Record<
							string,
							{
								content: Record<
									string,
									{ schema: { properties: { partner: unknown } } }
								>;
							}
						>;
					};
				}
			>;
			components: {
				schemas: {
					PartnersResponse: { properties: { partners: { items: unknown } } };
				};
			};
		};
		const listItem =
			s.components.schemas.PartnersResponse.properties.partners.items;
		expect(listItem).toEqual({ $ref: "#/components/schemas/Partner" });
		expect(
			s.paths["/api/partners/{slug}"].get.responses["200"].content[
				"application/json"
			].schema.properties.partner,
		).toEqual(listItem);
	});
});
