import { afterEach, describe, expect, it, vi } from "vitest";
import { CURATED_BUILD_LINKS } from "@/data/curated-build-links";
import {
	CURATED_HACKATHONS,
	CURATED_WINNERS_NOTES,
} from "@/data/curated-hackathons";
import {
	indexProjectNames,
	indexProjectOwners,
	indexProjectRepos,
	indexProjectSites,
	indexProjectSlugs,
	LINK_BASES,
	type LinkedProject,
	linkBuild,
	namedCandidate,
	type ProjectRepoRow,
	parseBuildId,
	withCuratedLink,
} from "@/lib/hackathon-build-links";
import { indexedFromStored } from "@/lib/hackathon-builds";
import { spec } from "@/lib/openapi-spec";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => null),
}));
// The curated events as the listing, with no DoraHacks read.
vi.mock("@/lib/integrations/dorahacks", async (orig) => {
	const { CURATED_HACKATHONS: rows } = await import(
		"@/data/curated-hackathons"
	);
	const all = vi.fn(async () => rows.map((h) => ({ ...h })));
	return {
		...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
		fetchAllDoraHacksHackathons: all,
		fetchAllDoraHacksHackathonsChecked: vi.fn(async () => ({
			hackathons: await all(),
			complete: true,
		})),
		fetchHackathonSubmissions: vi.fn(async () => []),
	};
});
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => []),
}));
// A copy the default-note test can take a dated note out of.
vi.mock("@/data/curated-hackathons", async (orig) => {
	const m = await orig<typeof import("@/data/curated-hackathons")>();
	return { ...m, CURATED_WINNERS_NOTES: { ...m.CURATED_WINNERS_NOTES } };
});

// Public directory facts of the two submissions no rule linked (TODO item
// 3, live 1.9.163 on 2026-11-24), and of the row a word alone would name.
const ROWS: ProjectRepoRow[] = [
	{
		slug: "hoops",
		name: "Hoops Finance",
		status: "Pre-Release",
		links: {
			website: "https://hoops.finance/",
			github: "https://github.com/hoops-finance",
			twitter: "https://x.com/hoops_finance",
		},
	},
	{
		slug: "comet",
		name: "Comet",
		status: "Inactive",
		links: {
			website: "https://github.com/cometdex",
			github: "https://github.com/cometdex",
		},
	},
	{
		slug: "juntta",
		name: "Juntta",
		status: "Live",
		links: {
			website: "https://juntta.org/",
			twitter: "https://x.com/junttaperu",
		},
	},
	{ slug: "old-hoops", name: "Hoops", canonicalSlug: "hoops" },
	{ slug: "hidden", name: "Hidden", status: "Draft" },
];
const idx = {
	repos: indexProjectRepos(ROWS),
	sites: indexProjectSites(ROWS),
	owners: indexProjectOwners(ROWS),
};
const COMET = {
	name: "Comet x Hoops Finance",
	githubUrl: "https://github.com/hoops-finance/cometswap",
	repoFullName: "hoops-finance/cometswap",
	demoUrl: "https://comet.hoops.finance",
	isWinner: true,
};
const JUNTTA = {
	name: "Juntta",
	demoUrl: "https://app--juntta-9bf6d029.base44.app",
	isWinner: false,
};

