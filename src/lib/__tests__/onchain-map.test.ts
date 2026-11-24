import { beforeEach, describe, expect, it } from "vitest";
import map from "../../data/onchain-map.json";
import {
	attributionsOf,
	buildContractsRegistry,
	resetContractsRegistryCache,
} from "../contracts-registry";
import {
	endedAtOf,
	leaveOutOtherOperators,
	ONCHAIN_MAP_EVIDENCE,
	type OnchainMapLink,
	selectLinks,
	settledElsewhere,
} from "../onchain-map";
import { accountPresence, contractPresence } from "../onchain-sources";

const C1 = "CCUN4RXU5VNDHSF4S4RKV4ZJYMX2YWKOH6L4AKEKVNVDQ7HY5QIAO4UB";
const C2 = "CAWGFKEL4XSE7JHVZLFIXSDVK7HNI57VFU4OPVRV7NHECRXCZ3ZNDNTR";
const G1 = "GALLBRBQHAPW5FOVXXHYWR6J4ZDAQ35BMSNADYGBW25VOUHUYRZM4XIL";
const row = (slug: string, address: string, tier = "strong") => ({
	slug,
	address,
	tier,
});

describe("selectLinks: the on-chain map's rules", () => {
	it("keeps an address an issuer and its tokens share for each member, one tier down, issuer first", () => {
		const { kept, left } = selectLinks([
			row("usdx", C1),
			row("fxdao", C1),
			row("eurx", C1, "labelled"),
		]);
		expect(left).toEqual([]);
		expect(kept.map((k) => [k.slug, k.tier])).toEqual([
			["usdx", "labelled"],
			["fxdao", "labelled"],
			["eurx", "labelled"],
		]);
		for (const k of kept)
			expect(k.sharedWithinFamily).toEqual(["fxdao", "usdx", "eurx"]);
	});

	it("links an address two unrelated projects hold to neither", () => {
		const { kept, left } = selectLinks([
			row("allbridge", G1),
			row("estrela", G1, "labelled"),
			row("allbridge", C2),
			row("estrela", C2),
		]);
		expect(kept).toEqual([]);
		expect(left.map((l) => l.reason)).toEqual(
			Array(4).fill("linked to 2 projects outside any issuer-and-token family"),
		);
	});

	it("gives a group shared by hand to its one member", () => {
		const { kept, left } = selectLinks([
			row("stellar-disbursement-platform-sdp", G1, "labelled"),
			row("stellar-development-foundation", G1, "labelled"),
		]);
		expect(kept.map((k) => k.slug)).toEqual(["stellar-development-foundation"]);
		expect(kept[0].sharedWithinFamily).toBeUndefined();
		expect(left[0].reason).toBe(
			"shared group given to stellar-development-foundation",
		);
	});

	it("keeps strong and labelled links only; a weaker link to another project still makes the address ambiguous", () => {
		const { kept, left } = selectLinks([
			row("acta", C1, "strong"),
			row("lumagg", C2, "weaker"),
			row("phoenix", G1, "labelled"),
			row("lumagg", G1, "weaker"),
		]);
		expect(kept.map((k) => [k.slug, k.tier])).toEqual([["acta", "strong"]]);
		expect(left.map((l) => [l.row.slug, l.reason])).toEqual([
			["lumagg", "weaker tier"],
			["phoenix", "linked to 2 projects outside any issuer-and-token family"],
			["lumagg", "weaker tier"],
		]);
	});

	it("the shipped file obeys its own rules: nothing weaker, no address on two projects outside a family, a public source for every link", () => {
		const links = map.links as Array<{
			slug: string;
			address: string;
			tier: string;
			sourceUrl: string;
			sharedWithinFamily?: string[];
		}>;
		expect(links.length).toBeGreaterThan(0);
		expect(selectLinks(map.links as OnchainMapLink[]).kept).toHaveLength(
			links.length,
		);
		const bySlug = new Map<string, Set<string>>();
		for (const l of map.links) {
			expect(["strong", "labelled"]).toContain(l.tier);
			for (const e of l.evidence)
				expect(ONCHAIN_MAP_EVIDENCE as readonly string[]).toContain(e);
			expect(l.sourceUrl).toMatch(/^https:\/\//);
			bySlug.set(l.address, (bySlug.get(l.address) ?? new Set()).add(l.slug));
		}
		for (const l of links)
			if ((bySlug.get(l.address)?.size ?? 0) > 1)
				expect(l.sharedWithinFamily?.slice().sort()).toEqual(
					[...(bySlug.get(l.address) ?? [])].sort(),
				);
	});
});

// The comet case, 2026-11-24, from the ledger: Stellar Index's comet
// registry listed three pools because they run Comet's code. Blend's
// deployer created CAS3FL6 (through Comet's factory) and BLNT's deployer
// created the other two (BLNT's own deployment record names them).
const BLEND_DEPLOYER =
	"GDJEHTBE6ZHUXSWFI642DCGLUOECLHPF3KSXHPXTSTJ7E3JF6MQ5EZYY";
const BLNT_DEPLOYER =
	"GDEA2WMOWYQ3T56A2PZH5QYYEQBAORW2AUUJYX4FFD5GDPESAICTFTAL";
const CAS3FL6 = "CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM";
const CDQMIKIH = "CDQMIKIHKA5UY3FQJ2UDTLNX3GOPD3GPNZWSPTOBVOHEUMQJQXOPC7Y3";
const CA5HX3D4 = "CA5HX3D47PQZWC2E7VWXCKH4534P2NOJEOIXAWU47MI4QV2FQUYY3FLC";
const link = (
	slug: string,
	address: string,
	evidence: string[],
	createdBy: string | null,
) => ({ slug, address, kind: "contract", tier: "strong", evidence, createdBy });

describe("leaveOutOtherOperators: code alone does not say who runs a contract", () => {
	it("a registry row created by another project's deployer is left out, the operator's own link stays", () => {
		const rows = [
			link("comet", CAS3FL6, ["protocol-registry"], BLEND_DEPLOYER),
			link("comet", CDQMIKIH, ["protocol-registry"], BLNT_DEPLOYER),
			link("comet", CA5HX3D4, ["protocol-registry"], BLNT_DEPLOYER),
			link("blend", C1, ["directory"], BLEND_DEPLOYER),
			link("blnt", CDQMIKIH, ["directory"], BLNT_DEPLOYER),
			link("blnt", CA5HX3D4, ["directory"], BLNT_DEPLOYER),
		];
		const { kept, left } = leaveOutOtherOperators(rows);
		expect(left.map((l) => [l.row.slug, l.row.address])).toEqual([
			["comet", CAS3FL6],
			["comet", CDQMIKIH],
			["comet", CA5HX3D4],
		]);
		expect(left[0].reason).toBe(
			"created by the deployer of blend, not of comet: code alone does not say who runs it",
		);
		// With the registry rows gone, the operators' links are not shared.
		expect(selectLinks(kept).kept.map((k) => `${k.slug} ${k.address}`)).toEqual(
			[`blend ${C1}`, `blnt ${CDQMIKIH}`, `blnt ${CA5HX3D4}`],
		);
	});

	it("the same rule covers a code proof: Blend's code deployed by BLNT is not Blend's", () => {
		const { left } = leaveOutOtherOperators([
			link("blend", C2, ["own-wasm-meta"], BLNT_DEPLOYER),
			link("blnt", C1, ["directory"], BLNT_DEPLOYER),
		]);
		expect(left.map((l) => l.row.address)).toEqual([C2]);
	});

	it("keeps a code-only link whose creator deployed for nobody else, for this project too, or is unknown", () => {
		const rows = [
			link("band", C1, ["protocol-registry"], G1),
			link("rozo", C2, ["protocol-registry"], BLNT_DEPLOYER),
			link("rozo", CAS3FL6, ["directory"], BLNT_DEPLOYER),
			link("blnt", CDQMIKIH, ["directory"], BLNT_DEPLOYER),
			link("comet", CA5HX3D4, ["protocol-registry"], null),
		];
		const { kept, left } = leaveOutOtherOperators(rows);
		expect(left).toEqual([]);
		expect(kept).toHaveLength(rows.length);
	});

	it("only own evidence makes a deployer a project's: another code-only or weaker link does not", () => {
		const { left } = leaveOutOtherOperators([
			link("comet", CAS3FL6, ["protocol-registry"], BLEND_DEPLOYER),
			link("blend", C1, ["own-repo-interface"], BLEND_DEPLOYER),
			{
				...link("blend", C2, ["same-deployer"], BLEND_DEPLOYER),
				tier: "weaker",
			},
		]);
		expect(left).toEqual([]);
	});

	it("the shipped file: comet holds none of the three pools, each sits with the project whose deployer created it", () => {
		const holder = (address: string) =>
			map.links.filter((l) => l.address === address).map((l) => l.slug);
		expect(map.links.filter((l) => l.slug === "comet")).toEqual([]);
		expect(holder(CAS3FL6)).toEqual(["blend"]);
		expect(holder(CDQMIKIH)).toEqual(["blnt"]);
		expect(holder(CA5HX3D4)).toEqual(["blnt"]);
		expect(
			(map.counts.left as Record<string, number>)[
				"created by the deployer of blnt, not of comet: code alone does not say who runs it"
			],
		).toBe(2);
	});

	it("the shipped file carries BLNT's deployment with ledger-proved creations, and Blend v2.1 on blend", () => {
		const blnt = map.links.filter((l) => l.slug === "blnt");
		expect(blnt.filter((l) => l.kind === "contract")).toHaveLength(9);
		for (const l of blnt) {
			expect(l.tier).toBe("strong");
			expect(l.createdLedger).toBeGreaterThan(0);
		}
		// Launch basis: the first contract of the V3 set the manifests record.
		const first = blnt
			.filter((l) => l.kind === "contract" && l.label !== "BLNT asset (SAC)")
			.sort((a, b) => (a.createdLedger ?? 0) - (b.createdLedger ?? 0))[0];
		expect([first.address, first.createdAt, first.createdLedger]).toEqual([
			CDQMIKIH,
			"2026-10-25T19:18:53Z",
			65134030,
		]);
		expect(blnt.find((l) => l.kind === "account")?.address).toBe(
			"GAP2ACGH3O6TRFAERGM4USJ6XWU3U2BFIK224JPV6NI3CUNEEEGTBTFB",
		);
		const blend = new Set(
			map.links.filter((l) => l.slug === "blend").map((l) => l.address),
		);
		for (const a of [
			"CCS4AZ5ORM6VLLPJTJUFRNXWBMHOO3L5WHHRPL2ZMILE35ZDMQFHOQMJ",
			"CACUXRNBUFV7BFPKUDLVJFQI6H7EHHNSJPOFJSCWJCYUUYMORM6C63AL",
			"CASYAKK3SHDN6S2E6IUOBVRXT3KKPVQCVQO4GNBDTVE6XZQQMW4UMIHE",
		])
			expect(blend.has(a), a).toBe(true);
	});
});

describe("settledElsewhere: a row with no join key loses only what another row now holds", () => {
	it("removes the contracts a seed or the map gives to another row and keeps the rest", () => {
		const owner = new Map([
			[CAS3FL6, "blend"],
			[CDQMIKIH, "blnt"],
			[C1, "comet"],
		]);
		const stored = [
			{ address: CAS3FL6, label: null },
			{ address: CDQMIKIH, label: null },
			{ address: C1, label: "own" },
			{ address: C2, label: "nobody holds it" },
		];
		const { keep, gone } = settledElsewhere("comet", stored, owner);
		expect(keep.map((c) => c.address)).toEqual([C1, C2]);
		expect(gone.map((g) => [g.contract.address, g.to])).toEqual([
			[CAS3FL6, "blend"],
			[CDQMIKIH, "blnt"],
		]);
	});
	it("leaves a malformed stored entry where it is", () => {
		const { keep, gone } = settledElsewhere(
			"comet",
			[{ address: undefined }, {}],
			new Map([[C1, "blend"]]),
		);
		expect(keep).toHaveLength(2);
		expect(gone).toEqual([]);
	});
});

describe("endedAtOf: could-not-check never ends an address", () => {
	const now = "2026-11-24T06:00:00.000Z";
	it("ends an address read absent on the day it was first read so", () => {
		expect(endedAtOf(null, "absent", now)).toBe(now);
		expect(endedAtOf("2026-11-17T06:00:00.000Z", "absent", now)).toBe(
			"2026-11-17T06:00:00.000Z",
		);
	});
	it("keeps what the row holds when it could not check, and clears on present", () => {
		expect(endedAtOf(null, null, now)).toBeNull();
		expect(endedAtOf("2026-11-17T06:00:00.000Z", null, now)).toBe(
			"2026-11-17T06:00:00.000Z",
		);
		expect(endedAtOf("2026-11-17T06:00:00.000Z", "present", now)).toBeNull();
	});
});

describe("existence readers", () => {
	const rpc =
		(listed: (keys: string[]) => string[], ok = true): typeof fetch =>
		async (_url, init) => {
			const { params } = JSON.parse(String(init?.body));
			return new Response(
				JSON.stringify(
					ok
						? {
								result: {
									latestLedger: 1,
									entries: listed(params.keys).map((key) => ({ key, xdr: "" })),
								},
							}
						: { error: { code: -1 } },
				),
			);
		};
	it("reads a contract the RPC does not list as absent", async () => {
		const got = await contractPresence(
			[C1, C2],
			"http://rpc",
			rpc((keys) => keys.slice(0, 1)),
		);
		expect([...(got ?? [])]).toEqual([
			[C1, "present"],
			[C2, "absent"],
		]);
	});
	it("is could-not-check when the RPC fails or lists none of several (the instrument, not the chain)", async () => {
		expect(
			await contractPresence(
				[C1, C2],
				"http://rpc",
				rpc(() => [], false),
			),
		).toBeNull();
		expect(
			await contractPresence(
				[C1, C2],
				"http://rpc",
				rpc(() => []),
			),
		).toBeNull();
	});
	it("reads Horizon's 404 as absent and any other failure as could-not-check", async () => {
		const horizon =
			(status: number, body: unknown = {}): typeof fetch =>
			async () =>
				new Response(JSON.stringify(body), { status });
		expect(await accountPresence(G1, horizon(200, { account_id: G1 }))).toBe(
			"present",
		);
		expect(await accountPresence(G1, horizon(404))).toBe("absent");
		expect(await accountPresence(G1, horizon(503))).toBeNull();
		expect(
			await accountPresence(G1, horizon(200, { account_id: "G" })),
		).toBeNull();
	});
});

describe("/api/contracts serves the map's contracts through the project rows", () => {
	beforeEach(() => resetContractsRegistryCache());
	const mapped = (
		slug: string,
		address: string,
		extra: Record<string, unknown> = {},
	) => ({
		slug,
		name: slug.toUpperCase(),
		onchain: {
			asOf: "2026-11-24T06:00:00.000Z",
			contracts: [
				{
					address,
					label: null,
					tier: "strong",
					evidence: ["own-repo-interface"],
					sourceUrl: `https://github.com/${slug}/contracts`,
					createdAt: "2026-06-30T07:17:02.000Z",
					createdLedger: 63262178,
					dateBasis: "creation proved in the ledger",
					endedAt: null,
					...extra,
				},
			],
		},
	});
	// biome-ignore lint/suspicious/noExplicitAny: mock payload
	const payloadOf = (repos: any[], projects: any[]): any => ({
		find: async ({ collection }: { collection: string }) => {
			const docs =
				collection === "repos"
					? repos
					: collection === "projects"
						? projects
						: [];
			return { docs, totalDocs: docs.length };
		},
	});

	it("a contract two projects hold outside one family is never attributed", () => {
		const a = attributionsOf(
			[mapped("acta", C1), mapped("kindfi", C1)],
			"contracts",
		);
		expect(a.has(C1)).toBe(false);
		// Two rows that name different families do not make one family.
		const b = attributionsOf(
			[
				mapped("fxdao", C1, { sharedWithinFamily: ["fxdao", "usdx"] }),
				mapped("ondo", C1, { sharedWithinFamily: ["ondo", "usdy"] }),
			],
			"contracts",
		);
		expect(b.has(C1)).toBe(false);
	});

	it("lists a mapped contract no repo names as its own row, and a family contract once, under the issuer", async () => {
		const fam = { tier: "labelled", sharedWithinFamily: ["fxdao", "usdx"] };
		const { contracts, total } = await buildContractsRegistry(
			payloadOf(
				[],
				[
					mapped("acta", C2),
					mapped("usdx", C1, fam),
					mapped("fxdao", C1, fam),
					mapped("kindfi", G1.replace("G", "C")),
					mapped("other", G1.replace("G", "C")),
				],
			),
			{ limit: 10 },
		);
		expect(total).toBe(2);
		const acta = contracts.find((c) => c.contractId === C2);
		expect(acta?.contractBasis).toBe("onchain-map");
		expect(acta?.project?.slug).toBe("acta");
		expect(acta?.repo).toBeNull();
		expect(acta?.attribution).toMatchObject({
			tier: "strong",
			evidence: ["own-repo-interface"],
			createdLedger: 63262178,
			endedAt: null,
		});
		const fx = contracts.find((c) => c.contractId === C1);
		expect(fx?.project?.slug).toBe("fxdao");
		expect(fx?.attribution?.sharedWithinFamily).toEqual(["fxdao", "usdx"]);
	});

	it("a repo row whose contract the map holds keeps its row and gains the attribution", async () => {
		const { contracts, total } = await buildContractsRegistry(
			payloadOf(
				[
					{
						fullName: "acta-team/contracts",
						url: "https://github.com/acta-team/contracts",
						mainnetContractId: C2,
						mainnetContractBasis: "source-matched",
						projectSlug: "acta",
					},
				],
				[mapped("acta", C2)],
			),
		);
		expect(total).toBe(1);
		expect(contracts[0].contractBasis).toBe("source-matched");
		expect(contracts[0].repo?.fullName).toBe("acta-team/contracts");
		expect(contracts[0].attribution?.tier).toBe("strong");
	});
});
