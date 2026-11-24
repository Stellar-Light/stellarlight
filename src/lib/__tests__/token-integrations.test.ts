// @vitest-environment node
/**
 * Token integrations layer: tiers, the depth rule, never-blended counts,
 * decoy-issuer disambiguation, the write plan (idempotent, ended never
 * deleted, could-not-check never ends), and the Ethena case as a fixture of
 * the readings taken on 2026-11-23 (USDe: integrated by Soroswap and XOXNO,
 * used by Aquarius and Sushi; Sushi is not SCF-funded).
 */
import { Asset, Networks } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
	addDecimals,
	aggregate,
	codeCandidates,
	type Edge,
	edgeUnread,
	holderTier,
	type IntegrationRow,
	marketTier,
	parseTokenParam,
	plannedWrites,
	planWrites,
	poolDepth,
	poolEdgeTier,
	priorHolderContracts,
	rowKey,
	type StoredRow,
	summarize,
	type TokenIdentity,
	XLM_SAC,
} from "../token-integrations";

const USDE = "CCNOV6XVI2O5BSTA3232GIRUQULDEBV7IWGKM6QKI6II5OIIQTU24JJN";
const SUSDE = "CACSKWC753QVGC4J6YPDBIR2BEHFVWIAE7CBSS3HOVYMN623OAIQYE2M";
const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const PAXOS_PYUSD = "CCCRWH6Q3FNP3I2I57BDLM5AFAT7O6OF6GKQOC6SSJNDAVRZ57SPHGU2";
const DECOY_PYUSD = "CAJZ36VD26EHWA5WSO7QFVVCK2H6NWWN7CJSZVOQP2NIMTC6W77NEJZQ";
const RUN = "2026-11-23T20:49:15Z";

function edge(p: Partial<Edge> & Pick<Edge, "token" | "kind" | "venue">): Edge {
	return {
		projectSlug: null,
		attributionBasis: "",
		pool: "P",
		method: "m",
		source: `registry:${p.venue}`,
		firstAt: null,
		firstBasis: "not read",
		lastSeenAt: null,
		events90d: null,
		events90dBasis: null,
		balance: null,
		balanceUsd: null,
		balanceBasis: null,
		depthUsd: null,
		depthBasis: null,
		tier: "integrated",
		tierBasis: "",
		evidenceUrl: "https://example.invalid",
		readAt: RUN,
		...p,
	};
}

describe("tiers", () => {
	it("used needs both floors; a floor fails only where it was read", () => {
		expect(marketTier(500, "x", 134108.38, 1).tier).toBe("used");
		expect(marketTier(9, "x", 1e6, 0).tier).toBe("available");
		expect(marketTier(null, null, 50, 0).tier).toBe("available");
		// depth below the floor but a leg unpriced: could-not-check, never available
		expect(marketTier(46, "x", 2.39, 1).tier).toBe("unrated");
		expect(marketTier(null, null, 5000, 0).tier).toBe("unrated");
	});

	it("configured kinds are integrated; a DEX pool only when its rewards config pays it", () => {
		const d = { usd: 0, unknownLegs: 0 };
		expect(poolEdgeTier("lending_reserve", null, null, null, d).tier).toBe(
			"integrated",
		);
		expect(poolEdgeTier("dex_pool", "0", 0, "x", d).tier).toBe("available");
		expect(poolEdgeTier("dex_pool", "12.5", 0, "x", d).tier).toBe("integrated");
		expect(poolEdgeTier("classic_amm_pool", "12.5", 0, "x", d).tier).toBe(
			"available",
		);
	});

	it("a holder is integrated by its own pool label only when tied directly and not a DEX", () => {
		const base = {
			projectSlug: "xoxno",
			direct: true,
			dexProject: false,
			label: "XOXNO - Central Pool",
			events90d: 500,
			eventsBasis: "x",
			usd: null,
		};
		expect(holderTier(base).tier).toBe("integrated");
		expect(holderTier({ ...base, direct: false }).tier).toBe("unrated");
		expect(holderTier({ ...base, dexProject: true }).tier).toBe("unrated");
		expect(holderTier({ ...base, label: "XOXNO deployer" }).tier).toBe(
			"unrated",
		);
	});

	it("one priced leg prices a constant-product pool at twice that leg, and nothing else", () => {
		const legs = [
			{ balance: "100", usd: 500 },
			{ balance: "7", usd: null },
		];
		expect(poolDepth(legs, true)).toMatchObject({ usd: 1000, unknownLegs: 0 });
		expect(poolDepth(legs, false)).toMatchObject({ usd: 500, unknownLegs: 1 });
		// an unread leg is not doubled over
		expect(
			poolDepth(
				[
					{ balance: "1", usd: 500 },
					{ balance: null, usd: null },
				],
				true,
			),
		).toMatchObject({ usd: 500, unknownLegs: 1 });
	});

	it("sums balances exactly", () => {
		expect(addDecimals(["2215345162883.7818336", "0.0000001"])).toBe(
			"2215345162883.7818337",
		);
		expect(addDecimals(["4753.16469", "4175.1648927"])).toBe("8928.3295827");
		expect(addDecimals(["1", "2"])).toBe("3");
	});
});

