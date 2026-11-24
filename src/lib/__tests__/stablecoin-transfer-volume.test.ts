// @vitest-environment node
/**
 * The owner, 2026-11-24: "instead of dex volume maybe we can track transfer
 * volume for the stables". The 24h DEX volume tile read N/A since Stellar
 * Expert went paid (2026-11-06); transfer volume is summed from the asset's
 * token contract events on Soroban RPC. These pin what it counts and the
 * null rule: null is not measured, never 0, and never a partial sum.
 */
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { figuresToStore } from "../stablecoin-pipeline";
import {
	type RpcCall,
	type TransferWindow,
	transferAmount,
	transferVolume,
	transferWindow,
} from "../stablecoin-transfer-volume";
import { transferVolumeTotal } from "../stablecoin-view";
import { rankStablecoins, storeRowToApi } from "../stablecoins";

const b64 = (v: xdr.ScVal) => v.toXDR("base64");
const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
const muxed = (n: bigint) =>
	xdr.ScVal.scvMap([
		new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("amount"), val: i128(n) }),
		new xdr.ScMapEntry({
			key: xdr.ScVal.scvSymbol("to_muxed_id"),
			val: nativeToScVal(7n, { type: "u64" }),
		}),
	]);

const USDC = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const W: TransferWindow = {
	startLedger: 1000,
	endLedger: 2000,
	from: "2026-11-23T02:00:00.000Z",
	to: "2026-11-24T02:00:00.000Z",
};
const INSIDE = "2026-11-23T12:00:00Z";

function event(
	name: string,
	value: xdr.ScVal,
	ledger = 1500,
	ledgerClosedAt = INSIDE,
) {
	return {
		ledger,
		ledgerClosedAt,
		topic: [b64(xdr.ScVal.scvSymbol(name))],
		value: b64(value),
		inSuccessfulContractCall: true,
	};
}
/** A getEvents cursor standing at the end of `ledger` (its TOID). */
const endOf = (ledger: number) =>
	`${((BigInt(ledger) << 32n) | 0xfffffn).toString().padStart(19, "0")}-4294967295`;

/** An RPC that answers getEvents from a list of pages, in order. */
function pages(...answers: Array<Record<string, unknown> | null>): RpcCall {
	let i = 0;
	return async (method) => {
		if (method !== "getEvents") throw new Error(method);
		return answers[i++] ?? null;
	};
}

describe("transferAmount: what one transfer event moved", () => {
	it("reads a bare i128 and the {amount, to_muxed_id} map", () => {
		expect(transferAmount(b64(i128(1658773763955n)))).toBe(1658773763955n);
		expect(transferAmount(b64(muxed(46377797n)))).toBe(46377797n);
	});

	it("anything else is unreadable, never zero", () => {
		expect(transferAmount(b64(xdr.ScVal.scvSymbol("amount")))).toBeNull();
		expect(transferAmount("not xdr")).toBeNull();
		expect(transferAmount(undefined)).toBeNull();
	});
});

describe("transferVolume: transfers only, inside the window, read whole", () => {
	it("sums transfer events and leaves out mints, burns, clawbacks and approvals", async () => {
		const rpc = pages({
			events: [
				event("transfer", i128(10_000_000n)),
				event("transfer", muxed(25_000_000n)),
				event("mint", i128(900_000_000n)),
				event("burn", i128(800_000_000n)),
				event("clawback", i128(700_000_000n)),
				event("approve", i128(600_000_000n)),
			],
			cursor: endOf(2000),
		});
		expect(await transferVolume("USDC", USDC, W, rpc)).toEqual({
			units: 3.5,
			transfers: 2,
		});
	});

	it("counts only events closed inside the 24 hours and stops past the end ledger", async () => {
		const rpc = pages({
			events: [
				event("transfer", i128(50_000_000n), 1001, "2026-11-23T01:59:59Z"),
				event("transfer", i128(10_000_000n), 1200),
				event("transfer", i128(10_000_000n), 2000),
				event("transfer", i128(99_000_000n), 2001),
			],
			cursor: endOf(2001),
		});
		expect(await transferVolume("USDC", USDC, W, rpc)).toEqual({
			units: 2,
			transfers: 2,
		});
	});

	it("reads on while the RPC has not looked past the window: a short page and a full one", async () => {
		const full = Array.from({ length: 10_000 }, () =>
			event("transfer", i128(10_000_000n), 1700),
		);
		const rpc = pages(
			// the RPC looks at a span of ledgers per call: none here, read on
			{ events: [], cursor: endOf(1400) },
			// a full page can stop mid-ledger: read on
			{ events: full, cursor: "0000007301444403200-0000000003" },
			{
				events: [event("transfer", i128(10_000_000n), 1900)],
				cursor: endOf(2400),
			},
		);
		expect(await transferVolume("USDC", USDC, W, rpc)).toEqual({
			units: 10_001,
			transfers: 10_001,
		});
	});

	it("a failed page, an unreadable amount or a stuck cursor is null, never a partial sum", async () => {
		const first = {
			events: [event("transfer", i128(10_000_000n))],
			cursor: endOf(1400),
		};
		expect(
			await transferVolume("USDC", USDC, W, pages(first, null)),
		).toBeNull();
		expect(
			await transferVolume(
				"USDC",
				USDC,
				W,
				pages({
					events: [event("transfer", xdr.ScVal.scvSymbol("x"))],
					cursor: endOf(2000),
				}),
			),
		).toBeNull();
		expect(
			await transferVolume(
				"USDC",
				USDC,
				W,
				pages(first, { events: [], cursor: endOf(1400) }),
			),
		).toBeNull();
		expect(
			await transferVolume("USDC", USDC, W, pages({ events: [] })),
		).toBeNull();
	});

	it("read through with no transfer is a measured 0", async () => {
		expect(
			await transferVolume(
				"USDC",
				USDC,
				W,
				pages({ events: [event("mint", i128(5n))], cursor: endOf(2000) }),
			),
		).toEqual({ units: 0, transfers: 0 });
	});
});

