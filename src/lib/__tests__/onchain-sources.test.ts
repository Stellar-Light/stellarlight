// @vitest-environment node
import { describe, expect, it } from "vitest";
import { attestedSourceRepos } from "@/lib/contract-ownership";
import { trustlinesOfAssetRecord } from "@/lib/horizon-supply";
import {
	contractReading,
	holdersOf,
	indexHeadAt,
	readAsset,
	readContract,
} from "@/lib/onchain-sources";

const NOW = new Date("2026-11-22T21:00:00Z");
const fresh = (data: unknown, asOf = "2026-11-22T20:00:00Z") => ({
	data,
	as_of: asOf,
});
const event = (close_time: string, topic_0: string) => ({
	close_time,
	topic_0,
	event_type: "contract",
});

describe("contractReading: an event date proves use, its absence proves nothing", () => {
	it("takes the newer of the activity rollup and the newest listed event", () => {
		expect(
			contractReading(
				fresh({
					exists: true,
					events: [event("2026-11-22T21:09:26Z", "transfer")],
					activity: {
						last_seen: "2026-11-22T20:46:56Z",
						active_ledgers_total: 3334076,
					},
					ttl: { state: "live" },
				}),
				NOW,
			),
		).toEqual({
			lastEventAt: "2026-11-22T21:09:26.000Z",
			activeLedgers: 3334076,
			ttlState: "live",
		});
	});

	// KALE's farm, 2026-11-22: 20 million sub-calls in a week and no event,
	// so the index answers with no activity block at all.
	it("reads a contract that never emitted an event as no event, not as unread", () => {
		expect(
			contractReading(
				fresh({ exists: true, events: [], ttl: { state: "archived" } }),
				NOW,
			),
		).toEqual({ lastEventAt: null, activeLedgers: null, ttlState: "archived" });
	});

	it.each([
		[
			"a contract the index does not know",
			fresh({ exists: false, events: [] }),
		],
		[
			"an answer older than three days",
			fresh({ exists: true, events: [] }, "2026-11-19T20:00:00Z"),
		],
		["an answer with no date", { data: { exists: true } }],
		["a failed read", null],
		["an error body", { type: "internal", status: 500 }],
	])("answers null for %s", (_label, body) => {
		expect(contractReading(body, NOW)).toBeNull();
	});
});

describe("holdersOf and trustlinesOfAssetRecord: a count or null, never a zero for unread", () => {
	it("reads the holder count", () => {
		expect(holdersOf(fresh({ holder_count: 7374, holders: [] }), NOW)).toBe(
			7374,
		);
		expect(holdersOf(fresh({ holder_count: 0 }), NOW)).toBe(0);
	});
	it.each([
		[fresh({ holders: [] })],
		[fresh({ holder_count: "7374" })],
		[fresh({ holder_count: 12 }, "2026-11-01T00:00:00Z")],
		[null],
	])("answers null for %j", (body) => {
		expect(holdersOf(body, NOW)).toBeNull();
	});
	it("sums trustlines in every authorization state", () => {
		expect(
			trustlinesOfAssetRecord({
				accounts: {
					authorized: 55311,
					authorized_to_maintain_liabilities: 1,
					unauthorized: 2,
				},
			}),
		).toBe(55314);
		expect(trustlinesOfAssetRecord({ accounts: { authorized: 5 } })).toBeNull();
		expect(trustlinesOfAssetRecord(null)).toBeNull();
	});
});

const ISSUER = "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2";
const ASSET_CONTRACT =
	"CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV";
const horizon = {
	_embedded: {
		records: [
			{
				accounts: {
					authorized: 55311,
					authorized_to_maintain_liabilities: 1,
					unauthorized: 0,
				},
				balances: {
					authorized: "4241423.6931019",
					authorized_to_maintain_liabilities: "10468.1435366",
					unauthorized: "0.0000000",
				},
				claimable_balances_amount: "355.5316351",
				liquidity_pools_amount: "7975.0816622",
				contracts_amount: "546403.9033421",
			},
		],
	},
};

