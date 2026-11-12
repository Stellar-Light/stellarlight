import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	planDeployments,
	probeCounts,
	registrable,
	tomlChain,
} from "../../../scripts/data/backfill-deployment";
import { DEPLOYMENT_VERIFIED } from "../../../scripts/data/curation-maps";
import { spec } from "../openapi-spec";
import {
	DEPLOYMENT_BASES,
	DEPLOYMENT_NETWORKS,
	type DeploymentCandidate,
	decideDeployment,
	deploymentGaps,
	deriveNetworks,
	explorerUrl,
	isTestnetEvidence,
	NETWORKS_BASES,
	onchainArtifact,
	pickDeployment,
} from "../project-deployment";

/** sls-079: deployment is a separate, evidence-backed fact beside status.
 * These tests pin the semantics the field's honesty depends on. */
describe("pickDeployment semantics", () => {
	it("no stored group serves an explicit unknown, never a guess", () => {
		expect(pickDeployment(null)).toEqual({
			network: "unknown",
			basis: null,
			sourceUrl: null,
			asOf: null,
		});
		expect(pickDeployment(undefined).network).toBe("unknown");
		expect(pickDeployment({}).network).toBe("unknown");
	});

	it("an unrecognized stored network degrades to unknown, not passthrough", () => {
		expect(pickDeployment({ network: "devnet" }).network).toBe("unknown");
	});

	it("unknown carries NO provenance — basis/sourceUrl describe evidence and unknown means there is none", () => {
		const out = pickDeployment({
			network: "unknown",
			basis: "stale-junk",
			sourceUrl: "https://example.com",
			asOf: "2026-01-01",
		});
		expect(out).toEqual({
			network: "unknown",
			basis: null,
			sourceUrl: null,
			asOf: null,
		});
	});

	it("evidenced networks pass provenance through untouched", () => {
		expect(
			pickDeployment({
				network: "testnet",
				basis: "human-verified",
				sourceUrl: "https://stellars.finance/assets/index-3HEaNhUX.js",
				asOf: "2026-08-28",
			}),
		).toEqual({
			network: "testnet",
			basis: "human-verified",
			sourceUrl: "https://stellars.finance/assets/index-3HEaNhUX.js",
			asOf: "2026-08-28",
		});
		expect(pickDeployment({ network: "mainnet" })).toEqual({
			network: "mainnet",
			basis: null,
			sourceUrl: null,
			asOf: null,
		});
	});
});

