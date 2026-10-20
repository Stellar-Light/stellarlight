import { describe, expect, it } from "vitest";
import {
	CURATED_HACKATHONS,
	shiftsUtcDate,
	TS_DATE_SHIFTS,
} from "../curated-hackathons";

describe("curated hackathons", () => {
	it("serves every date as written: no timestamp crosses a UTC date", () => {
		expect(CURATED_HACKATHONS.length).toBeGreaterThan(0);
		expect(TS_DATE_SHIFTS).toEqual([]);
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

	it("says HackMeridian 2025's days are derived", () => {
		const h = CURATED_HACKATHONS.find((x) => x.uname === "hackmeridian-2025");
		expect(h?.description).toMatch(/derived/);
	});
});
