/**
 * sls-029: oracle products per contract and network, with what the chain
 * showed. Two halves, each with its own writer:
 *  - the served surface: mergeProducts serves the oracle registry's records
 *    (and no stored oracle-feed copy) and the search route joins a reading;
 *  - the lane's reads: every chain answer below is XDR built with the SDK,
 *    run through the same parse and classify code the lane runs.
 * Trinary throughout: a value, a defined no-value answer, or could-not-check;
 * a failed RPC call never reads as a stale feed.
 */
import {
	Address,
	nativeToScVal,
	type rpc,
	SorobanDataBuilder,
	StrKey,
	scValToNative,
	xdr,
} from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { ORACLE_REGISTRY, type OracleProduct } from "@/data/oracle-registry";
import {
	curatedFieldsFor,
	DESCRIPTION_FIXES,
	LIFECYCLE_NOTE_SET,
	lifecycleNoteHold,
	STATUS_FIX,
} from "../../../scripts/data/curation-maps";
import {
	type CallOutcome,
	callOutcome,
	contractErrorCode,
	instancesFromEntries,
	type OracleRpc,
	observeOracle,
	toIso,
} from "../oracle-observe";
import {
	agedOutReadings,
	type OracleReading,
	observationTier,
	pickObservation,
	withOracleObservations,
} from "../oracle-products";
import { pickDeployment } from "../project-deployment";
import { mergeProducts, type ProductRecord } from "../rwa-products";

const NOW = new Date("2026-11-11T23:00:00.000Z");
const S = (secondsAgo: number) =>
	BigInt(Math.floor(NOW.getTime() / 1000) - secondsAgo);
const C1 = "CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN";
const USDC_SAC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const entry = (key: xdr.ScVal, val: xdr.ScVal) =>
	new xdr.ScMapEntry({ key, val });
const map = (o: Record<string, xdr.ScVal>) =>
	xdr.ScVal.scvMap(Object.entries(o).map(([k, v]) => entry(sym(k), v)));
const u64 = (n: bigint) => nativeToScVal(n, { type: "u64" });
const other = (s: string) => xdr.ScVal.scvVec([sym("Other"), sym(s)]);
const stellar = (id: string) =>
	xdr.ScVal.scvVec([sym("Stellar"), new Address(id).toScVal()]);
const ok = (value: xdr.ScVal): CallOutcome => ({ ok: true, value });
const err = (code: number | null, error = "HostError"): CallOutcome => ({
	ok: false,
	code,
	error,
});

function product(over: Partial<OracleProduct>): OracleProduct {
	return {
		slug: "reflector",
		name: "test oracle",
		network: "mainnet",
		contractId: C1,
		status: "live",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: "https://example.org",
		asOf: "2026-11-11",
		note: "",
		...over,
	};
}

/** A fake RPC: instance storage per id, call answers from a handler. */
function fakeRpc(opts: {
	instances?: Record<string, xdr.ScMapEntry[]>;
	instancesThrow?: boolean;
	call?: (fn: string, args: xdr.ScVal[], id: string) => CallOutcome | "throw";
	json?: unknown;
}): OracleRpc {
	return {
		async instances(_net, ids) {
			if (opts.instancesThrow)
				throw new Error("Request failed with status code 429");
			const out = new Map<string, xdr.ScMapEntry[]>();
			for (const id of ids) {
				const s = opts.instances?.[id];
				if (s) out.set(id, s);
			}
			return out;
		},
		async call(_net, id, fn, args) {
			const r = opts.call?.(fn, args, id) ?? err(null, "no handler");
			if (r === "throw") throw new Error("socket hang up");
			return r;
		},
		async json() {
			if (opts.json === undefined) throw new Error("404");
			return opts.json;
		},
	};
}

