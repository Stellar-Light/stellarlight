/**
 * A scoped regrade (--only) must grade exactly the named rows, and grade
 * each one as the full pass would. Live case 2026-11-13: enrich-repos
 * unlinked 38 rows from projects that no longer claim them and left their
 * repoScore to the regrade lane, whose full pass would move 6,351 rows.
 * A scope that is mistyped must never widen to that full pass.
 */

import { describe, expect, it, vi } from "vitest";
import { type RepoGradeInput, repoGrade } from "../repo-grade";
import {
	gradeInputOf,
	gradeStoredRow,
	type ProjectAuthority,
	parseRegradeArgs,
	planRegrade,
	type RegradeMove,
	runRegrade,
	scopeProblems,
} from "../repo-regrade";

const noFile = () => "";
const recent = new Date(Date.now() - 10 * 86_400_000).toISOString();
const rows = [
	// Unlinked: no project any more, score still lifted by the old one.
	{
		id: "a",
		fullName: "Octoplace/Contracts",
		projectSlug: null,
		stars: 3,
		lastCommitAt: recent,
		repoScore: 61,
		repoScoreLabel: "medium",
	},
	// Linked to an SCF-awarded project; stored grade is stale.
	{
		id: "b",
		fullName: "paltalabs/defindex",
		projectSlug: "defindex",
		stars: 40,
		description: "vaults",
		lastCommitAt: recent,
		repoScore: 5,
		repoScoreLabel: "low",
	},
	// Never graded (a builder-owned row is created with no score).
	{
		id: "c",
		fullName: "someone/thing",
		stars: 0,
		lastCommitAt: recent,
	},
];
const projects = new Map<string, ProjectAuthority>([
	["defindex", { prominence: 60, scfAwarded: true, hackathonWinner: true }],
]);
const only = (s: string) => parseRegradeArgs([`--only=${s}`], noFile).only;

describe("planRegrade", () => {
	it("a scoped run grades only the named rows, case-insensitively", () => {
		const plan = planRegrade(
			rows,
			projects,
			only("octoplace/contracts, SOMEONE/thing"),
		);
		expect([...plan.matched].sort()).toEqual([
			"octoplace/contracts",
			"someone/thing",
		]);
		expect(plan.moves.map((m) => m.id).sort()).toEqual(["a", "c"]);
	});

	it("a scoped grade equals the full pass's grade for that row", () => {
		const full = planRegrade(rows, projects, null);
		expect(full.moves.map((m) => m.id).sort()).toEqual(["a", "b", "c"]);
		const scoped = planRegrade(rows, projects, only("paltalabs/defindex"));
		expect(scoped.moves).toEqual(full.moves.filter((m) => m.id === "b"));
	});

	it("counts every matched row, so a case twin is visible", () => {
		const twins = [
			rows[0],
			{ ...rows[0], id: "a2", fullName: "octoplace/contracts" },
		];
		const plan = planRegrade(twins, projects, only("octoplace/contracts"));
		expect(plan.matched).toEqual([
			"octoplace/contracts",
			"octoplace/contracts",
		]);
	});
});

