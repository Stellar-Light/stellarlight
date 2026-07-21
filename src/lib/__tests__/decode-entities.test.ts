import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, normalizeTitleText } from "../decode-entities";

describe("decodeHtmlEntities", () => {
	it("decodes the real S6 offenders", () => {
		// The live sample from corpus-health.
		expect(
			decodeHtmlEntities(
				"The Stellar Development Foundation&#x27;s 2023 Strategy",
			),
		).toBe("The Stellar Development Foundation's 2023 Strategy");
		expect(decodeHtmlEntities("Payments &amp; Anchors")).toBe(
			"Payments & Anchors",
		);
	});

	it("handles decimal, hex, and named references", () => {
		expect(decodeHtmlEntities("a &#39;b&#39; c")).toBe("a 'b' c");
		expect(decodeHtmlEntities("x &#x2014; y")).toBe("x — y");
		expect(decodeHtmlEntities("&lt;tag&gt; &quot;q&quot;")).toBe('<tag> "q"');
	});

	it("leaves unknown references and entity-free text untouched", () => {
		expect(decodeHtmlEntities("no entities here")).toBe("no entities here");
		// Unknown named ref is preserved, not dropped.
		expect(decodeHtmlEntities("A&unknownref;B")).toBe("A&unknownref;B");
		// A bare ampersand is not a reference.
		expect(decodeHtmlEntities("R&D budget")).toBe("R&D budget");
	});

	it("normalizeTitleText also collapses whitespace and trims", () => {
		expect(normalizeTitleText("  Payments &amp;   Anchors  ")).toBe(
			"Payments & Anchors",
		);
	});
});