describe("served surface: the oracle registry writes oracle-feed records", () => {
	it("a provider with no stored products serves its registry records, unobserved", () => {
		const band = mergeProducts(null, "band");
		expect(band?.map((p) => [p.network, p.status, p.contractId])).toEqual([
			[
				"mainnet",
				"live",
				"CCQXWMZVM3KRTXTUPTN53YHL272QGKF32L7XEDNZ2S6OSUFK3NFBGG5M",
			],
			[
				"testnet",
				"retired",
				"CBRV5ZEQSSCQ4FFO64OF46I3UASBVEJNE5C2MCFWVIXL4Z7DMD7PJJMF",
			],
		]);
		for (const p of band ?? []) {
			expect(p.kind).toBe("oracle-feed");
			// Band publishes no Stellar address: only Stellar's page does
			expect(p.addressTier).toBe("directory-only");
			expect(p.observation).toBeNull();
		}
		// DIA's only published contract is gone from testnet: retired, not live
		expect(mergeProducts(null, "dia")?.map((p) => p.status)).toEqual([
			"retired",
		]);
	});

	it("a stored oracle-feed copy is not served beside the registry; other kinds are", () => {
		const stale: ProductRecord = {
			name: "Chainlink Data Feeds proxy (Stellar Mainnet)",
			kind: "oracle-feed",
			network: "mainnet",
			status: "live",
			contractId: "CDQBHEUGLDHMSUHG4IH33RJBUTMNCZOT4JIAQR4WZFRDZW6DR6S32ZLZ",
			evidenceUrl: "https://docs.chain.link/data-feeds/stellar",
			asOf: "2026-11-04",
			note: "old stored copy",
		};
		const other: ProductRecord = {
			...stale,
			kind: "other",
			contractId: null,
			name: "x",
			note: null,
		};
		const out = mergeProducts([stale, other], "chainlink") ?? [];
		expect(out.some((p) => p.note === "old stored copy")).toBe(false);
		expect(out.some((p) => p.name === "x")).toBe(true);
		expect(
			out
				.filter((p) => p.kind === "oracle-feed")
				.map((p) => [p.network, p.contractId]),
		).toEqual([
			["mainnet", "CDQBHEUGLDHMSUHG4IH33RJBUTMNCZOT4JIAQR4WZFRDZW6DR6S32ZLZ"],
			["testnet", "CBUF6IADAWPWIDWRTHJNINKXHG2UTIQ6TU2F2HRAXWAI7OT3KJPKK6O4"],
			["testnet", "CA7GVHWH4GRHE6GI7MHEKQZAOYO4GE7KRGSU3EOS3HYJRVLX3XEA4ONQ"],
		]);
		// Lightecho's stored record had no contract; the registry's has one per network
		expect(
			mergeProducts(
				[{ ...stale, name: "Lightecho Stellar Oracle", contractId: null }],
				"lightecho",
			)?.map((p) => p.contractId),
		).toEqual([
			"CDOR3QD27WAAF4TK4MO33TGQXR6RPNANNVLOY277W2XVV6ZVJ6X6X42T",
			"CA335SIV2XT6OC3SOUTZBHTX5IXMFO3WYBD3NNVBP37JXX4FXFNF5CI6",
		]);
	});

	it("joins a stored reading by network and contract; a malformed one is null, not a guess", () => {
		const reading = {
			key: `mainnet:${C1}`,
			checkedAt: "2026-11-11T23:00:00.000Z",
			contract: "present",
			method: "sep40-lastprice",
			maxAgeSeconds: 600,
			lastUpdateAt: "2026-11-11T22:55:00.000Z",
			feedList: {
				basis: "contract",
				sourceUrl: `https://lab.stellar.org/r/mainnet/contract/${C1}`,
				asOf: "2026-11-11T23:00:00.000Z",
			},
			feeds: [
				{
					feed: "BTC",
					label: null,
					contractId: null,
					lastUpdateAt: "2026-11-11T22:55:00.000Z",
					state: "updating",
				},
				{
					feed: "DOT",
					label: null,
					contractId: null,
					lastUpdateAt: null,
					state: "no-value",
				},
			],
		};
		const records = mergeProducts(null, "reflector");
		const joined = withOracleObservations(
			records,
			new Map([[reading.key, reading]]),
		);
		const hit = joined?.find(
			(p) => p.contractId === C1 && p.network === "mainnet",
		);
		expect(hit?.observation?.feeds?.map((f) => f.state)).toEqual([
			"updating",
			"no-value",
		]);
		expect(hit?.observation?.lastUpdateAt).toBe("2026-11-11T22:55:00.000Z");
		// the same address on testnet is a different contract: no reading, null
		expect(joined?.filter((p) => p.observation).length).toBe(1);
		expect(
			pickObservation({ ...reading, feeds: [{ feed: "BTC", state: "fresh" }] }),
		).toBeNull();
		expect(pickObservation({ ...reading, contract: "maybe" })).toBeNull();
	});

	it("every registry row is a valid, unique contract with a dated source", () => {
		const seen = new Set<string>();
		for (const r of ORACLE_REGISTRY) {
			expect(StrKey.isValidContract(r.contractId), r.contractId).toBe(true);
			const k = `${r.network}:${r.contractId}`;
			expect(seen.has(k), k).toBe(false);
			seen.add(k);
			expect(r.evidenceUrl).toMatch(/^https:\/\//);
			expect(r.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(!!r.feedListUrl).toBe(
				r.read === "chainlink-latest-round" ||
					r.read === "redstone-adapter-read",
			);
			expect(!!r.feeds?.length).toBe(r.read === "band-reference-data");
		}
	});
});

describe("chain reads: XDR answers through the lane's own parse", () => {
	it("SEP-40: a fresh price is updating, None is no-value, the contract's own last write counts", async () => {
		const storage = [entry(sym("last_timestamp"), u64(S(120) * 1000n))]; // Reflector keeps ms
		const meta = [
			entry(
				sym("METADATA"),
				map({
					decimal: nativeToScVal(7, { type: "u32" }),
					name: xdr.ScVal.scvString(
						"USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
					),
					symbol: xdr.ScVal.scvString("USDC"),
				}),
			),
		];
		const r = await observeOracle(
			product({}),
			fakeRpc({
				instances: { [C1]: storage, [USDC_SAC]: meta },
				call: (fn, args) => {
					if (fn === "assets")
						return ok(xdr.ScVal.scvVec([other("BTC"), stellar(USDC_SAC)]));
					if (fn === "resolution")
						return ok(nativeToScVal(300, { type: "u32" }));
					const a = scValToNative(args[0]) as [string, string];
					return a[1] === "BTC"
						? ok(
								map({
									price: nativeToScVal(7_000_000n, { type: "i128" }),
									timestamp: u64(S(60)),
								}),
							)
						: ok(xdr.ScVal.scvVoid());
				},
			}),
			NOW,
		);
		expect(r.ok).toBe(true);
		expect(r.observation?.contract).toBe("present");
		expect(r.observation?.maxAgeSeconds).toBe(600);
		expect(r.observation?.feeds).toEqual([
			{
				feed: "BTC",
				label: null,
				contractId: null,
				lastUpdateAt: "2026-11-11T22:59:00.000Z",
				state: "updating",
			},
			{
				feed: USDC_SAC,
				label: "USDC",
				contractId: null,
				lastUpdateAt: null,
				state: "no-value",
			},
		]);
		expect(r.observation?.lastUpdateAt).toBe("2026-11-11T22:59:00.000Z");
		expect(r.observation?.feedList).toEqual({
			basis: "contract",
			sourceUrl: `https://lab.stellar.org/r/mainnet/contract/${C1}`,
			asOf: NOW.toISOString(),
		});
	});

	it("SEP-40: an old price is stale, unless the provider's published heartbeat covers it", async () => {
		const call = (fn: string) =>
			fn === "assets"
				? ok(xdr.ScVal.scvVec([other("EUR")]))
				: fn === "resolution"
					? ok(nativeToScVal(300, { type: "u32" }))
					: ok(
							map({
								price: nativeToScVal(1n, { type: "i128" }),
								timestamp: u64(S(3600)),
							}),
						);
		const rpcFake = fakeRpc({ instances: { [C1]: [] }, call });
		const plain = await observeOracle(product({}), rpcFake, NOW);
		expect(plain.observation?.feeds?.[0].state).toBe("stale");
		const beat = await observeOracle(
			product({ heartbeatSeconds: 7200 }),
			rpcFake,
			NOW,
		);
		expect(beat.observation?.maxAgeSeconds).toBe(14_400);
		expect(beat.observation?.feeds?.[0].state).toBe("updating");
	});

	it("a failed RPC call is could-not-check, never stale; when every read fails nothing is stored", async () => {
		const call = (fn: string) =>
			fn === "assets"
				? ok(xdr.ScVal.scvVec([other("BTC"), other("ETH")]))
				: fn === "resolution"
					? ok(nativeToScVal(300, { type: "u32" }))
					: ("throw" as const);
		const r = await observeOracle(
			product({}),
			fakeRpc({ instances: { [C1]: [] }, call }),
			NOW,
		);
		expect(r.observation?.feeds?.map((f) => f.state)).toEqual([
			"could-not-check",
			"could-not-check",
		]);
		expect(r.ok).toBe(false);
		const down = await observeOracle(
			product({}),
			fakeRpc({ instancesThrow: true }),
			NOW,
		);
		expect(down).toMatchObject({ ok: false, observation: null });
	});

	it("no instance at the address is absent, once a call confirms it; an archived one is not absent", async () => {
		const missing = fakeRpc({
			instances: {},
			call: () =>
				err(
					null,
					"HostError: Error(Storage, MissingValue)\n\nEvent log (newest first):",
				),
		});
		const r = await observeOracle(product({}), missing, NOW);
		expect(r.ok).toBe(true);
		expect(r.observation).toMatchObject({
			contract: "absent",
			feeds: null,
			lastUpdateAt: null,
		});
		const archived = fakeRpc({
			instances: {},
			call: () => err(null, "archived state needs a restore"),
		});
		expect(await observeOracle(product({}), archived, NOW)).toMatchObject({
			ok: false,
			observation: null,
		});
		const restore = callOutcome({
			id: "1",
			latestLedger: 1,
			events: [],
			_parsed: true,
			transactionData: new SorobanDataBuilder(),
			minResourceFee: "100",
			result: { auth: [], retval: xdr.ScVal.scvVoid() },
			restorePreamble: {
				minResourceFee: "100",
				transactionData: new SorobanDataBuilder(),
			},
		} as unknown as rpc.Api.SimulateTransactionResponse);
		expect(restore).toEqual({
			ok: false,
			code: null,
			error: "archived state needs a restore",
		});
	});

	it("Chainlink: a round is dated by its timestamp; NoDataPresent (#50) is no-value", async () => {
		const btc = `0x01a0b4d920000332${"0".repeat(48)}`;
		const eth = `0x01d585327c000332${"0".repeat(48)}`;
		const r = await observeOracle(
			product({
				slug: "chainlink",
				read: "chainlink-latest-round",
				feedListUrl: "https://x",
			}),
			fakeRpc({
				instances: { [C1]: [] },
				json: [
					{ name: "BTC / USD", proxyAddress: btc, heartbeat: 86400 },
					{ name: "ETH / USD", proxyAddress: eth, heartbeat: 86400 },
				],
				call: (_fn, args) => {
					const id = Buffer.from(args[0].bytes()).toString("hex");
					return id.startsWith("01a0b4d9")
						? ok(
								map({
									answer: nativeToScVal(74_029n, { type: "i256" }),
									round_id: u64(770n),
									timestamp: u64(S(1800)),
								}),
							)
						: err(50, "HostError: Error(Contract, #50)");
				},
			}),
			NOW,
		);
		expect(r.observation?.maxAgeSeconds).toBe(172_800);
		expect(
			r.observation?.feeds?.map((f) => [f.label, f.state, f.lastUpdateAt]),
		).toEqual([
			["BTC / USD", "updating", "2026-11-11T22:30:00.000Z"],
			["ETH / USD", "no-value", null],
		]);
		expect(r.observation?.feedList).toEqual({
			basis: "provider-list",
			sourceUrl: "https://x",
			asOf: NOW.toISOString(),
		});
		const noList = await observeOracle(
			product({ read: "chainlink-latest-round", feedListUrl: "https://x" }),
			fakeRpc({ instances: { [C1]: [] } }),
			NOW,
		);
		expect(noList.ok).toBe(false);
	});

	it("Band: reference data is dated by last_updated_base; error #1 is no-value", async () => {
		const r = await observeOracle(
			product({
				read: "band-reference-data",
				feeds: [{ id: "XLM" }, { id: "BTC" }],
				feedSeed: {
					sourceUrl: "https://horizon.example/relays",
					asOf: "2026-11-11",
				},
			}),
			fakeRpc({
				instances: { [C1]: [] },
				call: (_fn, args) => {
					const pair = scValToNative(args[0]) as string[][];
					return pair[0][0] === "XLM"
						? ok(
								xdr.ScVal.scvVec([
									map({
										last_updated_base: u64(S(3000)),
										last_updated_quote: u64(S(10)),
										rate: nativeToScVal(149_215n, { type: "u128" }),
									}),
								]),
							)
						: err(1, "HostError: Error(Contract, #1)");
				},
			}),
			NOW,
		);
		expect(r.observation?.feeds?.map((f) => [f.feed, f.state])).toEqual([
			["XLM/USD", "updating"],
			["BTC/USD", "no-value"],
		]);
		// a seeded list says where and when it was seeded
		expect(r.observation?.feedList).toEqual({
			basis: "seeded",
			sourceUrl: "https://horizon.example/relays",
			asOf: "2026-11-11",
		});
		// no seed source, no reading: an unsourced list is never served
		const unsourced = await observeOracle(
			product({ read: "band-reference-data", feeds: [{ id: "XLM" }] }),
			fakeRpc({ instances: { [C1]: [] } }),
			NOW,
		);
		expect(unsourced.ok).toBe(false);
	});

	it("RedStone: the adapter's own staleness error (#1400) is stale, dated from its history", async () => {
		const pd = (ms: bigint) =>
			map({
				package_timestamp: u64(ms - 7000n),
				price: nativeToScVal(1n, { type: "u256" }),
				write_timestamp: u64(ms),
			});
		const manifest = {
			adapterContractType: "multi-feed",
			chain: { name: "stellar-mainnet", id: "stellar/1" },
			adapterContract: C1,
			priceFeeds: {
				BTC: { priceFeedAddress: USDC_SAC },
				SolvBTC: {},
				X: { priceFeedAddress: C1 },
			},
		};
		const r = await observeOracle(
			product({
				read: "redstone-adapter-read",
				feedListUrl: "https://raw.example/m.json",
			}),
			fakeRpc({
				instances: { [C1]: [] },
				json: manifest,
				call: (fn, args) => {
					const id = scValToNative(args[0]) as string;
					if (fn === "read_price_history")
						return ok(xdr.ScVal.scvVec([pd(1779352808000n)]));
					if (id === "BTC") return ok(pd(S(600) * 1000n));
					if (id === "SolvBTC")
						return err(1400, "HostError: Error(Contract, #1400)");
					return err(null, "HostError: Error(Context, InvalidAction)");
				},
			}),
			NOW,
		);
		expect(r.observation?.feeds).toEqual([
			{
				feed: "BTC",
				label: null,
				contractId: USDC_SAC,
				lastUpdateAt: "2026-11-11T22:50:00.000Z",
				state: "updating",
			},
			{
				feed: "SolvBTC",
				label: null,
				contractId: null,
				lastUpdateAt: "2026-05-21T08:40:08.000Z",
				state: "stale",
			},
			{
				feed: "X",
				label: null,
				contractId: null,
				lastUpdateAt: null,
				state: "could-not-check",
			},
		]);
		expect(r.observation?.feedList).toMatchObject({
			basis: "provider-list",
			sourceUrl: "https://raw.example/m.json",
		});
		// a manifest for another adapter is not this contract's list
		const wrong = await observeOracle(
			product({
				read: "redstone-adapter-read",
				feedListUrl: "https://raw.example/m.json",
			}),
			fakeRpc({
				instances: { [C1]: [] },
				json: { ...manifest, adapterContract: USDC_SAC },
			}),
			NOW,
		);
		expect(wrong.ok).toBe(false);
	});

	it("Reflector Beam: per-asset reads are not public; a contract not written within the bound makes every feed stale", async () => {
		const beam = (lastMs: bigint) =>
			observeOracle(
				product({ read: "reflector-beam-last-timestamp" }),
				fakeRpc({
					instances: { [C1]: [entry(sym("last_timestamp"), u64(lastMs))] },
					call: (fn) =>
						fn === "assets"
							? ok(xdr.ScVal.scvVec([other("BTC")]))
							: ok(nativeToScVal(60, { type: "u32" })),
				}),
				NOW,
			);
		const old = await beam(1792682400000n); // 2026-10-22T15:20:00Z
		expect(old.observation?.lastUpdateAt).toBe("2026-10-22T15:20:00.000Z");
		expect(old.observation?.feeds?.[0].state).toBe("stale");
		const fresh = await beam(S(30) * 1000n);
		expect(fresh.observation?.feeds?.[0].state).toBe("could-not-check");
	});

	it("a pull-model verifier is existence only, and says freshness is not observable on chain", async () => {
		const r = await observeOracle(
			product({ read: "pull-verifier" }),
			fakeRpc({ instances: { [C1]: [] } }),
			NOW,
		);
		expect(r).toMatchObject({
			ok: true,
			observation: {
				contract: "present",
				feeds: null,
				feedList: null,
				maxAgeSeconds: null,
			},
		});
		expect(observationTier(r.observation as OracleReading, READ_AT)).toBe(
			"not-observable-pull-model",
		);
	});
});

describe("RPC boundary parsing", () => {
	it("reads contract instances out of getLedgerEntries rows", () => {
		const data = xdr.LedgerEntryData.contractData(
			new xdr.ContractDataEntry({
				ext: new xdr.ExtensionPoint(0),
				contract: new Address(C1).toScAddress(),
				key: xdr.ScVal.scvLedgerKeyContractInstance(),
				durability: xdr.ContractDataDurability.persistent(),
				val: xdr.ScVal.scvContractInstance(
					new xdr.ScContractInstance({
						executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
						storage: [entry(sym("last_timestamp"), u64(1794437400000n))],
					}),
				),
			}),
		);
		const got = instancesFromEntries([data]);
		expect([...got.keys()]).toEqual([C1]);
		expect(scValToNative(got.get(C1)?.[0].val() as xdr.ScVal)).toBe(
			1794437400000n,
		);
	});

	it("a contract error code is an answer; any other simulation error is not", () => {
		expect(
			contractErrorCode("HostError: Error(Contract, #1400)\n\nEvent log"),
		).toBe(1400);
		expect(
			contractErrorCode("HostError: Error(Storage, MissingValue)"),
		).toBeNull();
		const asSim = (o: object) =>
			o as unknown as rpc.Api.SimulateTransactionResponse;
		expect(
			callOutcome(
				asSim({
					id: "1",
					latestLedger: 1,
					events: [],
					_parsed: true,
					error: "HostError: Error(Contract, #50)",
				}),
			),
		).toMatchObject({ ok: false, code: 50 });
		const v = nativeToScVal(300, { type: "u32" });
		expect(
			callOutcome(
				asSim({
					id: "1",
					latestLedger: 1,
					events: [],
					_parsed: true,
					transactionData: new SorobanDataBuilder(),
					minResourceFee: "100",
					result: { auth: [], retval: v },
				}),
			),
		).toEqual({ ok: true, value: v });
	});

	it("timestamps in seconds and in milliseconds both land on the same instant", () => {
		expect(toIso(1794437700n)).toBe("2026-11-11T22:55:00.000Z");
		expect(toIso(1794437700000n)).toBe("2026-11-11T22:55:00.000Z");
		expect(toIso(0)).toBeNull();
	});
});

/** The clock the tier rules are judged at (the readings below are dated 2026-11-11). */
const READ_AT = new Date("2026-11-11T23:30:00.000Z");
/** A stored reading with defaults, for the tier rules. */
const reading = (over: Partial<OracleReading>): OracleReading => ({
	checkedAt: "2026-11-11T23:00:00.000Z",
	contract: "present",
	method: "sep40-lastprice",
	maxAgeSeconds: 600,
	lastUpdateAt: null,
	feeds: null,
	feedList: null,
	...over,
});
const f = (state: "updating" | "stale" | "no-value" | "could-not-check") => ({
	feed: "X",
	label: null,
	contractId: null,
	lastUpdateAt: null,
	state,
});

describe("evidence tiers (sls-029): Raven's six read off addressTier and observation.tier", () => {
	it("every record's address tier names who publishes the address", () => {
		for (const r of ORACLE_REGISTRY)
			expect(r.addressTier, `${r.slug} ${r.network}`).toBe(
				r.slug === "band" ? "directory-only" : "official-address",
			);
	});

	it("the reading's tier follows from its own fields", () => {
		expect(observationTier(reading({ contract: "absent" }), READ_AT)).toBe(
			"published-address-absent",
		);
		expect(observationTier(reading({ method: "pull-verifier" }), READ_AT)).toBe(
			"not-observable-pull-model",
		);
		expect(
			observationTier(reading({ feeds: [f("updating"), f("stale")] }), READ_AT),
		).toBe("observed-updating");
		// Lightecho on 2026-11-11: every asset no-value, contract last written 2026-10-05
		expect(
			observationTier(
				reading({
					feeds: [f("no-value"), f("no-value")],
					lastUpdateAt: "2026-10-05T07:00:00.000Z",
					maxAgeSeconds: 1200,
				}),
				READ_AT,
			),
		).toBe("observed-stale");
		expect(observationTier(reading({ feeds: [f("stale")] }), READ_AT)).toBe(
			"observed-stale",
		);
	});
});

describe("no promotion (sls-029): existence is not updating, one product's evidence is not another's", () => {
	it("a contract that exists, or was written recently, without a feed read updating is never observed-updating", () => {
		// present, nothing read (a contract with no reader yet)
		expect(
			observationTier(reading({ method: "instance-only" }), READ_AT),
		).toBeNull();
		// Beam testnet: the contract-wide timestamp is recent, no feed is public
		expect(
			observationTier(
				reading({
					method: "reflector-beam-last-timestamp",
					lastUpdateAt: "2026-11-11T22:58:00.000Z",
					maxAgeSeconds: 14_400,
					feeds: [f("could-not-check"), f("could-not-check")],
				}),
				READ_AT,
			),
		).toBeNull();
		// every read failed: no claim either way
		expect(
			observationTier(reading({ feeds: [f("could-not-check")] }), READ_AT),
		).toBeNull();
	});

	it("a Data Streams verifier reading never lands on a Data Feeds record", () => {
		const streams = {
			// served tiers are judged at the request's clock
			...reading({
				method: "pull-verifier",
				checkedAt: new Date().toISOString(),
			}),
			key: "testnet:CA7GVHWH4GRHE6GI7MHEKQZAOYO4GE7KRGSU3EOS3HYJRVLX3XEA4ONQ",
		};
		const joined =
			withOracleObservations(
				mergeProducts(null, "chainlink"),
				new Map([[streams.key, streams]]),
			) ?? [];
		const byName = (n: string, net: string) =>
			joined.find((p) => p.name === n && p.network === net);
		expect(
			byName("Chainlink Data Streams verifier", "testnet")?.observation?.tier,
		).toBe("not-observable-pull-model");
		expect(
			byName("Chainlink Data Feeds proxy", "testnet")?.observation,
		).toBeNull();
		expect(
			byName("Chainlink Data Feeds proxy", "mainnet")?.observation,
		).toBeNull();
	});

	it("a provider's records stay on the provider's row, and never set a project's deployment", () => {
		// the third-party VRF relayer is not Chainlink: no Chainlink products
		expect(mergeProducts(null, "chainlink-oracles-relayer")).toBeNull();
		// a live mainnet Pyth verifier record does not make Pyth's deployment
		// known; that fact has its own writer and evidence
		expect(
			mergeProducts(null, "pyth")?.some(
				(p) => p.network === "mainnet" && p.status === "live",
			),
		).toBe(true);
		expect(pickDeployment(null, "pyth").network).toBe("unknown");
	});

	it("registry text carries no freshness claim: freshness is only ever an observation", () => {
		for (const r of ORACLE_REGISTRY)
			expect(`${r.name} ${r.note}`, `${r.slug} ${r.contractId}`).not.toMatch(
				/\b(updating|updated|stale|fresh|real-?time|actively)\b|last written|an hour/i,
			);
	});
});

describe("feed lists carry their source (sls-029)", () => {
	it("a stored reading with feeds but no list source is served as no observation", () => {
		const r = reading({ feeds: [f("updating")] });
		expect(pickObservation(r)).toBeNull();
		expect(
			pickObservation({
				...r,
				feedList: {
					basis: "seeded",
					sourceUrl: "https://x",
					asOf: "2026-11-11",
				},
			})?.feedList?.basis,
		).toBe("seeded");
	});

	it("every registry list is a provider list read each run, or a seed with its source and date", () => {
		for (const r of ORACLE_REGISTRY) {
			if (
				r.read === "chainlink-latest-round" ||
				r.read === "redstone-adapter-read"
			)
				expect(r.feedListUrl, r.contractId).toMatch(/^https:\/\//);
			if (r.read === "band-reference-data") {
				expect(r.feedSeed?.sourceUrl, r.contractId).toMatch(/^https:\/\//);
				expect(r.feedSeed?.asOf, r.contractId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			}
		}
	});
});

describe("served summaries and lifecycle notes of oracle rows (sls-029)", () => {
	const providers = [...new Set(ORACLE_REGISTRY.map((r) => r.slug))];
	// freshness belongs to the observation, dated; static text cannot carry it
	const FRESHNESS =
		/\b(updating|updated|stale|fresh|real-?time|actively|live on)\b|last written|an hour/i;
	// a listed integration is a listing, never stated as use
	const CONSUMPTION = /\b(powering|powers|powered by|used by|relies on)\b/i;
	const summary = (slug: string) => DESCRIPTION_FIXES[slug] ?? "";

	it("every provider's summary is curated, so the served text is the tested text", () => {
		for (const slug of providers)
			expect(DESCRIPTION_FIXES[slug], slug).toBeTypeOf("string");
	});

	it("no summary or lifecycle note states freshness or turns a listing into use", () => {
		for (const slug of providers) {
			for (const text of [
				summary(slug),
				STATUS_FIX[slug]?.note ?? "",
				LIFECYCLE_NOTE_SET[slug] ?? "",
			]) {
				expect(text, slug).not.toMatch(FRESHNESS);
				expect(text, slug).not.toMatch(CONSUMPTION);
			}
		}
	});

	it("a summary claims a network only where the registry holds a live contract there", () => {
		for (const slug of providers) {
			const live = ORACLE_REGISTRY.filter(
				(r) => r.slug === slug && r.status === "live",
			);
			const text = summary(slug).replace(/\bno mainnet\b[^.;]*/gi, "");
			if (/\bmainnet\b/i.test(text))
				expect(
					live.some((r) => r.network === "mainnet"),
					slug,
				).toBe(true);
			if (!live.length)
				expect(text, slug).not.toMatch(
					/\b(live|deployed|available|running|launched) on\b/i,
				);
		}
		// DIA: its only published contract is gone; the summary says so
		expect(summary("dia")).toMatch(/no longer on the testnet/);
		expect(summary("dia")).toMatch(/no mainnet contract is published/);
	});

	it("the replaced lifecycle notes point at the observation, and status ownership is untouched", () => {
		for (const slug of ["lightecho", "redstone-finance", "reflector"]) {
			expect(LIFECYCLE_NOTE_SET[slug], slug).toMatch(
				/observation, null until a check has run/,
			);
			// note-only: no STATUS_FIX entry, so status stays unowned and the
			// status lanes and the feed sync treat the row as before
			expect(STATUS_FIX[slug], slug).toBeUndefined();
			expect(curatedFieldsFor(slug).has("status"), slug).toBe(false);
		}
		for (const slug of Object.keys(LIFECYCLE_NOTE_SET))
			expect(STATUS_FIX[slug]?.note, `${slug} has two note writers`).toBe(
				undefined,
			);
	});

	it("a summary says only what its source says: Lightecho's README, not a currency list", () => {
		expect(summary("lightecho")).toMatch(
			/emerging markets data and XLM volatility feeds/,
		);
		// INR is in no source (the contract lists IDR and IDRT); the feed list
		// is the contract's own assets(), served in products
		expect(summary("lightecho")).not.toMatch(/\b(INR|KES|30-day|P2P)\b/);
		// freshness is promised only once a check has run, never as a standing fact
		for (const slug of providers)
			if (/freshness/.test(summary(slug)))
				expect(summary(slug), slug).toMatch(/once checked|not observable/);
	});
});

describe("a reading that cannot be refreshed stops carrying a tier (sls-029 audit)", () => {
	const now = new Date("2026-11-13T00:00:00.000Z");
	it("a check older than 24 hours serves no tier", () => {
		const fresh = reading({
			checkedAt: "2026-11-12T12:00:00.000Z",
			feeds: [f("updating")],
		});
		expect(observationTier(fresh, now)).toBe("observed-updating");
		const old = { ...fresh, checkedAt: "2026-11-11T23:00:00.000Z" };
		expect(observationTier(old, now)).toBeNull();
		expect(
			observationTier({ ...old, contract: "absent" } as OracleReading, now),
		).toBeNull();
	});

	it("a feed that could not be read beside stale ones makes no stale verdict", () => {
		const mixed = reading({
			checkedAt: "2026-11-12T23:00:00.000Z",
			feeds: [f("stale"), f("could-not-check")],
			lastUpdateAt: "2026-10-05T07:00:00.000Z",
		});
		expect(observationTier(mixed, now)).toBeNull();
		expect(
			observationTier({ ...mixed, feeds: [f("stale"), f("stale")] }, now),
		).toBe("observed-stale");
	});

	it("the lane flags a stored reading it did not refresh once it is older than 24 hours", () => {
		const stored = new Map([
			["mainnet:A", { checkedAt: "2026-11-11T23:00:00.000Z" }],
			["mainnet:B", { checkedAt: "2026-11-12T20:00:00.000Z" }],
			["mainnet:C", { checkedAt: "2026-11-10T00:00:00.000Z" }],
		]);
		expect(
			agedOutReadings(
				["mainnet:A", "mainnet:B", "mainnet:C", "mainnet:D"],
				stored,
				new Set(["mainnet:C"]),
				now,
			),
		).toEqual([{ key: "mainnet:A", checkedAt: "2026-11-11T23:00:00.000Z" }]);
	});

	it("most feeds unreadable is no reading to store, whatever the cause; Beam's unread feeds are its answer", async () => {
		const call = (fn: string, args: xdr.ScVal[]) => {
			if (fn === "assets")
				return ok(xdr.ScVal.scvVec([other("A"), other("B"), other("C")]));
			if (fn === "resolution") return ok(nativeToScVal(300, { type: "u32" }));
			const a = scValToNative(args[0]) as [string, string];
			return a[1] === "A"
				? ok(
						map({
							price: nativeToScVal(1n, { type: "i128" }),
							timestamp: u64(S(60)),
						}),
					)
				: err(null, "HostError: Error(WasmVm, UnexpectedSize)");
		};
		const r = await observeOracle(
			product({}),
			fakeRpc({ instances: { [C1]: [] }, call }),
			NOW,
		);
		expect(r.observation?.feeds?.map((x) => x.state)).toEqual([
			"updating",
			"could-not-check",
			"could-not-check",
		]);
		expect(r).toMatchObject({
			ok: false,
			why: "2 of 3 feeds could not be read",
		});
		const beam = await observeOracle(
			product({ read: "reflector-beam-last-timestamp" }),
			fakeRpc({
				instances: { [C1]: [entry(sym("last_timestamp"), u64(S(30) * 1000n))] },
				call: (fn) =>
					fn === "assets"
						? ok(xdr.ScVal.scvVec([other("BTC")]))
						: ok(nativeToScVal(60, { type: "u32" })),
			}),
			NOW,
		);
		expect(beam.ok).toBe(true);
	});

	it("Chainlink judges each feed against its own heartbeat", async () => {
		const id = (h: string) => `0x${h}${"0".repeat(64 - h.length)}`;
		const r = await observeOracle(
			product({ read: "chainlink-latest-round", feedListUrl: "https://x" }),
			fakeRpc({
				instances: { [C1]: [] },
				json: [
					{ name: "FAST / USD", proxyAddress: id("01aa"), heartbeat: 3600 },
					{ name: "SLOW / USD", proxyAddress: id("01bb"), heartbeat: 86400 },
				],
				call: () =>
					ok(
						map({
							answer: nativeToScVal(1n, { type: "i256" }),
							round_id: u64(1n),
							timestamp: u64(S(3 * 3600)),
						}),
					),
			}),
			NOW,
		);
		// three hours old: past twice FAST's 1 h heartbeat, inside SLOW's 24 h
		expect(r.observation?.feeds?.map((x) => [x.label, x.state])).toEqual([
			["FAST / USD", "stale"],
			["SLOW / USD", "updating"],
		]);
	});
});

describe("the note-only writer never writes over a row that left Live (sls-029)", () => {
	it("writes only onto a Live row with no STATUS_FIX entry", () => {
		for (const slug of Object.keys(LIFECYCLE_NOTE_SET)) {
			expect(lifecycleNoteHold(slug, { status: "Live" }), slug).toBeNull();
			// a shutdown note from any path (a STATUS_FIX move without a note,
			// backfill-lifecycle) stands
			for (const status of [
				"Inactive",
				"Development",
				"Pre-Release",
				"Draft",
				null,
			])
				expect(lifecycleNoteHold(slug, { status }), `${slug} ${status}`).toBe(
					"not-live",
				);
		}
	});

	it("any STATUS_FIX entry for the slug owns its lifecycle, with or without a note", () => {
		// dia has a STATUS_FIX stamp; a slug added to both maps steps aside
		expect(lifecycleNoteHold("dia", { status: "Live" })).toBe("status-fix");
		const noteless = Object.entries(STATUS_FIX).find(([, f]) => !f.note)?.[0];
		if (noteless)
			expect(lifecycleNoteHold(noteless, { status: "Live" })).toBe(
				"status-fix",
			);
	});
});
