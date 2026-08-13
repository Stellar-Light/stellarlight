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

describe("code-truth signals in notes", () => {
	const audits = new Map([
		["blend", [{ projectSlug: "blend", auditor: "Certora", publishedAt: "2025-08-13" }]],
	]);
	it("audit note carries drift days + committed-since when both dates exist", () => {
		const notes = buildKnowledgeNotes("x/y", "blend", audits, {
			lastCommitAt: "2026-08-01T00:00:00Z",
		});
		const audit = notes.find((n) => n.source === "derived:audit");
		expect(audit?.note).toMatch(/Latest report is \d+ days old; the repo has committed since\./);
	});
	it("audit note says no-commits-since when the repo is older than the audit", () => {
		const notes = buildKnowledgeNotes("x/y", "blend", audits, {
			lastCommitAt: "2025-01-01T00:00:00Z",
		});
		expect(notes.find((n) => n.source === "derived:audit")?.note).toContain("no commits since");
	});
	it("usage note appears only with a dated codeInUse and formats deltas", () => {
		const notes = buildKnowledgeNotes("x/y", null, new Map(), {
			codeInUse: { contracts: 1, events: 44447, eventsDelta: 743, asOf: "2026-08-13" },
		});
		const use = notes.find((n) => n.source === "derived:usage");
		expect(use?.note).toBe(
			"Live on mainnet: 1 attributed contract, 44,447 lifetime events (+743 since the prior weekly snapshot) per stellar.expert.",
		);
		expect(use?.asOf).toBe("2026-08-13");
	});
	it("no usage note without codeInUse", () => {
		const notes = buildKnowledgeNotes("x/y", null, new Map(), {});
		expect(notes.find((n) => n.source === "derived:usage")).toBeUndefined();
	});
});
