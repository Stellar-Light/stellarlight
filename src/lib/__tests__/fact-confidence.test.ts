import { describe, expect, it } from "vitest";
import { factConfidence } from "../fact-confidence";

const NOW = new Date("2026-08-12T12:00:00Z");

describe("factConfidence", () => {
	it("null/unknown basis → null, never a low score", () => {
		expect(factConfidence(null, "2026-08-01", NOW)).toBeNull();
		expect(factConfidence(undefined, null, NOW)).toBeNull();
		expect(factConfidence("made-up-basis", "2026-08-01", NOW)).toBeNull();
	});

	it("evidence ladder orders as documented (fresh facts)", () => {
		const s = (b: string) => factConfidence(b, "2026-08-10", NOW)?.score ?? -1;
		expect(s("human-verified")).toBeGreaterThan(s("official-record"));
		expect(s("official-record")).toBeGreaterThan(s("site-liveness"));
		expect(s("site-liveness")).toBeGreaterThan(s("source-inherited"));
		expect(s("source-inherited")).toBeGreaterThan(s("unverified"));
	});

	it("fresh human-verified is high; unverified is always low", () => {
		expect(factConfidence("human-verified", "2026-08-11", NOW)).toEqual({
			score: 1,
			label: "high",
			ageDays: 1,
		});
		expect(factConfidence("unverified", "2026-08-11", NOW)?.label).toBe("low");
	});

	it("freshness decays stepwise and floors at half", () => {
		const at = (asOf: string) =>
			factConfidence("official-record", asOf, NOW)?.score ?? -1;
		expect(at("2026-08-01")).toBe(0.9); // 11d → ×1.0
		expect(at("2026-06-01")).toBeCloseTo(0.81); // ~72d → ×0.9
		expect(at("2026-03-01")).toBeCloseTo(0.72); // ~164d → ×0.8
		expect(at("2025-10-01")).toBeCloseTo(0.59); // ~315d → ×0.65
		expect(at("2023-01-01")).toBeCloseTo(0.45); // years → ×0.5 floor
	});

	it("unknown asOf on a known basis dampens (0.6), not full trust", () => {
		const c = factConfidence("official-record", null, NOW);
		expect(c).toEqual({ score: 0.54, label: "medium", ageDays: null });
	});

	it("label thresholds: ≥0.75 high, ≥0.5 medium, else low", () => {
		expect(factConfidence("code-scan", "2026-08-10", NOW)?.label).toBe("high");
		expect(factConfidence("source-inherited", "2026-08-10", NOW)?.label).toBe(
			"medium",
		);
		expect(factConfidence("source-inherited", "2024-01-01", NOW)?.label).toBe(
			"low",
		);
	});

	it("garbage asOf is treated as unknown age, not a crash", () => {
		const c = factConfidence("stellar-toml", "not-a-date", NOW);
		expect(c?.ageDays).toBeNull();
		expect(c?.score).toBe(0.54);
	});
});