describe("curated build links (TODO item 3)", () => {
	it("no rule links the two named submissions", () => {
		const names = indexProjectNames(ROWS);
		for (const b of [COMET, JUNTTA]) {
			expect(linkBuild(b, idx).project, b.name).toBeNull();
			expect(namedCandidate(b, idx, names), b.name).toBeNull();
		}
	});

	it("records each of the five verified links, with named evidence and a day", () => {
		const byId = new Map(
			CURATED_BUILD_LINKS.map((l) => [l.buildId, l.projectSlug]),
		);
		expect(byId.size).toBe(CURATED_BUILD_LINKS.length);
		expect(Object.fromEntries(byId)).toMatchObject({
			"dorahacks-buidl-27417": "hoops",
			"dorahacks-buidl-30931": "juntta",
			"dorahacks-buidl-27456": "yieldbackcash",
			"dorahacks-buidl-25141": "payzoll",
			"dorahacks-buidl-42656": "clevercon",
		});
		for (const l of CURATED_BUILD_LINKS) {
			expect(parseBuildId(l.buildId), l.buildId).toBe(l.buildId);
			expect(l.evidence.length, l.buildId).toBeGreaterThan(40);
			expect(l.checkedOn, l.buildId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(l.evidence, l.buildId).not.toMatch(/[\u2013\u2014]/);
		}
	});

	it("links a record's project as curated when no rule finds it", () => {
		const slugs = indexProjectSlugs(ROWS);
		for (const [b, slug] of [
			[COMET, "hoops"],
			[JUNTTA, "juntta"],
		] as const) {
			expect(
				withCuratedLink(linkBuild(b, idx).project, slugs.get(slug)),
				b.name,
			).toEqual({
				slug,
				name: slug === "hoops" ? "Hoops Finance" : "Juntta",
				basis: "curated",
			});
		}
	});

	it("keeps a rule's basis on the same project, overrules a rule's other project, and stands aside without a listed project", () => {
		const slugs = indexProjectSlugs(ROWS);
		const byPage: LinkedProject = {
			slug: "hoops",
			name: "Hoops Finance",
			basis: "submission-links-and-name",
		};
		expect(withCuratedLink(byPage, slugs.get("hoops"))).toBe(byPage);
		const other: LinkedProject = {
			slug: "comet",
			name: "Comet",
			basis: "repo",
		};
		expect(withCuratedLink(other, slugs.get("hoops"))?.basis).toBe("curated");
		expect(withCuratedLink(other, slugs.get("gone"))).toBe(other);
		expect(withCuratedLink(null, slugs.get("hidden"))).toBeNull();
		// A duplicate row resolves to its canonical project.
		expect(slugs.get("old-hoops")).toEqual({
			slug: "hoops",
			name: "Hoops Finance",
		});
	});

	it("serves and declares the curated basis", () => {
		expect(LINK_BASES).toContain("curated");
		const served = indexedFromStored({
			id: "x",
			buildId: "dorahacks-buidl-27417",
			name: "Comet x Hoops Finance",
			hackathonSlug: "stellar-hacks-blend",
			hackathonTitle: "Stellar Hacks: Blend",
			url: "https://dorahacks.io/buidl/27417",
			linkCheckedAt: "2026-11-24T00:00:00.000Z",
			projectSlug: "hoops",
			projectName: "Hoops Finance",
			projectLinkBasis: "curated",
			firstSeenAt: "2026-11-24T00:00:00.000Z",
			lastSeenAt: "2026-11-24T00:00:00.000Z",
			updatedAt: "2026-11-24T00:00:00.000Z",
			createdAt: "2026-11-24T00:00:00.000Z",
		});
		expect(served.project?.basis).toBe("curated");
		const basis =
			// biome-ignore lint/suspicious/noExplicitAny: walking the spec object
			(spec as any).paths["/api/hackathons/builds"].get.responses["200"]
				.content["application/json"].schema.properties.builds.items.properties
				.project.properties.basis;
		expect(basis.enum).toContain("curated");
		expect(basis.description).toContain("curated:");
	});
});

const payload = { find: async () => ({ docs: [] }) } as never;
const detail = async (slug: string) => {
	const { getHackathonDetail } = await import("@/lib/hackathon-detail");
	const r = await getHackathonDetail(payload, slug);
	if (!r.found) throw new Error(`no event ${slug}`);
	return JSON.parse(JSON.stringify(r.body));
};

describe("an ended event with no winner on record (TODO item 4)", () => {
	const WATERLOO = "blockchain-innovation-challenge-waterloo-2026";
	afterEach(() => vi.useRealTimers());

	it("never serves a bare 0: every ended curated event with 0 winners says why", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-24T12:00:00Z"));
		// A sweep that checks nothing passes vacuously: count what it checked.
		let checked = 0;
		for (const h of CURATED_HACKATHONS) {
			const { status, stats } = (await detail(h.uname)).hackathon;
			if (status !== "completed" || stats.winners) continue;
			checked++;
			expect(stats.winnersNote, h.uname).toEqual(expect.any(String));
		}
		// Waterloo, Jaipur and Journey to Mastery on 2026-11-24.
		expect(checked).toBeGreaterThanOrEqual(3);
	});

	it("serves Waterloo's dated check of its organizer's page", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-24T12:00:00Z"));
		const { stats } = (await detail(WATERLOO)).hackathon;
		expect(stats.winners).toBe(0);
		expect(stats.winnersNote).toMatch(
			/^Not announced upstream: .*checked 2026-11-24.*not a claim that no one won/,
		);
	});

	it("says its 0 is not a count when no dated note covers it yet", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-24T12:00:00Z"));
		const saved = CURATED_WINNERS_NOTES[WATERLOO];
		delete CURATED_WINNERS_NOTES[WATERLOO];
		try {
			const { stats } = (await detail(WATERLOO)).hackathon;
			expect(stats.winners).toBe(0);
			expect(stats.winnersNote).toMatch(/this 0 is not a count/);
			expect(stats.winnersNote).toMatch(/not a claim that no one won/);
		} finally {
			if (saved) CURATED_WINNERS_NOTES[WATERLOO] = saved;
		}
	});
});
