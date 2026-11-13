/**
 * The Raven panel counts the records Raven retired.
 *
 * Raven's improvements/stellar-light-scout folder is an active queue: a
 * record they retire is deleted, with a receipt in their resolved.json. The
 * builder listed only the folder, so on 2026-11-12 /quality read 4 records
 * lifetime while their ledger held 110 retired (sls-101, sls-111 and sls-115
 * that day in PR #423, sls-024 and sls-029 in PR #424).
 */
import { describe, expect, it } from "vitest";
import {
	type Deletion,
	type ExternalRecord,
	type Receipt,
	retiredRecords,
	summarize,
} from "../../../scripts/quality/build-external-findings";

const receipts: Receipt[] = [
	{
		id: "sls-024",
		title: "lifecycle provenance",
		service: "stellar-light-scout",
		discovered: "2026-07-10",
		resolved: "2026-11-12",
		sourceUrl: "https://github.com/x/blob/aaf8963a/sls-024.md",
	},
	{
		id: "sls-101",
		title: "stale TVL total",
		service: "stellar-light-scout",
		discovered: "2026-11-02",
		resolved: "2026-11-12",
	},
	// another service's receipt is not ours
	{ id: "sd-103", service: "stellar-docs", resolved: "2026-11-11" },
	// a receipt for a record still in their folder: the folder wins
	{ id: "sls-033", service: "stellar-light-scout", resolved: "2026-07-14" },
];
const deletions: Deletion[] = [
	{
		path: "improvements/stellar-light-scout/sls-024-project-lifecycle-operator-conflicts.md",
		commit: "cd1ca34a7be9dd19312755a2919e66875fcc8bcc",
		date: "2026-11-12T10:34:05-05:00",
		subject: "Retire sls-024 and sls-029 with their golden partial caps (#424)",
	},
	{
		path: "improvements/stellar-light-scout/sls-101-analyze-tvl-total-includes-stale-rows.md",
		commit: "2bc3f985e4f91766759df659e1eeac74fef024dc",
		date: "2026-11-12T10:25:32-05:00",
		subject:
			"Absorb Scout 1.9.135, refresh SCF RFP goldens, retire sls-101/111/115 (#423)",
	},
	// an older deletion of the same id (deleted, re-filed, retired again)
	{
		path: "improvements/stellar-light-scout/sls-024-old-name.md",
		commit: "0000000000000000000000000000000000000000",
		date: "2026-08-01T00:00:00Z",
		subject: "older cleanup",
	},
];
const activeIds = new Set(["sls-033", "sls-039", "sls-107", "sls-116"]);

describe("retiredRecords", () => {
	it("recovers every record their ledger retired, from their receipts only", () => {
		const r = retiredRecords(receipts, deletions, activeIds);
		expect(r.map((x) => x.id)).toEqual(["sls-024", "sls-101"]);
		expect(r[0].retired).toBe("2026-11-12");
	});
	it("serves each retired record compactly: id, date and the retiring link", () => {
		for (const x of retiredRecords(receipts, deletions, activeIds))
			expect(Object.keys(x).sort()).toEqual(["id", "retired", "retiredBy"]);
	});
	it("names the newest deleting commit and its PR", () => {
		const [a, b] = retiredRecords(receipts, deletions, activeIds);
		expect(a.retiredBy).toBe(
			"https://github.com/stellar-experimental/stellar-raven/pull/424",
		);
		expect(b.retiredBy).toBe(
			"https://github.com/stellar-experimental/stellar-raven/pull/423",
		);
	});
	it("an unreadable history leaves the retiring commit null, not the status", () => {
		const r = retiredRecords(receipts, null, activeIds);
		expect(r.map((x) => [x.id, x.retired, x.retiredBy])).toEqual([
			["sls-024", "2026-11-12", null],
			["sls-101", "2026-11-12", null],
		]);
	});
	it("does not match sls-1010 to sls-101", () => {
		const r = retiredRecords(
			[{ id: "sls-101", service: "stellar-light-scout" }],
			[
				{
					path: "improvements/stellar-light-scout/sls-1010-other.md",
					commit: "abc",
					date: "2026-11-12T00:00:00Z",
					subject: "Retire sls-1010 (#999)",
				},
			],
			new Set(),
		);
		expect(r[0].retiredBy).toBeNull();
	});
});

describe("summarize", () => {
	const rec = (id: string, status: string, state?: string): ExternalRecord => ({
		id,
		title: id,
		status,
		discovered: null,
		disposition: null,
		sourceUrl: "",
		ourIssue: state ? Number(id.slice(4)) : null,
		...(state
			? { ourResponse: { issue: 1, state, closedAt: null, url: "" } }
			: {}),
	});
	const active = [
		rec("sls-033", "reported-upstream", "closed"),
		rec("sls-039", "declined-upstream", "closed"),
		rec("sls-107", "reported-upstream", "closed"),
		rec("sls-116", "reported-upstream", "open"),
	];
	const retired = retiredRecords(receipts, deletions, activeIds);
	it("lifetime counts retired records, under their status", () => {
		const s = summarize(active, retired);
		expect(s.total).toBe(6);
		expect(s.counts).toEqual({
			"reported-upstream": 3,
			"declined-upstream": 1,
			retired: 2,
		});
	});
	it("counts.retired is present when none were retired", () => {
		expect(summarize(active, []).counts.retired).toBe(0);
	});
	it("our side is scored on active records only", () => {
		const s = summarize(active, retired);
		expect(s.ourResponse.fixApplicable).toBe(3);
		expect(s.ourResponse.fixShipped).toBe(2);
		expect(s.ourResponse.declined).toBe(1);
	});
});