describe("counting is per tier, never blended", () => {
	it("a project counts once at its best tier; network pools and unattributed holders apart", () => {
		const rows = aggregate(
			[
				edge({
					token: USDC,
					kind: "dex_pool",
					venue: "aquarius",
					projectSlug: "aquarius",
					tier: "available",
					pool: "A1",
				}),
				edge({
					token: USDC,
					kind: "dex_pool",
					venue: "aquarius",
					projectSlug: "aquarius",
					tier: "used",
					pool: "A2",
				}),
				edge({
					token: USDC,
					kind: "asset_list",
					venue: "Aquarius list",
					projectSlug: "aquarius",
					tier: "integrated",
				}),
				edge({
					token: USDC,
					kind: "dex_pool",
					venue: "sushiswap_v3",
					projectSlug: "sushi",
					tier: "available",
				}),
				edge({
					token: USDC,
					kind: "classic_amm_pool",
					venue: "stellar-classic-amm",
					tier: "used",
					pool: "L1",
				}),
				edge({
					token: USDC,
					kind: "classic_amm_pool",
					venue: "stellar-classic-amm",
					tier: "available",
					pool: "L2",
				}),
				edge({
					token: USDC,
					kind: "holder_unattributed",
					venue: "holder",
					tier: "unrated",
					pool: "H1",
					balanceUsd: 10,
				}),
			],
			new Map(),
		);
		const s = summarize(rows, (slug) => slug === "aquarius");
		expect(s.projectsByTier).toEqual({
			integrated: 1,
			used: 0,
			available: 1,
			unrated: 0,
		});
		expect(s.scfFundedByTier).toEqual({
			integrated: 1,
			used: 0,
			available: 0,
			unrated: 0,
		});
		expect(s.networkVenuePoolsByTier).toEqual({
			integrated: 0,
			used: 1,
			available: 1,
			unrated: 0,
		});
		expect(s.unattributedHolders).toEqual({ contracts: 1, balanceUsd: 10 });
		expect(Object.keys(s)).not.toContain("total");
		// the aquarius dex row aggregates its two pools and keeps the per-pool tiers
		const aq = rows.find(
			(r) => r.kind === "dex_pool" && r.projectSlug === "aquarius",
		);
		expect(aq).toMatchObject({
			tier: "used",
			pools: 2,
			poolsByTier: { used: 1, available: 1 },
		});
	});
});

