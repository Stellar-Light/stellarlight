import { describe, expect, it } from "vitest";
import {
	buidlNumbersIn,
	indexProjectNames,
	indexProjectOwners,
	indexProjectRepos,
	indexProjectSites,
	LINK_BASES,
	linkBuild,
	linkChangeLine,
	linkDropReason,
	namedCandidate,
	PAGE_LINK_BASES,
	type ProjectRepoRow,
	pageRuleLink,
	productKeyOf,
	scfPageOf,
	scfSiteUrlsBuidls,
	siteKeyOf,
	xHandleOf,
} from "@/lib/hackathon-build-links";
import { indexedFromStored } from "@/lib/hackathon-builds";
import { pageLinksOf } from "@/lib/integrations/dorahacks";
import { spec } from "@/lib/openapi-spec";

// Directory rows shaped like the two named cases (public project facts
// only) and the traps a name rule has to survive.
const ROWS: ProjectRepoRow[] = [
	{
		slug: "payzoll",
		name: "PayZoll",
		status: "Live",
		links: {
			website: "https://payzoll.finance/",
			github: "https://github.com/payzoll-orgs",
			twitter: "https://x.com/payzoll",
		},
		scf: {
			sourceUrl: "https://communityfund.stellar.org/project/payzoll-v4g",
		},
	},
	{
		slug: "yieldbackcash",
		name: "YieldBack.Cash",
		status: "Live",
		links: {
			website: "https://yieldback.cash/",
			github: "https://github.com/yieldback-cash",
		},
		scf: {
			sourceUrl: "https://communityfund.stellar.org/project/yieldbackcash-enj",
		},
	},
	{
		slug: "blend",
		name: "Blend",
		status: "Live",
		links: {
			website: "https://blend.capital",
			twitter: "https://x.com/blend_capital",
		},
	},
	{ slug: "vesseo", name: "Vesseo", status: "Live", aliases: ["Vibrant"] },
	{ slug: "twin-a", name: "Twin Labs", status: "Live" },
	{ slug: "twin-b", name: "TwinLabs", status: "Development" },
	{ slug: "hidden", name: "Hidden Draft", status: "Draft" },
	{
		slug: "widget-old",
		name: "Widget Classic",
		status: "Draft",
		canonicalSlug: "widget",
	},
	{
		slug: "widget",
		name: "Widget",
		status: "Live",
		links: { website: "https://widget.io" },
		github: { repos: [{ owner: "widget-org", name: "widget" }] },
	},
	{
		slug: "shared-a",
		name: "Shared A",
		status: "Live",
		links: { website: "https://shared.example" },
	},
	{
		slug: "shared-b",
		name: "Shared B",
		status: "Live",
		links: { website: "https://shared.example" },
	},
	{
		slug: "alpha-one",
		name: "Alpha One",
		status: "Live",
		links: { twitter: "https://x.com/sharedx" },
	},
	{
		slug: "beta-two",
		name: "Beta Two",
		status: "Live",
		links: { twitter: "https://twitter.com/SharedX" },
	},
];
const idx = {
	repos: indexProjectRepos(ROWS),
	sites: indexProjectSites(ROWS),
	owners: indexProjectOwners(ROWS),
};
// Lazy, so each test fails on its own where the rule is missing.
const names = () => indexProjectNames(ROWS);
const named = (key: string) => {
	const p = names().get(key);
	if (!p) throw new Error(`fixture: no project named ${key}`);
	return p;
};
const winner = (name: string, extra: Record<string, unknown> = {}) => ({
	name,
	isWinner: true,
	...extra,
});

