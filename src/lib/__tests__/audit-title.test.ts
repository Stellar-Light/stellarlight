/**
 * composeAuditTitle — Q6, the overlong slice of the corpus-hygiene queue.
 *
 * The audit ingester appended the portal's report `name` unconditionally, and
 * that name is usually the PDF's internal doc-title restating the protocol and
 * auditor already in front of it. Three titles served on prod today breach the
 * corpus sweep's 110-char "overlong (sentence, not a title)" bar — the strings
 * below are copied verbatim from /api/research?source=audit.
 */
import { describe, expect, it } from "vitest";
import { composeAuditTitle, MAX_TITLE_LEN } from "../audit-identity";

describe("composeAuditTitle — the live overlong cases", () => {
	const CASES = [
		{
			protocol: "PhoenixDeFiHub",
			auditor: "Veridise",
			name: "Auditing Report Hardening Blockchain Security with Formal Methods for PhoenixDeFiHub",
			want: "PhoenixDeFiHub — Veridise",
		},
		{
			protocol: "Stellar Timelock Contract",
			auditor: "Veridise",
			name: "Auditing Report Hardening Blockchain Security with Formal Methods for Stellar Timelock Contract",
			want: "Stellar Timelock Contract — Veridise",
		},
		{
			protocol: "Soroban - Band Standard Reference Contract",
			auditor: "Runtime Verification",
			name: "Band Protocol: Soroban - Band Standard Reference Contract Audit Report",
			want: "Soroban - Band Standard Reference Contract — Runtime Verification",
		},
	];

	it.each(CASES)("$protocol drops the restating parenthetical", (c) => {
		const title = composeAuditTitle(c.protocol, c.auditor, c.name);
		expect(title).toBe(c.want);
		expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LEN);
	});
});

describe("composeAuditTitle — what it must NOT throw away", () => {
	it("keeps a short name that adds a real distinction", () => {
		expect(composeAuditTitle("Blend", "Certora", "V2.1")).toBe(
			"Blend — Certora (V2.1)",
		);
	});

	it("keeps a name that distinguishes two audits of the same pair", () => {
		expect(composeAuditTitle("Soroswap", "OtterSec", "Phase 2 Re-audit")).toBe(
			"Soroswap — OtterSec (Phase 2 Re-audit)",
		);
	});

	it("drops a name that only restates the prefix, even when short", () => {
		expect(composeAuditTitle("Blend", "Certora", "Blend Certora")).toBe(
			"Blend — Certora",
		);
	});

	it("handles a missing report name", () => {
		expect(composeAuditTitle("Blend", "Certora", null)).toBe("Blend — Certora");
		expect(composeAuditTitle("Blend", "Certora", "")).toBe("Blend — Certora");
	});

	it("never exceeds the bar, whatever it is handed", () => {
		const title = composeAuditTitle(
			"Some Protocol",
			"Some Auditor",
			"x".repeat(400),
		);
		expect(title.length).toBeLessThanOrEqual(MAX_TITLE_LEN);
	});

	it("still repairs the identity text it always did (homoglyph auditor)", () => {
		// canonicalAuditor fixes the portal's Cyrillic-Es "Сoinspect"
		expect(composeAuditTitle("Blend", "Сoinspect", null)).toBe(
			"Blend — Coinspect",
		);
	});
});
