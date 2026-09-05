/** The six-hour lane's reading attaches to a registry row without ever
 * touching identity, and its absence is an admission, never zero. */
import { describe, expect, it } from "vitest";
import { RWA_REGISTRY } from "@/data/rwa-registry";
import { mergeMeasured } from "../rwa-measured";

const row = RWA_REGISTRY.find((r) => r.symbol === "USDY");
if (!row) throw new Error("fixture missing");

describe("mergeMeasured", () => {
	it("null until the lane has measured the asset — never a zero supply", () => {
		expect(mergeMeasured(row, null).measured).toBeNull();
		expect(mergeMeasured(row, undefined).measured).toBeNull();
		// a doc without a date or basis is not a measurement
		expect(mergeMeasured(row, { supply: 5 }).measured).toBeNull();
	});

	it("a live reading rides the row, dated, and identity is untouched", () => {
		const m = mergeMeasured(row, {
			supply: 461621961.66,
			holders: 2715,
			activityCount: 1234,
			measureBasis: "live",
			measuredAt: "2026-09-05T03:37:00.000Z",
			note: null,
		});
		expect(m.measured).toEqual({
			supply: 461621961.66,
			holders: 2715,
			activityCount: 1234,
			measureBasis: "live",
			measuredAt: "2026-09-05T03:37:00.000Z",
			note: null,
		});
		expect(m.id).toBe(row.id);
		expect(m.verificationLevel).toBe(row.verificationLevel);
		expect(m.state).toBe(row.state);
	});

	it("an unmeasured reading keeps the previous numbers and says why", () => {
		const m = mergeMeasured(row, {
			supply: 461000000,
			holders: 2700,
			activityCount: null,
			measureBasis: "unmeasured",
			measuredAt: "2026-09-04T21:37:00.000Z",
			note: "could not check: rate-limited or unreachable after retries",
		});
		expect(m.measured?.measureBasis).toBe("unmeasured");
		expect(m.measured?.supply).toBe(461000000);
		expect(m.measured?.note).toContain("could not check");
	});
});