describe("transferWindow: 24 hours the RPC can actually cover", () => {
	const latest = { sequence: 20_000, closeTime: String(1795485600) };
	it("ends at the newest ledger and reaches back 24 hours", async () => {
		const rpc: RpcCall = async (method, params) =>
			method === "getLatestLedger"
				? latest
				: {
						ledgers: [
							{
								sequence: params.startLedger,
								ledgerCloseTime: String(1795485600 - 86_400 - 300),
							},
						],
					};
		expect(await transferWindow(rpc)).toEqual({
			startLedger: 20_000 - 17_400,
			endLedger: 20_000,
			from: new Date((1795485600 - 86_400) * 1000).toISOString(),
			to: new Date(1795485600 * 1000).toISOString(),
		});
	});

	it("null when the RPC cannot be read or its start closed inside the 24 hours", async () => {
		expect(await transferWindow(async () => null)).toBeNull();
		const late: RpcCall = async (method) =>
			method === "getLatestLedger"
				? latest
				: { ledgers: [{ ledgerCloseTime: String(1795485600 - 86_000) }] };
		expect(await transferWindow(late)).toBeNull();
	});
});

describe("the null rule, from the store to the tile", () => {
	it("a missed read is never carried forward from the last run", () => {
		const { figures } = figuresToStore(
			{
				supply: 1,
				priceUSD: 1,
				priceBasis: "assumed-peg",
				marketCapUSD: 1,
				holders: 1,
				volume24hUSD: null,
				paymentsCountLifetime: null,
				transferVolume24h: null,
				transferVolume24hUSD: null,
			},
			{ transferVolume24h: 500, transferVolume24hUSD: 500 },
		);
		expect(figures.transferVolume24h).toBeNull();
		expect(figures.transferVolume24hUSD).toBeNull();
	});

	it("the API serves null as null and a measured 0 as 0", () => {
		expect(storeRowToApi({ code: "USDE" })).toMatchObject({
			transferVolume24h: null,
			transferVolume24hUSD: null,
		});
		expect(
			storeRowToApi({
				code: "USDE",
				transferVolume24h: 0,
				transferVolume24hUSD: 0,
			}),
		).toMatchObject({ transferVolume24h: 0, transferVolume24hUSD: 0 });
	});

	it("sort=volume ranks by transfer volume, rows not measured last", () => {
		const rows = [
			{ code: "A", transferVolume24hUSD: null },
			{ code: "B", transferVolume24hUSD: 5 },
			{ code: "C", transferVolume24hUSD: 0 },
			{ code: "D", transferVolume24hUSD: 900 },
		].map(storeRowToApi);
		expect(rankStablecoins(rows, "volume").map((r) => r.ticker)).toEqual([
			"D",
			"B",
			"C",
			"A",
		]);
	});

	it("the tile sums the measured rows and is null, not $0, when none was", () => {
		expect(
			transferVolumeTotal([
				{ transferVolumeRaw: null },
				{ transferVolumeRaw: null },
			]),
		).toEqual({ usd: null, measured: 0 });
		expect(
			transferVolumeTotal([
				{ transferVolumeRaw: 100 },
				{ transferVolumeRaw: 0 },
				{ transferVolumeRaw: null },
			]),
		).toEqual({ usd: 100, measured: 2 });
	});
});
