/** The Certora grammar had no round-trip, so it published whatever subset its
 * regex matched. Blend v2 (portal report 40) shipped as 6 findings when the
 * report enumerates 10 — it lost H-01 to PDF reflow wrapping that row's
 * severity word, and lost every Informational because the table writes "Info".
 * Both failure modes are reproduced below. */
import { describe, expect, it } from "vitest";
import { extractFindings } from "../audit-findings";

/** Shaped like the real report: a contents list with dot-leaders, then the
 *  findings table. H-01's severity word wraps; I-* rows say "Info". */
const BLEND_V2 = `
Table of Contents
H-01. The protocol is vulnerable to sybil attacks...................... 7
H-02. Users can create nearly unfillable auctions...................... 9
M-01. Missing MAX_POSITIONS check in the flash loan................... 11
M-02. Users can use share inflation to bypass protection.............. 12
L-01. Lack of off-chain infrastructure................................ 14
L-02. Missing check to ensure reserve.config.util..................... 15
L-03. Token to shares ratio can be 1:1............................... 16
I-01. Missing or incorrect documentation............................. 18
I-02. Code quality and best practices................................ 19
I-03. Spelling mistakes.............................................. 20

Detailed Findings
H-01 The protocol is vulnerable to sybil attacks due to the lack of
High Fixed
H-02 Users can create nearly unfillable auctions High Fixed
M-01 Medium Fixed Missing MAX_POSITIONS check in the flash
M-02 Users can use share inflation to bypass Medium Fixed
L-01 Lack of off-chain infrastructure to call Low Acknowledged
L-02 Missing check to ensure reserve.config.util is Low Fixed
L-03 Low Acknowledged Token to shares ratio can be 1:1
I-01 Missing or Incorrect documentation Info Fixed
I-02 Code quality and best practices Info Acknowledged
I-03 Spelling Mistakes Info Fixed
`;

describe("certora findings extraction", () => {
	it("counts every enumerated finding, including Info and a wrapped row", () => {
		expect(extractFindings("Certora", BLEND_V2)).toEqual({
			findingsTotal: 10,
			severityCounts: { high: 2, medium: 2, low: 3, informational: 3 },
		});
	});

	it("refuses when the table names a finding the contents never listed", () => {
		// An id in the table but not the contents means we are reading prose,
		// not the report's structure. Not-extracted beats a confident subset.
		expect(
			extractFindings("Certora", `${BLEND_V2}\nM-09 Invented row Medium Fixed\n`),
		).toBeNull();
	});

	it("refuses when a severity word contradicts its own ID prefix", () => {
		expect(
			extractFindings(
				"Certora",
				BLEND_V2.replace("H-02 Users can create nearly unfillable auctions High Fixed",
					"H-02 Users can create nearly unfillable auctions Low Fixed"),
			),
		).toBeNull();
	});
});