describe("gradeInputOf: every stored field reaches the grade", () => {
	const full = {
		id: "f",
		fullName: "paltalabs/defindex",
		projectSlug: "defindex",
		stars: 40,
		isFork: true,
		isArchived: true,
		hackathonWinner: false,
		description: "vaults",
		topics: ["defi", "vaults"],
		openIssues: 3,
		lastCommitAt: recent,
		activitySignals: { commits90d: 12, lastReleaseAt: "2026-06-01T00:00:00Z" },
		codeDepth: 0.6,
		judgeScore: 0.7,
		stellarProof: "cargo-sdk",
		knowledgeNotes: [
			{ visibility: "public" },
			{ visibility: "internal" },
			{ visibility: null },
		],
		testsPresent: true,
		ciPresent: false,
		versionStatus: "supported",
		contractInterface: [{}, {}, {}],
		codeScanState: "scanned",
		publishedPackages: [{}, {}],
		builderReputation: 0.4,
	};
	const explicit: RepoGradeInput = {
		lastCommitAt: recent,
		stargazerCount: 40,
		isFork: true,
		isArchived: true,
		hackathonWinner: false,
		scfAwarded: true,
		projectProminence: 60,
		hasDescription: true,
		topicCount: 2,
		openIssues: 3,
		commits90d: 12,
		codeDepth: 0.6,
		judgeScore: 0.7,
		stellarProof: "cargo-sdk",
		knowledgeNoteCount: 2, // the internal note vouches for nothing
		curatedCanonical: false,
		firstParty: false,
		testsPresent: true,
		ciPresent: false,
		lastReleaseAt: "2026-06-01T00:00:00Z",
		versionStatus: "supported",
		contractInterfaceCount: 3,
		codeScanned: true,
		name: "paltalabs/defindex",
		publishedPackageCount: 2,
		builderReputation: 0.4,
	};

	// The project's own placement is off here, so the row's flag shows.
	const fullProjects = new Map<string, ProjectAuthority>([
		["defindex", { prominence: 60, scfAwarded: true, hackathonWinner: false }],
	]);

	it("passes each stored value through, exactly", () => {
		expect(gradeInputOf(full, fullProjects)).toEqual(explicit);
		expect(gradeStoredRow(full, fullProjects)).toEqual(repoGrade(explicit));
		// A placed project makes every repo it owns a winner.
		expect(gradeInputOf(full, projects).hackathonWinner).toBe(true);
	});

	it("changing any one stored field changes the grade input", () => {
		const flips: Array<[string, unknown]> = [
			["fullName", "stellar/js-stellar-sdk"],
			["projectSlug", null],
			["stars", 41],
			["isFork", false],
			["isArchived", false],
			["hackathonWinner", true],
			["description", ""],
			["topics", ["defi"]],
			["openIssues", 0],
			["lastCommitAt", "2025-01-01T00:00:00Z"],
			[
				"activitySignals",
				{ commits90d: 1, lastReleaseAt: "2026-06-01T00:00:00Z" },
			],
			["activitySignals", { commits90d: 12, lastReleaseAt: null }],
			["codeDepth", 0.2],
			["judgeScore", 0.1],
			["stellarProof", "none"],
			["knowledgeNotes", [{ visibility: "public" }]],
			["testsPresent", false],
			["ciPresent", true],
			["versionStatus", "deprecated"],
			["contractInterface", [{}]],
			["codeScanState", "pending"],
			["publishedPackages", []],
			["builderReputation", 0],
		];
		// Every field the grade reads from the row appears above.
		expect(new Set(flips.map(([f]) => f))).toEqual(
			new Set(Object.keys(full).filter((k) => k !== "id")),
		);
		const base = gradeInputOf(full, fullProjects);
		for (const [field, value] of flips)
			expect(
				gradeInputOf({ ...full, [field]: value }, fullProjects),
				`${field} did not reach the grade input`,
			).not.toEqual(base);
	});
});

