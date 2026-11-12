/**
 * sls-107 audit, 2026-11-11. Two serving gaps between a deploy and the next
 * six-hourly refresh, which lands hours later:
 *   - the class: 38 of 41 stored rows hold no class until the refresh
 *     writes one, so they served Unclassified, which the spec defines as
 *     "no issuer statement could be read";
 *   - retirement: an asset dropped from the registry stayed in the list
 *     until the refresh stamped retiredAt, and a retired row's page was an
 *     ordinary indexable page in the sitemap (BRL-GDVKY2GU answered 200).
 * The rows below are the stored shapes production held on 2026-11-11.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	STABLECOIN_REGISTRY,
	STABLECOIN_RETIREMENTS,
	stablecoinId,
} from "@/data/stablecoin-registry";
import { retirementOf } from "../stablecoins";

let stored: Array<Record<string, unknown>> = [];
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async (args: { collection: string }) => ({
			docs: args.collection === "stablecoins" ? stored : [],
		}),
	})),
}));
// The verify route opens Payload directly rather than through the client.
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (orig) => ({
	...(await orig<typeof import("payload")>()),
	getPayload: vi.fn(async () => ({
		find: async (args: { collection: string }) => ({
			docs: args.collection === "stablecoins" ? stored : [],
		}),
	})),
}));
vi.mock("@/lib/integrations/sdf-skills", () => ({
	fetchSdfSkillNames: vi.fn(async () => []),
}));
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathons: vi.fn(async () => []),
}));

const row = (assetId: string, extra: Record<string, unknown> = {}) => ({
	assetId,
	code: assetId.split("-")[0],
	issuer: "G",
	basis: "unmeasured",
	measuredAt: "2026-11-11T19:43:08.630Z",
	assetType: null,
	...extra,
});
// What production stored on 2026-11-11: no class on USDC or MGUSD, USDY's
// qualifier with no source, GYEN not yet stamped, BRL stamped in September.
const PROD = () => [
	row("USDC-GA5ZSEJY"),
	row("MGUSD-GAIUGZZZ"),
	row("USDY-GAJMPX5N", { assetType: "Yield Stablecoin" }),
	row("GYEN-GDF6VOEG"),
	row("BRL-GDVKY2GU", { retiredAt: "2026-09-03T06:25:00.000Z" }),
];

const api = async (query = "") => {
	const { GET } = await import("@/app/api/stablecoins/route");
	const res = await GET(
		new NextRequest(`https://x.test/api/stablecoins${query}`),
	);
	return res.json();
};

describe("from deploy, before the next refresh", () => {
	beforeEach(() => {
		stored = PROD();
	});

	it("rows serve their registry class and source, so ?assetType=Fiat-Backed is not empty", async () => {
		const body = await api("?limit=100");
		const usdc = body.stablecoins.find(
			(r: { assetId: string }) => r.assetId === "USDC-GA5ZSEJY",
		);
		expect(usdc).toMatchObject({
			assetType: "Fiat-Backed",
			assetTypeSourceUrl: "https://www.circle.com/usdc",
		});
		const fiat = await api("?assetType=Fiat-Backed&limit=100");
		expect(
			fiat.stablecoins.map((r: { assetId: string }) => r.assetId).sort(),
		).toEqual(["MGUSD-GAIUGZZZ", "USDC-GA5ZSEJY"]);
	});

	it("an asset the registry retired is not served, stamped or not", async () => {
		const body = await api("?limit=100");
		const ids = body.stablecoins.map((r: { assetId: string }) => r.assetId);
		expect(ids).not.toContain("GYEN-GDF6VOEG");
		expect(ids).not.toContain("BRL-GDVKY2GU");
		expect(body.meta.counts.tracked).toBe(3);
	});

	it("verifyClaim's issued check does not answer from a retired row either", async () => {
		stored = [
			row("GYEN-GDF6VOEG", { company: "GMO Trust" }),
			row("USDC-GA5ZSEJY", { company: "Circle" }),
		];
		const { GET } = await import("@/app/api/verify/route");
		const body = await (
			await GET(
				new NextRequest(
					"https://x.test/api/verify?type=issued&subject=GYEN&auditor=GMO%20Trust",
				),
			)
		).json();
		expect(body.meta.searched.stablecoins).toBe(1);
		expect(body.verdict).not.toBe("supported");
	});

	it("the sitemap submits tracked stablecoin pages only", async () => {
		const { default: sitemap } = await import("@/app/sitemap");
		const urls = (await sitemap())
			.map((u) => u.url)
			.filter((u) => u.startsWith("https://stellarlight.xyz/stablecoins/"));
		expect(urls.sort()).toEqual([
			"https://stellarlight.xyz/stablecoins/MGUSD-GAIUGZZZ",
			"https://stellarlight.xyz/stablecoins/USDC-GA5ZSEJY",
			"https://stellarlight.xyz/stablecoins/USDY-GAJMPX5N",
		]);
	});
});

describe("a retired row's page says so, with the date and the reason", () => {
	it("a row the refresh stamped keeps the stamped date and the recorded reason", () => {
		expect(
			retirementOf({
				assetId: "BRL-GDVKY2GU",
				retiredAt: "2026-09-03T06:25:00.000Z",
			}),
		).toMatchObject({
			retiredAt: "2026-09-03T06:25:00.000Z",
			reason: expect.stringContaining("discontinued"),
			sourceUrl: "https://ntokens.com",
		});
	});

	it("a row retired by the registry and not yet stamped is retired from deploy, dated by the record", () => {
		expect(retirementOf({ assetId: "GYEN-GDF6VOEG" })).toMatchObject({
			retiredAt: "2026-11-11",
			reason: expect.stringContaining("wound down"),
		});
		expect(retirementOf({ assetId: "USDC-GA5ZSEJY" })).toBeNull();
	});

	it("every recorded retirement is an asset the registry no longer lists, with a dated, sourced reason", () => {
		const listed = new Set(STABLECOIN_REGISTRY.map(stablecoinId));
		for (const [id, r] of Object.entries(STABLECOIN_RETIREMENTS)) {
			expect(listed.has(id), id).toBe(false);
			expect(r.retiredOn, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(r.sourceUrl, id).toMatch(/^https:\/\//);
			expect(r.reason.length, id).toBeGreaterThan(40);
		}
		expect(Object.keys(STABLECOIN_RETIREMENTS).sort()).toEqual([
			"BRL-GDVKY2GU",
			"GBPZ-GCTG4YT2",
			"GYEN-GDF6VOEG",
			"UAH-GCJI3CP2",
			"VEUR-GDXLSLCO",
			"ZUSD-GDF6VOEG",
		]);
	});

	it("the page is kept out of search", async () => {
		stored = [row("BRL-GDVKY2GU", { retiredAt: "2026-09-03T06:25:00.000Z" })];
		const { generateMetadata } = await import(
			"@/app/(frontend)/stablecoins/[assetId]/page"
		);
		const meta = await generateMetadata({
			params: Promise.resolve({ assetId: "BRL-GDVKY2GU" }),
		});
		expect(meta.robots).toMatchObject({ index: false });
		// The description says the page is no longer tracked, never that it
		// is measured every six hours.
		expect(meta.description).toMatch(/^BRL is no longer tracked/);
		expect(meta.description).toContain("discontinued");
		expect(meta.description).not.toContain("every six hours");
		stored = [row("USDC-GA5ZSEJY")];
		const live = await generateMetadata({
			params: Promise.resolve({ assetId: "USDC-GA5ZSEJY" }),
		});
		expect(live.robots).toBeUndefined();
		expect(live.description).toContain("measured every six hours");
		// Importing the page pulls in its chart components: allow for that.
	}, 20_000);
});
