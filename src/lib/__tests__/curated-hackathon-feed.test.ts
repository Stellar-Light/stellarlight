import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CURATED_BUILDS } from "@/data/curated-builds";
import { CURATED_HACKATHONS } from "@/data/curated-hackathons";
import { getHackathonBuildsIndex } from "@/lib/hackathon-builds";
import {
	type DoraHacksHackathon,
	fetchAllDoraHacksHackathons,
	fetchAllDoraHacksHackathonsChecked,
	fetchHackathonSubmissions,
} from "@/lib/integrations/dorahacks";
import { spec } from "@/lib/openapi-spec";
import {
	responseSchema,
	undeclaredInServed,
} from "../../../scripts/contract/served-shape";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
// No Payload collection rows: the feed is the DoraHacks listing, which
// carries the code-curated events, read here without DoraHacks itself.
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => null),
}));
vi.mock("@/lib/integrations/dorahacks", async (orig) => {
	const { CURATED_HACKATHONS: rows } = await import(
		"@/data/curated-hackathons"
	);
	return {
		...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
		fetchAllDoraHacksHackathons: vi.fn(async () => rows.map((h) => ({ ...h }))),
		fetchAllDoraHacksHackathonsChecked: vi.fn(async () => ({
			hackathons: rows.map((h) => ({ ...h })),
			complete: true,
		})),
		fetchHackathonSubmissions: vi.fn(async () => []),
	};
});
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => []),
}));

const feed = async (query = "") => {
	const { GET } = await import("@/app/api/hackathons/route");
	const res = await GET(
		new NextRequest(`https://x.test/api/hackathons${query}`),
	);
	return res.json();
};
const payload = { find: async () => ({ docs: [] }) } as never;
const detail = async (slug: string) => {
	const { getHackathonDetail } = await import("@/lib/hackathon-detail");
	const r = await getHackathonDetail(payload, slug);
	if (!r.found) throw new Error(`no event ${slug}`);
	// As the route serves it: JSON.
	return JSON.parse(JSON.stringify(r.body));
};