describe("the token parameter never picks a decoy issuer silently", () => {
	const PAXOS = "GDQE7IXJ4HUHV6RQHIUPRJSEZE4DRS5WY577O2FY6YQ5LVWZ7JZTU2V5";
	const DECOY = "GAHXL2PXFYUT7S2HO5QPJQ4DEAA7H4D3WVQGKCJEIA3TVW3ERNPQPFCF";
	it("CODE:ISSUER and CODE-ISSUER resolve to the asset's contract", () => {
		expect(parseTokenParam(`PYUSD:${PAXOS}`)).toEqual({
			type: "id",
			tokenId: PAXOS_PYUSD,
		});
		expect(parseTokenParam(`PYUSD-${PAXOS}`)).toEqual(
			parseTokenParam(`PYUSD:${PAXOS}`),
		);
		expect(parseTokenParam("xlm")).toEqual({
			type: "id",
			tokenId: XLM_SAC,
		});
		expect(XLM_SAC).toBe(Asset.native().contractId(Networks.PUBLIC));
		expect(parseTokenParam(USDC)).toEqual({ type: "id", tokenId: USDC });
		expect(parseTokenParam("PYUSD")).toEqual({ type: "code", code: "PYUSD" });
		expect(parseTokenParam("drop table").type).toBe("invalid");
	});

	it("a code with two issuers returns both candidates; one issuer resolves", () => {
		const row = (
			tokenId: string,
			issuer: string,
			slug: string | null,
			tier: IntegrationRow["tier"],
		) => ({
			tokenId,
			code: "PYUSD",
			issuer,
			homeDomain: null,
			issuerLabel: null,
			projectSlug: slug,
			kind: "dex_pool" as const,
			tier,
			pools: 1,
			poolsByTier: { [tier]: 1 },
			balanceUsd: null,
		});
		const rows = [
			row(PAXOS_PYUSD, PAXOS, "lobstr", "integrated"),
			row(DECOY_PYUSD, DECOY, "aquarius", "available"),
		];
		const c = codeCandidates("pyusd", rows);
		expect(c.map((x) => x.issuer)).toEqual([PAXOS, DECOY]);
		expect(codeCandidates("PYUSD", rows.slice(1))).toHaveLength(1);
		expect(codeCandidates("USDC", rows)).toHaveLength(0);
	});
});

describe("the write plan", () => {
	const desired = aggregate(
		[
			edge({
				token: USDE,
				kind: "dex_pool",
				venue: "aquarius",
				projectSlug: "aquarius",
				tier: "used",
			}),
			edge({
				token: USDE,
				kind: "asset_list",
				venue: "Soroswap Protocol",
				projectSlug: "soroswap",
				source: "asset-list:soroswap",
			}),
		],
		new Map(),
	);
	// what the store holds after a plan is applied: the same fields, plus an id
	const applied = (rows: IntegrationRow[]): StoredRow[] =>
		JSON.parse(JSON.stringify(rows)).map((r: IntegrationRow, i: number) => ({
			...r,
			id: `id${i}`,
		}));

	it("creates against an empty store, then re-plans nothing (idempotent)", () => {
		const first = planWrites(desired, [], () => null, RUN);
		expect(first.create).toHaveLength(2);
		const again = planWrites(desired, applied(desired), () => null, RUN);
		expect(plannedWrites(again)).toBe(0);
		expect(again.unchanged).toBe(2);
	});

	it("an edge whose evidence is gone is ended, dated, never deleted; re-planning ends nothing more", () => {
		const store = applied(desired);
		const plan = planWrites(desired.slice(1), store, () => null, RUN);
		expect(plan.end).toHaveLength(1);
		expect(plan.end[0].data).toMatchObject({ status: "ended", endedAt: RUN });
		const after = store.map((s) =>
			s.id === plan.end[0].id ? { ...s, ...plan.end[0].data } : s,
		);
		expect(
			plannedWrites(planWrites(desired.slice(1), after, () => null, RUN)),
		).toBe(0);
		// it comes back: reactivated by an update, not a second row
		const back = planWrites(desired, after, () => null, RUN);
		expect(back.create).toHaveLength(0);
		expect(back.update.map((u) => u.changed)).toEqual([
			["status", "endedAt", "endedReason"],
		]);
	});

	it("could-not-check never ends a row", () => {
		const plan = planWrites(
			[],
			applied(desired),
			(s) =>
				s.source === "registry:aquarius"
					? "could-not-check: registry:aquarius not read"
					: null,
			RUN,
		);
		const key = (venue: string) => desired.find((r) => r.venue === venue)?.key;
		expect(plan.keep.map((k) => k.key)).toEqual([key("aquarius")]);
		expect(plan.end.map((e) => e.key)).toEqual([key("Soroswap Protocol")]);
	});

	it("a changed reading is an update naming the fields", () => {
		const store = applied(desired);
		const moved = desired.map((r) =>
			r.venue === "aquarius" ? { ...r, tier: "available" as const } : r,
		);
		const plan = planWrites(moved, store, () => null, RUN);
		expect(plan.update).toHaveLength(1);
		expect(plan.update[0].changed).toEqual(["tier"]);
	});
});

