// @vitest-environment node

/**
 * /hackathons/<slug> renders the body getHackathonDetail builds for the API,
 * and says "not known" where that body holds null: an event's page answered
 * 404 for every event while the API served 27. West of UTC, so a calendar
 * date parsed as UTC midnight would print the day before.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import HackathonDetailPage, { generateMetadata } from "../page";

const TZ = process.env.TZ;
process.env.TZ = "America/Los_Angeles";
afterAll(() => {
	if (TZ === undefined) delete process.env.TZ;
	else process.env.TZ = TZ;
});

const detail = vi.fn();
let payload: unknown = { find: async () => ({ docs: [] }) };
let listing: unknown[] = [];
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => payload),
}));
vi.mock("@/lib/hackathon-detail", () => ({
	getHackathonDetail: (...args: unknown[]) => detail(...args),
}));
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathons: vi.fn(async () => listing),
}));

const stats = (over: Record<string, unknown> = {}) => ({
	totalSubmissions: null,
	upstreamSubmissions: null,
	coverageNote: null,
	hiddenWinners: null,
	winnersNote: null,
	totalPrizeUSD: null,
	winners: 0,
	outcomes: null,
	...over,
});
const event = (over: Record<string, unknown> = {}) => ({
	id: "dorahacks--1001",
	name: "HackMeridian 2026",
	slug: "hackmeridian-2026",
	description: "Building on Stellar in Lisbon.",
	startDate: "2026-10-25",
	endDate: "2026-10-26",
	status: "upcoming",
	externalUrl: "https://meridian.stellar.org/hackmeridian",
	organizer: { id: "o", name: "Stellar Development Foundation", slug: "sdf" },
	source: "curated",
	stats: stats(),
	tracks: null,
	...over,
});
const serve = (
	hackathon: Record<string, unknown>,
	winners: unknown[] = [],
	submissions: unknown[] = [],
) =>
	detail.mockResolvedValue({
		found: true,
		source: "dorahacks",
		body: { meta: {}, hackathon, winners, submissions, tracks: null },
	});
const render = async (slug = "hackmeridian-2026") =>
	renderToStaticMarkup(
		await HackathonDetailPage({ params: Promise.resolve({ slug }) }),
	);
const count = (html: string, s: string) => html.split(s).length - 1;
/** A stat block's value. */
const zeroStat = /tracking-tight">0</;

beforeEach(() => {
	detail.mockReset();
	payload = { find: async () => ({ docs: [] }) };
	listing = [];
});

/** Render with the API's answer still pending at the page's deadline. */
const renderLate = async (slug: string) => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	try {
		detail.mockReturnValue(new Promise(() => {}));
		const pending = render(slug).catch((e: unknown) => e);
		await vi.advanceTimersByTimeAsync(6000);
		return await pending;
	} finally {
		vi.useRealTimers();
	}
};

