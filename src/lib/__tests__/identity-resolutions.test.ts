/**
 * Identity resolutions of 2026-11-12: rows the audit found sharing a site, a
 * repo or a GitHub account. Each was decided from the project's own site,
 * repo, README and SCF page (see the comments beside each map entry). Merge
 * only when two rows are the same product; otherwise fix the shared or wrong
 * link and keep both rows, since a wrong merge deletes a real project.
 *
 * DUPE_MERGES lives inside scripts/data/curate-projects.ts, so the merge half
 * drives that script with a fake Payload (the curate-waslive-callsites
 * harness) and reads its dry-run plan.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ALIAS_ADD,
	curatedFieldsFor,
	DESCRIPTION_FIXES,
	GITHUB_LINK_FIX,
	GITHUB_LINK_REMOVE,
	GITHUB_REPOS_ADD,
	GITHUB_REPOS_SET,
	NAME_FIXES,
	OWNERSHIP_COVERAGE,
	SEEDS,
	STATUS_FIX,
	STATUS_SOURCE_RETRACT,
	statusFixHold,
	TWITTER_LINK_FIX,
	WEBSITE_FIXES,
} from "../../../scripts/data/curation-maps";

// biome-ignore lint/suspicious/noExplicitAny: fake Payload rows
type Row = Record<string, any>;
const state: { rows: Row[]; updates: Array<{ id: string; data: Row }> } = {
	rows: [],
	updates: [],
};

vi.mock("../../../scripts/load-env", () => ({}));
vi.mock("../../payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("payload", () => ({
	getPayload: async () => ({
		// biome-ignore lint/suspicious/noExplicitAny: Payload query shape
		find: async ({ collection, where }: any) => {
			const want = where?.slug?.equals;
			const docs =
				collection === "projects" && typeof want === "string"
					? state.rows.filter((r) => r.slug === want)
					: [];
			return { docs, totalDocs: docs.length };
		},
		findByID: async ({ id }: { id: string }) =>
			state.rows.find((r) => r.id === id),
		update: async (a: { id: string; data: Row }) => {
			state.updates.push({ id: a.id, data: a.data });
			return {};
		},
		create: async () => ({}),
	}),
}));

class Exit extends Error {}

/** Runs the curate pass once and returns what it printed. */
async function curate(rows: Row[], execute: boolean): Promise<string[]> {
	state.rows = rows;
	state.updates = [];
	const lines: string[] = [];
	const argv = process.argv;
	process.argv = execute ? [...argv, "--execute"] : [...argv];
	vi.spyOn(console, "log").mockImplementation((...a) => {
		lines.push(a.join(" "));
	});
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.stubGlobal("fetch", async () => new Response("", { status: 200 }));
	let finish: () => void = () => {};
	const exited = new Promise<void>((r) => {
		finish = r;
	});
	let calls = 0;
	vi.spyOn(process, "exit").mockImplementation(() => {
		if (calls++ === 0) {
			finish();
			throw new Exit();
		}
		return undefined as never;
	});
	vi.resetModules();
	try {
		await import("../../../scripts/data/curate-projects");
		await exited;
	} finally {
		process.argv = argv;
	}
	return lines;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const scf = (slug: string, rounds: number[], total: number) => ({
	awarded: true,
	slug,
	sourceUrl: `https://communityfund.stellar.org/project/${slug}`,
	totalAwarded: total,
	awardedRounds: rounds,
	basis: "official-record",
	asOf: "2026-11-12",
});
const row = (slug: string, extra: Row = {}): Row => ({
	id: `id-${slug}`,
	slug,
	name: slug,
	status: "Live",
	links: {},
	github: { repos: [] },
	scf: {},
	...extra,
});

/** Same product twice: [shadow, canonical, does the award move]. */
const MERGES: Array<[string, string, boolean]> = [
	["safu-protocol", "safu", true],
	["cryptix", "stellar-token-launchpad", false],
	["net-sdk", "net-stellar-sdk", true],
	["ios-mac-stellar-sdk", "ios-stellar-sdk", false],
	["lusty-finance", "lusty", true],
	["autowhale", "renesis", true],
	["stellar-vrf", "vrf-soroban", false],
	["soroban-elk", "stellar-command-insights", false],
];
/** One maker, two products: never folded. */
const KEPT_APART = [
	["estrela", "allbridge"],
	["inference", "inferera"],
	["octarine", "mystic"],
	["chaincerts", "chaincred"],
	["catalyst", "chef"],
	["rampmedaddy", "wellspring"],
	["pakananet", "stellar-razor-and-blazor-suite"],
];

function rows(): Row[] {
	const out: Row[] = [];
	for (const [dupe, canonical, award] of MERGES) {
		out.push(
			row(dupe, award ? { scf: scf(`${dupe}-page`, [44], 30000) } : {}),
			row(canonical),
		);
	}
	for (const pair of KEPT_APART) for (const s of pair) out.push(row(s));
	const set = (slug: string, extra: Row) => {
		const r = out.find((x) => x.slug === slug);
		if (r) Object.assign(r, extra);
		else out.push(row(slug, extra));
	};
	set("estrela", {
		links: { github: "https://github.com/allbridge-io/allbridge-core-js-sdk" },
		github: {
			orgLogin: "allbridge-io",
			repos: [
				{ owner: "allbridge-io", name: "allbridge-core-js-sdk" },
				{ owner: "allbridge-io", name: "dex-soroban-contracts" },
			],
		},
	});
	set("catalyst", {
		links: { github: "https://github.com/stellar-chef/stellar-chef" },
		github: {
			orgLogin: "stellar-chef",
			repos: [{ owner: "stellar-chef", name: "stellar-chef" }],
		},
	});
	set("wellspring", {
		github: {
			orgLogin: "trustek-io",
			repos: [
				{ owner: "trustek-io", name: "wellspring-mvp-treasurymanagement" },
				{ owner: "trustek-io", name: "rampmedaddy-frontend" },
			],
		},
	});
	set("moneygram", {
		links: {
			github: "https://github.com/stellar/moneygram-access-wallet-mvp",
		},
		github: {
			orgLogin: "stellar",
			repos: [{ owner: "stellar", name: "moneygram-access-wallet-mvp" }],
		},
	});
	// Already at the target, in another case: the set must read as done.
	set("pakananet", {
		links: {
			github: "https://github.com/lockb0x-llc/pakana-stellar-razor-components",
		},
		github: {
			orgLogin: "lockb0x-llc",
			repos: [
				{ owner: "lockb0x-llc", name: "pakana-stellar-razor-components" },
			],
		},
	});
	set("stellar-razor-and-blazor-suite", {
		types: ["SDK"],
		links: {
			github: "https://github.com/lockb0x-llc/Pakana-Stellar-Razor-Components",
		},
		github: {
			orgLogin: "lockb0x-llc",
			repos: [
				{ owner: "lockb0x-llc", name: "pakana-stellar-razor-components" },
			],
		},
	});
	// Already at the target, in another case: the set must read as done.
	set("chaincred", {
		links: { github: "https://github.com/Prince29chouhan/ChainCred" },
		github: {
			orgLogin: "prince29chouhan",
			repos: [{ owner: "prince29chouhan", name: "chaincred" }],
		},
	});
	set("vrf-soroban", {
		status: "Development",
		statusBasis: "human-verified",
	});
	set("stellar-registry", {
		github: {
			orgLogin: "theahaco",
			repos: [
				{ owner: "theahaco", name: "scaffold-stellar" },
				{ owner: "stellar-registry", name: "contracts" },
				{ owner: "stellar-registry", name: "cli" },
			],
		},
	});
	// The canonical keeps its human Inactive verdict.
	set("stellar-token-launchpad", {
		status: "Inactive",
		statusBasis: "human-verified",
		statusSourceUrl: "https://tokenlaunchpad.eu/",
	});
	set("allbridge", {});
	return out;
}

describe("the 2026-11-12 duplicate merges", () => {
	it("folds each same-product pair onto its canonical row", async () => {
		const lines = await curate(rows(), false);
		for (const [dupe, canonical] of MERGES)
			expect(
				lines.some((l) =>
					l.startsWith(`  ${dupe}: → shadow of ${canonical} (`),
				),
				`${dupe} → ${canonical}`,
			).toBe(true);
	});

	it("moves the award with the fold where only the shadow held one", async () => {
		const lines = await curate(rows(), false);
		for (const [dupe, canonical, award] of MERGES)
			expect(
				lines.some((l) =>
					l.startsWith(`  ${canonical}: SCF record ← ${dupe} (`),
				),
				`${dupe} → ${canonical}`,
			).toBe(award);
	});

	it("never folds two products of one maker", async () => {
		const lines = await curate(rows(), false);
		for (const pair of KEPT_APART)
			for (const s of pair)
				expect(
					lines.filter((l) => l.startsWith(`  ${s}: → shadow of `)),
					s,
				).toEqual([]);
	});

	it("parks the shadow at Draft and leaves the canonical's status alone", async () => {
		await curate(rows(), true);
		const shadow = state.updates.find((u) => u.id === "id-cryptix");
		expect(shadow?.data).toMatchObject({
			canonicalSlug: "stellar-token-launchpad",
			status: "Draft",
		});
		const canon = state.updates.filter(
			(u) => u.id === "id-stellar-token-launchpad",
		);
		expect(canon.some((u) => "status" in u.data)).toBe(false);
	});
});

describe("links shared by two products move to the right one", () => {
	it("each pair's wrong link is replaced or removed, value-guarded", async () => {
		const lines = await curate(rows(), false);
		expect(lines).toContain(
			"  estrela: github https://github.com/allbridge-io/allbridge-core-js-sdk → https://github.com/allbridge-io/dex-soroban-contracts",
		);
		expect(lines).toContain(
			"  catalyst: github REMOVED (was https://github.com/stellar-chef/stellar-chef)",
		);
		expect(lines).toContain(
			"  moneygram: github REMOVED (was https://github.com/stellar/moneygram-access-wallet-mvp)",
		);
	});

	it("the github group follows, so no project keeps claiming a repo it lost", async () => {
		const lines = await curate(rows(), false);
		expect(lines).toContain(
			"  wellspring: github {orgLogin trustek-io, repos trustek-io/wellspring-mvp-treasurymanagement trustek-io/rampmedaddy-frontend} → {orgLogin trustek-io, repos trustek-io/wellspring-mvp-treasurymanagement}",
		);
		expect(lines).toContain(
			"  moneygram: github {orgLogin stellar, repos stellar/moneygram-access-wallet-mvp} → {orgLogin (none), repos (none)}",
		);
		expect(lines).toContain(
			"  catalyst: github {orgLogin stellar-chef, repos stellar-chef/stellar-chef} → {orgLogin (none), repos (none)}",
		);
		expect(lines).toContain(
			"  estrela: github {orgLogin allbridge-io, repos allbridge-io/allbridge-core-js-sdk allbridge-io/dex-soroban-contracts} → {orgLogin allbridge-io, repos allbridge-io/dex-soroban-contracts}",
		);
		// GitHub logins are case-insensitive: a case difference is no write.
		expect(lines).toContain("  chaincred: github group already set, skip");
	});

	it("the repo a row lost is claimed by its own project, so the next repo pass rejoins it", async () => {
		const lines = await curate(rows(), false);
		// theahaco/attest-contract now answers 301 to stellar-registry/actions:
		// listed under its old path, the repo pass finds the stored row and
		// rewrites it under the new name and the registry's slug.
		expect(lines).toContain(
			"  stellar-registry: github.repos +theahaco/attest-contract",
		);
		expect(lines).toContain(
			"  allbridge: github.repos +allbridge-io/allbridge-core-js-sdk",
		);
	});

	it("a group set owns the github group, so the feed sync cannot put a lost repo back", () => {
		expect(OWNERSHIP_COVERAGE.map((c) => c.name)).toContain("GITHUB_REPOS_SET");
		for (const slug of Object.keys(GITHUB_REPOS_SET))
			expect(curatedFieldsFor(slug), slug).toContain("github");
	});

	it("the github group set matches the link each row ends with", () => {
		for (const [slug, g] of Object.entries(GITHUB_REPOS_SET)) {
			if (slug in GITHUB_LINK_REMOVE) {
				expect(g, slug).toEqual({ orgLogin: null, repos: [] });
				continue;
			}
			const link = GITHUB_LINK_FIX[slug];
			if (!link) continue;
			const [owner, name] = link.replace("https://github.com/", "").split("/");
			expect(g.orgLogin?.toLowerCase(), slug).toBe(owner.toLowerCase());
			if (name)
				expect(
					g.repos.map((r) => `${r.owner}/${r.name}`.toLowerCase()),
					slug,
				).toContain(`${owner}/${name}`.toLowerCase());
		}
	});

	it("names each link fix after the evidence-tied target", () => {
		expect(GITHUB_LINK_FIX.estrela).toBe(
			"https://github.com/allbridge-io/dex-soroban-contracts",
		);
		expect(GITHUB_LINK_FIX.chaincred).toBe(
			"https://github.com/Prince29chouhan/ChainCred",
		);
		expect(GITHUB_LINK_FIX.inferera).toBe(
			"https://github.com/Inferara/soroban-ret",
		);
		expect(GITHUB_LINK_FIX.pretium).toBe(
			"https://github.com/derrickbundi/pretium-mcp",
		);
		expect(WEBSITE_FIXES.inference).toBe("https://inference-lang.org/");
		expect(TWITTER_LINK_FIX.lusty).toBe("https://x.com/Lustyfinance");
		expect(GITHUB_REPOS_ADD.allbridge).toContainEqual({
			owner: "allbridge-io",
			name: "allbridge-core-js-sdk",
		});
	});
});

describe("a status that rested on another product's evidence is withdrawn", () => {
	it("estrela's rested on the Allbridge Core bridge SDK", () => {
		expect(STATUS_FIX.estrela).toMatchObject({
			from: "Live",
			to: "Live",
			basis: "unverified",
			withdraw: true,
		});
		expect(
			statusFixHold(STATUS_FIX.estrela, {
				status: "Live",
				statusBasis: "repo-activity",
			}),
		).toBeNull();
		expect(STATUS_SOURCE_RETRACT.estrela).toBe(
			"https://github.com/allbridge-io/allbridge-core-js-sdk",
		);
	});
	it("mystic's rested on Octarine's repo", () => {
		expect(STATUS_FIX.mystic).toMatchObject({
			from: "Development",
			to: "Development",
			basis: "unverified",
			withdraw: true,
			replaceNote: true,
		});
		expect(STATUS_SOURCE_RETRACT.mystic).toBe(
			"https://github.com/mystic-finance/Stellar-RFQ/blob/main/docs/MILESTONE_1.md",
		);
	});
});

describe("Inferera is Inferara's Soroban decompiler, under its own name", () => {
	it("renamed, with the old spelling kept as an alias", () => {
		expect(NAME_FIXES.inferera).toBe("soroban-ret");
		expect(ALIAS_ADD.inferera).toEqual(
			expect.arrayContaining(["Inferara", "Inferera"]),
		);
	});
	it("describes the decompiler, not the Inference language", () => {
		expect(DESCRIPTION_FIXES.inferera).toMatch(/decompil/i);
		expect(DESCRIPTION_FIXES.inferera).not.toMatch(/specification language/);
	});
});

describe("kedgeway is seeded from its npm release", () => {
	const seed = SEEDS.find((s) => s.slug === "kedgeway");
	it("a Live tooling row on package-release, citing the registry record", () => {
		expect(seed).toMatchObject({
			name: "kedgeway",
			category: "Tooling",
			status: "Live",
			types: ["SDK"],
			supportedNetworks: [],
			statusBasis: "package-release",
			statusAsOf: "2026-11-12",
			statusSourceUrl: "https://registry.npmjs.org/kedgeway",
			links: {
				website: "https://kedgeway.vercel.app/",
				github: "https://github.com/Klorenn/kedgeway",
			},
		});
	});
	it("the dry run plans its create", async () => {
		const lines = await curate(rows(), false);
		expect(lines).toContain("  kedgeway: CREATE (Live, SDK)");
	});
});

/** The GitHub link a row ends with once the maps apply to its stored one. */
const endLink = (slug: string, stored: string): string | null => {
	const norm = (u: string) => u.replace(/\/+$/, "");
	if (
		GITHUB_LINK_REMOVE[slug] &&
		norm(GITHUB_LINK_REMOVE[slug]) === norm(stored)
	)
		return null;
	return GITHUB_LINK_FIX[slug] ?? stored;
};
/** enrich-repos fans a bare owner link (github.com/<login>) out to every
 * repo that owner holds (orgLoginOf); a repo link it does not. */
const fansOut = (link: string | null) =>
	!!link && /^https?:\/\/(www\.)?github\.com\/[^/\s]+\/?$/i.test(link);

describe("Pakana.Net publishes no repo of its own (gate M2)", () => {
	const stored =
		"https://github.com/lockb0x-llc/pakana-stellar-razor-components";
	it("its link is removed, not pointed at the company org", () => {
		expect(endLink("pakananet", stored)).toBeNull();
		expect(fansOut(endLink("pakananet", stored))).toBe(false);
		// The org link would have fanned out to all 29 of lockb0x-llc's repos.
		expect(fansOut("https://github.com/lockb0x-llc")).toBe(true);
		expect(GITHUB_REPOS_SET.pakananet).toEqual({ orgLogin: null, repos: [] });
	});
	it("the Razor suite keeps its own repo and gets no write", async () => {
		const lines = await curate(rows(), false);
		expect(lines).toContain(`  pakananet: github REMOVED (was ${stored})`);
		expect(
			lines.filter(
				(l) =>
					l.startsWith("  stellar-razor-and-blazor-suite:") &&
					!l.endsWith("skip"),
			),
		).toEqual([]);
		await curate(rows(), true);
		expect(
			state.updates.filter((u) => u.id === "id-stellar-razor-and-blazor-suite"),
		).toEqual([]);
	});
});

describe("VRF-Soroban runs on mainnet (gate B2)", () => {
	it("a dated, sourced Live verdict from the chain", () => {
		expect(STATUS_FIX["vrf-soroban"]).toMatchObject({
			from: "Development",
			to: "Live",
			basis: "human-verified",
			asOf: "2026-11-12",
			sourceUrl:
				"https://horizon.stellar.org/transactions/5f1f72ba18ec312ab3a033905a2687ec2b56d33606b008f2499c92928bc82f51",
		});
		expect(STATUS_FIX["vrf-soroban"].note).toContain(
			"CAW6KECQMHRTX2GS3JVHWBMOB5JNNOHNOCE635RQS4SWJ72YF56EUPRX",
		);
	});
	it("the dry run moves it while folding stellar-vrf into it", async () => {
		const lines = await curate(rows(), false);
		expect(lines).toContain("  vrf-soroban: status Development → Live");
		expect(
			lines.some((l) =>
				l.startsWith("  stellar-vrf: → shadow of vrf-soroban ("),
			),
		).toBe(true);
	});
});

describe("gate lows", () => {
	it("soroban-ret rests on its crates.io release, not the maker's site", () => {
		expect(STATUS_FIX.inferera).toMatchObject({
			from: "Live",
			to: "Live",
			basis: "package-release",
			asOf: "2026-07-26",
			sourceUrl: "https://crates.io/api/v1/crates/soroban-ret",
		});
	});
	it("stellar-command-insights carries the site its SCF page names", () => {
		expect(WEBSITE_FIXES["stellar-command-insights"]).toBe(
			"https://voluble-fairy-844611.netlify.app/",
		);
	});
	it("an exact group set and an additive repo list never name the same row", () => {
		const both = Object.keys(GITHUB_REPOS_SET).filter(
			(s) => s in GITHUB_REPOS_ADD,
		);
		expect(both).toEqual([]);
	});
});