// Live 1.9.116 (sls-110): rules.judgingCriteria held the qualitative
// sentence only, while hackmeridian.com/build publishes one weighted rubric.
describe("a curated event's weighted rubric", () => {
	it("is served as criterion and weight pairs, with its page and day", async () => {
		const body = await detail("hackmeridian-2026");
		expect(body.hackathon.rules.rubric).toEqual({
			scoreMin: 1,
			scoreMax: 5,
			criteria: [
				{
					criterion: "Track Alignment (Genesis) / Ecosystem Alignment (Scale)",
					weightPercent: 20,
					byCategory: [
						{
							category: "Genesis",
							criterion: "Track Alignment",
							scores: "Fit with Stellar Unlocked and/or Stellar Composed.",
						},
						{
							category: "Scale",
							criterion: "Ecosystem Alignment",
							scores: "Fit with and value to the Stellar ecosystem.",
						},
					],
				},
				{ criterion: "User Value & Problem", weightPercent: 20 },
				{ criterion: "Technical Execution", weightPercent: 15 },
				{ criterion: "Innovation", weightPercent: 15 },
				{ criterion: "Hackathon Progress", weightPercent: 10 },
				{ criterion: "Market & Ecosystem Potential", weightPercent: 10 },
				{ criterion: "Product Design & UX", weightPercent: 10 },
			],
			source: "https://www.hackmeridian.com/build",
			checkedOn: "2026-11-04",
		});
		// The judging sentence keeps its own page and day.
		expect(body.hackathon.rules.source).toBe("https://hackmeridian.com");
		expect(body.hackathon.rules.checkedOn).toBe("2026-10-20");
		expect(
			undeclaredInServed(
				spec,
				responseSchema(spec, "/api/hackathons/{slug}"),
				body,
			),
		).toEqual([]);
	});

	it("sums to 100 percent with distinct criteria, for every curated rubric", () => {
		const rubrics = CURATED_HACKATHONS.flatMap((h) =>
			h.judging?.rubric ? [[h.uname, h.judging.rubric] as const] : [],
		);
		expect(rubrics.map(([slug]) => slug)).toEqual(["hackmeridian-2026"]);
		for (const [slug, r] of rubrics) {
			const weights = r.criteria.map((c) => c.weightPercent);
			expect(
				weights.reduce((s, w) => s + w, 0),
				slug,
			).toBe(100);
			for (const w of weights)
				expect(Number.isInteger(w) && w > 0, slug).toBe(true);
			const names = r.criteria.map((c) => c.criterion);
			expect(new Set(names).size, slug).toBe(names.length);
			expect(r.scoreMin < r.scoreMax, slug).toBe(true);
			expect(r.source, slug).toMatch(/^https:\/\//);
			expect(r.checkedOn, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(JSON.stringify(r), slug).not.toMatch(/[\u2013\u2014]/);
			// A criterion scored under a name per category names each of the
			// record's categories once, and nothing else.
			const categories = (
				CURATED_HACKATHONS.find((h) => h.uname === slug)?.tracks ?? []
			)
				.filter((t) => t.kind === "category")
				.map((t) => t.name);
			for (const c of r.criteria)
				if (c.byCategory)
					expect(
						c.byCategory.map((b) => b.category),
						c.criterion,
					).toEqual(categories);
		}
	});
});

// Live 1.9.116 (sls-106): the feed held 7 curated events and no Rise In
// Stellar Pro Hackathon; ?q=istanbul returned none.
describe("the Rise In Stellar Pro Hackathon in Istanbul", () => {
	const SLUG = "stellar-pro-hackathon-istanbul-2026";

	it("is in the feed as a completed curated event, on the organizer's figures", async () => {
		const body = await feed("?status=completed");
		const row = body.hackathons.find((h: { slug: string }) => h.slug === SLUG);
		expect(row).toMatchObject({
			name: "Stellar Pro Hackathon, Istanbul",
			// Local dates in Istanbul (GMT+3): the page's start is midnight on
			// the 19th, which its header prints as the 18th in UTC.
			startDate: "2026-09-19",
			endDate: "2026-09-20",
			status: "completed",
			source: "curated",
			prizePoolUSD: 15000,
			hackersCount: 153,
			externalUrl: "https://www.risein.com/programs/stellar-pro-hackathon",
			organizer: { name: "Rise In" },
		});
		const found = await feed("?q=istanbul");
		expect(found.hackathons.map((h: { slug: string }) => h.slug)).toEqual([
			SLUG,
		]);
	});

	// Review: the page served no rules, a DoraHacks feed outage, 0 winners
	// and winnersRanked null beside a record naming seven winners.
	it("serves its record: tracks, judging and the seven winners its recap names", async () => {
		vi.mocked(fetchHackathonSubmissions).mockClear();
		const body = await detail(SLUG);
		// No DoraHacks roster behind an event off DoraHacks.
		expect(fetchHackathonSubmissions).not.toHaveBeenCalled();
		expect(body.meta.note).not.toMatch(
			/DoraHacks-sourced|DoraHacks event|unavailable/,
		);
		expect(body.meta.note).toMatch(/curated roster/);
		expect(
			body.hackathon.tracks.map((t: { name: string; kind: string }) => [
				t.kind,
				t.name,
			]),
		).toEqual([
			["category", "Genesis Track"],
			["category", "Scale Track"],
		]);
		expect(body.hackathon.rules).toEqual({
			judgingCriteria:
				"The Stellar team reviewed every submission on the hackathon criteria and each project's quality and progress, shortlisted teams from each track, and only the shortlisted teams presented live to the jury.",
			source: "https://www.risein.com/programs/stellar-pro-hackathon",
			checkedOn: "2026-11-04",
		});
		expect(body.hackathon.coverage).toBe("winners-only");
		expect(body.hackathon.stats.winners).toBe(7);
		expect(body.hackathon.stats.totalSubmissions).toBeNull();
		expect(body.hackathon.stats.winnersNote).toBeNull();
		expect(body.winnersRanked).toBe(true);
		expect(
			body.winners
				.map(
					(w: { track: string; placementRank: number; name: string }) =>
						`${w.track} ${w.placementRank} ${w.name}`,
				)
				.sort(),
		).toEqual([
			"Genesis Track 1 Pera Wallet",
			"Genesis Track 2 Plink",
			"Genesis Track 3 StellarCard",
			"Genesis Track 4 Payper",
			"Scale Track 1 Pacta",
			"Scale Track 2 Koul",
			"Scale Track 3 Mono",
		]);
		expect(body.submissions).toHaveLength(7);
		expect(body.hackathon.description).toMatch(/presented by Stellar/i);
	});

	it("stores its dates as the days published, with no clock time", () => {
		const h = CURATED_HACKATHONS.find((x) => x.uname === SLUG);
		// The page's start, midnight on the 19th in Istanbul, is the 18th in
		// UTC: the day is kept, not an hour of it.
		expect(new Date((h?.start_time ?? 0) * 1000).toISOString()).toBe(
			"2026-09-19T00:00:00.000Z",
		);
		// The page's own end: 23:59:59 on the 20th, Istanbul time.
		expect(new Date((h?.end_time ?? 0) * 1000).toISOString()).toBe(
			"2026-09-20T20:59:59.000Z",
		);
	});
});

// Review: every curated event's page said "DoraHacks-sourced: live
// submission feed unavailable", and served submissions [] for a roster no
// one holds.
describe("a curated event's page", () => {
	it("says what Scout holds of it, never a feed outage", async () => {
		for (const h of CURATED_HACKATHONS) {
			const body = await detail(h.uname);
			expect(body.meta.note, h.uname).not.toMatch(
				/DoraHacks-sourced|DoraHacks event|unavailable/,
			);
			if (CURATED_BUILDS.some((b) => b.hackathonSlug === h.uname)) {
				expect(body.submissions.length, h.uname).toBeGreaterThan(0);
				expect(body.meta.note, h.uname).toMatch(/only its winners on record/);
			} else {
				// None is held: not known here, never none.
				expect(body.submissions, h.uname).toBeNull();
				expect(body.meta.note, h.uname).toMatch(
					/no submission roster is held for it/,
				);
			}
			expect("rules" in body.hackathon, h.uname).toBe(!!h.judging);
			expect(
				undeclaredInServed(
					spec,
					responseSchema(spec, "/api/hackathons/{slug}"),
					body,
				),
				h.uname,
			).toEqual([]);
		}
	});
});

// Review: a failed roster read and a failed builds index both served
// submissions [], a checked empty list.
describe("a DoraHacks event whose roster could not be read", () => {
	const DORA = {
		id: 2198,
		uname: "stellar-hacks-zk",
		title: "Stellar Hacks: Real-World ZK",
		start_time: 1_750_000_000,
		end_time: 1_760_000_000,
		bonus_price: 10_000,
		hackers_count: 300,
		status: 2,
		winner_announced: true,
	} as DoraHacksHackathon;

	it("serves submissions null with the reason, never an empty list", async () => {
		vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([DORA]);
		vi.mocked(getHackathonBuildsIndex).mockRejectedValueOnce(
			new Error("index down"),
		);
		vi.mocked(fetchHackathonSubmissions).mockRejectedValueOnce(
			new Error("DoraHacks 503"),
		);
		const body = await detail(DORA.uname);
		expect(body.submissions).toBeNull();
		expect(body.meta.note).toMatch(/could not be read/);
		expect(body.hackathon.stats.totalSubmissions).toBeNull();
		expect(body.hackathon.notes?.[0]).toMatch(/could not be read/);
		expect(
			undeclaredInServed(
				spec,
				responseSchema(spec, "/api/hackathons/{slug}"),
				body,
			),
		).toEqual([]);
	});

	it("keeps an empty list for a roster DoraHacks read as empty", async () => {
		vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([DORA]);
		vi.mocked(fetchHackathonSubmissions).mockResolvedValueOnce([]);
		const body = await detail(DORA.uname);
		expect(body.submissions).toEqual([]);
		expect(body.meta.note).toMatch(/DoraHacks lists no submission/);
	});
});

describe("the DoraHacks roster read", () => {
	afterEach(() => vi.unstubAllGlobals());
	const json = (status: number, body: unknown) =>
		new Response(JSON.stringify(body), { status });
	const roster = async () =>
		(
			await vi.importActual<typeof import("@/lib/integrations/dorahacks")>(
				"@/lib/integrations/dorahacks",
			)
		).fetchHackathonSubmissions;

	it("throws on a roster page that fails, so a caller can say could-not-check", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				String(url).includes("/buidls")
					? json(503, {})
					: json(200, { award_list: [] }),
			),
		);
		await expect((await roster())({ id: 1, uname: "x" })).rejects.toThrow(
			/HTTP 503/,
		);
	});

	it("answers [] when DoraHacks lists none, and the rows when it lists some", async () => {
		const page = (results: unknown[]) =>
			json(200, { count: results.length, results, next: null });
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				String(url).includes("/buidls")
					? page([])
					: json(200, { award_list: [] }),
			),
		);
		expect(await (await roster())({ id: 1, uname: "x" })).toEqual([]);
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				String(url).includes("/buidls")
					? page([{ buidl: { id: 7, name: "Seven", vision: "Builds." } }])
					: json(200, { award_list: [] }),
			),
		);
		expect(
			(await (await roster())({ id: 1, uname: "x" })).map((s) => s.id),
		).toEqual(["dorahacks-buidl-7"]);
	});
});

