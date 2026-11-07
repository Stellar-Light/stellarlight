import { describe, expect, it } from "vitest";
import { RWA_REGISTRY } from "@/data/rwa-registry";
import {
	horizonAssetSupply,
	horizonAssetUrl,
	supplyOfAssetRecord,
} from "@/lib/horizon-supply";

const ISSUER = "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5";

// The shape Horizon served for the verified BENJI issuer on 2026-11-07.
const BENJI = {
	asset_code: "BENJI",
	asset_issuer: ISSUER,
	balances: {
		authorized: "1150573406.8338513",
		authorized_to_maintain_liabilities: "0.0000000",
		unauthorized: "25.0775957",
	},
	claimable_balances_amount: "0.0000000",
	liquidity_pools_amount: "0.0000000",
	contracts_amount: "0.0000000",
};

const answer = (status: number, body: unknown) =>
	(async () =>
		new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("supplyOfAssetRecord: every balance Horizon counts", () => {
	it("sums trustlines in each state, claimable, pool and contract balances exactly", () => {
		expect(supplyOfAssetRecord(BENJI)).toBeCloseTo(1150573431.911447, 6);
		expect(
			supplyOfAssetRecord({
				...BENJI,
				claimable_balances_amount: "1.0000000",
				liquidity_pools_amount: "2.5000000",
				contracts_amount: "0.0000001",
			}),
		).toBeCloseTo(1150573435.4114471, 6);
	});

	it("reads an unreadable record as unknown, never as a supply of 0", () => {
		expect(supplyOfAssetRecord({ ...BENJI, balances: undefined })).toBeNull();
		expect(
			supplyOfAssetRecord({ ...BENJI, contracts_amount: "n/a" }),
		).toBeNull();
		expect(supplyOfAssetRecord(null)).toBeNull();
	});
});

describe("horizonAssetSupply: one pinned issuer, a failed read is an outage", () => {
	it("asks for the code and the pinned issuer, never the code alone", async () => {
		const urls: string[] = [];
		const spy = (async (u: string) => {
			urls.push(u);
			return new Response(JSON.stringify({ _embedded: { records: [BENJI] } }));
		}) as unknown as typeof fetch;
		const r = await horizonAssetSupply("BENJI", ISSUER, spy);
		expect(r.supply).toBeCloseTo(1150573431.911447, 6);
		expect(Number.isNaN(Date.parse(r.readAt))).toBe(false);
		expect(urls).toEqual([horizonAssetUrl("BENJI", ISSUER)]);
		expect(urls[0]).toContain(`asset_issuer=${ISSUER}`);
	});

	it("throws on an error status, an empty record set, or an unreadable record", async () => {
		await expect(
			horizonAssetSupply("BENJI", ISSUER, answer(503, {})),
		).rejects.toThrow();
		await expect(
			horizonAssetSupply(
				"BENJI",
				ISSUER,
				answer(200, { _embedded: { records: [] } }),
			),
		).rejects.toThrow();
		await expect(
			horizonAssetSupply(
				"BENJI",
				ISSUER,
				answer(200, {
					_embedded: { records: [{ ...BENJI, balances: undefined }] },
				}),
			),
		).rejects.toThrow();
	});
});

describe("Benji's figure reads the registry's verified issuer", () => {
	it("pins the FOBXX BENJI entry the route prices", () => {
		const row = RWA_REGISTRY.find((r) => r.id === `BENJI-${ISSUER}`);
		expect(row?.code).toBe("BENJI");
		expect(row?.issuer).toBe(ISSUER);
		expect(row?.projectSlug).toBe("benji");
	});
});
