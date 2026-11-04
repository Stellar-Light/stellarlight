// @vitest-environment node

/**
 * GET /api/partners/{slug} serves the same row as GET /api/partners for the
 * same partner (#1909). The detail kept its own copy of the row and of its
 * schema, and the copy drifted: it served `seps: []` and curated `assets`
 * for anchors whose stellar.toml was never fetched, where the list serves
 * null, and `caseStudies: []` where the list serves null. `[]` asserts
 * "we read their SEP-1 file and it lists none"; null admits "not checked".
 *
 * A read is recorded only with BOTH its source URL and its date, the one
 * test every partner row uses. Curated tag lists (services, sectors,
 * regions) serve null when none is recorded, never "none".
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { spec } from "@/lib/openapi-spec";
import { scorePartners } from "@/lib/partner-match";

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
const READ = {
	tomlSourceUrl: "https://read.example/.well-known/stellar.toml",
	tomlFetchedAt: "2026-09-29",
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
	// Read from its stellar.toml (Anclap), with the gated experiment blocks.
	{
		...base,
		...READ,
		slug: "anchor-read",
		name: "Read",
		assets: [{ code: "PEN" }, { code: "ARS" }],
		seps: ["sep-6", "sep-24"],
		rampTypes: ["on-ramp", "off-ramp"],
		compliance: { licenses: [{ authority: "SBS", jurisdiction: "Peru" }] },
		onchain: [{ code: "PEN", issuer: "GABC", holders: 12, asOf: "2026-10-01" }],
	},
	// Fetched, and the file lists no SEPs or currencies: [] is earned here.
	{
		...base,
		...READ,
		slug: "anchor-read-none",
		name: "Read none",
		assets: [],
		seps: [],
		rampTypes: [],
	},
	// Half a read stamp is no read, in either direction.
	{
		...base,
		slug: "anchor-date-only",
		name: "Date only",
		assets: [{ code: "USDC" }],
		seps: ["sep-24"],
		rampTypes: ["off-ramp"],
		tomlSourceUrl: null,
		tomlFetchedAt: "2026-09-29",
	},
	{
		...base,
		slug: "anchor-url-only",
		name: "URL only",
		assets: [{ code: "USDC" }],
		seps: ["sep-24"],
		rampTypes: ["off-ramp"],
		tomlSourceUrl: READ.tomlSourceUrl,
		tomlFetchedAt: null,
	},
	// Nobody has tagged it: no services, sectors or regions recorded.
	{
		partnerType: "tooling",
		status: "published",
		tagline: "Dev tools",
		contactEmail: "hi@tools.example",
		slug: "partner-untagged",
		name: "Untagged",
		regions: [],
		services: [],
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

const FLAGS = "exp=partner-compliance-api,partner-onchain-live";
const listRows = async (qs = "") => {
	const { GET } = await import("@/app/api/partners/route");
	const res = await GET(
		new NextRequest(`https://x.test/api/partners?all=1${qs ? `&${qs}` : ""}`),
	);
	expect(res.status).toBe(200);
	const body = await res.json();
	return new Map<string, Record<string, unknown>>(
		body.partners.map((p: { slug: string }) => [p.slug, p]),
	);
};
const detail = async (slug: string, qs = "") => {
	const { GET } = await import("@/app/api/partners/[slug]/route");
	const res = await GET(
		new NextRequest(`https://x.test/api/partners/${slug}${qs ? `?${qs}` : ""}`),
		{ params: Promise.resolve({ slug }) },
	);
	expect(res.status).toBe(200);
	return (await res.json()).partner as Record<string, unknown>;
};

describe("GET /api/partners/{slug} serves the list's row", () => {
	it.each(docs.map((d) => d.slug))("%s: detail equals list", async (slug) => {
		const list = await listRows();
		expect(await detail(slug)).toEqual(list.get(slug));
	});

	it.each(docs.map((d) => d.slug))(
		"%s: detail equals list with the experiment flags on",
		async (slug) => {
			const list = await listRows(FLAGS);
			expect(await detail(slug, FLAGS)).toEqual(list.get(slug));
		},
	);

	it("serves the gated blocks on the detail too when the flags are on", async () => {
		const p = await detail("anchor-read", FLAGS);
		expect(p.compliance).toBeDefined();
		expect(p.onchain).toBeDefined();
		const off = await detail("anchor-read");
		expect(off.compliance).toBeUndefined();
		expect(off.onchain).toBeUndefined();
	});

	it("keeps unknown toml facts null, and curated ramps as recorded", async () => {
		const p = await detail("anchor-curated");
		expect(p.seps).toBeNull();
		expect(p.assets).toBeNull();
		expect(p.tomlConfidence).toBeNull();
		expect(p.caseStudies).toBeNull();
		expect(p.rampTypes).toEqual(["on-ramp", "off-ramp"]);
	});

	it.each(["anchor-date-only", "anchor-url-only"])(
		"%s: half a read stamp is no read",
		async (slug) => {
			for (const p of [await detail(slug), (await listRows()).get(slug)]) {
				expect(p?.seps).toBeNull();
				expect(p?.assets).toBeNull();
				expect(p?.tomlConfidence).toBeNull();
			}
		},
	);

	it("serves [] only when the fetch found none", async () => {
		const p = await detail("anchor-read-none");
		expect(p.seps).toEqual([]);
		expect(p.assets).toEqual([]);
		expect((await detail("anchor-read")).seps).toEqual(["sep-6", "sep-24"]);
	});

	it("serves null for curated tag lists nobody recorded", async () => {
		const p = await detail("partner-untagged");
		expect(p.services).toBeNull();
		expect(p.sectors).toBeNull();
		expect(p.regions).toBeNull();
		expect((await detail("anchor-read")).regions).toEqual(["latam"]);
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

describe("the assistant's partner rows follow the same rules", () => {
	const rowOf = (slug: string, need = "fiat ramp") =>
		scorePartners(
			need,
			docs.filter((d) => d.slug === slug),
			5,
		)[0]?.partner;

	it("serves toml facts only for a recorded read", () => {
		const curated = rowOf("anchor-curated");
		expect(curated?.seps).toBeNull();
		expect(curated?.assets).toBeNull();
		expect(curated?.rampTypes).toEqual(["on-ramp", "off-ramp"]);
		expect(rowOf("anchor-date-only")?.seps).toBeNull();
		expect(rowOf("anchor-read")?.assets).toEqual(["PEN", "ARS"]);
		expect(rowOf("anchor-read-none")?.seps).toEqual([]);
	});

	it("scores a missing tag list exactly as an empty one", () => {
		const doc = docs.find((d) => d.slug === "partner-untagged");
		const as = (tags: unknown) =>
			scorePartners(
				"dev tools in latam",
				[{ ...doc, sectors: tags, regions: tags, services: tags }],
				5,
			).map((s) => [s.partner.slug, s.score, s.reasons]);
		expect(as(null)).toEqual(as([]));
		expect(as(undefined)).toEqual(as([]));
	});
});

describe("every served partner row declares the null it can serve", () => {
	const dig = (o: unknown, ...keys: string[]): unknown =>
		keys.reduce<unknown>(
			(x, k) => (x as Record<string, unknown> | undefined)?.[k],
			o,
		);
	const props = (o: unknown) =>
		dig(o, "properties") as Record<string, { nullable?: boolean }>;
	const row200 = (path: string) =>
		dig(
			spec.paths,
			path,
			"post",
			"responses",
			"200",
			"content",
			"application/json",
			"schema",
			"properties",
			"matches",
			"items",
		);
	const component = dig(spec.components, "schemas", "Partner");
	const matchRow = dig(row200("/api/partners/match"), "properties", "partner");
	const assistantRow = row200("/api/partners/assistant");
	it.each([
		[
			"Partner",
			component,
			[
				"assets",
				"seps",
				"rampTypes",
				"services",
				"sectors",
				"regions",
				"caseStudies",
			],
		],
		["matchPartners row", matchRow, ["sectors", "regions"]],
		["partnerAssistant row", assistantRow, ["assets", "seps", "rampTypes"]],
	] as Array<[string, unknown, string[]]>)("%s", (_, schema, fields) => {
		for (const f of fields)
			expect(props(schema)[f]?.nullable, `${f} must be nullable`).toBe(true);
	});
});
