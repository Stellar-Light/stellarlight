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
	holderTier,
	type IntegrationRow,
	marketTier,
	parseTokenParam,
	plannedWrites,
	planWrites,
	poolDepth,
	poolEdgeTier,
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
