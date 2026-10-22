import { describe, expect, it } from "vitest";
import { CURATED_HACKATHONS } from "../curated-hackathons";
import { WINNER_OVERLAY } from "../winner-overlay";

describe("winners named off DoraHacks", () => {
	it("name stored DoraHacks submissions by build id, each once, with a dated source", () => {
		// An event off DoraHacks carries its winners as its own curated rows.
		const curated = new Set(CURATED_HACKATHONS.map((h) => h.uname));
		const keys = WINNER_OVERLAY.flatMap((e) =>
			e.winners.map((w) => `${w.buildId}@${e.hackathonSlug}`),
		);
		expect(new Set(keys).size).toBe(keys.length);
		for (const e of WINNER_OVERLAY) {
			expect(curated.has(e.hackathonSlug), e.hackathonSlug).toBe(false);
			expect(e.url).toMatch(/^https:\/\//);
			expect(e.note).toMatch(/checked on \d{4}-\d{2}-\d{2}/);
			expect(e.note).not.toMatch(/[\u2013\u2014]/);
			for (const w of e.winners) {
				expect(w.buildId).toMatch(/^dorahacks-buidl-\d+$/);
				expect(w.placement.trim()).not.toBe("");
			}
		}
	});

	it("serves Hack+ Alebrije's two stored winners and says the third is not stored", () => {
		const e = WINNER_OVERLAY.find((x) => x.hackathonSlug === "alebrije2026");
		expect(e?.url).toBe(
			"https://bafs-newsletter.beehiiv.com/p/b-news-from-mexico-city-to-lima-this-month-s-web3-route",
		);
		// MañanaSeguro and GIBBOR; the newsletter names no places.
		expect(e?.winners).toEqual([
			{ buildId: "dorahacks-buidl-41505", placement: "Winner" },
			{ buildId: "dorahacks-buidl-41502", placement: "Winner" },
		]);
		expect(e?.note).toMatch(/Seyf is not served/);
	});
});
