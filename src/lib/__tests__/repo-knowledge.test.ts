/** buildKnowledgeNotes — facts with sources, exact joins, never guesses. */
import { describe, expect, it } from "vitest";
import {
	type AuditRecord,
	buildKnowledgeNotes,
	findDirectAnswerNote,
	findRepoByTrigger,
	REPO_KNOWLEDGE_NOTES,
} from "../repo-knowledge";

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
		const notes = buildKnowledgeNotes(
			"blend-capital/blend-contracts",
			"blend",
			audits,
		);
		// The registry may also carry curated notes for this repo (P5 batch 3
		// does) — assert the DERIVED note, not the total.
		const derived = notes.filter((n) => n.source === "derived:audit");
		expect(derived).toHaveLength(1);
		expect(derived[0].note).toContain("2 security audit reports");
		expect(derived[0].note).toContain("OtterSec, 2025-09-15");
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
			[
				"colibri",
				[{ projectSlug: "colibri", auditor: null, publishedAt: null }],
			],
		]);
		const notes = buildKnowledgeNotes("fazzatti/colibri", "colibri", withAudit);
		// colibri carries the 2026-08-15 deep-read set (6 curated notes); the
		// stacking contract is curated-first then derived, whatever the count.
		const sources = notes.map((n) => n.source);
		expect(
			sources.filter((x) => x === "curated").length,
		).toBeGreaterThanOrEqual(6);
		expect(sources.at(-1)).toBe("derived:audit");
		expect(sources.slice(0, -1).every((x) => x === "curated")).toBe(true);
	});
});

