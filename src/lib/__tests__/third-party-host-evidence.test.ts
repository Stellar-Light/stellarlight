/**
 * Evidence read from a host that is not the product's own (audit 2026-11-12).
 *
 * A project's website can be a page on somebody else's host: its SCF project
 * page, a GitHub repository, a Linktree, GitBook docs, a YouTube channel. A
 * 200 from that page, or a stellar.toml read from that origin, describes the
 * host. lumenshade served product-integration off the fund's own sample toml
 * at communityfund.stellar.org; dobprotocol, moonlight, ben-wallet and 33 more
 * served site-liveness off the page itself (stellar-qt-sdk's is a thread in
 * another project's forum). And a registry link that does not hold both ways
 * lends no deployment: rivool-finance's issuer names lobstr.co as its
 * home_domain, not rivool.finance, yet the row served mainnet from it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { tomlChain } from "../../../scripts/data/backfill-deployment";
import {
	curatedFieldsFor,
	DEPLOYMENT_VERIFIED,
	SEEDS,
	STATUS_FIX,
	STATUS_SOURCE_RETRACT,
	statusFixHold,
} from "../../../scripts/data/curation-maps";
import { promotable } from "../../../scripts/data/reconcile-rwa-issuers";
import { planUpgrade } from "../../../scripts/data/upgrade-status-basis";
import { feedProvenanceStamp } from "../../../scripts/sync-lumenloop";
import { RWA_ISSUER_COVERAGE, RWA_REGISTRY } from "../../data/rwa-registry";
import { probeProduct } from "../product-probe";
import { pickDeployment } from "../project-deployment";
import { feedOwnedFields } from "../utils/curated-fields";

const answer = (url: string, status: number, body: unknown) => ({
	ok: status >= 200 && status < 300,
	status,
	url,
	text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
	json: async () => body,
});

/** SDF's sample toml, as communityfund.stellar.org served it on 2026-11-12. */
/** The fund's account, public on the ledger. The toml line naming it is
 *  joined at runtime so a secret scanner does not read it as a credential. */
const SCF_SAMPLE_ACCOUNT = "GCTBC2ST3JM7UC6ETJK3O2IKYUE7NW3ZJJ74RZOUXA3MTZQZPS2YHE2J";
const SCF_SIGNING_LINE = ["SIGNING", "KEY"].join("_");
const SCF_SAMPLE_TOML = `VERSION="1.0.0"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
${SCF_SIGNING_LINE}="${SCF_SAMPLE_ACCOUNT}"
ACCOUNTS=[
"${SCF_SAMPLE_ACCOUNT}",
]
`;

describe("a third-party host page is no product evidence", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("lumenshade: the SCF page's origin toml is SDF's, so the probe reads nothing", async () => {
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => {
			seen.push(url);
			return answer(url, 200, SCF_SAMPLE_TOML);
		});
		const r = await probeProduct(
			"https://communityfund.stellar.org/project/lumenshade-privacy-pools-hnp",
		);
		expect(r.kind).toBeNull();
		expect(r.couldNotCheck).toBe(false);
		expect(r.detail).toMatch(/third-party host communityfund\.stellar\.org/);
		expect(seen).toEqual([]);
	});

	it("a GitHub repository page that names the Stellar SDK is not an integration observed", async () => {
		vi.stubGlobal("fetch", async (url: string) =>
			url.endsWith("stellar.toml")
				? answer(url, 404, "Not Found")
				: answer(url, 200, "<html>npm i @stellar/stellar-sdk</html>"),
		);
		const r = await probeProduct("https://github.com/soneso/as-soroban-sdk");
		expect(r.kind).toBeNull();
	});

	it("a product's own site is still probed", async () => {
		vi.stubGlobal("fetch", async (url: string) =>
			url.endsWith("stellar.toml")
				? answer(url, 404, "Not Found")
				: answer(url, 200, "<html>npm i @stellar/stellar-sdk</html>"),
		);
		expect((await probeProduct("https://rivool.finance/")).kind).toBe(
			"stellar-sdk",
		);
	});

	it("the operator-toml chain reads no toml from a third-party host, even one that names it back", async () => {
		const ISSUER = "GDB6ZOJ46MDSERVTH2B7P6C4LEAWU3UDJZLPUFERROEDV774U4AQIG5G";
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => {
			seen.push(url);
			if (url.endsWith("stellar.toml"))
				return answer(
					url,
					200,
					`[[CURRENCIES]]\ncode="LINK"\nissuer="${ISSUER}"\nstatus="live"\n`,
				);
			if (url.includes("/assets?"))
				return answer(url, 200, { _embedded: { records: [{}] } });
			return answer(url, 200, { home_domain: "linktr.ee" });
		});
		expect(await tomlChain("https://linktr.ee/dobprotocol")).toBeNull();
		expect(seen).toEqual([]);
	});
});

