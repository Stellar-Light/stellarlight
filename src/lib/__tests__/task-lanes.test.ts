import { describe, expect, it } from "vitest";
import {
	buildTaskPrompt,
	isAllowedPath,
	pickClaimLane,
	pickGap,
	pickNotes,
	recentlyAttempted,
	type TaskAttempt,
	taskForSchedule,
} from "../task-lanes";

const attempt = (over: Partial<TaskAttempt>): TaskAttempt => ({
	task: "notes",
	unit: "notes-2026-09-15",
	items: [],
	date: "2026-09-15",
	run: "1",
	outcome: "fixed",
	pr: "https://github.com/x/y/pull/1",
	costUsd: 1,
	note: "",
	...over,
});
const now = new Date("2026-09-20T00:00:00Z");

describe("task lane: which task a schedule is", () => {
	it("maps each weekday cron to its track and nothing else", () => {
		expect(taskForSchedule("17 9 * * 2")).toBe("notes");
		expect(taskForSchedule("17 9 * * 3")).toBe("claims");
		expect(taskForSchedule("17 9 * * 4")).toBe("packets");
		expect(taskForSchedule("17 9 * * 5")).toBe("gap");
		expect(taskForSchedule("47 8 * * *")).toBeNull();
	});
});

describe("task lane: what each task may touch", () => {
	it("keeps notes in the registry, gap in the curation map, packets under quality/", () => {
		expect(isAllowedPath("notes", "notes-x", "src/lib/repo-knowledge.ts")).toBe(
			true,
		);
		expect(isAllowedPath("notes", "notes-x", "scripts/enrich-repos.ts")).toBe(
			false,
		);
		expect(
			isAllowedPath("gap", "sourced", "scripts/data/curation-maps.ts"),
		).toBe(true);
		expect(isAllowedPath("gap", "sourced", "src/collections/Projects.ts")).toBe(
			false,
		);
		expect(
			isAllowedPath(
				"packets",
				"packets-x",
				"improvements/quality/verification-packets-2026-09-18.md",
			),
		).toBe(true);
		expect(
			isAllowedPath("packets", "packets-x", "improvements/lanes/lanes.json"),
		).toBe(false);
	});
	it("lets claims into exactly one lane's workflow, never another's, never lanes.json", () => {
		expect(
			isAllowedPath(
				"claims",
				"check-links",
				".github/workflows/check-links.yml",
			),
		).toBe(true);
		expect(
			isAllowedPath("claims", "check-links", "scripts/check-links.ts"),
		).toBe(true);
		expect(
			isAllowedPath("claims", "check-links", "src/lib/utils/read-back.ts"),
		).toBe(true);
		expect(
			isAllowedPath(
				"claims",
				"check-links",
				".github/workflows/enrich-repos.yml",
			),
		).toBe(false);
		expect(
			isAllowedPath("claims", "check-links", "improvements/lanes/lanes.json"),
		).toBe(false);
		expect(isAllowedPath("claims", "check-links", "specs/openapi.yaml")).toBe(
			false,
		);
	});
});

describe("task lane: notes picker", () => {
	const pool = [
		{ fullName: "a/low", repoScore: 31 },
		{ fullName: "B/Noted", repoScore: 80 },
		{ fullName: "c/top", repoScore: 70 },
		{ fullName: "d/tried", repoScore: 60 },
	];
	it("skips registry keys case-insensitively and repos attempted this month, best first", () => {
		const picked = pickNotes(
			pool,
			new Set(["b/noted"]),
			[attempt({ items: ["d/tried"] })],
			25,
			now,
		);
		expect(picked.map((r) => r.fullName)).toEqual(["c/top", "a/low"]);
	});
	it("caps the wave", () => {
		expect(
			pickNotes(pool, new Set(), [], 1, now).map((r) => r.fullName),
		).toEqual(["B/Noted"]);
	});
	it("does not count an error outcome — the unit was never worked", () => {
		const err = attempt({ items: ["d/tried"], outcome: "error", pr: null });
		expect(recentlyAttempted([err], "notes", "d/tried", now)).toBe(false);
	});
	it("forgets an attempt after the retry window", () => {
		const old = attempt({ items: ["d/tried"], date: "2026-07-01" });
		expect(recentlyAttempted([old], "notes", "d/tried", now)).toBe(false);
	});
});

