import { describe, expect, it } from "vitest";
import { paperDate, preambleDate, toPublishedAt } from "../doc-dates";

// Real header blocks fetched live from stellar/stellar-protocol@master and
// stellar.org/papers/stellar-consensus-protocol.pdf on 2026-08-28 — the
// parser is calibrated against upstream reality, not invented fixtures.

const SEP_0006 = `## Preamble

\`\`\`
SEP: 0006
Title: Deposit and Withdrawal API
Author: SDF
Status: Active (Interactive components are deprecated in favor of SEP-24)
Created: 2017-10-30
Updated: 2025-09-10
Version 4.3.0
\`\`\`

## Simple Summary

This SEP defines the standard way for anchors and wallets to interact on behalf
of users.`;

const SEP_0001 = `## Preamble

\`\`\`
SEP: 0001
Title: Stellar Info File
Author: stellar.org
Status: Active
Created: 2017-10-30
Updated: 2025-01-16
Version: 2.7.0
\`\`\`
`;

const CAP_0046 = `## Preamble

\`\`\`
CAP: 0046
Title: Soroban smart contract system overview
Working Group:
    Owner: Graydon Hoare <@graydon>
Status: Final
Created: 2022-10-27
Discussion:
Protocol version: 20
\`\`\`

## Simple Summary

This CAP is an overview of changes to stellar-core and the Stellar Protocol.`;

const CAP_0063 = `## Preamble

\`\`\`
CAP: 0063
Title: Parallelism-friendly Transaction Scheduling
Status: Final
Created: 2024-12-18
Discussion: https://github.com/stellar/stellar-protocol/discussions/1602
Protocol version: 23
\`\`\`
`;

describe("preambleDate", () => {
	it("prefers Updated: over Created: (SEP-0006)", () => {
		expect(preambleDate(SEP_0006)).toBe("2025-09-10");
	});

	it("reads SEP-0001's Updated:", () => {
		expect(preambleDate(SEP_0001)).toBe("2025-01-16");
	});

	it("falls back to Created: when a CAP carries no Updated: (CAP-0046)", () => {
		expect(preambleDate(CAP_0046)).toBe("2022-10-27");
	});

	it("reads CAP-0063's Created:", () => {
		expect(preambleDate(CAP_0063)).toBe("2024-12-18");
	});

	it("returns null without the SEP:/CAP: preamble signature", () => {
		// A README-ish chunk mentioning dates in prose must never date the doc.
		expect(
			preambleDate("# Some repo\n\nUpdated: 2024-01-01 by the maintainers."),
		).toBeNull();
	});

	it("returns null when the preamble states no parseable date", () => {
		expect(
			preambleDate("## Preamble\n\nSEP: 9999\nStatus: Draft\n"),
		).toBeNull();
	});

	it("ignores an Updated: beyond the preamble zone", () => {
		const md = `## Preamble\n\nSEP: 0042\nStatus: Draft\n\n${"x".repeat(2600)}\nUpdated: 2024-05-05\n`;
		expect(preambleDate(md)).toBeNull();
	});
});

describe("paperDate", () => {
	it("reads the SCP whitepaper's page footer anywhere in the text", () => {
		const text = `# The Stellar Consensus Protocol: A Federated Model for Internet-level Consensus\n\n${"prose ".repeat(600)}\nDraft of February 25, 2016\n`;
		expect(paperDate(text)).toBe("2016-02-25");
	});

	it("trusts a bare Month D, YYYY only in the head", () => {
		expect(paperDate("Whitepaper\nJanuary 5, 2020\n\nAbstract…")).toBe(
			"2020-01-05",
		);
		expect(
			paperDate(`${"prose ".repeat(600)}March 3, 2021 saw a rise…`),
		).toBeNull();
	});

	it("returns null when no date is stated", () => {
		expect(paperDate("A paper with no date anywhere.")).toBeNull();
	});
});

describe("toPublishedAt", () => {
	it("expands a day to the stored ISO shape", () => {
		expect(toPublishedAt("2025-09-10")).toBe("2025-09-10T00:00:00.000Z");
	});
});