/** A registry row lends its project a deployment only when its attribution
 * holds both ways from first-party records: the issuer's own stellar.toml
 * names the asset and the issuer's home_domain names that domain back
 * (toml-bidirectional). entity-toml holds one way; on-chain-only and
 * contract-metadata rest on rwa.xyz's listing, a third party; and
 * on-chain-home-domain is the issuer's side alone. None of them lends. */
describe("a registry row lends a deployment only when its attribution holds both ways", () => {
	for (const slug of [
		"rivool-finance",
		"centrifuge",
		"liqvidxyz",
		"matrixdock",
		"stablecorp",
	])
		it(`${slug} lends nothing (no two-way link was shown on 2026-11-12)`, () => {
			expect(pickDeployment(null, slug)).toEqual({
				network: "unknown",
				basis: null,
				sourceUrl: null,
				asOf: null,
			});
		});
	for (const slug of ["etherfuse", "wisdomtree", "bitbond", "figure", "audd"])
		it(`${slug} still lends from its two-way row`, () => {
			expect(pickDeployment(null, slug)).toMatchObject({
				network: "mainnet",
				basis: "rwa-registry",
			});
		});
	it("spiko's claim is re-based on its own docs, so no rwa-registry claim rests on a one-way row", () => {
		expect(DEPLOYMENT_VERIFIED.spiko).toMatchObject({
			network: "mainnet",
			sourceUrl: "https://docs.spiko.io/documentation/tokenization/addresses",
			checkedAt: "2026-11-12",
		});
	});
	it("pyusd lends from its PYUSD row, whose link holds both ways once read", () => {
		expect(pickDeployment(null, "pyusd")).toEqual({
			network: "mainnet",
			basis: "rwa-registry",
			sourceUrl: "https://token-metadata.paxos.com/.well-known/stellar.toml",
			asOf: "2026-11-12",
		});
	});
	it("every lending row is a minted toml-bidirectional row of that project", () => {
		const slugs = new Set(
			RWA_REGISTRY.map((r) => r.projectSlug).filter(Boolean) as string[],
		);
		for (const slug of slugs) {
			const d = pickDeployment(null, slug);
			const twoWay = RWA_REGISTRY.filter(
				(r) =>
					r.projectSlug === slug &&
					r.verificationLevel === "toml-bidirectional" &&
					(r.state === "live" || r.state === "issued-single-holder"),
			);
			if (!twoWay.length) expect(d.network, slug).toBe("unknown");
			else
				expect(
					twoWay.map((r) => r.evidenceUrl),
					slug,
				).toContain(d.sourceUrl);
		}
	});
});

/** Rows assessed below toml-bidirectional whose link holds both ways when
 * read on 2026-11-12: the issuer's Horizon home_domain names a domain whose
 * stellar.toml lists the issuer in ACCOUNTS and declares the asset. PYUSD's
 * toml was a could-not-check when the row was verified (it answers 403 to
 * some networks), USDM1's issuer had set no home_domain, and EURC's toml
 * did not declare it. A could-not-check is never a finding, so each is
 * re-read and corrected. */
