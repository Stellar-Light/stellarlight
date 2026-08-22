/** parseCapPreamble — fixture text verbatim from real CAPs (2026-08-04). */
import { describe, expect, it } from "vitest";
import { parseCapPreamble } from "../cap-preamble";

const CAP_46 = `## Preamble

\`\`\`
CAP: 0046
Title: Soroban smart contract system overview
Status: Final
Created: 2022-10-27
Discussion:
Protocol version: 20
\`\`\`

## Simple Summary
...`;

describe("parseCapPreamble", () => {
	it("parses Status + Protocol version from a real preamble", () => {
		expect(parseCapPreamble(CAP_46)).toEqual({
			status: "Final",
			protocolVersion: 20,
		});
	});

	it("non-numeric protocol version (TBD drafts) yields null, never guessed", () => {
		const md = "```\nCAP: 0099\nStatus: Draft\nProtocol version: TBD\n```";
		expect(parseCapPreamble(md)).toEqual({
			status: "Draft",
			protocolVersion: null,
		});
	});

	it("missing preamble yields nulls", () => {
		expect(parseCapPreamble("# Some doc without a preamble")).toEqual({
			status: null,
			protocolVersion: null,
		});
	});

	it("a 'Status:' deep in prose does not match (head-only)", () => {
		const md = `${"x".repeat(3000)}\nStatus: Fake\nProtocol version: 99`;
		expect(parseCapPreamble(md)).toEqual({
			status: null,
			protocolVersion: null,
		});
	});
});
