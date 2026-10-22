import { describe, expect, it } from "vitest";
import { CURATED_BUILDS } from "../curated-builds";
import {
	CURATED_HACKATHONS,
	CURATED_WINNERS_NOTES,
	curatedTimestamp,
	shiftsUtcDate,
	TS_DATE_SHIFTS,
} from "../curated-hackathons";
import { LATEST_WINNERS } from "../recent-hackathon-winners";

describe("curated winners notes", () => {
	it("say why a curated event's winners are missing, dated, for curated events only", () => {
		const events = new Set(CURATED_HACKATHONS.map((h) => h.uname));
		expect(Object.keys(CURATED_WINNERS_NOTES).sort()).toEqual([
			"apac-stellar-hackathon-2026",
			"stellar-builders-camp-jaipur-2026",
			"stellar-journey-to-mastery-2026",
		]);
		for (const [slug, note] of Object.entries(CURATED_WINNERS_NOTES)) {
			expect(events.has(slug), slug).toBe(true);
			expect(note, slug).toMatch(/checked \d{4}-\d{2}-\d{2}/);
			// Not announced is never "none won".
			expect(note, slug).toMatch(/not a claim/);
			expect(note, slug).not.toMatch(/[\u2013\u2014]/);
		}
		expect(CURATED_WINNERS_NOTES["apac-stellar-hackathon-2026"]).toMatch(
			/^Winners published for one track only: .*Olio 1st in Payment & Consumer Application/,
		);
	});

	it("an event noted as not announced serves no winner", () => {
		const won = new Set([
			...CURATED_BUILDS.filter((b) => b.isWinner).map((b) => b.hackathonSlug),
			LATEST_WINNERS.hackathonUname,
		]);
		const unannounced = Object.entries(CURATED_WINNERS_NOTES).filter(([, n]) =>
			n.startsWith("Not announced upstream"),
		);
		expect(unannounced.map(([slug]) => slug).sort()).toEqual([
			"stellar-builders-camp-jaipur-2026",
			"stellar-journey-to-mastery-2026",
		]);
		for (const [slug] of unannounced) expect(won.has(slug), slug).toBe(false);
	});
});

describe("curated hackathons", () => {
	it("serves every date as written: no timestamp crosses a UTC date", () => {
		expect(CURATED_HACKATHONS.length).toBeGreaterThan(0);
		expect(TS_DATE_SHIFTS).toEqual([]);
	});

	it("records a shifted timestamp written through the rows' helper", () => {
		const before = TS_DATE_SHIFTS.length;
		try {
			curatedTimestamp("2026-08-21T00:00:00+05:30");
			expect(TS_DATE_SHIFTS.slice(before)).toEqual([
				"2026-08-21T00:00:00+05:30",
			]);
		} finally {
			// Never leave the shared list dirty for the "empty" test.
			TS_DATE_SHIFTS.splice(before);
		}
	});

	it("detects a timestamp whose UTC date is not the date written", () => {
		// Local midnight east of UTC, and late evening west of it, roll over.
		expect(shiftsUtcDate("2026-08-21T00:00:00+05:30")).toBe(true);
		expect(shiftsUtcDate("2026-08-06T23:59:00-03:00")).toBe(true);
		expect(shiftsUtcDate("2026-08-21T15:00:00+05:30")).toBe(false);
		expect(shiftsUtcDate("2026-10-25T09:00:00+00:00")).toBe(false);
	});

	it("keeps HackMeridian 2026 on the organizer's figures, not 2024's", () => {
		const h = CURATED_HACKATHONS.find((x) => x.uname === "hackmeridian-2026");
		expect(h?.bonus_price).toBe(30000);
		const iso = (s?: number) => new Date((s ?? 0) * 1000).toISOString();
		expect(iso(h?.start_time)).toBe("2026-10-25T09:00:00.000Z");
		expect(iso(h?.end_time)).toBe("2026-10-26T12:00:00.000Z");
		expect(h?.description).toMatch(/Genesis/);
		expect(h?.description).toMatch(/Scale/);
		expect(h?.description).toMatch(/\$30,000/);
		expect(h?.description).toMatch(/calls it 28 hours; its schedule gives 27/);
		// The archived 2024 session's figures.
		expect(h?.description).not.toMatch(/36 hours|\$50,000/);
	});

	it("says HackMeridian 2025's days are derived, and stores them at midday", () => {
		const h = CURATED_HACKATHONS.find((x) => x.uname === "hackmeridian-2025");
		expect(h?.description).toMatch(/15 to 16 September dates here are derived/);
		const iso = (s?: number) => new Date((s ?? 0) * 1000).toISOString();
		// Midday Rio time on each derived day.
		expect(iso(h?.start_time)).toBe("2025-09-15T15:00:00.000Z");
		expect(iso(h?.end_time)).toBe("2025-09-16T15:00:00.000Z");
	});
});