describe("readAsset: a row is read whole or not at all", () => {
	const answers = (over: Record<string, unknown> = {}) => {
		const urls: string[] = [];
		const by: Record<string, unknown> = {
			"horizon.stellar.org/assets": horizon,
			"/holders": fresh({ holder_count: 7374 }),
			[`/contracts/${ASSET_CONTRACT}`]: fresh({
				exists: true,
				events: [
					event("2026-11-22T20:50:00Z", "set_authorized"),
					event("2026-11-22T20:46:56Z", "transfer"),
				],
			}),
			...over,
		};
		const fetchJson = async (url: string) => {
			urls.push(url);
			const key = Object.keys(by).find((k) => url.includes(k));
			return key ? by[key] : null;
		};
		return { fetchJson, urls };
	};

	it("reads supply and trustlines from Horizon, holders and the last movement from the index", async () => {
		const { fetchJson, urls } = answers();
		expect(await readAsset("EURC", ISSUER, fetchJson, NOW)).toEqual({
			supply: 4806626.3532779,
			trustlines: 55312,
			holders: 7374,
			// an authorization event is not a movement of the asset
			lastMovementAt: "2026-11-22T20:46:56.000Z",
		});
		// the asset's token contract id follows from its code and issuer
		expect(urls.at(-1)).toContain(`/contracts/${ASSET_CONTRACT}?`);
	});

	it("keeps an asset the index holds no event for, with no movement date", async () => {
		const { fetchJson } = answers({
			[`/contracts/${ASSET_CONTRACT}`]: fresh({ exists: false, events: [] }),
		});
		expect(
			(await readAsset("EURC", ISSUER, fetchJson, NOW))?.lastMovementAt,
		).toBeNull();
	});

	it.each([
		[
			"Horizon holds no such asset",
			{ "horizon.stellar.org/assets": { _embedded: { records: [] } } },
		],
		["Horizon did not answer", { "horizon.stellar.org/assets": null }],
		["the holder count did not answer", { "/holders": null }],
		[
			"the token contract did not answer",
			{ [`/contracts/${ASSET_CONTRACT}`]: null },
		],
	])("answers null when %s", async (_label, over) => {
		const { fetchJson } = answers(over);
		expect(await readAsset("EURC", ISSUER, fetchJson, NOW)).toBeNull();
	});
});

describe("readContract", () => {
	it("asks the index for the contract and reads its answer", async () => {
		const urls: string[] = [];
		const reading = await readContract(
			ASSET_CONTRACT,
			async (url) => {
				urls.push(url);
				return fresh({ exists: true, events: [], ttl: { state: "live" } });
			},
			NOW,
		);
		expect(urls).toEqual([
			`https://api.stellarindex.io/v1/contracts/${ASSET_CONTRACT}?limit=1`,
		]);
		expect(reading?.ttlState).toBe("live");
	});
});

// The index stamps `as_of` with when it answered, so a stalled ingestion
// looks fresh. Its newest native-asset event is its own clock (second
// review, 2026-11-22).
describe("indexHeadAt: the index's own clock", () => {
	const NATIVE = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
	it("reads the newest native-asset event, from the native token contract", async () => {
		const urls: string[] = [];
		const head = await indexHeadAt(async (url) => {
			urls.push(url);
			return fresh({
				exists: true,
				events: [event("2026-11-22T20:59:58Z", "transfer")],
				// the rollup lags the list and is not the clock
				activity: { last_seen: "2026-11-22T20:39:06Z" },
			});
		});
		expect(urls).toEqual([
			`https://api.stellarindex.io/v1/contracts/${NATIVE}?limit=1`,
		]);
		expect(head).toBe("2026-11-22T20:59:58.000Z");
	});
	it.each([
		["no answer", null],
		["an answer with no event", fresh({ exists: true, events: [] })],
		["an error body", { status: 500 }],
	])("answers null for %s", async (_label, body) => {
		expect(await indexHeadAt(async () => body)).toBeNull();
	});
});

describe("attestedSourceRepos: a contract that could not be read is left out", () => {
	const rpc = (result: unknown) =>
		(async () =>
			new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
				status: 200,
			})) as unknown as typeof fetch;

	it("answers nothing when the RPC lists no entry or fails", async () => {
		expect(
			(
				await attestedSourceRepos(
					[ASSET_CONTRACT],
					"http://rpc.test",
					rpc({ latestLedger: 1, entries: [] }),
				)
			).size,
		).toBe(0);
		expect(
			(
				await attestedSourceRepos(
					[ASSET_CONTRACT],
					"http://rpc.test",
					rpc(undefined),
				)
			).size,
		).toBe(0);
		expect(
			(
				await attestedSourceRepos(
					["not-an-address"],
					"http://rpc.test",
					rpc({ latestLedger: 1 }),
				)
			).size,
		).toBe(0);
	});
});