describe("winner names", () => {
	it("compares names as one product, a trailing chain word aside", () => {
		expect(productKeyOf("PayZoll_Stellar")).toBe("payzoll");
		expect(productKeyOf("YieldBack.Cash")).toBe("yieldbackcash");
		expect(productKeyOf("Widget on Stellar")).toBe("widget");
		expect(productKeyOf("Widget x Soroban")).toBe("widget");
		expect(productKeyOf("Widget (Stellar)")).toBe("widget");
		// Only a trailing chain word goes: a leading one names the product.
		expect(productKeyOf("Stellar Pay")).toBe("stellarpay");
		// Nothing left, or too short to identify anything.
		expect(productKeyOf("Stellar")).toBeNull();
		expect(productKeyOf("Zap on Stellar")).toBeNull();
		expect(productKeyOf("")).toBeNull();
		expect(productKeyOf(null)).toBeNull();
	});

	it("indexes names and aliases; a key two projects carry names neither", () => {
		const n = names();
		expect(n.get("payzoll")).toMatchObject({
			slug: "payzoll",
			name: "PayZoll",
			scfPage: "https://communityfund.stellar.org/project/payzoll-v4g",
			site: "payzoll.finance",
			xHandle: "payzoll",
		});
		expect(n.get("vibrant")?.slug).toBe("vesseo");
		expect(n.get("twinlabs")).toBeNull();
		expect(n.has("hiddendraft")).toBe(false);
		// A duplicate's name resolves to its canonical project, with the
		// canonical project's own facts.
		expect(n.get("widgetclassic")).toMatchObject({
			slug: "widget",
			name: "Widget",
			site: "widget.io",
		});
	});

	it("reads only X profile links as an account", () => {
		expect(xHandleOf("https://x.com/PayZoll")).toBe("payzoll");
		expect(xHandleOf("https://twitter.com/payzoll/")).toBe("payzoll");
		expect(xHandleOf("https://www.x.com/payzoll?s=21")).toBe("payzoll");
		expect(xHandleOf("https://x.com/payzoll/status/123")).toBeNull();
		expect(xHandleOf("https://x.com/intent/follow")).toBeNull();
		expect(xHandleOf("https://x.com/home")).toBeNull();
		expect(xHandleOf("https://payzoll.finance")).toBeNull();
		expect(xHandleOf(null)).toBeNull();
	});

	it("reads an SCF project page link and the submissions a page links", () => {
		expect(
			scfPageOf("https://communityfund.stellar.org/project/payzoll-v4g/"),
		).toBe("https://communityfund.stellar.org/project/payzoll-v4g");
		expect(scfPageOf("https://communityfund.stellar.org/projects")).toBeNull();
		expect(scfPageOf("https://example.org/project/payzoll-v4g")).toBeNull();
		expect(scfPageOf(null)).toBeNull();
		expect(
			[
				...buidlNumbersIn(
					'"analytics":"https://dorahacks.io/buidl/27456"} and dorahacks.io\\/buidl\\/31 and https://dorahacks.io/hackathon/blend',
				),
			].sort(),
		).toEqual(["27456", "31"]);
	});
});

describe("which winners the page rules consider", () => {
	it("a winner no other rule links, named for exactly one project", () => {
		expect(namedCandidate(winner("PayZoll_Stellar"), idx, names())?.slug).toBe(
			"payzoll",
		);
		expect(namedCandidate(winner("Vibrant"), idx, names())?.slug).toBe(
			"vesseo",
		);
	});

	it("never a submission that did not win", () => {
		expect(
			namedCandidate(
				{ name: "PayZoll_Stellar", isWinner: false },
				idx,
				names(),
			),
		).toBeNull();
		expect(
			namedCandidate({ name: "PayZoll_Stellar" }, idx, names()),
		).toBeNull();
	});

	it("never a name two projects carry, or a name no project carries", () => {
		expect(namedCandidate(winner("Twin Labs"), idx, names())).toBeNull();
		expect(
			namedCandidate(winner("Blend Coupon Bond"), idx, names()),
		).toBeNull();
		expect(namedCandidate(winner("Hidden Draft"), idx, names())).toBeNull();
	});

	it("never a winner another rule links or finds ambiguous", () => {
		// The controls: with nothing else to go on, both are candidates.
		expect(namedCandidate(winner("Widget"), idx, names())?.slug).toBe("widget");
		expect(namedCandidate(winner("PayZoll"), idx, names())?.slug).toBe(
			"payzoll",
		);
		// Its repo is listed: the repo rule decides, not the name.
		expect(
			namedCandidate(
				winner("Widget", { repoFullName: "widget-org/widget" }),
				idx,
				names(),
			),
		).toBeNull();
		// Its demo site is a site two projects share: unlinked, as before.
		expect(
			namedCandidate(
				winner("PayZoll", { demoUrl: "https://shared.example/app" }),
				idx,
				names(),
			),
		).toBeNull();
	});
});

