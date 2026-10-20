import { describe, expect, it } from "vitest";
import { CURATED_HACKATHONS, TS_DATE_SHIFTS } from "../curated-hackathons";

describe("curated hackathons", () => {
	it("serves every date as written: no timestamp crosses a UTC date", () => {
		expect(CURATED_HACKATHONS.length).toBeGreaterThan(0);
		expect(TS_DATE_SHIFTS).toEqual([]);
	});
});
