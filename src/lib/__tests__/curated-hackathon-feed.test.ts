import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import {
	CURATED_HACKATHONS,
	CURATED_WINNERS_NOTES,
} from "@/data/curated-hackathons";
import { fetchAllDoraHacksHackathons } from "@/lib/integrations/dorahacks";
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
			expect(JSON.stringify(r), slug).not.toMatch(/[–—]/);
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

	it("serves its two tracks and says why no winner row is held", async () => {
		const body = await detail(SLUG);
		expect(
			body.hackathon.tracks.map((t: { name: string; kind: string }) => [
				t.kind,
				t.name,
			]),
		).toEqual([
			["category", "Genesis Track"],
			["category", "Scale Track"],
		]);
		expect(body.hackathon.stats.winners).toBe(0);
		expect(body.hackathon.stats.winnersNote).toBe(CURATED_WINNERS_NOTES[SLUG]);
		expect(body.hackathon.stats.winnersNote).toMatch(/names seven winners/);
		expect(body.hackathon.stats.winnersNote).toMatch(/not a claim/);
		expect(body.hackathon.description).toMatch(/presented by Stellar/i);
	});
});

// Live 1.9.116: an empty ?status=active said "between events", a claim
// about the ecosystem's schedule that the feed cannot make.
describe("the empty-feed summary", () => {
	const summaryFor = async (query: string) => {
		vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([]);
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
		// Other filters narrow what was looked at, and it says so.
		expect(await summaryFor("?status=active&q=istanbul")).toMatch(
			/^No active hackathons match these filters in stellarlight's feed right now\./,
		);
	});

	it("says a failed read is no check that none is listed", async () => {
		vi.mocked(fetchAllDoraHacksHackathons).mockRejectedValueOnce(
			new Error("DoraHacks down"),
		);
		const body = await feed("?status=upcoming");
		expect(body.meta.warnings?.length).toBeGreaterThan(0);
		expect(body.meta.fallbackChannels.summary).toMatch(
			/could not be read \(meta\.warnings\), so this is not a check that none is listed/,
		);
	});
});