describe("links the page rules make", () => {
	it("links when the project's SCF page links the submission", () => {
		expect(
			pageRuleLink("dorahacks-buidl-27456", named("yieldbackcash"), {
				scfBuidls: new Set(["27456"]),
				pageLinks: ["https://youtu.be/x"],
			}),
		).toEqual({
			slug: "yieldbackcash",
			name: "YieldBack.Cash",
			basis: "scf-page-and-name",
		});
	});

	it("links when the submission's page lists the project's X account or site", () => {
		const ev = {
			scfBuidls: new Set<string>(),
			pageLinks: ["https://www.payzoll.xyz", "https://x.com/PayZoll"],
		};
		expect(pageRuleLink("dorahacks-buidl-25141", named("payzoll"), ev)).toEqual(
			{
				slug: "payzoll",
				name: "PayZoll",
				basis: "submission-links-and-name",
			},
		);
		expect(
			pageRuleLink("dorahacks-buidl-25141", named("payzoll"), {
				scfBuidls: new Set<string>(),
				pageLinks: ["https://app.payzoll.finance/login"],
			})?.basis,
		).toBe("submission-links-and-name");
	});

	it("links nothing on another site, a post, a shared platform or another number", () => {
		for (const pageLinks of [
			["https://www.payzoll.xyz"],
			["https://x.com/payzoll/status/1"],
			["https://github.com/payzoll-orgs"],
			["https://drive.google.com/drive/folders/abc"],
		])
			expect(
				pageRuleLink("dorahacks-buidl-25141", named("payzoll"), {
					scfBuidls: new Set(["9"]),
					pageLinks,
				}),
			).toBeNull();
	});

	it("a project with no SCF page needs only the submission's page", () => {
		expect(
			pageRuleLink("dorahacks-buidl-5", named("blend"), {
				scfBuidls: null,
				pageLinks: ["https://blend.capital"],
			})?.basis,
		).toBe("submission-links-and-name");
		expect(
			pageRuleLink("dorahacks-buidl-5", named("blend"), {
				scfBuidls: null,
				pageLinks: [],
			}),
		).toBeNull();
	});

	it("a page it could not read decides nothing: a stored page link to the same project is kept", () => {
		const stored = {
			projectSlug: "payzoll",
			projectLinkBasis: "submission-links-and-name",
		};
		// The submission's page was not read this run.
		expect(
			pageRuleLink(
				"dorahacks-buidl-25141",
				named("payzoll"),
				{ scfBuidls: new Set<string>() },
				stored,
			),
		).toEqual({
			slug: "payzoll",
			name: "PayZoll",
			basis: "submission-links-and-name",
		});
		// The SCF page was not read and the submission's page shows nothing.
		expect(
			pageRuleLink(
				"dorahacks-buidl-25141",
				named("payzoll"),
				{ pageLinks: [] },
				{ projectSlug: "payzoll", projectLinkBasis: "scf-page-and-name" },
			)?.basis,
		).toBe("scf-page-and-name");
		// Nothing stored, a link by another rule, or to another project: none.
		expect(
			pageRuleLink("dorahacks-buidl-25141", named("payzoll"), {
				pageLinks: [],
			}),
		).toBeNull();
		expect(
			pageRuleLink(
				"dorahacks-buidl-25141",
				named("payzoll"),
				{ pageLinks: [] },
				{ projectSlug: "payzoll", projectLinkBasis: "repo" },
			),
		).toBeNull();
		expect(
			pageRuleLink(
				"dorahacks-buidl-25141",
				named("payzoll"),
				{ pageLinks: [] },
				{ projectSlug: "blend", projectLinkBasis: "scf-page-and-name" },
			),
		).toBeNull();
		// Both pages read and neither shows the project: the stored link goes.
		expect(
			pageRuleLink(
				"dorahacks-buidl-25141",
				named("payzoll"),
				{
					scfBuidls: new Set<string>(),
					pageLinks: ["https://www.payzoll.xyz"],
				},
				stored,
			),
		).toBeNull();
	});

	it("a stored link ends once its own page is read and no longer shows it, whatever the other page", () => {
		// Review 2026-10-31: either page unread used to keep both bases.
		expect(
			pageRuleLink(
				"dorahacks-buidl-25141",
				named("payzoll"),
				{ pageLinks: ["https://youtu.be/x"] },
				{
					projectSlug: "payzoll",
					projectLinkBasis: "submission-links-and-name",
				},
			),
		).toBeNull();
		expect(
			pageRuleLink(
				"dorahacks-buidl-25141",
				named("payzoll"),
				{ scfBuidls: new Set<string>(), pageLinks: [] },
				{ projectSlug: "payzoll", projectLinkBasis: "scf-page-and-name" },
			),
		).toBeNull();
	});

	it("a stored SCF page link stays while the project's SCF page is not known", () => {
		// The row's SCF link can flap; nothing was read, so nothing decides.
		expect(
			pageRuleLink(
				"dorahacks-buidl-25141",
				{ ...named("payzoll"), scfPage: null },
				{ scfBuidls: null, pageLinks: ["https://youtu.be/x"] },
				{ projectSlug: "payzoll", projectLinkBasis: "scf-page-and-name" },
			)?.basis,
		).toBe("scf-page-and-name");
	});

	it("never a submission off DoraHacks", () => {
		expect(
			pageRuleLink("curated-hackmeridian-2025-payzoll", named("payzoll"), {
				scfBuidls: new Set(["25141"]),
				pageLinks: ["https://x.com/payzoll"],
			}),
		).toBeNull();
	});
});