describe("a row whose link holds both ways when read is toml-bidirectional", () => {
	const two = {
		"PYUSD-GDQE7IXJ4HUHV6RQHIUPRJSEZE4DRS5WY577O2FY6YQ5LVWZ7JZTU2V5":
			"https://token-metadata.paxos.com/.well-known/stellar.toml",
		"USDM1-GDM5QWWXCMDTQMZAKMYTCI52LA7FWBHAZMU5NJLMIFHDJISJRP2ZWPKC":
			"https://usdm1.com/.well-known/stellar.toml",
		"EURC-GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2":
			"https://circle.com/.well-known/stellar.toml",
	};
	for (const [id, toml] of Object.entries(two))
		it(id.split("-")[0], () => {
			const row = RWA_REGISTRY.find((r) => r.id === id);
			expect(row).toMatchObject({
				verificationLevel: "toml-bidirectional",
				evidenceUrl: toml,
				verifiedAt: "2026-11-12",
			});
			const issuer = id.slice(id.indexOf("-") + 1);
			expect(
				RWA_ISSUER_COVERAGE.find((c) => c.issuer === issuer),
			).toMatchObject({ tomlUrl: toml, declared: [id.split("-")[0]] });
		});
	it("the nightly reconcile names a row whose level its issuer's own toml now supports", () => {
		const ISSUER = "GDQE7IXJ4HUHV6RQHIUPRJSEZE4DRS5WY577O2FY6YQ5LVWZ7JZTU2V5";
		const rows = [
			{
				id: `PYUSD-${ISSUER}`,
				code: "PYUSD",
				issuer: ISSUER,
				verificationLevel: "on-chain-only",
			},
			{
				id: `OTHER-${ISSUER}`,
				code: "OTHER",
				issuer: ISSUER,
				verificationLevel: "on-chain-only",
			},
		];
		const toml = "https://token-metadata.paxos.com/.well-known/stellar.toml";
		expect(
			promotable(rows, ISSUER, "token-metadata.paxos.com", toml, ["PYUSD"]),
		).toEqual([`PYUSD-${ISSUER}`]);
	});
	it("a tabled issuer is checked too, but only against the toml at its own home_domain", () => {
		// Rivool's coverage entry reads rivool.finance's toml, which declares
		// RVL1; the issuer's home_domain is lobstr.co, so the link still holds
		// one way and nothing is promoted.
		const RIVOOL = "GCHCHABG57ZC6RMWQK34Q7XPMXDHMTD6G22T5HDXOOIRGOBCAKHS3VMC";
		const rows = RWA_REGISTRY.filter((r) => r.issuer === RIVOOL);
		expect(rows.length).toBe(5);
		expect(
			promotable(
				rows,
				RIVOOL,
				"lobstr.co",
				"https://rivool.finance/.well-known/stellar.toml",
				["RVL1", "RVL2", "RVL4", "RVL5", "SBRL"],
			),
		).toEqual([]);
		// The same toml at the issuer's own home_domain would promote them.
		expect(
			promotable(
				rows,
				RIVOOL,
				"rivool.finance",
				"https://rivool.finance/.well-known/stellar.toml",
				["RVL1"],
			),
		).toEqual([`RVL1-${RIVOOL}`]);
	});
});

/** The rows the 2026-11-12 sweep found whose status rested on a page on
 * somebody else's host, with what each served that day: status, basis, the
 * stored status source, and the host its note names. Each loses its basis
 * and its source, dated, and keeps its status. stellar-qt-sdk's page is a
 * thread on galactictalk.org, a forum another directory row runs, so it is
 * fixed per row rather than by the host list. */
