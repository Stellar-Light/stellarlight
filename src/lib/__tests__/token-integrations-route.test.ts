// @vitest-environment node
/**
 * /api/tokens/integrations over a fake store: unknown params answer 400, a
 * code with two issuers returns candidates and no edges (never a pick), a
 * resolved token's summary is per tier with SCF read from the project rows,
 * and an empty store is 503 (not populated), never an empty list.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Doc = Record<string, unknown>;
const h = vi.hoisted(() => ({
	rows: [] as Doc[],
	projects: [] as Doc[],
}));
type Cond = Record<string, { equals?: unknown; in?: unknown[]; like?: string }>;
const test = (d: Doc, w: Record<string, unknown>): boolean => {
	if (Array.isArray(w.and)) return (w.and as Doc[]).every((x) => test(d, x));
	return Object.entries(w as Cond).every(([k, c]) => {
		if ("equals" in c) return d[k] === c.equals;
		if ("in" in c) return (c.in ?? []).includes(d[k]);
		if ("like" in c)
			return String(d[k] ?? "")
				.toLowerCase()
				.includes(String(c.like).toLowerCase());
		return true;
	});
};
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async (a: { collection: string; where: Doc }) => ({
			docs: (a.collection === "projects" ? h.projects : h.rows).filter((d) =>
				test(d, a.where),
			),
		}),
		count: async () => ({ totalDocs: h.rows.length }),
	})),
}));
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
const { GET } = await import("@/app/api/tokens/integrations/route");

const PAXOS = "GDQE7IXJ4HUHV6RQHIUPRJSEZE4DRS5WY577O2FY6YQ5LVWZ7JZTU2V5";
const DECOY = "GAHXL2PXFYUT7S2HO5QPJQ4DEAA7H4D3WVQGKCJEIA3TVW3ERNPQPFCF";
const PAXOS_PYUSD = "CCCRWH6Q3FNP3I2I57BDLM5AFAT7O6OF6GKQOC6SSJNDAVRZ57SPHGU2";
const DECOY_PYUSD = "CAJZ36VD26EHWA5WSO7QFVVCK2H6NWWN7CJSZVOQP2NIMTC6W77NEJZQ";
const row = (
	tokenId: string,
	issuer: string,
	slug: string | null,
	kind: string,
	tier: string,
	extra: Doc = {},
): Doc => ({
	key: `${tokenId}|${kind}|${slug ?? "net"}|${slug ?? ""}`,
	tokenId,
	code: "PYUSD",
	issuer,
	projectSlug: slug,
	venue: slug ?? "stellar-classic-amm",
	kind,
	tier,
	tierBasis: "b",
	pools: 1,
	poolsByTier: { [tier]: 1 },
	balanceUsd: null,
	depthUsd: null,
	readAt: "2026-11-23T20:00:00Z",
	status: "active",
	...extra,
});
const call = async (qs: string) => {
	const res = await GET(
		new NextRequest(`https://stellarlight.xyz/api/tokens/integrations?${qs}`),
	);
	return { status: res.status, body: await res.json() };
};

beforeEach(() => {
	h.rows = [
		row(PAXOS_PYUSD, PAXOS, "lobstr", "asset_list", "integrated"),
		row(PAXOS_PYUSD, PAXOS, "aquarius", "dex_pool", "integrated"),
		row(PAXOS_PYUSD, PAXOS, "aquarius", "holder", "available", {
			key: "aq-holder",
		}),
		row(PAXOS_PYUSD, PAXOS, "sushi", "dex_pool", "used"),
		row(PAXOS_PYUSD, PAXOS, null, "classic_amm_pool", "available", {
			pools: 49,
			poolsByTier: { available: 49 },
		}),
		row(DECOY_PYUSD, DECOY, "aquarius", "dex_pool", "available"),
	];
	h.projects = [
		{
			slug: "lobstr",
			name: "LOBSTR",
			scf: { awarded: true, roundAwards: [{ round: 22, amountUSD: 1 }] },
		},
		{
			slug: "aquarius",
			name: "Aquarius",
			scf: { awarded: true, roundAwards: [] },
		},
		{ slug: "sushi", name: "Sushi", scf: { awarded: false } },
	];
});

describe("GET /api/tokens/integrations", () => {
	it("rejects an unknown parameter and an invalid tier", async () => {
		expect((await call("sort=tvl")).status).toBe(400);
		expect((await call("tier=supported")).status).toBe(400);
		expect((await call("token=not a token")).status).toBe(400);
	});

	it("a code two issuers carry returns both candidates and no edges", async () => {
		const { status, body } = await call("token=pyusd");
		expect(status).toBe(200);
		expect(body.edges).toBeNull();
		expect(body.summary).toBeNull();
		expect(body.meta.token.resolvedTokenId).toBeNull();
		expect(body.meta.token.candidates.map((c: Doc) => c.issuer)).toEqual([
			PAXOS,
			DECOY,
		]);
	});

	it("CODE:ISSUER resolves; counts are per tier with SCF from the project rows", async () => {
		const { status, body } = await call(`token=PYUSD:${PAXOS}`);
		expect(status).toBe(200);
		expect(body.meta.token.resolvedTokenId).toBe(PAXOS_PYUSD);
		expect(body.summary.projectsByTier).toEqual({
			integrated: 2,
			used: 1,
			available: 0,
			unrated: 0,
		});
		expect(body.summary.scfFundedByTier).toEqual({
			integrated: 2,
			used: 0,
			available: 0,
			unrated: 0,
		});
		expect(body.summary.networkVenuePoolsByTier.available).toBe(49);
		const sushi = body.edges.find((e: Doc) => e.projectSlug === "sushi");
		expect(sushi).toMatchObject({ scfAwarded: false, projectName: "Sushi" });
		const net = body.edges.find((e: Doc) => e.kind === "classic_amm_pool");
		expect(net).toMatchObject({ scfAwarded: null, scfRounds: null });
		expect(body.edges[0].tier).toBe("integrated");
	});

	it("scfAwarded and project filter; an unknown project is a 400", async () => {
		const scf = await call(`token=${PAXOS_PYUSD}&scfAwarded=true`);
		expect(scf.body.edges.map((e: Doc) => e.projectSlug).sort()).toEqual([
			"aquarius",
			"aquarius",
			"lobstr",
		]);
		const proj = await call("project=aquarius");
		expect(proj.body.summary.tokensByTier).toEqual({
			integrated: 1,
			used: 0,
			available: 1,
			unrated: 0,
		});
		expect((await call("project=nope")).status).toBe(400);
	});

	it("an empty store is 503 (the lane has not run), never an empty list", async () => {
		h.rows = [];
		expect((await call(`token=${PAXOS_PYUSD}`)).status).toBe(503);
		expect((await call("token=PYUSD")).status).toBe(503);
	});
});