describe("the page rules' bases are served and declared", () => {
	it("serves each page basis on a stored link", () => {
		for (const basis of PAGE_LINK_BASES) {
			expect(LINK_BASES).toContain(basis);
			const b = indexedFromStored({
				id: "x",
				buildId: "dorahacks-buidl-1",
				name: "X",
				hackathonSlug: "e",
				hackathonTitle: "E",
				url: "https://dorahacks.io/buidl/1",
				linkCheckedAt: "2026-10-23T00:00:00.000Z",
				projectSlug: "payzoll",
				projectName: "PayZoll",
				projectLinkBasis: basis,
				firstSeenAt: "2026-10-23T00:00:00.000Z",
				lastSeenAt: "2026-10-23T00:00:00.000Z",
				updatedAt: "2026-10-23T00:00:00.000Z",
				createdAt: "2026-10-23T00:00:00.000Z",
			});
			expect(b.project?.basis).toBe(basis);
		}
	});

	it("declares every basis in the spec, with no null, and describes each", () => {
		// spec-enum-parity holds the enum to LINK_BASES; this holds the text.
		const basis =
			// biome-ignore lint/suspicious/noExplicitAny: walking the spec object
			(spec as any).paths["/api/hackathons/builds"].get.responses["200"]
				.content["application/json"].schema.properties.builds.items.properties
				.project.properties.basis;
		expect(basis.enum).not.toContain(null);
		for (const b of PAGE_LINK_BASES) {
			expect(basis.enum).toContain(b);
			expect(basis.description).toContain(`${b}:`);
		}
	});
});

describe("the submission page's own links", () => {
	it("reads every link the page lists, once each", () => {
		expect(
			pageLinksOf({
				links: ["https://drive.google.com/x", "https://www.payzoll.xyz"],
				social_urls: ["https://www.payzoll.xyz", "https://x.com/PayZoll", 7],
				demo_url: "https://drive.google.com/x",
				github_url: null,
				demo_video_url: " https://youtu.be/abc ",
			}),
		).toEqual([
			"https://drive.google.com/x",
			"https://www.payzoll.xyz",
			"https://x.com/PayZoll",
			"https://youtu.be/abc",
		]);
		expect(pageLinksOf({ links: [] })).toEqual([]);
	});

	it("a record with no links list is a format it does not know: null, never none", () => {
		expect(pageLinksOf({ social_urls: ["https://x.com/payzoll"] })).toBeNull();
		expect(pageLinksOf({})).toBeNull();
		expect(pageLinksOf(null)).toBeNull();
	});
});