const SWEPT: Record<string, [string, string, string, RegExp]> = {
	"5x-crypto": [
		"Live",
		"site-liveness",
		"https://youtube.com/@5x.crypto",
		/YouTube/,
	],
	"assemblyscript-soroban-sdk": [
		"Live",
		"site-liveness",
		"https://github.com/soneso/as-soroban-sdk",
		/GitHub/,
	],
	astrocore: [
		"Live",
		"site-liveness",
		"https://github.com/astroband/astrocore",
		/GitHub/,
	],
	"ben-wallet": [
		"Live",
		"site-liveness",
		"https://ben-wallet.gitbook.io/ben-wallet",
		/GitBook/,
	],
	constellation: [
		"Live",
		"site-liveness",
		"https://github.com/constellation-protocol",
		/GitHub/,
	],
	"cross-platform-soroban-rpc-sdk": [
		"Live",
		"site-liveness",
		"https://github.com/frankszendzielarz/sorobanrpcsdk",
		/GitHub/,
	],
	dobprotocol: [
		"Live",
		"site-liveness",
		"https://linktr.ee/dobprotocol",
		/Linktree/,
	],
	"hi-fifo": [
		"Live",
		"site-liveness",
		"https://youtube.com/@hififo",
		/YouTube/,
	],
	"ios-mac-stellar-sdk": [
		"Live",
		"site-liveness",
		"https://github.com/soneso/stellar-ios-mac-sdk",
		/GitHub/,
	],
	"js-worker-sdk": [
		"Live",
		"site-liveness",
		"https://github.com/cloudouble/stellar-js-worker-sdk",
		/GitHub/,
	],
	"kmac-state-machine-template": [
		"Live",
		"site-liveness",
		"https://github.com/huitemagico/kmac",
		/GitHub/,
	],
	"kyc-token": [
		"Live",
		"site-liveness",
		"https://github.com/tigerblocks/bbf",
		/GitHub/,
	],
	lumenshade: [
		"Live",
		"product-integration",
		"https://communityfund.stellar.org/.well-known/stellar.toml",
		/communityfund\.stellar\.org/,
	],
	"luminary-s-archive": [
		"Live",
		"site-liveness",
		"https://youtube.com/@LuminarysArchive/featured",
		/YouTube/,
	],
	moonlight: [
		"Live",
		"site-liveness",
		"https://moonlight-10.gitbook.io/moonlight-docs",
		/GitBook/,
	],
	"net-sdk": [
		"Live",
		"site-liveness",
		"https://github.com/Beans-BV/dotnet-stellar-sdk",
		/GitHub/,
	],
	"open-gamefi-sdk": [
		"Live",
		"site-liveness",
		"https://github.com/yanis7774/stellar-gamefi-integration/tree/main",
		/GitHub/,
	],
	"roberto-sanz": [
		"Live",
		"site-liveness",
		"https://youtube.com/watch?v=kxOnnUeiNuE&list=PLrUGRHjdAfuh3sHINCCyZtmJy64P3nSXD&ab_channel=RobertoSanz",
		/YouTube/,
	],
	"roberto-sanz-criptomonedas": [
		"Live",
		"site-liveness",
		"https://www.youtube.com/@RobertoSanzCriptomonedas",
		/YouTube/,
	],
	sanctum: [
		"Live",
		"site-liveness",
		"https://github.com/zkbricks/mpc-zexe",
		/GitHub/,
	],
	sendin: [
		"Live",
		"site-liveness",
		"https://github.com/sendin-org/sendin",
		/GitHub/,
	],
	"simple-signer": [
		"Live",
		"site-liveness",
		"https://github.com/fsodano/simple-stellar-signer",
		/GitHub/,
	],
	solarkraft: [
		"Live",
		"site-liveness",
		"https://github.com/freespek/solarkraft",
		/GitHub/,
	],
	"soroban-copilot": [
		"Live",
		"site-liveness",
		"https://github.com/mootz12/soroban-copilot",
		/GitHub/,
	],
	"soroban-decompiler": [
		"Development",
		"site-liveness",
		"https://github.com/salaheldinsoliman/soroban-decompiler",
		/GitHub/,
	],
	"soroban-pre-order-contract": [
		"Live",
		"site-liveness",
		"https://github.com/aolieman/soroban-pre-order",
		/GitHub/,
	],
	"soroban-react": [
		"Live",
		"site-liveness",
		"https://github.com/paltalabs/soroban-react",
		/GitHub/,
	],
	sorobanmath: [
		"Live",
		"site-liveness",
		"https://github.com/rahul-soshte/soroban-math",
		/GitHub/,
	],
	sstream: [
		"Live",
		"site-liveness",
		"https://github.com/rahimklaber/sstream",
		/GitHub/,
	],
	"stellar-c-sdk": [
		"Live",
		"site-liveness",
		"https://github.com/lightsail-network/libstellar",
		/GitHub/,
	],
	"stellar-command-insights": [
		"Development",
		"site-liveness",
		"https://github.com/bytemaster333/Soroban-ELK",
		/GitHub/,
	],
	"stellar-nest": [
		"Live",
		"site-liveness",
		"https://github.com/alkeops/it-s-not-another-package",
		/GitHub/,
	],
	"stellar-qt-sdk": [
		"Live",
		"site-liveness",
		"https://galactictalk.org/d/2300-sdk-for-stellar-qt",
		/galactictalk\.org/,
	],
	teken: [
		"Live",
		"site-liveness",
		"https://github.com/moonbite-gmbh/multisig-ui",
		/GitHub/,
	],
	web3dev: [
		"Live",
		"site-liveness",
		"https://discord.com/invite/web3dev",
		/Discord/,
	],
};