describe("the Ethena case (readings of 2026-11-23)", () => {
	const identity = new Map<string, TokenIdentity>([
		[
			USDE,
			{
				tokenId: USDE,
				code: "USDE",
				issuer: "GDJ5BNU5NN6NQ54D7OX6NQTUYNBZ42CAT33QGM5BIQ2QIYADAC5ICH47",
				tokenKind: "sac",
				homeDomain: null,
				issuerLabel: null,
			},
		],
		[
			SUSDE,
			{
				tokenId: SUSDE,
				code: "SUSDE",
				issuer: "GDJ5BNU5NN6NQ54D7OX6NQTUYNBZ42CAT33QGM5BIQ2QIYADAC5ICH47",
				tokenKind: "sac",
				homeDomain: null,
				issuerLabel: null,
			},
		],
	]);
	const dex = (
		token: string,
		venue: string,
		slug: string,
		pool: string,
		legs: Array<{ balance: string | null; usd: number | null }>,
		ev: number,
	) => {
		const d = poolDepth(legs, false); // Aquarius concentrated and SushiSwap v3: not constant-product
		const t = poolEdgeTier(
			"dex_pool",
			"0",
			ev,
			"stellarindex /contracts events in window",
			d,
		);
		return edge({
			token,
			kind: "dex_pool",
			venue,
			projectSlug: slug,
			pool,
			tier: t.tier,
			tierBasis: t.basis,
			depthUsd: d.usd,
			events90d: ev,
		});
	};
	const holding = (token: string, balance: string) => {
		const t = holderTier({
			projectSlug: "xoxno",
			direct: true,
			dexProject: false,
			label: "XOXNO - Central Pool",
			events90d: 500,
			eventsBasis: "x",
			usd: null,
		});
		return edge({
			token,
			kind: "holder",
			venue: "holder",
			projectSlug: "xoxno",
			pool: "CBXRNDQMAJFG4VUKMKFEMFS75UUXE2SPSNV4LEEFCSNBCN66PYRWBKXO",
			balance,
			tier: t.tier,
			tierBasis: t.basis,
			source: `holders:${token}`,
		});
	};
	const edges = [
		edge({
			token: USDE,
			kind: "asset_list",
			venue: "Soroswap Protocol",
			projectSlug: "soroswap",
		}),
		edge({
			token: SUSDE,
			kind: "asset_list",
			venue: "Soroswap Protocol",
			projectSlug: "soroswap",
		}),
		holding(USDE, "4753.16469"),
		holding(SUSDE, "4175.1648927"),
		// USDe/USDC concentrated pool: USDe unpriced, USDC priced
		dex(
			USDE,
			"aquarius",
			"aquarius",
			"CC2WWGEKJ6HT6FGCQ6QDES7EWUW6BNHMWQ2CHYNUZON6FZ24LYN5EREC",
			[
				{ balance: "165877.4127921", usd: null },
				{ balance: "134172.1896374", usd: 134108.38 },
			],
			500,
		),
		// USDT0/USDe: USDT0 priced
		dex(
			USDE,
			"sushiswap_v3",
			"sushi",
			"CAWIGTP2YITU57IUU34YR6JFQZ3UGW6RNRUHRUFCXRIM36VHP4VGEIOP",
			[
				{ balance: "250046.766551", usd: null },
				{ balance: "250075.8399904", usd: 249815.76 },
			],
			61,
		),
		// sUSDe/USDe: neither leg priced, so neither floor can be judged
		dex(
			USDE,
			"sushiswap_v3",
			"sushi",
			"CAOAVZOUDGYDI3QJTCDEQ3GJPWFN7QHM632EQZLWAIUWKILEFTKZUPE6",
			[
				{ balance: "107300.4831024", usd: null },
				{ balance: "125858.902524", usd: null },
			],
			500,
		),
		dex(
			SUSDE,
			"sushiswap_v3",
			"sushi",
			"CAOAVZOUDGYDI3QJTCDEQ3GJPWFN7QHM632EQZLWAIUWKILEFTKZUPE6",
			[
				{ balance: "125858.902524", usd: null },
				{ balance: "107300.4831024", usd: null },
			],
			500,
		),
		edge({
			token: USDE,
			kind: "holder_unattributed",
			venue: "holder",
			pool: "CAAMRQZ5W24TKAJIIP6DZZE3OWRVKVW4MTD6ZMGERMDJRZALFUETZVGE",
			balance: "4555.000001",
			tier: "unrated",
		}),
	];
	const rows = aggregate(edges, identity);
	const scf = new Set(["soroswap", "xoxno", "aquarius"]);
	const usde = rows.filter((r) => r.tokenId === USDE);
	const tierOf = (slug: string) => {
		const s = summarize(
			usde.filter((r) => r.projectSlug === slug),
			() => false,
		).projectsByTier;
		return (Object.keys(s) as Array<keyof typeof s>).find((k) => s[k] === 1);
	};

	it("USDe: integrated by Soroswap (its list) and XOXNO (its pool), used by Aquarius and Sushi", () => {
		expect(tierOf("soroswap")).toBe("integrated");
		expect(tierOf("xoxno")).toBe("integrated");
		expect(tierOf("aquarius")).toBe("used");
		expect(tierOf("sushi")).toBe("used");
		const s = summarize(usde, (slug) => scf.has(slug));
		expect(s.projectsByTier).toEqual({
			integrated: 2,
			used: 2,
			available: 0,
			unrated: 0,
		});
		// Sushi is not SCF-funded: the used tier has one SCF-funded project, Aquarius
		expect(s.scfFundedByTier).toEqual({
			integrated: 2,
			used: 1,
			available: 0,
			unrated: 0,
		});
		expect(s.unattributedHolders.contracts).toBe(1);
	});

	it("USDe on Sushi keeps its per-pool tiers; sUSDe on Sushi is unrated, never available", () => {
		const sushi = usde.find((r) => r.projectSlug === "sushi");
		expect(sushi).toMatchObject({
			tier: "used",
			pools: 2,
			poolsByTier: { used: 1, unrated: 1 },
			depthUsd: 249815.76,
		});
		const sSushi = rows.find(
			(r) => r.tokenId === SUSDE && r.projectSlug === "sushi",
		);
		expect(sSushi?.tier).toBe("unrated");
		const xoxno = rows.find(
			(r) => r.tokenId === SUSDE && r.projectSlug === "xoxno",
		);
		expect(xoxno).toMatchObject({
			tier: "integrated",
			balance: "4175.1648927",
			code: "SUSDE",
		});
	});
});

