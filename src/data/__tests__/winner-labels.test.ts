import { describe, expect, it } from "vitest";
import { LATEST_WINNERS } from "../recent-hackathon-winners";

// The hackathon page splits a placement label at a spaced hyphen, en dash or
// em dash: the place goes in the badge, the rest in the track chip
// (app/(frontend)/hackathons/[slug]/page.tsx, placementMeta). A label written
// with another separator loses its chip on the live page.
const SPLIT = /\s+[-–—]\s+/;

describe("roster placement labels", () => {
	it("every label splits into a place and a track at a spaced hyphen", () => {
		expect(LATEST_WINNERS.winners.length).toBeGreaterThan(0);
		for (const w of LATEST_WINNERS.winners) {
			const [place, ...rest] = w.placementLabel.split(SPLIT);
			expect(place, w.placementLabel).toMatch(/^\d+(st|nd|rd|th)$/);
			expect(rest.join(" ").length, w.placementLabel).toBeGreaterThan(0);
		}
	});
});