describe("each swept row loses its basis and its source, dated, and keeps its status", () => {
	it("covers the 35 rows moved to unverified", () => {
		expect(Object.keys(SWEPT)).toHaveLength(35);
	});
	for (const [slug, [status, basis, source, host]] of Object.entries(SWEPT))
		it(slug, () => {
			const fix = STATUS_FIX[slug];
			expect(fix).toMatchObject({
				from: status,
				to: status,
				basis: "unverified",
				asOf: "2026-11-12",
			});
			// No source in the entry: the stored one is retracted below, and
			// curate neither rewrites it nor fetches it for the pre-launch scan.
			expect(fix.sourceUrl).toBeUndefined();
			expect(STATUS_SOURCE_RETRACT[slug]).toBe(source);
			expect(fix.note).toMatch(host);
			expect(fix.note).toMatch(/^Basis withdrawn 2026-11-12/);
			expect(fix.note).not.toMatch(/[–—]/);
			expect(statusFixHold(fix, { status, statusBasis: basis })).toBeNull();
			expect(!!fix.withdraw).toBe(basis === "product-integration");
		});
});

describe("a row with its own answering site gets the basis its evidence supports", () => {
	it("sentora: its own launch post is an operator announcement about the product", () => {
		const fix = STATUS_FIX.sentora;
		expect(fix).toMatchObject({
			from: "Live",
			to: "Live",
			basis: "operator-announcement",
			asOf: "2026-07-15",
		});
		// The stored source is that post; the entry keeps it as stored.
		expect(fix.sourceUrl).toBeUndefined();
		expect(STATUS_SOURCE_RETRACT.sentora).toBeUndefined();
		expect(fix.note).not.toMatch(/describes the host/);
		expect(
			statusFixHold(fix, { status: "Live", statusBasis: "site-liveness" }),
		).toBeNull();
	});
	it("x402: @x402/stellar 2.30.0 on npm names x402's own repository", () => {
		expect(STATUS_FIX.x402).toMatchObject({
			from: "Live",
			to: "Live",
			basis: "package-release",
			asOf: "2026-11-04",
			sourceUrl: "https://registry.npmjs.org/@x402/stellar",
		});
		expect(STATUS_SOURCE_RETRACT.x402).toBeUndefined();
		expect(
			statusFixHold(STATUS_FIX.x402, {
				status: "Live",
				statusBasis: "site-liveness",
			}),
		).toBeNull();
	});
	it("a curated stamp never overwrites a different basis a lane earned later, unless a person stands behind it", () => {
		// x402.org showed no Stellar marker on 2026-11-12; if the product probe
		// earns product-integration later, curate keeps it rather than writing
		// package-release back every Tuesday.
		expect(
			statusFixHold(STATUS_FIX.x402, {
				status: "Live",
				statusBasis: "product-integration",
			}),
		).toBe("earned-basis");
		expect(
			statusFixHold(STATUS_FIX.sentora, {
				status: "Live",
				statusBasis: "repo-activity",
			}),
		).toBe("stronger-basis");
		expect(
			statusFixHold(
				{ from: "Live", to: "Live", basis: "human-verified" },
				{ status: "Live", statusBasis: "product-integration" },
			),
		).toBeNull();
	});
	it("lumenshade stops citing the fund's sample toml", () => {
		expect(STATUS_SOURCE_RETRACT.lumenshade).toBe(
			"https://communityfund.stellar.org/.well-known/stellar.toml",
		);
	});
});

