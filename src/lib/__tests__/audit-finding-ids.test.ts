import { describe, expect, it } from "vitest";

/**
 * stellarlight#1031. Scout reported `V-SOR-APP-VUL-003` as an exact MISS while
 * the Veridise V2.1 report carries it in Appendix A.2.2 — a confident false
 * negative on a real audit item.
 *
 * Root cause: the heading promoter required exactly THREE alpha groups of 2+
 * letters ([A-Z]{2,}-[A-Z]{2,}-[A-Z]{2,}-\d+), so every Veridise id was
 * missed — they have FOUR groups and a single-letter prefix. Their findings
 * never became their own chunk, so no chunk carried the identifier verbatim.
 *
 * This pins the pattern. Keep it identical to ingest-soroban-security.ts and
 * inspect-audit-corpus.ts.
 */
const FINDING_ID = /^# ([A-Z]+(?:-[A-Z]{2,}){2,}-\d+\s*)/m;

describe("audit finding-ID heading promoter", () => {
	it("promotes Veridise ids (the reported miss)", () => {
		expect(FINDING_ID.test("# V-SOR-APP-VUL-003 Denial of Service")).toBe(true);
		expect(FINDING_ID.test("# V-BLND-VUL-001 Some Finding")).toBe(true);
	});

	it("still promotes the OtterSec form it already handled", () => {
		expect(FINDING_ID.test("# OS-BCL-ADV-00 Advisory")).toBe(true);
	});

	it("does not swallow ordinary prose headings", () => {
		// A heading must still look like an identifier, not just contain caps.
		expect(FINDING_ID.test("# Executive Summary")).toBe(false);
		expect(FINDING_ID.test("# Scope and Methodology")).toBe(false);
	});
});
