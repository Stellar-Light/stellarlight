import { describe, expect, it } from "vitest";
import {
	type Attempt,
	buildPrompt,
	isProtectedPath,
	type LedgerRow,
	pickRow,
} from "../repair-lane";

const row = (over: Partial<LedgerRow> & { id: string }): LedgerRow => ({
	status: "open",
	severity: "medium",
	firstSeen: "2026-09-01T00:00:00Z",
	...over,
});

describe("repair lane: which row it works", () => {
	it("refuses the sources a human or upstream owns, and blocked rows", () => {
		const rows = [
			row({ id: "link-health:https-x", source: "link-health" }),
			row({ id: "raven-routing:freighter", source: "raven-routing" }),
			row({
				id: "engine-a-recall:x",
				source: "engine-a-recall",
				blockedOn: "upstream",
			}),
		];
		const r = pickRow(rows, []);
		expect(r.row).toBeNull();
		expect(r.reason).toMatch(/2 owned by a human or upstream/);
		expect(r.reason).toMatch(/1 blocked upstream/);
	});

	it("takes the highest severity, then the oldest", () => {
		const rows = [
			row({
				id: "engine-a-recall:new-medium",
				source: "engine-a-recall",
				firstSeen: "2026-09-10T00:00:00Z",
			}),
			row({
				id: "nightly-claims:old-high",
				source: "nightly-claims",
				severity: "high",
				firstSeen: "2026-08-01T00:00:00Z",
			}),
			row({
				id: "engine-a-recall:old-medium",
				source: "engine-a-recall",
				firstSeen: "2026-08-15T00:00:00Z",
			}),
		];
		expect(pickRow(rows, []).row?.id).toBe("nightly-claims:old-high");
		expect(pickRow(rows.slice(0, 1).concat(rows.slice(2)), []).row?.id).toBe(
			"engine-a-recall:old-medium",
		);
	});

	it("skips a row with an open repair PR and a row tried twice this fortnight", () => {
		const now = new Date("2026-09-14T00:00:00Z");
		const a = (
			rowId: string,
			outcome: Attempt["outcome"],
			pr: string | null,
			date = "2026-09-13",
		): Attempt => ({
			rowId,
			outcome,
			pr,
			date,
			run: "1",
			costUsd: 1,
			note: "",
		});
		const rows = [
			row({ id: "engine-a-recall:has-pr", source: "engine-a-recall" }),
			row({ id: "engine-a-recall:tried-twice", source: "engine-a-recall" }),
			row({ id: "engine-a-recall:tried-long-ago", source: "engine-a-recall" }),
		];
		const attempts = [
			a("engine-a-recall:has-pr", "fixed", "https://github.com/x/pull/1"),
			a("engine-a-recall:tried-twice", "skip", null),
			a("engine-a-recall:tried-twice", "error", null),
			a("engine-a-recall:tried-long-ago", "skip", null, "2026-08-01"),
			a("engine-a-recall:tried-long-ago", "skip", null, "2026-08-02"),
		];
		expect(pickRow(rows, attempts, now).row?.id).toBe(
			"engine-a-recall:tried-long-ago",
		);
	});
});

describe("repair lane: what it may not touch", () => {
	it("protects the contract, the client, the lanes and the collections", () => {
		for (const p of [
			"specs/openapi.json",
			"api-client/src/schema.ts",
			"public/openapi.json",
			".github/workflows/x.yml",
			"improvements/lanes/lanes.json",
			"src/collections/Repos.ts",
			"src/components/awards/Vote.tsx",
		])
			expect(isProtectedPath(p)).toBe(true);
		for (const p of [
			"src/lib/project-search-match.ts",
			"src/app/api/projects/search/route.ts",
			"scripts/eval/generated-recall.ts",
			"src/lib/repo-knowledge.ts",
		])
			expect(isProtectedPath(p)).toBe(false);
	});
});

describe("repair lane: the prompt", () => {
	it("carries the row, the re-check rule, the gates, the protected paths and the artifacts it must write", () => {
		const p = buildPrompt(
			row({
				id: "engine-a-recall:x",
				source: "engine-a-recall",
				probe: "https://stellarlight.xyz/api/projects/search?q=x",
			}),
			{ branch: "repair/x", date: "2026-09-14" },
		);
		for (const must of [
			"engine-a-recall:x",
			"RE-CHECK BEFORE YOU FIX",
			"already-passing",
			"npx tsc --noEmit",
			"npx vitest run",
			"specs/",
			"never git push",
			".repair/verdict.json",
			".repair/pr-body.md",
			"improvements/engine/weekly/engine-a-recall-latest.json",
		])
			expect(p).toContain(must);
		expect(p).not.toMatch(/DATABASE_URI|PAYLOAD_SECRET/);
	});
});