describe("code-truth signals in notes", () => {
	const audits = new Map([
		[
			"blend",
			[{ projectSlug: "blend", auditor: "Certora", publishedAt: "2025-08-13" }],
		],
	]);
	it("audit note carries drift days + committed-since when both dates exist", () => {
		const notes = buildKnowledgeNotes("x/y", "blend", audits, {
			lastCommitAt: "2026-08-01T00:00:00Z",
		});
		const audit = notes.find((n) => n.source === "derived:audit");
		expect(audit?.note).toMatch(
			/Latest report is \d+ days old; the repo has committed since\./,
		);
	});
	it("audit note says no-commits-since when the repo is older than the audit", () => {
		const notes = buildKnowledgeNotes("x/y", "blend", audits, {
			lastCommitAt: "2025-01-01T00:00:00Z",
		});
		expect(notes.find((n) => n.source === "derived:audit")?.note).toContain(
			"no commits since",
		);
	});
	it("usage note appears only with a dated codeInUse and formats deltas", () => {
		const notes = buildKnowledgeNotes("x/y", null, new Map(), {
			codeInUse: {
				contracts: 1,
				events: 44447,
				eventsDelta: 743,
				asOf: "2026-08-13",
			},
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

// sls-080: a curated dated fact leads the answer only when the query names
// the exact identifier the note carries — tight by design.
describe("findDirectAnswerNote", () => {
	const notes = [
		{
			note: "Horizon's protocol ceiling: MaxSupportedProtocolVersion uint32 = 28, defined in internal/ingest/main.go.",
			source: "curated",
			asOf: "2026-09-01",
		},
	];

	it("matches a camelCase identifier in the question", () => {
		expect(
			findDirectAnswerNote(
				"what is the MaxSupportedProtocolVersion in stellar horizon",
				notes,
			)?.asOf,
		).toBe("2026-09-01");
	});

	it("never matches generic prose questions", () => {
		expect(
			findDirectAnswerNote("how does horizon ingest ledger data", notes),
		).toBeNull();
		expect(
			findDirectAnswerNote("what protocol version is supported", notes),
		).toBeNull();
	});

	it("short or non-identifier tokens never qualify", () => {
		expect(findDirectAnswerNote("what is mainGo", notes)).toBeNull();
	});

	it("internal notes never become answers", () => {
		const internal = [{ ...notes[0], visibility: "internal" as const }];
		expect(
			findDirectAnswerNote(
				"what is the MaxSupportedProtocolVersion here",
				internal,
			),
		).toBeNull();
	});
});

// Audit C1 (2026-09-01): three reproduced hijacks of the note matcher, each
// pinned dead. A note must lead ONLY when the question names its identifier.
describe("findDirectAnswerNote hijack resistance", () => {
	const horizonNote = [
		{
			note: "Horizon protocol ceiling: MaxSupportedProtocolVersion = 28 (a uint32 constant defined in internal/ingest/main.go) — https://github.com/stellar/stellar-horizon/blob/master/internal/ingest/main.go",
			source: "curated",
			asOf: "2026-09-01",
		},
	];
	const advisoryNote = [
		{
			note: "One advisory: mnemonic phrase readable via private API, fixed in 5.3.1 — https://github.com/stellar/freighter/security/advisories/GHSA-vqr6-hwg2-775w",
			source: "curated",
			asOf: "2026-09-01",
		},
	];

	it("citation URLs never make a note match (github.com question ≠ advisory)", () => {
		expect(
			findDirectAnswerNote(
				"how do I report a bug on github.com for freighter?",
				advisoryNote,
			),
		).toBeNull();
	});

	it("bare domains are not identifiers", () => {
		expect(
			findDirectAnswerNote(
				"is stellar-horizon.com the official site?",
				horizonNote,
			),
		).toBeNull();
	});

	it("infix fragments never match squashed paths (internal_ingest ≠ internal/ingest)", () => {
		expect(
			findDirectAnswerNote(
				"how do I configure internal_ingest workers?",
				horizonNote,
			),
		).toBeNull();
		expect(
			findDirectAnswerNote(
				"max_supported throughput of horizon ingestion?",
				horizonNote,
			),
		).toBeNull();
	});

	it("the exact identifier still matches (the sls-080 case survives the hardening)", () => {
		expect(
			findDirectAnswerNote(
				"what is the MaxSupportedProtocolVersion in stellar horizon",
				horizonNote,
			)?.asOf,
		).toBe("2026-09-01");
	});
});

// sls-080 round 2: the upstream monitor's probe is PLAIN ENGLISH — no
// identifier — so the note must reach it through its curated trigger
// phrases. Pinned against the REAL registry entry (the served contract),
// with the monitor's exact sentence.
describe("findDirectAnswerNote trigger phrases", () => {
	const real = REPO_KNOWLEDGE_NOTES["stellar/stellar-horizon"];

	it("the upstream monitor's exact phrasing reaches the note", () => {
		expect(
			findDirectAnswerNote(
				"Which Horizon ingestion constant pins the highest supported protocol version, and what is its value?",
				real,
			)?.note,
		).toContain("= 28");
	});

	it("natural max/maximum phrasings reach the note", () => {
		expect(
			findDirectAnswerNote("what is the max supported protocol version", real)
				?.note,
		).toContain("= 28");
		expect(
			findDirectAnswerNote(
				"maximum supported protocol version of horizon?",
				real,
			)?.note,
		).toContain("= 28");
	});

	it("vague or partial phrasings still fall through to DeepWiki", () => {
		expect(
			findDirectAnswerNote("what protocol version is supported", real),
		).toBeNull();
		expect(
			findDirectAnswerNote("how does horizon check protocol versions", real),
		).toBeNull();
		expect(
			findDirectAnswerNote(
				"max_supported throughput of horizon ingestion?",
				real,
			),
		).toBeNull();
	});

	it("trigger words must ALL appear — scattered overlap never fires", () => {
		expect(
			findDirectAnswerNote(
				"is the highest ledger version the supported one?",
				real,
			),
		).toBeNull();
	});
});

describe("findRepoByTrigger", () => {
	it("routes a plain-English question to the ONE repo whose trigger fires", () => {
		expect(findRepoByTrigger("was the soroban cli renamed?")).toBe(
			"stellar/stellar-cli",
		);
		expect(findRepoByTrigger("where did the java stellar sdk moved to")).toBe(
			"lightsail-network/java-stellar-sdk",
		);
	});

	it("no trigger, or a single shared word, routes nothing", () => {
		expect(findRepoByTrigger("what is soroban")).toBeNull();
		expect(findRepoByTrigger("renamed")).toBeNull();
	});
});

describe("pool triage verdicts", () => {
	it("expand to INTERNAL notes only — a verdict is never served as an answer", () => {
		const entry = REPO_KNOWLEDGE_NOTES["402md/agentcard"];
		expect(entry?.length).toBeGreaterThan(0);
		expect(entry?.every((n) => n.visibility === "internal")).toBe(true);
		expect(
			findDirectAnswerNote("agentcard hackathon demo testnet", entry ?? []),
		).toBeNull();
	});
});