describe("deployment contract parity", () => {
	it("the spec's network enum and the serializer's are the same set", () => {
		// The response schema sits behind a $ref; resolve it through components.
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const anySpec: any = spec;
		let schema =
			anySpec.paths["/api/projects/search"].get.responses["200"].content[
				"application/json"
			].schema;
		const deref = (node: any): any =>
			node?.$ref
				? anySpec.components.schemas[node.$ref.replace(/^.*\//, "")]
				: node;
		schema = deref(schema);
		const item = deref(schema.properties.projects.items);
		const specEnum: string[] =
			item.properties.deployment.properties.network.enum;
		expect([...specEnum].sort()).toEqual([...DEPLOYMENT_NETWORKS].sort());
	});

	it("every search-route row builder uses the ONE shared serializer (the sls-079 three-builder drift class)", () => {
		const route = readFileSync(
			join(process.cwd(), "src/app/api/projects/search/route.ts"),
			"utf8",
		);
		const builders = route.match(/\.\.\.statusChecksFor\(/g) ?? [];
		// The serializer must receive the row's slug, or the registry fill
		// (sls-023) silently never applies — a bare pickDeployment(x.deployment)
		// would satisfy a looser regex while serving unknown for every issuer.
		const shared =
			route.match(
				/deployment: pickDeployment\((\w+)\.deployment, \1\.slug\)/g,
			) ?? [];
		// One pickDeployment call per row builder; an inline `deployment: {`
		// block in the route would be the drift class reopening.
		expect(shared.length).toBe(builders.length);
		expect(route).not.toMatch(/deployment: \{\s*\n\s*network:/);
	});
});

// rendergate and clevercon were stamped mainnet off testnet explorer links.
describe("isTestnetEvidence", () => {
	it("reads the network an explorer or endpoint link names", () => {
		for (const u of [
			"https://stellar.expert/explorer/testnet/tx/5c898eb489265c142baee086d502e25b87a5536e4386e5ccdf69edc2515c0ef6",
			"https://stellar.expert/explorer/testnet/contract/CDFLEJ2HFPK3WKFTWB4CKP2JHEYNAUWKXGEJRYW4YMMGDSQSQ7D4LRTE",
			"https://horizon-testnet.stellar.org/transactions/abc",
		])
			expect(isTestnetEvidence(u), u).toBe(true);
		for (const u of [
			"https://stellar.expert/explorer/public/contract/CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH",
			"https://defillama.com/protocol/spiko",
			"https://developers.stellar.org/docs/data/oracles/oracle-providers",
			null,
		])
			expect(isTestnetEvidence(u), String(u)).toBe(false);
	});
});

/**
 * sls-024: every positive deployment claim carries its own provenance (a
 * source URL, a basis, a date and the networks), apart from lifecycle and
 * repository activity. Measured live on 2026-11-11 (API 1.9.127): of 105
 * mainnet or testnet claims, 56 had no sourceUrl (every one basis
 * onchain-activity, Allbridge among them) and 35 had a null network list.
 */
describe("deploymentGaps: the sls-024 guard", () => {
	const nets = ["stellar"];
	it("flags Allbridge as served on 2026-11-11: mainnet on-chain activity with no source", () => {
		expect(
			deploymentGaps({
				deployment: {
					network: "mainnet",
					basis: "onchain-activity",
					sourceUrl: null,
					asOf: "2026-08-28T20:58:13.695Z",
				},
				supportedNetworks: ["stellar"],
			}),
		).toEqual(["no sourceUrl"]);
	});

	it("flags a sourced claim beside a null network list (brale, 2026-11-11)", () => {
		expect(
			deploymentGaps({
				deployment: {
					network: "mainnet",
					basis: "human-verified",
					sourceUrl: "https://brale.xyz/.well-known/stellar.toml",
					asOf: "2026-08-28T22:02:11.580Z",
				},
				supportedNetworks: null,
			}),
		).toEqual(["supportedNetworks does not list stellar"]);
	});

	it("flags evidence from the other network, either way round", () => {
		const testnetTx =
			"https://stellar.expert/explorer/testnet/tx/5c898eb489265c142baee086d502e25b87a5536e4386e5ccdf69edc2515c0ef6";
		const mainnetContract = explorerUrl(
			"mainnet",
			"contract",
			"CBQ6GW7QCFFE252QEVENUNG45KYHHBRO4IZIWFJOXEFANHPQUXX5NFWV",
		);
		const asOf = "2026-11-11T00:00:00.000Z";
		const basis = "onchain-activity";
		expect(
			deploymentGaps({
				deployment: { network: "mainnet", basis, sourceUrl: testnetTx, asOf },
				supportedNetworks: nets,
			}),
		).toEqual(["mainnet claim cites evidence from another network"]);
		expect(
			deploymentGaps({
				deployment: {
					network: "testnet",
					basis,
					sourceUrl: mainnetContract,
					asOf,
				},
				supportedNetworks: nets,
			}),
		).toEqual(["testnet claim cites evidence from another network"]);
		expect(
			deploymentGaps({
				deployment: { network: "testnet", basis, sourceUrl: testnetTx, asOf },
				supportedNetworks: nets,
			}),
		).toEqual([]);
	});

	it("flags a missing or unknown basis and a missing date; network casing does not matter", () => {
		expect(
			deploymentGaps({
				deployment: {
					network: "mainnet",
					basis: "stablecoin-issuance",
					sourceUrl: "https://example.org/a",
					asOf: null,
				},
				supportedNetworks: ["Stellar"],
			}),
		).toEqual(["basis stablecoin-issuance is not a known class", "no asOf"]);
		expect(
			deploymentGaps({
				deployment: { network: "mainnet", sourceUrl: "https://example.org/a" },
				supportedNetworks: nets,
			}),
		).toEqual(["no basis", "no asOf"]);
	});

	it("an unknown with null fields is the documented unknown state, never a gap", () => {
		expect(
			deploymentGaps({
				deployment: pickDeployment(null),
				supportedNetworks: null,
			}),
		).toEqual([]);
		expect(deploymentGaps({})).toEqual([]);
	});
});

describe("decideDeployment: the writer requires a source", () => {
	const c = (
		probe: DeploymentCandidate["probe"],
		sourceUrl = `https://stellar.expert/explorer/public/contract/C${probe}`,
	): DeploymentCandidate => ({
		network: "mainnet",
		basis: "onchain-activity",
		sourceUrl,
		asOf: null,
		probe,
	});

	it("a candidate with no sourceUrl is never a claim, even when found", () => {
		expect(decideDeployment([c("found", "")])).toEqual({ kind: "none" });
		expect(decideDeployment([c("found", ""), c("found")])).toEqual({
			kind: "claim",
			claim: c("found"),
		});
	});

	it("checked-absent falls through; the first found wins", () => {
		expect(decideDeployment([c("checked-absent"), c("found")])).toEqual({
			kind: "claim",
			claim: c("found"),
		});
		expect(decideDeployment([c("checked-absent")])).toEqual({ kind: "none" });
		expect(decideDeployment([])).toEqual({ kind: "none" });
	});

	it("a check that could not run before any was found leaves the stored claim alone", () => {
		expect(decideDeployment([c("could-not-check"), c("found")]).kind).toBe(
			"abstain",
		);
		// A failure after the winner changes nothing.
		expect(decideDeployment([c("found"), c("could-not-check")]).kind).toBe(
			"claim",
		);
	});
});

describe("onchainArtifact and explorerUrl", () => {
	it("read an explorer link as the artifact and network it names, and back", () => {
		for (const [url, want] of [
			[
				"https://stellar.expert/explorer/public/asset/MBRL-GDLS4RCNECY46KKA4OGU2MMJILUK3I372CUFISWM4HKCV7265RY2NJ4Z",
				{
					network: "mainnet",
					kind: "asset",
					id: "MBRL-GDLS4RCNECY46KKA4OGU2MMJILUK3I372CUFISWM4HKCV7265RY2NJ4Z",
				},
			],
			[
				"https://stellar.expert/explorer/testnet/contract/CDFLEJ2HFPK3WKFTWB4CKP2JHEYNAUWKXGEJRYW4YMMGDSQSQ7D4LRTE",
				{
					network: "testnet",
					kind: "contract",
					id: "CDFLEJ2HFPK3WKFTWB4CKP2JHEYNAUWKXGEJRYW4YMMGDSQSQ7D4LRTE",
				},
			],
		] as const) {
			expect(onchainArtifact(url)).toEqual(want);
			expect(explorerUrl(want.network, want.kind, want.id)).toBe(url);
		}
	});

	it("a docs page, a repo, a DefiLlama page or a paywalled API URL is no on-chain artifact", () => {
		for (const u of [
			// an asset page with no issuer (XLM) names nothing Horizon can check
			"https://stellar.expert/explorer/public/asset/XLM",
			"https://stellar.expert/explorer/public/contract/not-a-contract-id",
			"https://developers.stellar.org/docs/data/oracles/oracle-providers",
			"https://github.com/bp-ventures/lightecho-stellar-oracle",
			"https://defillama.com/protocol/spiko",
			"https://api.stellar.expert/explorer/public/asset/KALE-GBDVX4VELCDSQ54KQJYTNHXAHFLBCA77ZY2USQBM4CSHTTV7DME7KALE/stats-history",
			null,
		])
			expect(onchainArtifact(u), String(u)).toBeNull();
	});
});

describe("deriveNetworks: a positive deployment never sits beside a null network list", () => {
	const sourced = {
		network: "mainnet",
		basis: "human-verified",
		sourceUrl: "https://brale.xyz/.well-known/stellar.toml",
		asOf: "2026-08-28T22:02:11.580Z",
	};
	it("a sourced deployment derives ['stellar'] when nothing else does", () => {
		expect(deriveNetworks({ slug: "brale-test", deployment: sourced })).toEqual(
			{ supportedNetworks: ["stellar"], networksBasis: "deployment" },
		);
	});

	it("an unsourced claim is no evidence for the list", () => {
		expect(
			deriveNetworks({
				slug: "x",
				deployment: { network: "mainnet", basis: "onchain-activity" },
			}),
		).toEqual({ supportedNetworks: null, networksBasis: null });
	});

	it("a deployment filled from the RWA registry counts, as served", () => {
		// bitbond: a live registry product, no stored deployment.
		expect(deriveNetworks({ slug: "bitbond" })).toEqual({
			supportedNetworks: ["stellar"],
			networksBasis: "deployment",
		});
	});

	it("serves a curated list lowercase, as the spec documents (20 rows stored 'Stellar' on 2026-11-11)", () => {
		expect(
			deriveNetworks({ slug: "vrf-soroban", supportedNetworks: ["Stellar"] }),
		).toEqual({ supportedNetworks: ["stellar"], networksBasis: "curated" });
		expect(
			deriveNetworks({
				slug: "x",
				supportedNetworks: [" Stellar", "stellar", "EVM"],
			}).supportedNetworks,
		).toEqual(["stellar", "evm"]);
	});

	it("is read last: curation and the stronger bases keep their place", () => {
		expect(
			deriveNetworks({
				slug: "x",
				deployment: sourced,
				supportedNetworks: ["stellar", "evm"],
			}),
		).toEqual({
			supportedNetworks: ["stellar", "evm"],
			networksBasis: "curated",
		});
		expect(
			deriveNetworks({
				slug: "x",
				deployment: sourced,
				scf: { awarded: true },
			}),
		).toEqual({ supportedNetworks: ["stellar"], networksBasis: "scf-award" });
		expect(deriveNetworks({ slug: "x" })).toEqual({
			supportedNetworks: null,
			networksBasis: null,
		});
	});
});

describe("deployment basis contract parity (sls-024)", () => {
	// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
	const P: any = (spec as any).components.schemas.Project.properties;
	it("the spec's deployment.basis enum and networksBasis enum are the code's lists", () => {
		expect([...P.deployment.properties.basis.enum].sort()).toEqual(
			[...DEPLOYMENT_BASES].sort(),
		);
		expect([...P.networksBasis.enum].sort()).toEqual(
			[...NETWORKS_BASES].sort(),
		);
	});

	it("each basis value is defined in its description, and the collection's help text lists them", () => {
		const d: string = P.deployment.properties.basis.description;
		for (const v of DEPLOYMENT_BASES) expect(d, v).toContain(`'${v}'`);
		expect(P.networksBasis.description).toContain("'deployment'");
		const collection = readFileSync(
			join(process.cwd(), "src/collections/Projects.ts"),
			"utf8",
		);
		const help = collection.match(/"Evidence class: ([^."]+)\./)?.[1];
		expect(help?.split(" | ").sort()).toEqual([...DEPLOYMENT_BASES].sort());
	});
});

describe("DEPLOYMENT_VERIFIED entries carry their evidence", () => {
	it("the 2026-11-11 retractions carry a dated reason, Pyth gains its source, and every positive entry names an https source", () => {
		// Each retracted claim rested on another project's artifact.
		for (const slug of [
			"lightsail",
			"stellar-indexer",
			"simplytokenized",
			"estrela",
			"websoroban-ide",
			"soroban-timelock-contract",
			"dia",
		])
			expect(DEPLOYMENT_VERIFIED[slug]?.network, slug).toBe("unknown");
		// Found on its network's ledger that day, from the operator's own page.
		expect(DEPLOYMENT_VERIFIED.pyth).toMatchObject({
			network: "mainnet",
			sourceUrl: "https://docs.pyth.network/pro/contract-addresses",
		});
		// Held assets whose issuer names another domain, traced by hand.
		for (const slug of ["vchf", "veur", "mbrl", "excellar"])
			expect(DEPLOYMENT_VERIFIED[slug]?.network, slug).toBe("mainnet");
		// Normal's toml currencies are dead; its own nUSDC vault is the evidence.
		expect(DEPLOYMENT_VERIFIED.normal).toMatchObject({
			network: "mainnet",
			sourceUrl:
				"https://stellar.expert/explorer/public/contract/CAWM7NKSYG2ITJW2MYYJWJ5ULGCJLDB6MXZIWPL3VPRG5TDVLJ66IMWR",
		});
		for (const [slug, e] of Object.entries(DEPLOYMENT_VERIFIED)) {
			if (e.network === "unknown") {
				expect(e.note.length, slug).toBeGreaterThan(40);
				expect(Number.isNaN(Date.parse(e.checkedAt)), slug).toBe(false);
			} else {
				expect(e.sourceUrl, slug).toMatch(/^https:\/\//);
				if (e.checkedAt)
					expect(Number.isNaN(Date.parse(e.checkedAt)), slug).toBe(false);
			}
		}
	});
});

/**
 * The writer itself (scripts/data/backfill-deployment.ts), with its network
 * reads swapped for fixed answers: every claim it plans carries the URL of the
 * evidence it checked, and nothing it cannot check moves a stored claim.
 */
describe("planDeployments: the deployment pass, without a database", () => {
	const ALLBRIDGE = "CBQ6GW7QCFFE252QEVENUNG45KYHHBRO4IZIWFJOXEFANHPQUXX5NFWV";
	const BLEND_POOL = "CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD";
	const NOW = "2026-11-11T12:00:00.000Z";
	const noSource = {
		network: "mainnet",
		basis: "onchain-activity",
		sourceUrl: null,
		asOf: "2026-08-28T20:58:13.695Z",
	};
	const io = (
		state: Record<string, "found" | "checked-absent" | "could-not-check">,
		homeDomains: Record<string, string | null> = {},
	) => ({
		contracts: async (_net: string, ids: string[]) =>
			new Map(ids.map((id) => [id, state[id] ?? "checked-absent"] as const)),
		horizon: async (_net: string, _kind: string, id: string) =>
			state[id] ?? "checked-absent",
		account: async (_net: string, account: string) =>
			account in homeDomains
				? { state: "found" as const, domain: homeDomains[account] }
				: { state: "could-not-check" as const, domain: null },
		toml: async () => {
			throw new Error("the toml chain must not run here");
		},
	});

	it("an on-chain claim gains the explorer page of the contract the ledger holds (Allbridge)", async () => {
		const { plan } = await planDeployments(
			[
				{
					id: 1,
					slug: "allbridge",
					status: "Live",
					deployment: noSource,
					onchain: { contracts: [{ address: ALLBRIDGE }] },
				},
			],
			[],
			io({ [ALLBRIDGE]: "found" }),
			NOW,
		);
		expect(plan.map((w) => w.to)).toEqual([
			{
				network: "mainnet",
				basis: "onchain-activity",
				sourceUrl: explorerUrl("mainnet", "contract", ALLBRIDGE),
				asOf: NOW,
				probe: "found",
				why: "",
			},
		]);
	});

	it("a contract another project's seed owns is never this row's evidence, and the pass does not retract on its own", async () => {
		const { plan, kept } = await planDeployments(
			[
				{
					id: 2,
					slug: "some-sdk",
					status: "Live",
					deployment: noSource,
					onchain: { contracts: [{ address: BLEND_POOL }] },
				},
			],
			[
				{
					projectSlug: "some-sdk",
					fullName: "acme/some-sdk",
					mainnetContractId: BLEND_POOL,
				},
			],
			io({ [BLEND_POOL]: "found" }),
			NOW,
		);
		expect(plan).toEqual([]);
		expect(kept).toEqual(["some-sdk mainnet (onchain-activity) NO SOURCE"]);
	});

	describe("a repo's contract id the scan judged cited", () => {
		// A README cites the contracts it calls as readily as its own:
		// reflector-network/reflector-stellar-connector names the SushiSwap
		// V3 factory as a config default.
		const CITED = "CD3KRKGDRVWPXVB3VXLUMQKMX6XZ6Q2H334IVZD4XXNAMKSRVQL5GLYF";
		const OWN = "CAEGJYOE6TYU36H3JLP2OJRNG7KPFSOL2KC374UKFFMCVWGL6EWOS5JP";
		const project = { id: 7, slug: "acme", status: "Live" };
		const repo = (
			fullName: string,
			basis: string | null | undefined,
			mainnetContractId: string,
		) => ({
			projectSlug: "acme",
			fullName,
			mainnetContractId,
			...(basis === undefined ? {} : { mainnetContractBasis: basis }),
		});
		const planFor = async (
			repos: ReturnType<typeof repo>[],
			p: Record<string, unknown> = project,
		) =>
			(
				await planDeployments(
					[p],
					repos,
					io({ [CITED]: "found", [OWN]: "found" }),
					NOW,
				)
			).plan.map((w) => [w.to.network, w.to.basis, w.to.sourceUrl, w.to.why]);
		const joined = (fullName: string) => [
			[
				"mainnet",
				"mainnet-contract-join",
				`https://github.com/${fullName}`,
				"",
			],
		];

		it("is no deployment evidence; any other basis, or none, still is", async () => {
			expect(await planFor([repo("acme/app", "cited", CITED)])).toEqual([]);
			for (const basis of ["source-matched", "published", null])
				expect(await planFor([repo("acme/app", basis, OWN)])).toEqual(
					joined("acme/app"),
				);
			// No basis key at all reads as not judged yet.
			expect(await planFor([repo("acme/app", undefined, OWN)])).toEqual(
				joined("acme/app"),
			);
		});

		it("gives way to the project's own id, whichever repo comes first", async () => {
			const cited = repo("acme/connector", "cited", CITED);
			const own = repo("acme/contracts", "self-validated", OWN);
			expect(await planFor([cited, own])).toEqual(joined("acme/contracts"));
			expect(await planFor([own, cited])).toEqual(joined("acme/contracts"));
		});

		it("retracts a stored join claim that rests on it, with a dated reason", async () => {
			const stored = {
				...project,
				deployment: {
					network: "mainnet",
					basis: "mainnet-contract-join",
					sourceUrl: "https://github.com/acme/app",
					asOf: "2026-09-05T05:28:54.666Z",
				},
			};
			expect(await planFor([repo("acme/app", "cited", CITED)], stored)).toEqual(
				[
					[
						"unknown",
						null,
						null,
						"retracted 2026-11-11: acme/app's contract id is one it cites, not its own (contract scan)",
					],
				],
			);
			// A stored join whose source repo is its
			// own stays as it is, and one whose source repo is not among the
			// repos read is kept, never retracted.
			const own = await planDeployments(
				[stored],
				[repo("acme/app", "self-validated", OWN)],
				io({ [OWN]: "found" }),
				NOW,
			);
			expect(own.plan).toEqual([]);
			const unread = await planDeployments(
				[stored],
				[repo("acme/other", "cited", CITED)],
				io({}),
				NOW,
			);
			expect(unread.plan).toEqual([]);
			expect(unread.kept).toEqual([
				"acme mainnet (mainnet-contract-join) https://github.com/acme/app",
			]);
		});

		it("never retracts when a ledger read could not run, or the stored source names the repo another way", async () => {
			const stored = (sourceUrl: string) => ({
				...project,
				onchain: { contracts: [{ address: OWN }] },
				deployment: {
					network: "mainnet",
					basis: "mainnet-contract-join",
					sourceUrl,
					asOf: "2026-09-05T05:28:54.666Z",
				},
			});
			// An abstaining project leaves its stored claim as it is.
			const abstains = await planDeployments(
				[stored("https://github.com/acme/app")],
				[repo("acme/app", "cited", CITED)],
				io({ [OWN]: "could-not-check" }),
				NOW,
			);
			expect(abstains.plan).toEqual([]);
			expect(abstains.abstained).toHaveLength(1);
			// Only the exact join source URL matches; a variant is kept.
			for (const url of [
				"https://github.com/acme/app/",
				"https://github.com/acme/app.git",
			]) {
				const variant = await planDeployments(
					[{ ...stored(url), onchain: undefined }],
					[repo("acme/app", "cited", CITED)],
					io({}),
					NOW,
				);
				expect(variant.plan).toEqual([]);
				expect(variant.kept).toEqual([
					`acme mainnet (mainnet-contract-join) ${url}`,
				]);
			}
		});
	});

	it("a ledger read that could not run leaves the stored claim as it is", async () => {
		const { plan, abstained } = await planDeployments(
			[
				{
					id: 3,
					slug: "allbridge",
					deployment: noSource,
					onchain: { contracts: [{ address: ALLBRIDGE }] },
				},
			],
			[],
			io({ [ALLBRIDGE]: "could-not-check" }),
			NOW,
		);
		expect(plan).toEqual([]);
		expect(abstained).toHaveLength(1);
	});

	it("a stale DefiLlama reading evidences nothing; Spiko falls to its RWA registry product", async () => {
		const reg = pickDeployment(null, "spiko");
		expect(reg.basis).toBe("rwa-registry");
		const { plan } = await planDeployments(
			[
				{
					id: 4,
					slug: "spiko",
					status: "Live",
					statusBasis: "onchain-activity",
					statusSourceUrl: "https://defillama.com/protocol/spiko",
					tvlSource: "defillama",
					tvlUSD: 1653789314,
					tvlAsOf: "2026-09-14T10:30:21.591Z",
					deployment: noSource,
				},
			],
			[],
			io({}),
			NOW,
		);
		expect(plan.map((w) => [w.to.basis, w.to.sourceUrl, w.to.asOf])).toEqual([
			["rwa-registry", reg.sourceUrl, reg.asOf],
		]);
	});

	it("a testnet explorer link cited as status evidence is checked on testnet and becomes the source (CleverCon)", async () => {
		const id = "CDFLEJ2HFPK3WKFTWB4CKP2JHEYNAUWKXGEJRYW4YMMGDSQSQ7D4LRTE";
		const url = explorerUrl("testnet", "contract", id);
		const { plan } = await planDeployments(
			[
				{
					id: 5,
					slug: "clevercon",
					status: "Pre-Release",
					statusBasis: "onchain-activity",
					statusSourceUrl: url,
					deployment: { ...noSource, network: "testnet" },
				},
			],
			[],
			io({ [id]: "found" }),
			NOW,
		);
		expect(plan.map((w) => [w.to.network, w.to.sourceUrl])).toEqual([
			["testnet", url],
		]);
	});

	it("a curated retraction writes unknown; a domain two rows share never runs the toml chain", async () => {
		const { plan } = await planDeployments(
			[
				{
					id: 6,
					slug: "lightsail",
					deployment: {
						network: "mainnet",
						basis: "mainnet-contract-join",
						sourceUrl:
							"https://github.com/lightsail-network/stellar-contract-bindings",
						asOf: "2026-09-05T05:28:54.666Z",
					},
				},
				{
					id: 7,
					slug: "dex-a",
					status: "Live",
					types: ["DEX"],
					links: { website: "https://shared.example/" },
				},
				{ id: 8, slug: "dex-b", links: { website: "https://shared.example" } },
			],
			[],
			io({}),
			NOW,
		);
		expect(plan.map((w) => [w.slug, w.to.network, w.to.sourceUrl])).toEqual([
			["lightsail", "unknown", null],
		]);
	});

	// Review findings, 2026-11-11.
	const FORWARDER = "CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T";
	const VNX = "GDXLSLCOPPHTWOQXLLKSVN4VN3G67WD2ENU7UMVAROEYVJLSPSEWXIZN";

	it("a status link to a contract seeded to another project is no evidence (Circle's CctpForwarder cited by a bridge)", async () => {
		const { plan, kept } = await planDeployments(
			[
				{
					id: 9,
					slug: "some-bridge",
					status: "Live",
					statusBasis: "onchain-activity",
					statusSourceUrl: explorerUrl("mainnet", "contract", FORWARDER),
					deployment: noSource,
				},
			],
			[
				{
					projectSlug: "some-bridge",
					fullName: "acme/ingress",
					mainnetContractId: FORWARDER,
				},
			],
			io({ [FORWARDER]: "found" }),
			NOW,
		);
		expect(plan).toEqual([]);
		expect(kept).toHaveLength(1);
	});

	it("a held asset counts only when its issuer's home_domain names the row's own domain", async () => {
		const row = (website: string) => ({
			id: 10,
			slug: "vnx-like",
			status: "Live",
			links: { website },
			deployment: noSource,
			onchain: { assetCode: "VCHF", issuer: VNX },
		});
		const id = `VCHF-${VNX}`;
		const other = await planDeployments(
			[row("https://vnx.li/")],
			[],
			io({ [id]: "found" }, { [VNX]: "vnx.io" }),
			NOW,
		);
		expect(other.plan).toEqual([]);
		const own = await planDeployments(
			[row("https://www.vnx.io/")],
			[],
			io({ [id]: "found" }, { [VNX]: "vnx.io" }),
			NOW,
		);
		expect(own.plan.map((w) => w.to.sourceUrl)).toEqual([
			explorerUrl("mainnet", "asset", id),
		]);
	});

	it("the same rule holds for an asset the status cites", async () => {
		const id = `VCHF-${VNX}`;
		const { plan } = await planDeployments(
			[
				{
					id: 11,
					slug: "vnx-like",
					status: "Live",
					statusBasis: "onchain-activity",
					statusSourceUrl: explorerUrl("mainnet", "asset", id),
					links: { website: "https://vnx.li/" },
					deployment: noSource,
				},
			],
			[],
			io({ [id]: "found" }, { [VNX]: "vnx.io" }),
			NOW,
		);
		expect(plan).toEqual([]);
	});

	it("the registry is written only over a stored positive claim; an unknown row is left to the serve-time fill", async () => {
		const { plan } = await planDeployments(
			[{ id: 12, slug: "bitbond", status: "Live", deployment: {} }],
			[],
			io({}),
			NOW,
		);
		expect(plan).toEqual([]);
		expect(pickDeployment({}, "bitbond").basis).toBe("rwa-registry");
	});

	it("an explorer link whose id fits no artifact is no candidate, so the row is not left unchecked every week", async () => {
		const { plan, abstained, kept } = await planDeployments(
			[
				{
					id: 13,
					slug: "xlm-page",
					statusBasis: "onchain-activity",
					statusSourceUrl: "https://stellar.expert/explorer/public/asset/XLM",
					deployment: noSource,
				},
			],
			[],
			io({ XLM: "could-not-check" }),
			NOW,
		);
		expect(abstained).toEqual([]);
		expect(plan).toEqual([]);
		expect(kept).toHaveLength(1);
	});

	it("a DefiLlama page evidences a deployment only above zero and while fresh by the run's own clock", async () => {
		const llama = (tvlUSD: number) => ({
			id: 14,
			slug: "llama-row",
			status: "Live",
			statusBasis: "onchain-activity",
			statusSourceUrl: "https://defillama.com/protocol/llama-row",
			tvlSource: "defillama",
			tvlUSD,
			tvlAsOf: "2026-11-09T13:44:29.805Z",
			deployment: noSource,
		});
		const fresh = await planDeployments([llama(4014111)], [], io({}), NOW);
		expect(
			fresh.plan.map((w) => [w.to.basis, w.to.sourceUrl, w.to.asOf]),
		).toEqual([
			[
				"defillama-tvl",
				"https://defillama.com/protocol/llama-row",
				"2026-11-09T13:44:29.805Z",
			],
		]);
		const zero = await planDeployments([llama(0)], [], io({}), NOW);
		expect(zero.plan).toEqual([]);
		const later = await planDeployments(
			[llama(4014111)],
			[],
			io({}),
			"2027-01-01T00:00:00.000Z",
		);
		expect(later.plan).toEqual([]);
	});
});

describe("registrable: who owns a host", () => {
	it("two hosts under a shared suffix match only as the same host", () => {
		expect(registrable("https://a.com.mx/")).toBe("a.com.mx");
		expect(registrable("b.com.mx")).not.toBe(registrable("a.com.mx"));
		expect(registrable("https://foo.vercel.app")).toBe("foo.vercel.app");
		expect(registrable("bar.vercel.app")).not.toBe(
			registrable("foo.vercel.app"),
		);
		expect(registrable("mbrl.com.br")).not.toBe(
			registrable("https://mercadobitcoin.com.br/mbrl"),
		);
		expect(registrable("www.docs.gitbook.io")).toBe("docs.gitbook.io");
		expect(registrable("vercel.app")).toBeNull();
	});

	it("an ordinary domain still matches across its subdomains", () => {
		expect(registrable("api.anclap.com")).toBe("anclap.com");
		expect(registrable("https://www.sodax.com/x")).toBe("sodax.com");
		expect(registrable("stablecoin.z.com")).toBe(registrable("z.com"));
	});
});

describe("tomlChain: SEP-1 status, and its Horizon reads count toward a blind run", () => {
	const ISSUER = "GDXLSLCOPPHTWOQXLLKSVN4VN3G67WD2ENU7UMVAROEYVJLSPSEWXIZN";
	const toml = (status: string) =>
		`VERSION="2.0.0"\n\n[[CURRENCIES]]\ncode="NBTC"\nissuer="${ISSUER}"\nstatus="${status}"\n`;
	const answer = (url: string, status: number, body: unknown) => ({
		ok: status >= 200 && status < 300,
		status,
		url,
		text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
		json: async () => body,
	});
	afterEach(() => vi.unstubAllGlobals());

	it("a currency the operator marks dead is no evidence, and no Horizon read is made for it", async () => {
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => {
			seen.push(url);
			if (url.endsWith("stellar.toml")) return answer(url, 200, toml("dead"));
			return answer(url, 200, {
				_embedded: { records: [{}] },
				home_domain: "normal.example",
			});
		});
		expect(await tomlChain("https://normal.example/")).toBeNull();
		expect(seen.filter((u) => u.includes("horizon"))).toEqual([]);
	});

	it("a live currency is checked both ways, and a Horizon failure is counted as a read that could not run", async () => {
		vi.stubGlobal("fetch", async (url: string) =>
			url.endsWith("stellar.toml")
				? answer(url, 200, toml("live"))
				: url.includes("/assets?")
					? answer(url, 200, { _embedded: { records: [{}] } })
					: answer(url, 200, { home_domain: "normal.example" }),
		);
		expect(await tomlChain("https://normal.example/")).toEqual({
			code: "NBTC",
			issuer: ISSUER,
			tomlUrl: "https://normal.example/.well-known/stellar.toml",
		});
		const before = probeCounts();
		vi.stubGlobal("fetch", async (url: string) =>
			url.endsWith("stellar.toml")
				? answer(url, 200, toml("live"))
				: answer(url, 503, {}),
		);
		expect(await tomlChain("https://normal.example/")).toBeNull();
		const after = probeCounts();
		expect(after.attempted - before.attempted).toBe(1);
		expect(after.failed - before.failed).toBe(1);
	});
});
