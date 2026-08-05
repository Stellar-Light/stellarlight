/** buildKnowledgeNotes — facts with sources, exact joins, never guesses. */
import { describe, expect, it } from "vitest";
import { type AuditRecord, buildKnowledgeNotes } from "../repo-knowledge";

const audits = new Map<string, AuditRecord[]>([
	[
		"blend",
		[
			{ projectSlug: "blend", auditor: "Certora", publishedAt: "2025-03-01" },
			{ projectSlug: "blend", auditor: "OtterSec", publishedAt: "2025-09-15" },
		],
	],
]);

describe("buildKnowledgeNotes", () => {
	it("derives an audit note from an EXACT projectSlug join, naming the latest", () => {
		const notes = buildKnowledgeNotes("blend-capital/blend-contracts", "blend", audits);
		expect(notes).toHaveLength(1);
		expect(notes[0].source).toBe("derived:audit");
		expect(notes[0].note).toContain("2 security audit reports");
		expect(notes[0].note).toContain("OtterSec, 2025-09-15");
	});

	it("no project or no audits → no derived note, never a guess", () => {
		expect(buildKnowledgeNotes("x/y", null, audits)).toEqual([]);
		expect(buildKnowledgeNotes("x/y", "unknown-project", audits)).toEqual([]);
	});

	it("curated entries attach case-insensitively by fullName", () => {
		const notes = buildKnowledgeNotes(
			"Creit-Tech/Stellar-Indexer-SDK",
			null,
			new Map(),
		);
		expect(notes).toHaveLength(1);
		expect(notes[0].source).toBe("curated");
		expect(notes[0].note).toContain("per-protocol extensions");
		expect(notes[0].asOf).toBe("2026-08-01");
	});

	it("curated + derived stack on the same repo", () => {
		const withAudit = new Map<string, AuditRecord[]>([
			["colibri", [{ projectSlug: "colibri", auditor: null, publishedAt: null }]],
		]);
		const notes = buildKnowledgeNotes("fazzatti/colibri", "colibri", withAudit);
		expect(notes.map((n) => n.source)).toEqual(["curated", "derived:audit"]);
	});
});