describe("review fixes", () => {
	const stored = {
		projectSlug: "payzoll",
		projectLinkBasis: "submission-links-and-name",
	};

	it("an empty links list (a 404, a private or archived record) is could-not-check: a stored page link is kept", () => {
		expect(
			pageRuleLink(
				"dorahacks-buidl-25141",
				named("payzoll"),
				{ scfBuidls: new Set<string>(), pageLinks: [] },
				stored,
			),
		).toEqual({
			slug: "payzoll",
			name: "PayZoll",
			basis: "submission-links-and-name",
		});
		// Nothing stored: an empty list still links nothing.
		expect(
			pageRuleLink("dorahacks-buidl-25141", named("payzoll"), {
				scfBuidls: new Set<string>(),
				pageLinks: [],
			}),
		).toBeNull();
		// A list that holds links, none of them the project's: a real reading.
		expect(
			pageRuleLink(
				"dorahacks-buidl-25141",
				named("payzoll"),
				{
					scfBuidls: new Set<string>(),
					pageLinks: ["https://youtu.be/x"],
				},
				stored,
			),
		).toBeNull();
	});

	it("a site or X account two projects hold never corroborates", () => {
		expect(named("alphaone").xHandle).toBeNull();
		expect(named("betatwo").xHandle).toBeNull();
		expect(named("shareda").site).toBeNull();
		expect(named("payzoll").xHandle).toBe("payzoll");
		for (const [key, link] of [
			["alphaone", "https://x.com/sharedx"],
			["shareda", "https://shared.example/app"],
		])
			expect(
				pageRuleLink("dorahacks-buidl-7", named(key), {
					scfBuidls: null,
					pageLinks: [link],
				}),
			).toBeNull();
	});

	it("reads buidl numbers from the SCF page's siteUrls record only", () => {
		const page = (siteUrls: string) =>
			`"bio":"won at dorahacks.io/buidl/31","siteUrls":${siteUrls},"traction":"see https://dorahacks.io/buidl/32"`;
		expect([
			...(scfSiteUrlsBuidls(
				page(
					'{"website":"https://yieldback.cash","analytics":"https://dorahacks.io/buidl/27456","nested":{"a":"b"}}',
				),
			) ?? []),
		]).toEqual(["27456"]);
		expect([...(scfSiteUrlsBuidls(page("null")) ?? ["x"])]).toEqual([]);
		// No siteUrls record: a format it does not know, could not check.
		expect(scfSiteUrlsBuidls('"bio":"dorahacks.io/buidl/31"')).toBeUndefined();
	});

	it("names why a stored link is dropped, for every rule", () => {
		const won = (name: string, extra: Record<string, unknown> = {}) =>
			winner(name, extra);
		// A page rule link whose own page was read and says nothing now.
		expect(
			linkDropReason(won("PayZoll_Stellar"), stored, idx, names()),
		).toMatch(/page was read/);
		// The directory changed: a second project took the name.
		expect(
			linkDropReason(
				won("Twin Labs"),
				{ projectSlug: "twin-a", projectLinkBasis: "scf-page-and-name" },
				idx,
				names(),
			),
		).toMatch(/two or more projects/);
		// No project carries the name now.
		expect(
			linkDropReason(
				won("Gone Project"),
				{ projectSlug: "gone", projectLinkBasis: "scf-page-and-name" },
				idx,
				names(),
			),
		).toMatch(/no project carries/);
		// A link by another rule.
		expect(
			linkDropReason(
				won("Anything", { repoFullName: "someone/thing" }),
				{ projectSlug: "widget", projectLinkBasis: "website" },
				idx,
				names(),
			),
		).toMatch(/website rule/);
	});

	it("prints one line per link change, old to new, and names a dropped link with its reason", () => {
		expect(
			linkChangeLine(
				"dorahacks-buidl-25141@build-on-stellar",
				stored,
				{ projectSlug: null, projectLinkBasis: null },
				"pages read: no page links the project",
			),
		).toBe(
			"  dropped dorahacks-buidl-25141@build-on-stellar: payzoll (submission-links-and-name) -> none: pages read: no page links the project",
		);
		expect(
			linkChangeLine(
				"dorahacks-buidl-9@e",
				{ projectSlug: "widget", projectLinkBasis: "repo" },
				{ projectSlug: "widget", projectLinkBasis: "moved-repo" },
			),
		).toBe("  link dorahacks-buidl-9@e: widget (repo) -> widget (moved-repo)");
		expect(
			linkChangeLine(
				"dorahacks-buidl-9@e",
				{},
				{ projectSlug: "payzoll", projectLinkBasis: "scf-page-and-name" },
			),
		).toBe("  link dorahacks-buidl-9@e: none -> payzoll (scf-page-and-name)");
		expect(
			linkChangeLine(
				"dorahacks-buidl-9@e",
				{ projectSlug: "widget", projectLinkBasis: "repo" },
				{ projectSlug: "widget", projectLinkBasis: "repo" },
			),
		).toBeNull();
	});
});