describe("task lane: claims picker", () => {
	const audit = [
		{
			id: "aggregate-feedback",
			stage: "eligible-for-2",
			interventionFreeWeeks: 5,
		},
		{ id: "sync-lumenloop", stage: "eligible-for-2", interventionFreeWeeks: 8 },
		{ id: "enrich-tvl", stage: 2, interventionFreeWeeks: 8 },
		{ id: "check-links", stage: "eligible-for-2", interventionFreeWeeks: 6 },
	];
	it("takes the longest clean streak among eligible lanes with no claim on record", () => {
		const registry = [
			{ id: "enrich-tvl", endStateClaim: "read-back …" },
			{ id: "sync-lumenloop" },
		];
		expect(pickClaimLane(audit, registry, [], now)?.id).toBe("sync-lumenloop");
	});
	it("skips a lane whose claim is already recorded or attempted this month", () => {
		const registry = [{ id: "sync-lumenloop", endStateClaim: "recorded" }];
		const tried = [
			attempt({ task: "claims", unit: "check-links", items: ["check-links"] }),
		];
		expect(pickClaimLane(audit, registry, tried, now)?.id).toBe(
			"aggregate-feedback",
		);
	});
});

describe("task lane: gap picker", () => {
	const rows = [
		{
			entity: "repo",
			field: "code depth reading",
			missing: 2286,
			of: 13259,
			examples: ["x/y"],
		},
		{
			entity: "project",
			field: "sourced",
			missing: 2,
			of: 981,
			examples: ["one", "two"],
		},
		{
			entity: "project",
			field: "typed",
			missing: 1,
			of: 981,
			examples: ["three"],
		},
	];
	it("works the sourced row first, minus slugs attempted this month, then typed", () => {
		expect(pickGap(rows, [], now)).toEqual({
			field: "sourced",
			examples: ["one", "two"],
			missing: 2,
			of: 981,
		});
		const tried = [
			attempt({ task: "gap", unit: "sourced", items: ["one", "two"] }),
		];
		expect(pickGap(rows, tried, now)?.field).toBe("typed");
	});
	it("never picks a row a lane or a human closes, and reports nothing when the curatable rows are empty", () => {
		expect(pickGap([rows[0]], [], now)).toBeNull();
	});
});

describe("task lane: the prompts", () => {
	const opts = { branch: "task/x", date: "2026-09-15" };
	it("notes: names every repo, the only file, the read-before-write rule and the artifacts", () => {
		const p = buildTaskPrompt(
			"notes",
			"notes-2026-09-15",
			[{ fullName: "stellar/x", repoScore: 45 }],
			opts,
		);
		expect(p).toContain("stellar/x");
		expect(p).toContain("YOU MAY EDIT ONLY: src/lib/repo-knowledge.ts");
		expect(p).toContain("Never state a fact you did not read");
		expect(p).toContain(".repair/verdict.json");
		expect(p).toContain("never git push");
	});
	it("claims: names the lane, forbids lanes.json, demands the two exit codes", () => {
		const p = buildTaskPrompt(
			"claims",
			"check-links",
			{ audit: { id: "check-links" } },
			opts,
		);
		expect(p).toContain(".github/workflows/check-links.yml");
		expect(p).toContain("Do NOT edit improvements/lanes/lanes.json");
		expect(p).toContain("exit 2 (could-not-look");
	});
	it("claims: without a PAT the prompt keeps the agent out of .github/workflows", () => {
		const p = buildTaskPrompt(
			"claims",
			"check-links",
			{ audit: { id: "check-links" } },
			opts,
		);
		expect(p).toContain("CANNOT PUSH WORKFLOW FILES");
		const q = buildTaskPrompt(
			"claims",
			"check-links",
			{ audit: { id: "check-links" } },
			{ ...opts, workflowsPushable: true },
		);
		expect(q).not.toContain("CANNOT PUSH WORKFLOW FILES");
	});
	it("gap: carries the slugs and the downgrade rule for sourced, the description rule for typed", () => {
		const s = buildTaskPrompt(
			"gap",
			"sourced",
			{ field: "sourced", examples: ["a-b"], missing: 1, of: 9 },
			opts,
		);
		expect(s).toContain('"a-b"');
		expect(s).toContain("propose the DOWNGRADE");
		const t = buildTaskPrompt(
			"gap",
			"typed",
			{ field: "typed", examples: ["c-d"], missing: 1, of: 9 },
			opts,
		);
		expect(t).toContain("TYPE_ADD");
	});
	it("packets: needs no agent", () => {
		expect(() => buildTaskPrompt("packets", "packets-x", null, opts)).toThrow(
			/no agent/,
		);
	});
});
