import { describe, expect, it } from "vitest";
import { clampSentences, plainText } from "../quality-text";

describe("quality board text", () => {
	it("drops markdown the card cannot render", () => {
		expect(plainText("cover **222 of 382** rows via `strongBasisSplit`")).toBe(
			"cover 222 of 382 rows via strongBasisSplit",
		);
	});
	it("leaves a short paragraph alone", () => {
		expect(clampSentences("two lanes at Stage 2.", 300)).toEqual({
			text: "two lanes at Stage 2.",
			clamped: false,
		});
	});
	it("clamps a wall at a sentence boundary and says so", () => {
		const wall = `${"first sentence here. ".repeat(4)}${"x".repeat(400)}`;
		const out = clampSentences(wall, 100);
		expect(out.clamped).toBe(true);
		expect(out.text.endsWith(". …")).toBe(true);
		expect(out.text.length).toBeLessThanOrEqual(104);
	});
});
