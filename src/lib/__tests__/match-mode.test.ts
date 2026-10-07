import { describe, expect, it } from "vitest";
import { matchModeMeta, SIMPLE_MATCH_LABEL } from "../match-mode";

describe("shared simple match-mode vocabulary", () => {
	it("every mode has a label that names the mechanism", () => {
		for (const [mode, label] of Object.entries(SIMPLE_MATCH_LABEL))
			expect(label.length, mode).toBeGreaterThan(10);
	});
	it("meta helper is spread-ready", () => {
		expect(matchModeMeta("filtered")).toEqual({
			matchMode: "filtered",
			matchModeLabel: SIMPLE_MATCH_LABEL.filtered,
		});
	});
});