describe("/hackathons/<slug>", () => {
	it("renders an upcoming curated event from the API's body, with no count it does not hold", async () => {
		serve(event());
		const html = await render();
		expect(detail).toHaveBeenCalledWith(payload, "hackmeridian-2026");
		expect(html).toContain("HackMeridian 2026</h1>");
		expect(html).toContain("Oct 25-26, 2026");
		expect(html).toContain("Building on Stellar in Lisbon.");
		expect(html).toContain("Stellar Development Foundation");
		expect(html).not.toContain("Submitted projects");
		expect(html).not.toContain("submitted");
		expect(html).not.toMatch(zeroStat);
		expect(html).toContain("No submissions from this event are on record yet.");
	});

	it("a winners-only event: its winners once, never as its submissions", async () => {
		const win = (name: string, placement: string, rank: number) => ({
			id: `curated-hackmeridian-2025-${name.toLowerCase()}`,
			name,
			description: null,
			track: "Composability",
			hackathonPlacement: placement,
			placementRank: rank,
			prizeUsd: null,
			isWinner: true,
			url: "https://stellar.org/blog/recap",
			source: "curated",
		});
		const rows = [
			win("Lance", "1st Place", 1),
			win("Star Lends", "2nd Place", 2),
		];
		serve(
			event({
				name: "HackMeridian 2025",
				slug: "hackmeridian-2025",
				status: "completed",
				coverage: "winners-only",
				// The record states the field's size; the page must not call it
				// unknown beside it.
				description:
					"More than 400 builders and 110+ submissions across two tracks.",
				stats: stats({
					winners: 2,
					coverageNote: "Only this event's winners are on record here.",
				}),
			}),
			rows,
			rows,
		);
		const html = await render("hackmeridian-2025");
		expect(html).toContain("2 projects");
		expect(count(html, "Lance</h3>")).toBe(1);
		expect(count(html, "Star Lends</h3>")).toBe(1);
		expect(html).not.toMatch(/\d+ submitted/);
		expect(html).toContain("110+ submissions");
		expect(html).toContain(
			"Only this event&#x27;s winners are stored here, not its full list of submissions.",
		);
		expect(html).not.toContain("not known");
		expect(html).not.toContain("No submissions from this event");
		expect(html).toContain("Prize not stated");
		expect(html).not.toContain("Prize awarded");
		expect(html).toContain(
			'href="https://stellar.org/blog/recap" target="_blank"',
		);
	});

	it("a DoraHacks event: unclassified outcomes are not known, its page's first prose is the description", async () => {
		const sub = (id: string, over: Record<string, unknown> = {}) => ({
			id,
			name: id,
			description: `${id} summary`,
			track: null,
			hackathonPlacement: null,
			isWinner: false,
			url: `https://dorahacks.io/buidl/${id}`,
			source: "dorahacks",
			...over,
		});
		const winner = sub("Wraith", {
			isWinner: true,
			hackathonPlacement: "1st Place - $5,000 in XLM",
		});
		serve(
			event({
				name: "Stellar Hacks: Real-World ZK",
				slug: "stellar-hacks-zk",
				status: "completed",
				source: "dorahacks",
				description:
					"# Stellar Hacks: Real-World ZK\n\n### Real-World ZK on Stellar\n\nThis hackathon is wide open: **build anything** with *zero-knowledge*, see the [docs](https://x.test).\n\n## Prizes\n- 1st Place: $5,000",
				stats: stats({
					totalSubmissions: 3,
					coverageNote:
						"DoraHacks counts 4 submissions for this event; 3 are served here.",
					winners: 1,
					outcomes: { built: 0, inProgress: 0, abandoned: 0, unknown: 3 },
				}),
			}),
			[{ ...winner, placementRank: 1, prizeUsd: 5000 }],
			[winner, sub("Shade"), sub("Veil")],
		);
		const html = await render("stellar-hacks-zk");
		expect(html).toContain(
			"This hackathon is wide open: build anything with zero-knowledge, see the docs.",
		);
		expect(html).not.toContain("# Stellar");
		expect(html).toContain('tracking-tight">3<');
		expect(count(html, "not known")).toBe(3);
		expect(html).not.toMatch(zeroStat);
		expect(html).not.toContain("Outcomes funnel");
		expect(html).toContain("3 submitted");
		expect(html).toContain(
			"DoraHacks counts 4 submissions for this event; 3 are served here.",
		);
		expect(html).toContain(">1st Place</span>");
		expect(html).toContain("$5,000");
		expect(html).toContain(
			'href="https://dorahacks.io/buidl/Shade" target="_blank"',
		);
	});

	it("a collection event: classified outcomes, the funnel and directory links", async () => {
		const project = (
			name: string,
			hackathonStatus: string | null,
			over: Record<string, unknown> = {},
		) => ({
			id: name,
			name,
			slug: name.toLowerCase(),
			category: "DeFi",
			shortDescription: null,
			hackathonStatus,
			hackathonPlacement: null,
			hackathonPrize: null,
			hackathonPrizeTrack: null,
			scfAwarded: false,
			url: `https://stellarlight.xyz/project/${name.toLowerCase()}`,
			...over,
		});
		const alpha = project("Alpha", "Built", {
			hackathonPlacement: "1st",
			hackathonPrize: 5000,
		});
		serve(
			event({
				name: "Collection Hack",
				slug: "collection-hack",
				status: "completed",
				source: undefined,
				startDate: "2026-02-27T00:00:00.000Z",
				endDate: "2026-03-02T00:00:00.000Z",
				stats: stats({
					totalSubmissions: 4,
					winners: 1,
					outcomes: { built: 1, inProgress: 1, abandoned: 1, unknown: 1 },
				}),
			}),
			[{ ...alpha, placementRank: 1 }],
			[
				alpha,
				project("Beta", "In Progress"),
				project("Gamma", "Abandoned"),
				project("Delta", null),
			],
		);
		const html = await render("collection-hack");
		expect(html).toContain("Feb 27 to Mar 2, 2026");
		expect(html).toContain("Outcomes funnel");
		expect(html).toContain("67% of tracked");
		expect(html).toContain('tracking-tight">2<');
		expect(html).toContain('href="/project/alpha"');
		expect(html).toContain(">1st</span>");
		expect(html).not.toContain("not known");
	});

	it("says why there are no winners when the API says why", async () => {
		const note =
			"Not announced upstream: no page we could read names this program's winners.";
		serve(event({ status: "completed", stats: stats({ winnersNote: note }) }));
		const html = await render();
		expect(html).toContain("Winners</h2>");
		expect(html).toContain(
			"Not announced upstream: no page we could read names this program&#x27;s winners.",
		);
		expect(html).toContain("No submissions from this event are on record.");
	});

	it("a winner's track fills its category line, and its footer does not repeat it", async () => {
		const winner = {
			id: "dorahacks-buidl-1",
			name: "Lendr",
			description: null,
			track: "Main Track",
			hackathonPlacement: "1st Place",
			placementRank: 1,
			prizeUsd: null,
			isWinner: true,
			url: "https://dorahacks.io/buidl/1",
			source: "dorahacks",
		};
		serve(
			event({
				name: "Stellar Hacks: Blend",
				slug: "stellar-hacks-blend",
				status: "completed",
				source: "dorahacks",
				stats: stats({
					totalSubmissions: 1,
					winners: 1,
					outcomes: { built: 0, inProgress: 0, abandoned: 0, unknown: 1 },
				}),
			}),
			[winner],
			[winner],
		);
		const html = await render("stellar-hacks-blend");
		expect(html).toContain(
			'text-xs text-muted-foreground truncate">Main Track</div>',
		);
		expect(html).not.toContain('ml-2">Main Track<');
	});

	it("a roster placement shows its place in the badge and its category in the footer, with no em dash", async () => {
		serve(
			event({
				name: "Stellar Builder Summit 2026",
				slug: "stellar-builder-summit-2026",
				status: "completed",
				stats: stats({ winners: 1 }),
			}),
			[
				{
					id: "winner-stellar-builder-summit-2026-quietbook",
					name: "Quietbook",
					slug: null,
					category: null,
					shortDescription: "Private payroll.",
					hackathonStatus: null,
					hackathonPlacement: "1st \u2014 Confidential Wallets",
					placementRank: 1,
					hackathonPrize: 1250,
					prizeUsd: 1250,
					hackathonPrizeTrack: null,
					scfAwarded: null,
					builder: "a team",
					url: "https://github.com/example/quietbook",
				},
			],
		);
		const html = await render("stellar-builder-summit-2026");
		expect(html).toContain(">1st</span>");
		expect(html).toContain('ml-2">Confidential Wallets</span>');
		expect(html).toContain("$1,250");
		expect(html).not.toMatch(/[\u2013\u2014]/);
	});

	it("an answer past the deadline: a curated event renders from its record, not a 404 or a 504", async () => {
		const html = await renderLate("hackmeridian-2026");
		expect(typeof html).toBe("string");
		expect(html).toContain("HackMeridian 2026</h1>");
		expect(html).toContain("Oct 25-26, 2026");
		expect(html).toContain("Warehouse ONE16");
		expect(html).toContain(
			"This event&#x27;s winners and submissions could not be loaded right now.",
		);
		expect(html).not.toContain("No submissions from this event");
		expect(html).not.toContain("Submitted projects");
	});

	it("an answer past the deadline: a DoraHacks event renders from its listing row", async () => {
		listing = [
			{
				id: 2198,
				uname: "stellar-hacks-zk",
				title: "Stellar Hacks: Real-World ZK",
				start_time: Date.parse("2026-09-01T12:00:00Z") / 1000,
				end_time: Date.parse("2026-10-09T12:00:00Z") / 1000,
				bonus_price: 10_000,
				hackers_count: 300,
				winner_announced: true,
				status: 2,
				organization: { id: 3096, name: "Stellar Development Foundation" },
				source: "dorahacks",
			},
		];
		const html = await renderLate("stellar-hacks-zk");
		expect(html).toContain("Stellar Hacks: Real-World ZK</h1>");
		expect(html).toContain("Sep 1 to Oct 9, 2026");
		expect(html).toContain(
			'href="https://dorahacks.io/hackathon/stellar-hacks-zk/detail"',
		);
		expect(html).toContain("could not be loaded right now");
	});

	it("a store that does not start by the deadline is bounded too", async () => {
		payload = new Promise(() => {});
		const html = await renderLate("hackmeridian-2026");
		expect(html).toContain("HackMeridian 2026</h1>");
		expect(html).toContain("could not be loaded right now");
		expect(detail).not.toHaveBeenCalled();
	});

	it("an answer past the deadline for a slug nothing it holds knows is an error, not a 404", async () => {
		const error = await renderLate("no-such-event");
		expect(error).toBeInstanceOf(Error);
		expect((error as { digest?: string }).digest).toBeUndefined();
	});

	it("404s only for a slug the API does not know", async () => {
		detail.mockResolvedValue({
			found: false,
			body: { error: "hackathon not found" },
		});
		await expect(render("hackmeridian-2024")).rejects.toMatchObject({
			digest: "NEXT_HTTP_ERROR_FALLBACK;404",
		});
		expect(
			await generateMetadata({
				params: Promise.resolve({ slug: "hackmeridian-2024" }),
			}),
		).toEqual({ title: "Hackathon Not Found" });
	});

	it("a store outage: a curated event renders from its record, and a slug nothing knows is an error, not a 404", async () => {
		payload = null;
		const html = await render("hackmeridian-2026");
		expect(html).toContain("HackMeridian 2026</h1>");
		expect(html).toContain("could not be loaded right now");
		const error = await render("no-such-event").catch(
			(e: { digest?: string }) => e,
		);
		expect(error).toBeInstanceOf(Error);
		expect((error as { digest?: string }).digest).toBeUndefined();
		expect(detail).not.toHaveBeenCalled();
	});

	it("metadata: the event's name, its description's first prose and a canonical", async () => {
		serve(event({ description: `${"Builders meet in Lisbon. ".repeat(10)}` }));
		const meta = await generateMetadata({
			params: Promise.resolve({ slug: "hackmeridian-2026" }),
		});
		expect(meta.title).toBe("HackMeridian 2026");
		expect(meta.alternates).toEqual({
			canonical: "/hackathons/hackmeridian-2026",
		});
		expect(String(meta.description).length).toBeLessThanOrEqual(162);
		expect(String(meta.description)).toMatch(/^Builders meet in Lisbon\./);
	});
});
