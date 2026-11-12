/**
 * sls-111: SCF's #45 round page lists 40 awards (read 2026-11-11) and the
 * directory carried 28. The twelve awardees with no row are seeded in SEEDS
 * (scripts/data/curation-maps.ts) and joined to their own SCF page by slug in
 * SCF_SLUG_OVERRIDES (scripts/data/scf-joins.ts), never by name: most rows are
 * named for the product, not the SCF title. enrich-scf writes their SCF fields.
 */
import { describe, expect, it } from "vitest";
import {
	ALIAS_ADD,
	curatedFieldsFor,
	SEEDS,
	SUPPORTED_NETWORKS,
	WEBSITE_REMOVE,
	WEBSITE_REMOVE_DEAD,
} from "../../../scripts/data/curation-maps";
import {
	type JoinRow,
	matchListingRow,
	SCF_SLUG_OVERRIDES,
} from "../../../scripts/data/scf-joins";
import { uniqueNames } from "../../../scripts/eval/scf-official";

const PAGE = "https://communityfund.stellar.org/project/";

/** SCF page slug, the listing's title for it, our seed's slug. */
const AWARDEES: Array<[string, string, string]> = [
	["pollar-nqe", "Pollar", "pollar"],
	["pods-dxl", "Pods", "pods"],
	[
		"agentsmith-x402-stellar-facilitator-and-bazaar-discovery-kdw",
		"AgentSmith x402: Stellar Facilitator and Bazaar Discovery",
		"agentsmith-x402",
	],
	["cara7-yyx", "Cara7", "cara7"],
	["astrolabe-bzg", "Astrolabe", "astrolabe"],
	["onboard-kvj", "Onboard", "onboard"],
	["nila-fwc", "Nila", "nila"],
	["principal-vzt", "Principal", "principal-protocol"],
	[
		"zkella-protocol-compliance-ready-confidential-finance-infrastructure-for-stellar-sib",
		"ZKELLA Protocol - Compliance-Ready Confidential Finance Infrastructure for Stellar",
		"zkella",
	],
	["canary-protocol-y4l", "Canary Protocol", "canary-protocol"],
	["fermah-pay-w3c", "Fermah Pay", "fermah-pay"],
	[
		"open-rwa-vault-infrastructure-nis",
		"Open RWA Vault Infrastructure",
		"strata",
	],
];

const seed = (slug: string) => SEEDS.find((s) => s.slug === slug);

describe("the twelve SCF #45 awardees with no row are seeded (sls-111)", () => {
	it("each seed cites its own SCF page and claims no more than the team said", () => {
		for (const [page, , slug] of AWARDEES) {
			const s = seed(slug);
			expect(s, slug).toBeDefined();
			expect(s?.statusSourceUrl, slug).toBe(PAGE + page);
			expect(s?.statusBasis, slug).toBe("operator-announcement");
			expect(s?.statusAsOf, slug).toBe("2026-11-11");
			// an award still disbursing is not a live Stellar product
			expect(["Development", "Pre-Release"], slug).toContain(s?.status);
			// a stored list is served as complete ("curated")
			expect(s?.supportedNetworks, slug).toEqual([]);
			// one field, one writer: the SCF fields are enrich-scf's
			expect(s && "scf" in s, slug).toBe(false);
		}
	});

	it("each joins its page by slug, even where a row by the SCF title's name exists", () => {
		const rows: JoinRow[] = [
			...SEEDS.map((s) => ({ slug: s.slug, name: s.name, links: s.links })),
			// rows a name matcher could take: the 2026-11-04 absence diff filed
			// Onboard under OnBoarding Club and AgentSmith x402 under x402
			{ slug: "onboarding-club", name: "OnBoarding Club" },
			{ slug: "x402", name: "x402" },
			{ slug: "principal-decoy", name: "Principal" },
			{ slug: "vault-decoy", name: "Open RWA Vault Infrastructure" },
			{
				slug: "beamable",
				name: "Beamable",
				links: { website: "https://beamable.com/" },
			},
		];
		const bySlug = new Map(rows.map((r) => [r.slug, r]));
		const index = {
			rows,
			bySlug,
			identityOf: (r: JoinRow) => r.slug,
			byNormName: uniqueNames(rows, (r: JoinRow) => r.slug),
		};
		for (const [page, title, slug] of AWARDEES) {
			expect(SCF_SLUG_OVERRIDES[page], page).toBe(slug);
			expect(matchListingRow({ slug: page, title }, index)?.slug, page).toBe(
				slug,
			);
		}
		// "Onboard" is a word-prefix of Beamable's #38 title: the new row must
		// not take that page from the project it belongs to
		expect(
			matchListingRow(
				{
					slug: "onboard-game-devs-with-beamable-m5q",
					title: "Onboard Game Devs with Beamable",
				},
				index,
			)?.slug,
		).toBe("beamable");
	});

	it("a seed with no site is one whose SCF site is dead or a person's, and the enrich never fills it", () => {
		const unusable: Record<string, string | undefined> = {
			astrolabe: WEBSITE_REMOVE_DEAD.astrolabe, // a removed deployment
			zkella: WEBSITE_REMOVE_DEAD.zkella, // answers 404
			// a repository under a person's GitHub account: live, not the project's
			"principal-protocol": WEBSITE_REMOVE["principal-protocol"],
		};
		for (const [slug, site] of Object.entries(unusable)) {
			expect(seed(slug)?.links, slug).toEqual({});
			expect(site, slug).toMatch(/^https:\/\//);
			expect(curatedFieldsFor(slug).has("links.website"), slug).toBe(true);
		}
	});

	it("aliases add the product's other name and the SCF project title a slug join makes an identity", () => {
		expect(ALIAS_ADD.pods).toContain("Deframe");
		expect(ALIAS_ADD["principal-protocol"]).toContain("Principal");
		// SCF's project titles for pages joined by slug: Raven resolved both
		// and got found: false
		expect(ALIAS_ADD.strata).toEqual([
			"Open RWA Vault Infrastructure",
			"Open RWA Vault",
		]);
		expect(SCF_SLUG_OVERRIDES["open-rwa-vault-infrastructure-nis"]).toBe(
			"strata",
		);
		expect(ALIAS_ADD.slimepay).toEqual([
			"The Merchant Settlement Rail for Africa",
		]);
		expect(
			SCF_SLUG_OVERRIDES["the-merchant-settlement-rail-for-africa-bzf"],
		).toBe("slimepay");
	});
});

describe("the 2026-09-15 SCF #45 seeds claim no complete network list (sls-111)", () => {
	// Stored ["stellar"] is served with networksBasis "curated", which the
	// spec reads as complete: false for Minisend (EVM chains and Solana).
	const NINE = [
		"balance",
		"micro-be",
		"catlog",
		"urbanflip",
		"lunar-finance",
		"haven",
		"enable",
		"minisend",
		"bwb",
	];
	it("the map curate-projects applies clears each stored list, since a seed only ever creates", () => {
		// exact-sync: an empty entry writes [], and the API then derives the
		// list from evidence (allbridge since 2026-10-23)
		for (const slug of NINE) expect(SUPPORTED_NETWORKS[slug], slug).toEqual([]);
		// and only these nine beside the two cleared before them
		expect(
			Object.entries(SUPPORTED_NETWORKS)
				.filter(([, nets]) => nets.length === 0)
				.map(([slug]) => slug)
				.sort(),
		).toEqual([...NINE, "allbridge", "estrela"].sort());
	});
	it("no seed literal would store the list again", () => {
		for (const slug of NINE)
			expect(seed(slug)?.supportedNetworks, slug).toEqual([]);
	});
});
