// @vitest-environment node
/**
 * Token integrations read the curated on-chain map the way the API serves it
 * (attributionsOf over project rows, the one reader): a strong link ranks
 * with the protocol registry, a labelled one with a public directory label,
 * the basis names tier and evidence, an ended address attributes nothing,
 * and the map's accounts are holders too. Stablecoin and RWA rows carry a
 * compact per-tier count of their token, null where the layer has no row.
 */
import { describe, expect, it } from "vitest";
import { attributionsOf } from "../contracts-registry";
import {
	accountHoldings,
	aggregate,
	type Edge,
	mapEvidence,
	readTokenBriefs,
	registryTokenId,
	tokenBriefs,
} from "../token-integrations";

const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const C1 = `C${"A".repeat(55)}`;
const G1 = `G${"A".repeat(55)}`;
const G2 = `G${"B".repeat(55)}`;
const RUN = "2026-11-23T20:49:15Z";

const link = (address: string, extra: Record<string, unknown> = {}) => ({
	address,
	label: null,
	tier: "strong",
	evidence: ["own-repo-interface"],
	sourceUrl: "https://github.com/acme/contracts",
	createdLedger: 63262178,
	dateBasis: "creation proved in the ledger",
	sharedWithinFamily: null,
	endedAt: null,
	...extra,
});
const row = (
	slug: string,
	list: "contracts" | "accounts",
	links: Array<ReturnType<typeof link>>,
) => ({
	slug,
	name: slug,
	onchain: { asOf: RUN, contracts: [], accounts: [], [list]: links },
});

describe("map attribution ranks by tier, names it, skips ended", () => {
	it("a strong link ranks with the registry, a labelled one with a label", () => {
		const strong = mapEvidence({
			project: { slug: "slender" },
			tier: "strong",
			evidence: ["own-repo-interface", "directory"],
			sourceUrl: "https://github.com/eq-lab/slender",
			endedAt: null,
		});
		expect(strong).toEqual({
			slug: "slender",
			rank: 1,
			basis:
				"on-chain map strong: own-repo-interface, directory (https://github.com/eq-lab/slender)",
		});
		const labelled = mapEvidence({
			project: { slug: "xoxno" },
			tier: "labelled",
			evidence: ["public-directory-label"],
			sourceUrl: null,
			endedAt: null,
		});
		expect(labelled).toMatchObject({ slug: "xoxno", rank: 2 });
		expect(labelled !== "ended" && labelled?.basis).toBe(
			"on-chain map labelled: public-directory-label",
		);
	});

	it("an address the weekly check ended attributes nothing; no link is null", () => {
		expect(
			mapEvidence({
				project: { slug: "acme" },
				tier: "strong",
				evidence: [],
				endedAt: "2026-11-20T00:00:00.000Z",
			}),
		).toBe("ended");
		expect(mapEvidence(null)).toBeNull();
		expect(mapEvidence({ project: { slug: "acme" }, tier: "weak" })).toBeNull();
	});

	it("reads contracts and accounts through the API's own reader", () => {
		const rows = [
			row("acme", "contracts", [link(C1)]),
			row("anclap", "accounts", [
				link(G1, { tier: "labelled", sharedWithinFamily: ["anclap", "ars"] }),
			]),
			row("ars", "accounts", [
				link(G1, { tier: "labelled", sharedWithinFamily: ["anclap", "ars"] }),
				link(G2, { endedAt: "2026-11-20T00:00:00.000Z" }),
			]),
		];
		const contracts = attributionsOf(rows, "contracts");
		expect([...contracts.keys()]).toEqual([C1]);
		const accounts = attributionsOf(rows, "accounts");
		// a family's shared account is the issuer's, one tier down
		expect(mapEvidence(accounts.get(G1)?.attribution)).toMatchObject({
			slug: "anclap",
			rank: 2,
		});
		expect(mapEvidence(accounts.get(G2)?.attribution)).toBe("ended");
	});
});