describe("parseRegradeArgs", () => {
	it("no scope flag is a full pass", () => {
		expect(parseRegradeArgs([], noFile)).toEqual({
			execute: false,
			limit: 0,
			only: null,
		});
		expect(parseRegradeArgs(["--execute", "--limit=5"], noFile)).toEqual({
			execute: true,
			limit: 5,
			only: null,
		});
	});

	it("a mistyped scope throws instead of becoming a full pass", () => {
		const bad = [
			["--execute", "--only", "a/b"], // the space form other scripts take
			["--only"],
			["--only-file"],
			["--only-file", "names.txt"],
			["--onyl=a/b"],
			["a/b"],
			["--limit=five"],
			["--dry-run"],
		];
		for (const args of bad)
			expect(() => parseRegradeArgs(args, noFile), args.join(" ")).toThrow();
		expect(() => parseRegradeArgs(["--only", "a/b"], noFile)).toThrow(
			/with "="/,
		);
		expect(() => parseRegradeArgs(["--onyl=a/b"], noFile)).toThrow(
			/unknown argument/,
		);
	});

	it("refuses --limit with a scope", () => {
		expect(() => parseRegradeArgs(["--limit=5", "--only=a/b"], noFile)).toThrow(
			/--limit/,
		);
	});

	it("reads --only-file: one name per line, # comments and blanks ignored", () => {
		const file =
			"# unlinked 2026-11-13\nraum-network/raum-v2\n\nusepaykit/PayKit-SDK\n";
		const args = parseRegradeArgs(["--only-file=x.txt"], (p) =>
			p === "x.txt" ? file : "",
		);
		expect([...(args.only ?? [])].sort()).toEqual([
			"raum-network/raum-v2",
			"usepaykit/paykit-sdk",
		]);
	});

	it("refuses an empty list rather than falling back to a full pass", () => {
		expect(() => parseRegradeArgs(["--only="], noFile)).toThrow(
			/no repo names/,
		);
		expect(() =>
			parseRegradeArgs(["--only-file=e.txt"], () => "# none\n"),
		).toThrow(/no repo names/);
	});

	it("refuses anything that is not owner/repo", () => {
		expect(() =>
			parseRegradeArgs(["--only=unlink octo/x from octo"], noFile),
		).toThrow(/not owner\/repo/);
	});
});

describe("scopeProblems", () => {
	it("names a scoped name no row matched, and a name two rows matched", () => {
		const scope = only("a/b,c/d,e/f") as Set<string>;
		expect(scopeProblems(scope, ["a/b", "e/f", "e/f"])).toEqual([
			"named but not found: c/d",
			"named and matched by more than one row: e/f",
		]);
		expect(scopeProblems(scope, ["a/b", "c/d", "e/f"])).toEqual([]);
	});
});

describe("runRegrade", () => {
	async function* pages(...ps: Array<Array<Record<string, unknown>>>) {
		for (const p of ps) yield p;
	}
	const execute = (s: string) => ({
		...parseRegradeArgs([`--only=${s}`], noFile),
		execute: true,
	});

	it("reads every page, then writes the scoped moves", async () => {
		const write = vi.fn(async (_m: RegradeMove) => null);
		const run = await runRegrade(
			pages([rows[0]], [rows[1], rows[2]]),
			projects,
			execute("octoplace/contracts,someone/thing"),
			write,
		);
		expect(run.problems).toEqual([]);
		expect(run.read).toBe(3);
		expect(write.mock.calls.map(([m]) => m.id)).toEqual(["a", "c"]);
		expect(run.wrote).toBe(2);
	});

	it("writes nothing when one name is missing, even if it is on a later page", async () => {
		const write = vi.fn(async (_m: RegradeMove) => null);
		const run = await runRegrade(
			pages([rows[0]], [rows[1]]),
			projects,
			execute("octoplace/contracts,someone/thing"),
			write,
		);
		expect(run.problems).toEqual(["named but not found: someone/thing"]);
		expect(write).not.toHaveBeenCalled();
		expect(run.wrote).toBe(0);
	});

	it("writes nothing when a name matches a hidden case twin", async () => {
		const write = vi.fn(async (_m: RegradeMove) => null);
		const run = await runRegrade(
			pages(
				[rows[0]],
				[{ ...rows[0], id: "a2", fullName: "octoplace/CONTRACTS" }],
			),
			projects,
			execute("octoplace/contracts"),
			write,
		);
		expect(run.problems).toEqual([
			"named and matched by more than one row: octoplace/contracts",
		]);
		expect(write).not.toHaveBeenCalled();
	});

	it("reports a write that did not read back", async () => {
		const run = await runRegrade(
			pages(rows),
			projects,
			execute("paltalabs/defindex"),
			async (m) => `${m.fullName}: read back 5/low`,
		);
		expect(run.mismatched).toEqual(["paltalabs/defindex: read back 5/low"]);
	});
});
