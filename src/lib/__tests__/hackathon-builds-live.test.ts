import { describe, expect, it, vi } from "vitest";
import type { DoraHacksSubmission } from "@/lib/integrations/dorahacks";

// The store does not answer, so the index is the live DoraHacks read.
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => null),
}));
const sub = (id: string, name: string): DoraHacksSubmission => ({
	id,
	name,
	description: null,
	githubUrl: null,
	demoUrl: null,
	videoUrl: null,
	track: "Genesis - Build with Stellar",
	hackathonPlacement: null,
	award: null,
	isWinner: false,
	voteCount: null,
	url: `https://dorahacks.io/buidl/${id.replace(/\D/g, "")}`,
	source: "dorahacks",
});
const event = (id: number, uname: string, title: string, end: number) => ({
	id,
	title,
	uname,
	start_time: end - 86_400,
	end_time: end,
	bonus_price: 8000,
	hackers_count: 190,
	winner_announced: false,
	status: 2,
	source: "dorahacks" as const,
});
const ALEBRIJE = event(
	2405,
	"alebrije2026",
	"Hack+ Alebrije | CDMX 2026",
	Date.UTC(2026, 2, 22) / 1000,
);
const PULSO = event(
	2700,
	"stellar-pulso-hackathon",
	"PULSO",
	Date.UTC(2026, 6, 1) / 1000,
);
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathons: vi.fn(async () => [ALEBRIJE]),
	// PULSO's winner list answers 429: the read throws, as it now does.
	fetchHackathonSubmissions: vi.fn(async (h: { uname: string }) => {
		if (h.uname === PULSO.uname)
			throw new Error(`DoraHacks winners for ${PULSO.uname}: HTTP 429`);
		return [
			sub("dorahacks-buidl-41502", "GIBBOR"),
			sub("dorahacks-buidl-41339", "Nomilar"),
		];
	}),
}));

describe("the live read, when the store does not answer", () => {
	it("serves a win named off DoraHacks as the stored read does", async () => {
		const { buildHackathonBuildsIndex } = await import(
			"@/lib/hackathon-builds"
		);
		const idx = await buildHackathonBuildsIndex();
		expect(
			idx.map((b) => [
				b.name,
				b.isWinner,
				b.hackathonPlacement,
				b.winnerSource,
			]),
		).toEqual([
			[
				"GIBBOR",
				true,
				"Winner",
				"https://bafs-newsletter.beehiiv.com/p/b-news-from-mexico-city-to-lima-this-month-s-web3-route",
			],
			["Nomilar", false, null, undefined],
		]);
	});

	it("leaves out an event whose winners cannot be read, serves the rest, and names it", async () => {
		const { buildHackathonBuildsIndex } = await import(
			"@/lib/hackathon-builds"
		);
		const { fetchAllDoraHacksHackathons } = await import(
			"@/lib/integrations/dorahacks"
		);
		const { parseBuildFilters } = await import("@/lib/hackathon-build-query");
		vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([
			PULSO,
			ALEBRIJE,
		]);
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			// A partial answer, not an outage and not PULSO with no winners.
			const idx = await buildHackathonBuildsIndex();
			expect([...new Set(idx.map((b) => b.hackathon.slug))]).toEqual([
				"alebrije2026",
			]);
			expect(log).toHaveBeenCalledWith(
				expect.stringMatching(
					/1 of 2 events could not be read and are left out: stellar-pulso-hackathon \(DoraHacks winners for stellar-pulso-hackathon: HTTP 429\)/,
				),
			);
			// A filter naming it gets the warning the routes already serve.
			const parsed = await parseBuildFilters(
				new URLSearchParams("hackathon=stellar-pulso-hackathon"),
				"hybrid",
				idx,
				async () => ({
					events: [{ slug: PULSO.uname, title: PULSO.title }],
					complete: true,
				}),
			);
			expect("warnings" in parsed && parsed.warnings).toEqual([
				"no submissions are stored for stellar-pulso-hackathon; 0 matched from it is not evidence that nothing was built",
			]);
		} finally {
			log.mockRestore();
		}
	});
});
