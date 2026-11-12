/**
 * sls-107, 2026-11-11: GMO-Z.com Trust wound down GYEN and ZUSD (its
 * stellar.toml: initial 1:1 redemption period 15 May to 11 November 2026),
 * and VNX discontinued VEUR (notice of 2026-04-22: holders to settle by 22
 * May 2026). The stablecoin registry retired them; these facts must hold on
 * every other surface that served them as live or issuing: the RWA
 * registry and the products it feeds, the project rows' status and
 * description, and the partner description.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { RWA_REGISTRY } from "@/data/rwa-registry";
import {
	DESCRIPTION_FIXES,
	PARTNER_DESCRIPTION_FIXES,
	STATUS_FIX,
} from "../../../scripts/data/curation-maps";
import { spec } from "../openapi-spec";
import { mergeMeasured } from "../rwa-measured";
import { registryProducts } from "../rwa-products";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
// The store unreachable: getRwaAssets still serves the registry.
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => null),
}));

const DISCONTINUED = ["GYEN", "VEUR", "ZUSD"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

describe("the RWA registry records the issuers' own discontinuation", () => {
	it("exactly GYEN, ZUSD and VEUR carry it, each with the issuer's words, the source and the day read", () => {
		const rows = RWA_REGISTRY.filter((r) => r.discontinued);
		expect(rows.map((r) => r.symbol).sort()).toEqual(DISCONTINUED);
		for (const r of rows) {
			expect(r.discontinued?.sourceUrl, r.symbol).toMatch(/^https:\/\//);
			expect(r.discontinued?.asOf, r.symbol).toMatch(DAY);
			expect(r.discontinued?.note, r.symbol).toMatch(/wound down|discontinued/);
		}
	});

	it("the rows stay: the tokens are still on chain, and the issuer's toml still declares GYEN and ZUSD", () => {
		for (const s of DISCONTINUED)
			expect(
				RWA_REGISTRY.some((r) => r.symbol === s),
				s,
			).toBe(true);
	});

	it("gyen's project row serves both products as retired, with the issuer's statement, never as live", () => {
		const products = registryProducts("gyen");
		expect(products.map((p) => p.assetId?.split("-")[0]).sort()).toEqual([
			"GYEN",
			"ZUSD",
		]);
		for (const p of products) {
			expect(p.status, p.name).toBe("retired");
			expect(p.note, p.name).toContain("wound down");
			expect(p.note, p.name).toContain(
				"https://stablecoin.z.com/.well-known/stellar.toml",
			);
		}
	});

	it("getRwaAssets serves discontinued on every row (null where none was found) and declares it", () => {
		const veur = RWA_REGISTRY.find((r) => r.symbol === "VEUR");
		const other = RWA_REGISTRY.find((r) => r.symbol === "AUDD");
		if (!veur || !other) throw new Error("fixture rows missing");
		expect(mergeMeasured(veur, null).discontinued?.sourceUrl).toBe(
			"https://vnx.li/blog",
		);
		expect(mergeMeasured(other, null).discontinued).toBeNull();
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const S: any = spec;
		const schema =
			S.paths["/api/rwa"].get.responses["200"].content["application/json"]
				.schema.properties.assets.items;
		expect(schema.properties.discontinued).toMatchObject({
			type: "object",
			nullable: true,
		});
	});
});

describe("the directory says the same: project rows and the partner", () => {
	it("gyen, zusd and veur move from Live to Inactive on a person's reading of the issuer's own words, dated and sourced", () => {
		for (const slug of ["gyen", "zusd", "veur"]) {
			const fix = STATUS_FIX[slug];
			expect(fix, slug).toMatchObject({
				from: "Live",
				to: "Inactive",
				basis: "human-verified",
				asOf: "2026-11-11",
			});
			expect(fix.sourceUrl, slug).toMatch(/^https:\/\//);
			expect(fix.note, slug).toMatch(/wound down|discontinued/);
		}
	});

	it("gyen's description is in the past tense and no longer says redemption remains open", () => {
		const d = DESCRIPTION_FIXES.gyen;
		expect(d).toMatch(/^GYEN was /);
		expect(d).toContain("wound down");
		expect(d).not.toMatch(/remains open|is a regulated/);
	});

	it("the GMO partner's stored seed text is corrected, and the seed for a fresh install says the same", () => {
		const fix = PARTNER_DESCRIPTION_FIXES["gmo-zcom-trust"];
		// The text the partner row served on 2026-11-11.
		expect(fix.from).toBe(
			"GMO Internet Group's NY-regulated trust company issuing GYEN (JPY) and ZUSD stablecoins on Stellar.",
		);
		expect(fix.to).not.toMatch(/\bissuing\b/);
		expect(fix.to).toContain("wound down");
		const seeds = readFileSync(
			resolve(__dirname, "../../../scripts/enrich-partners-toml.ts"),
			"utf8",
		);
		expect(seeds).toContain(JSON.stringify(fix.to));
		expect(seeds).not.toContain(fix.from);
	});
});

describe("getRwaAssets counts what state cannot say", () => {
	it("meta.counts.discontinued counts the rows that keep state live as an on-chain fact, and the spec says so", async () => {
		const { GET } = await import("@/app/api/rwa/route");
		const body = await (
			await GET(new NextRequest("https://x.test/api/rwa?state=live&limit=100"))
		).json();
		expect(body.meta.counts.discontinued).toBe(3);
		const live = body.assets.map((r: { symbol: string }) => r.symbol);
		for (const s of DISCONTINUED) expect(live, s).toContain(s);
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const S: any = spec;
		const ok =
			S.paths["/api/rwa"].get.responses["200"].content["application/json"]
				.schema;
		expect(ok.properties.assets.items.properties.state.description).toContain(
			"on-chain fact",
		);
		expect(
			ok.properties.meta.properties.counts.properties.discontinued,
		).toMatchObject({ type: "integer" });
	});
});