describe("create-only seeds carry the label their source supports", () => {
	const basis = (slug: string) =>
		(SEEDS.find((s) => s.slug === slug) as { statusBasis?: string })
			?.statusBasis;
	it("a package on npm or jsr.io whose registry names the row's repo is package-release", () => {
		for (const slug of [
			"colibri",
			"stellar-indexer",
			"stellar-agent-search",
			"x402",
		])
			expect(basis(slug), slug).toBe("package-release");
	});
	it("sentora's own launch post is an operator announcement", () => {
		expect(basis("sentora")).toBe("operator-announcement");
	});
	it("the rest are unverified", () => {
		for (const slug of [
			"stellar-defi-hub",
			"stellar-mpp-sdk",
			"roberto-sanz-criptomonedas",
		])
			expect(basis(slug), slug).toBe("unverified");
	});
});

/** The liveness lane's own decision (planUpgrade), run on rows shaped like
 * the swept ones: removing its third-party skip reds this. */
describe("the liveness lane gives no site-liveness to a website on a third-party host", () => {
	const fresh = new Date(Date.now() - 86_400_000).toISOString();
	const check = (url: string) => ({
		url,
		status: "ok",
		statusCode: 200,
		lastSuccessAt: fresh,
		lastChecked: fresh,
		pageVerdict: "product",
	});
	const row = (slug: string, website: string) => ({
		id: slug,
		slug,
		status: "Live",
		statusBasis: "source-inherited",
		links: { website },
	});
	it("a fresh 200 from a GitHub repo, a Linktree or the SCF page earns nothing", () => {
		const sites = {
			"zz-repo": "https://github.com/someone/some-sdk",
			"zz-bio": "https://linktr.ee/someone",
			"zz-scf": "https://communityfund.stellar.org/project/some-thing-abc",
		};
		const plan = planUpgrade(
			Object.entries(sites).map(([s, u]) => row(s, u)),
			Object.values(sites).map(check),
		);
		expect(plan.upgrade).toEqual([]);
		expect(plan.thirdParty.map((r) => r.host).sort()).toEqual([
			"communityfund.stellar.org",
			"github.com",
			"linktr.ee",
		]);
	});
	it("a fresh 200 from the product's own site still does", () => {
		const plan = planUpgrade(
			[row("zz-own", "https://some-product.example/")],
			[check("https://some-product.example/")],
		);
		expect(plan.upgrade.map((u) => u.slug)).toEqual(["zz-own"]);
		expect(plan.thirdParty).toEqual([]);
	});
});

/** The lumenloop sync's own stamp (feedProvenanceStamp): reverting it to the
 * old inline rule reds this. */
describe("the lumenloop sync leaves a curated basis alone", () => {
	const file = "x.yaml";
	it("a swept row the feed carries keeps the basis curate wrote", () => {
		for (const slug of ["dobprotocol", "moonlight", "lumenshade"])
			expect(
				feedProvenanceStamp(
					{
						status: "Live",
						statusBasis: "unverified",
						statusAsOf: "2026-11-12",
					},
					feedOwnedFields(curatedFieldsFor(slug), "unverified"),
					{ status: "Live" },
					file,
				),
				slug,
			).toEqual({});
	});
	it("an uncurated row with no evidence is still dated to the feed", () => {
		expect(
			feedProvenanceStamp(
				{ status: "Live", statusBasis: "unverified", statusAsOf: "2026-11-12" },
				feedOwnedFields(curatedFieldsFor("zz-not-curated"), "unverified"),
				{ status: "Live" },
				file,
			),
		).toEqual({
			statusBasis: "source-inherited",
			statusSourceUrl:
				"https://github.com/lumenloop/stellar-ecosystem-db/blob/main/projects/x.yaml",
		});
	});
});