describe("hosts that hold many projects", () => {
	it("a link-in-bio, event or booking page is never a site identity", () => {
		const pages = [
			"https://linktr.ee/someone",
			"https://beacons.ai/someone-else",
			"https://bio.link/someone",
			"https://bento.me/someone",
			"https://about.me/someone",
			"https://lu.ma/some-event",
			"https://calendly.com/someone",
			"https://dune.com/someone/dashboard",
		];
		expect(pages.filter((u) => siteKeyOf(u) !== null)).toEqual([]);
		// A per-site subdomain host keeps one key per site.
		expect(siteKeyOf("https://a.carrd.co")).not.toBe(
			siteKeyOf("https://b.carrd.co"),
		);
	});

	it("a demo on such a page links no project whose website is another page there", () => {
		const rows: ProjectRepoRow[] = [
			{
				slug: "noticias-trading",
				name: "Noticias Trading",
				status: "Live",
				links: { website: "https://beacons.ai/noticiastrading" },
			},
		];
		const at = {
			repos: indexProjectRepos(rows),
			sites: indexProjectSites(rows),
			owners: indexProjectOwners(rows),
		};
		expect(
			linkBuild(
				{ name: "Unrelated Build", demoUrl: "https://beacons.ai/someone-else" },
				at,
			).project,
		).toBeNull();
	});
});

// Review 2026-10-31 (another model family), each reproduced first.
describe("reading SCF siteUrls and names", () => {
	it("reads the siteUrls record as JSON: braces inside its strings do not end it", () => {
		const late =
			'"siteUrls":{"note":"template dorahacks.io/buidl/31}","analytics":"https://dorahacks.io/buidl/27456"}';
		expect([...(scfSiteUrlsBuidls(late) ?? [])].sort()).toEqual([
			"27456",
			"31",
		]);
		const early =
			'"siteUrls":{"website":"https://x.io/{a"},"traction":"see https://dorahacks.io/buidl/32"}';
		expect([...(scfSiteUrlsBuidls(early) ?? ["could not check"])]).toEqual([]);
	});

	it("a record it cannot read is could-not-check, never links-none", () => {
		expect(
			scfSiteUrlsBuidls('"siteUrls":[{"url":"https://dorahacks.io/buidl/5"}]'),
		).toBeUndefined();
		expect(
			scfSiteUrlsBuidls(
				'"siteUrls":{"analytics":"https://dorahacks.io/buidl/5"',
			),
		).toBeUndefined();
		// A page that lists none still reads as none.
		expect([...(scfSiteUrlsBuidls('"siteUrls":null') ?? ["x"])]).toEqual([]);
	});

	it("another host's /buidl/ path is not a DoraHacks link; a subdomain of it is", () => {
		expect(
			[
				...buidlNumbersIn(
					"https://notdorahacks.io/buidl/31 https://www.dorahacks.io/buidl/7 https://hackathon.dorahacks.io/buidl/6",
				),
			].sort(),
		).toEqual(["6", "7"]);
	});

	it("reads the record past an earlier null on another object", () => {
		const page =
			'"m":{"siteUrls":null},"p":{"siteUrls":{"analytics":"https://dorahacks.io/buidl/27456"}}';
		expect([...(scfSiteUrlsBuidls(page) ?? [])]).toEqual(["27456"]);
	});

	it("folds accents in name keys: different names never collide, one spelling in two forms does not split", () => {
		expect(productKeyOf("CaféPay")).toBe("cafepay");
		expect(productKeyOf("CafPay")).toBe("cafpay");
		// A trademark sign is not part of the name.
		expect(productKeyOf("PayZoll\u2122")).toBe("payzoll");
		expect(productKeyOf("CaféPay")).toBe(productKeyOf("CaféPay"));
	});
});