describe("account holdings", () => {
	it("reads wanted classic balances above zero, never XLM", () => {
		const wanted = new Map([[`USDC:${USDC_ISSUER}`, USDC]]);
		const account = {
			balances: [
				{ asset_type: "native", balance: "5000.0000000" },
				{
					asset_type: "credit_alphanum4",
					asset_code: "USDC",
					asset_issuer: USDC_ISSUER,
					balance: "1250.5000000",
				},
				{
					asset_type: "credit_alphanum4",
					asset_code: "EURC",
					asset_issuer: G2,
					balance: "9.0000000",
				},
				{ asset_type: "liquidity_pool_shares", balance: "3.0000000" },
			],
		};
		expect(accountHoldings(account, wanted)).toEqual([
			{ token: USDC, balance: "1250.5" },
		]);
		const empty = {
			balances: [
				{ asset_code: "USDC", asset_issuer: USDC_ISSUER, balance: "0.0000000" },
			],
		};
		expect(accountHoldings(empty, wanted)).toEqual([]);
		expect(accountHoldings(null, wanted)).toEqual([]);
	});

	it("an account holding is its own row and carries no contract sweep", () => {
		const base = {
			token: USDC,
			kind: "holder" as const,
			projectSlug: "moneygram",
			attributionBasis: "",
			method: "m",
			firstAt: null,
			firstBasis: "",
			lastSeenAt: null,
			events90d: 40,
			events90dBasis: null,
			balance: "1",
			balanceUsd: 1,
			balanceBasis: null,
			depthUsd: 1,
			depthBasis: null,
			tier: "available" as const,
			tierBasis: "",
			evidenceUrl: "",
			readAt: RUN,
		};
		const edges: Edge[] = [
			{ ...base, venue: "holder", pool: C1, source: `holders:${USDC}` },
			{
				...base,
				venue: "account",
				pool: G1,
				source: `account-holders:${USDC}`,
			},
		];
		const rows = aggregate(
			edges,
			new Map(),
			new Map([[USDC, { sweep: "candidates only" }]]),
		);
		expect(rows.map((r) => [r.venue, r.holderSweep])).toEqual([
			["account", null],
			["holder", { sweep: "candidates only" }],
		]);
	});
});

describe("the integrations block on stablecoin and RWA rows", () => {
	const r = (
		tokenId: string,
		projectSlug: string | null,
		tier: "integrated" | "used" | "available" | "unrated",
		extra: Record<string, unknown> = {},
	) => ({
		tokenId,
		projectSlug,
		kind: "holder" as const,
		tier,
		pools: 1,
		poolsByTier: { [tier]: 1 },
		balanceUsd: null,
		readAt: RUN,
		status: "active" as const,
		endedAt: null,
		...extra,
	});

	it("counts each project once per tier, SCF apart, active rows only", () => {
		const briefs = tokenBriefs(
			[
				r(USDC, "blend", "integrated"),
				r(USDC, "blend", "used"),
				r(USDC, "sushi", "used"),
				r(USDC, "gone", "integrated", {
					status: "ended",
					endedAt: "2026-11-30T00:00:00Z",
				}),
				r(USDC, null, "used", { kind: "classic_amm_pool" }),
				r(C1, "old", "used", {
					status: "ended",
					endedAt: "2026-11-30T00:00:00Z",
				}),
			],
			(s) => s === "blend",
		);
		expect(briefs.get(USDC)).toEqual({
			projectsByTier: { integrated: 1, used: 1, available: 0, unrated: 0 },
			scfFundedByTier: { integrated: 1, used: 0, available: 0, unrated: 0 },
			asOf: "2026-11-30T00:00:00Z",
			url: `https://stellarlight.xyz/api/tokens/integrations?token=${USDC}`,
		});
		// written, every edge ended: zeros are a reading, not a gap
		expect(briefs.get(C1)?.projectsByTier.used).toBe(0);
		// never written: no entry, so the row serves null
		expect(briefs.has(G1)).toBe(false);
	});

	it("keys stablecoin and RWA rows on the token id the lane writes", () => {
		expect(registryTokenId("USDC", USDC_ISSUER, null)).toBe(USDC);
		expect(registryTokenId(null, null, C1)).toBe(C1);
		expect(registryTokenId(null, null, "not-a-contract")).toBeNull();
		expect(registryTokenId("USDC", null, null)).toBeNull();
	});

	it("reads SCF from the project rows; an unreadable store is null, never zeros", async () => {
		const payload = {
			find: async ({ collection }: { collection: string }) => ({
				docs:
					collection === "token-integrations"
						? [r(USDC, "blend", "integrated")]
						: [{ slug: "blend", scf: { awarded: true } }],
			}),
		};
		// biome-ignore lint/suspicious/noExplicitAny: mock payload
		const got = await readTokenBriefs(payload as any, [USDC, null, USDC]);
		expect(got?.get(USDC)?.scfFundedByTier.integrated).toBe(1);
		const down = {
			find: async () => {
				throw new Error("down");
			},
		};
		// biome-ignore lint/suspicious/noExplicitAny: mock payload
		expect(await readTokenBriefs(down as any, [USDC])).toBeNull();
	});
});