describe("priorHolderContracts", () => {
	const C1 = `C${"A".repeat(55)}`;
	const C2 = `C${"B".repeat(55)}`;
	const G1 = `G${"A".repeat(55)}`;
	const row = (o: Partial<StoredRow>): StoredRow =>
		({ id: "x", key: "k", tokenId: "T", status: "active", ...o }) as StoredRow;
	it("re-reads the contract every live holder row was last read at", () => {
		// Blend's USDC holder row ended in a dry run because its contract fell
		// out of the capped candidate lists while it still held 5,942 USDC.
		const m = priorHolderContracts([
			row({ kind: "holder", bestPool: C1 }),
			row({ kind: "holder_unattributed", bestPool: C2 }),
			row({ kind: "holder", bestPool: G1 }), // an account holder: Horizon reads it
			row({ kind: "holder", bestPool: C2, status: "ended" }),
			row({ kind: "dex_pool", bestPool: C2, tokenId: "U" }),
		]);
		expect([...m]).toEqual([["T", new Set([C1, C2])]]);
	});
});

// The dry run of 2026-11-24 (run 45451926000) planned 14 rows from a judged
// tier to unrated. Stellar Index had begun withholding thin-market prices
// (price_withheld_reason "substance": BLND, USTRY, AFR, MXN, CETES), so rows
// judged on those prices the night before read unrated: a failed reading
// would have overwritten a good one. Three of the 14 were real readings:
// the USST and LUMI Aquarius pools lost their priced leg, and MXN's one used
// classic pool read below $1,000.
describe("a reading that could not be taken never replaces a judged tier", () => {
	const BLND = "CD25MNVTZDL4Y3XBCPCJXGXATV5WUHHOWMYFF4YBEGU5FCPGMYTVG5JY";
	const COMET = "CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM";
	const NIGHT = "2026-11-24T01:49:50.579Z";
	const DAY = "2026-11-24T17:45:05Z";
	const WITHHELD =
		"the BLND price was not read (Stellar Index withheld it: substance)";
	const comet = (p: Partial<Edge>) =>
		edge({
			token: BLND,
			kind: "dex_pool",
			venue: "comet",
			projectSlug: "comet",
			pool: COMET,
			events90d: 500,
			balance: "400.9196672",
			...p,
		});
	const store = (es: Edge[]): StoredRow[] =>
		JSON.parse(JSON.stringify(aggregate(es, new Map()))).map(
			(r: IntegrationRow, i: number) => ({ ...r, id: `id${i}` }),
		);
	const night = store([
		comet({
			tier: "available",
			tierBasis: "priced depth $2.82 < $1000 with every leg priced",
			balanceUsd: 2.26,
			depthUsd: 2.82,
			readAt: NIGHT,
		}),
	]);
	const dayEdge = comet({
		tier: "unrated",
		tierBasis: "activity or depth not read; 1 leg(s) unpriced or unread",
		depthUsd: 0.56,
		readAt: DAY,
		unread: WITHHELD,
	});
	const plan = (
		es: Edge[],
		stored: StoredRow[],
		at = DAY,
		judge: (s: StoredRow) => string | null = () => null,
	) =>
		planWrites(aggregate(es, new Map()), stored, judge, at, (k) =>
			es.filter((e) => rowKey(e.token, e.kind, e.venue, e.projectSlug) === k),
		);

	it("a withheld price keeps the stored tier and reading, marked not refreshed with the date", () => {
		const p = plan([dayEdge], night);
		expect(p.update).toHaveLength(1);
		const { row, changed } = p.update[0];
		expect(changed).toEqual(["tierBasis"]);
		expect(row).toMatchObject({
			tier: "available",
			tierBasis: `priced depth $2.82 < $1000 with every leg priced (not refreshed 2026-11-24: ${WITHHELD})`,
			balanceUsd: 2.26,
			depthUsd: 2.82,
			readAt: NIGHT,
		});
		expect(p.keep).toEqual([
			{
				key: night[0].key,
				reason: `kept available as read at ${NIGHT}; reads unrated this run only because ${WITHHELD}`,
			},
		]);
	});

	it("re-planning the held store plans nothing; a later run moves the mark, never stacks it", () => {
		const held = plan([dayEdge], night).update[0].row;
		const after = [{ ...night[0], ...JSON.parse(JSON.stringify(held)) }];
		expect(plannedWrites(plan([dayEdge], after))).toBe(0);
		const week = plan([dayEdge], after, "2026-12-01T04:23:00Z").update[0].row;
		expect(week.tierBasis).toBe(
			`priced depth $2.82 < $1000 with every leg priced (not refreshed 2026-12-01: ${WITHHELD})`,
		);
	});

	it("once the price is read again, the fresh reading replaces the held one", () => {
		const held = plan([dayEdge], night).update[0].row;
		const after = [{ ...night[0], ...JSON.parse(JSON.stringify(held)) }];
		const read = comet({
			tier: "available",
			tierBasis: "priced depth $3.1 < $1000 with every leg priced",
			balanceUsd: 2.5,
			depthUsd: 3.1,
			readAt: DAY,
		});
		const p = plan([read], after);
		expect(p.keep).toEqual([]);
		expect(p.update[0].row).toMatchObject({
			tierBasis: "priced depth $3.1 < $1000 with every leg priced",
			readAt: DAY,
		});
	});

	it("a used row whose own pool lost its price is held (USTRY's unattributed holder)", () => {
		const USTRY = "CBLV4ATSIWU67CFSQU2NVRKINQIKUZ2ODSZBUJTJ43VJVRSBTZYOPNUR";
		const h = (p: Partial<Edge>) =>
			edge({
				token: USTRY,
				kind: "holder_unattributed",
				venue: "holder",
				pool: "CBMUX",
				...p,
			});
		const stored = store([
			h({
				tier: "used",
				tierBasis: "124 events in 90d >= 10 and priced depth $3968.53 >= $1000",
			}),
			h({ pool: "CB2", tier: "available", tierBasis: "3 events in 90d < 10" }),
		]);
		const p = plan(
			[
				h({
					tier: "unrated",
					unread:
						"the USTRY price was not read (Stellar Index withheld it: substance)",
				}),
				h({ pool: "CB2", tier: "available" }),
			],
			stored,
		);
		expect(p.update[0].row.tier).toBe("used");
		expect(p.keep).toHaveLength(1);
	});

	it("a pool read and found drained is a reading: it updates (USST's Aquarius pool)", () => {
		const USST = "CBZ4DCE7PYMUTOAKKUTRSUPT3FJFVOWCSKWUM5A72D6SAVMUJE5JN2PJ";
		const a = (p: Partial<Edge>) =>
			edge({
				token: USST,
				kind: "dex_pool",
				venue: "aquarius",
				projectSlug: "aquarius",
				pool: "CCYMZ",
				...p,
			});
		const stored = store([
			a({
				tier: "used",
				tierBasis:
					"32 events in 90d >= 10 and priced depth $717354.37 >= $1000",
			}),
		]);
		// USST has no price at the index at all (no withheld reason): its USDC leg was read, near empty
		const unread = edgeUnread("unrated", null, [
			{ code: "USST", balance: "0.0843592", priceUnread: null },
			{ code: "USDC", balance: "0.05", priceUnread: null },
		]);
		expect(unread).toBeNull();
		const p = plan([a({ tier: "unrated", unread })], stored);
		expect(p.update[0].row.tier).toBe("unrated");
		expect(p.keep).toEqual([]);
	});

	it("a used pool read below the floor is a reading even beside unread pools (MXN's classic pools)", () => {
		const MXN = "CBVJZDNMOPEEPED3OBY4VLQPQKU4IOCKWACDKXPBO4E6TQI432W66BE5";
		const c = (p: Partial<Edge>) =>
			edge({
				token: MXN,
				kind: "classic_amm_pool",
				venue: "stellar-classic-amm",
				pool: "85a4",
				...p,
			});
		const stored = store([
			c({
				tier: "used",
				tierBasis: "200 events in 90d >= 10 and priced depth $1024.46 >= $1000",
			}),
			c({ pool: "x1", tier: "unrated" }),
		]);
		const p = plan(
			[
				c({
					tier: "available",
					tierBasis: "priced depth $974 < $1000 with every leg priced",
				}),
				c({
					pool: "x1",
					tier: "unrated",
					unread:
						"the AFR price was not read (Stellar Index withheld it: substance)",
				}),
			],
			stored,
		);
		expect(p.update[0].row.tier).toBe("unrated");
		expect(p.keep).toEqual([]);
	});

	it("an integrated pool its rewards config no longer pays is a reading (ETH and CETES on Aquarius)", () => {
		const a = (p: Partial<Edge>) =>
			edge({
				token: USDE,
				kind: "dex_pool",
				venue: "aquarius",
				projectSlug: "aquarius",
				pool: "CARBT",
				...p,
			});
		const stored = store([
			a({
				tier: "integrated",
				tierBasis:
					"the protocol's rewards config pays this pool (reward_tps 3273469)",
			}),
		]);
		const p = plan(
			[
				a({
					tier: "unrated",
					unread: "activity was not read: could-not-check (http error)",
				}),
			],
			stored,
		);
		expect(p.update[0].row.tier).toBe("unrated");
	});

	it("a used row whose pool this run did not read at all is held only while its source is unread", () => {
		const h = (p: Partial<Edge>) =>
			edge({
				token: USDE,
				kind: "holder",
				venue: "holder",
				projectSlug: "blend",
				pool: "CBEST",
				...p,
			});
		const stored = store([
			h({ tier: "used" }),
			h({ pool: "COTHER", tier: "available" }),
		]);
		const fresh = [h({ pool: "COTHER", tier: "available" })];
		const unreadSource = () =>
			"could-not-check: holders:T was not read completely this run";
		expect(plan(fresh, stored, DAY, unreadSource).update[0].row.tier).toBe(
			"used",
		);
		expect(plan(fresh, stored).update[0].row.tier).toBe("available");
	});

	it("an edge is unread only for a read that failed, never for a token with no price at all", () => {
		const withheld = "Stellar Index withheld it: substance";
		expect(
			edgeUnread("unrated", null, [
				{ code: "LUMI", balance: "7", priceUnread: null },
			]),
		).toBeNull();
		expect(edgeUnread("available", "could-not-check", [])).toBeNull();
		expect(
			edgeUnread("unrated", null, [
				{ code: "BLND", balance: "7", priceUnread: withheld },
			]),
		).toBe(`the BLND price was not read (${withheld})`);
		// an empty leg's price moves nothing
		expect(
			edgeUnread("unrated", null, [
				{ code: "BLND", balance: "0", priceUnread: withheld },
			]),
		).toBeNull();
		expect(
			edgeUnread("unrated", "could-not-check (http 503)", [
				{ code: "AFR", balance: null, priceUnread: null },
			]),
		).toBe(
			"activity was not read: could-not-check (http 503); the AFR balance was not read",
		);
	});
});
