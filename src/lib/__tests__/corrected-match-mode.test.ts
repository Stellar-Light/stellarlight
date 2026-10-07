/**
 * sls-076: q="Strupey" returned Stroopy.AI at matchMode=strict with
 * "all keywords matched" and confidence 0.92 — although neither the name nor
 * the slug contains "strupey". The admission came from our own curated
 * spelling-correction synonym (strupey → stroopy), which is deliberate and
 * good; the LABEL was the lie. Two independent agent runs promoted the row
 * into identity evidence for an unverified name on the strength of it.
 *
 * The fix: a row admitted ONLY through a spelling correction reports
 * matchMode "corrected", never a keyword tier.
 */
import { describe, expect, it } from "vitest";
import {
	buildHaystack,
	correctionMediated,
	tokenize,
} from "../project-search-match";
import { SPELLING_CORRECTIONS } from "../search-vocabulary";

const stroopy = buildHaystack({
	name: "Stroopy.AI",
	slug: "stroopyai",
	shortDescription: "AI companion for the Stellar ecosystem",
	category: "User-Facing App",
} as never);

describe("spelling corrections are labelled, not laundered", () => {
	it("knows strupey is a correction", () => {
		expect(SPELLING_CORRECTIONS.strupey).toBe("stroopy");
	});

	it("flags the Stroopy row as correction-mediated for q=Strupey", () => {
		expect(correctionMediated(stroopy, tokenize("Strupey"))).toBe(true);
	});

	it("does NOT flag it for its real name", () => {
		expect(correctionMediated(stroopy, tokenize("Stroopy"))).toBe(false);
		expect(correctionMediated(stroopy, tokenize("stroopyai"))).toBe(false);
	});

	it("leaves domain synonyms alone — cex is a synonym, not a correction", () => {
		const binance = buildHaystack({
			name: "Binance",
			slug: "binance",
			shortDescription: "Binance is a centralized exchange that lists XLM",
			category: "User-Facing App",
			types: ["Exchange"],
		} as never);
		expect(correctionMediated(binance, tokenize("cex exchange"))).toBe(false);
	});

	it("does not fire when the literal token genuinely occurs", () => {
		const hay = buildHaystack({
			name: "Strupey Labs",
			slug: "strupey-labs",
			shortDescription: "hypothetical row that really carries the token",
		} as never);
		expect(correctionMediated(hay, tokenize("Strupey"))).toBe(false);
	});
});