// Live 1.9.116: an empty ?status=active said "between events", a claim
// about the ecosystem's schedule that the feed cannot make.
describe("the empty-feed summary", () => {
	const summaryFor = async (query: string) => {
		vi.mocked(fetchAllDoraHacksHackathonsChecked).mockResolvedValueOnce({
			hackathons: [],
			complete: true,
		});
		return (await feed(query)).meta.fallbackChannels?.summary as string;
	};

	it("claims only this feed and the selected status", async () => {
		for (const status of ["upcoming", "active"]) {
			const summary = await summaryFor(`?status=${status}`);
			expect(summary).toMatch(
				new RegExp(
					`^No ${status} hackathons in stellarlight's feed right now\\.`,
				),
			);
			expect(summary).not.toMatch(/between events/i);
			expect(summary).toMatch(/not a claim that no Stellar hackathon is/);
		}
		// Other filters narrow what was looked at, and it names them.
		expect(await summaryFor("?status=active&q=istanbul")).toMatch(
			/^No active hackathons match q=istanbul in stellarlight's feed right now\./,
		);
	});

	it("says a failed read is no check that none is listed, names the filters, and counts nothing", async () => {
		vi.mocked(fetchAllDoraHacksHackathonsChecked).mockRejectedValueOnce(
			new Error("DoraHacks down"),
		);
		const body = await feed("?status=upcoming&q=istanbul");
		expect(body.meta.warnings?.length).toBeGreaterThan(0);
		expect(body.meta.fallbackChannels.summary).toMatch(
			/^No upcoming hackathons matching q=istanbul came back, but part of stellarlight's feed could not be read \(meta\.warnings\), so this is not a check that none is listed/,
		);
		expect(body.meta.counts).toMatchObject({
			returned: 0,
			total: null,
			totalBasis: "partial-read",
		});
	});

	it("reads a DoraHacks listing read in part as a failed read", async () => {
		vi.mocked(fetchAllDoraHacksHackathonsChecked).mockResolvedValueOnce({
			hackathons: [],
			complete: false,
		});
		const body = await feed("?status=active");
		expect(body.meta.partial).toBe(true);
		expect(body.meta.counts.total).toBeNull();
		expect(body.meta.fallbackChannels.summary).toMatch(/could not be read/);
	});
});
