/**
 * Drives scripts/enrich-repos.ts itself, with a fake Payload and a fake
 * GitHub, so the call site is under test and not only the rule it calls
 * (judgeRedirect): a claim whose old path now leads to another owner's
 * empty repo writes nothing, an honest transfer is still written under its
 * new name, and a denied repo is never written. Removing the call site
 * turns this red. The refusal sits ahead of the row lookups, so a refused
 * claim adds no id or canonical name to the unlink planner: the row the
 * takeover already wrote reads as unclaimed, and its unlink is written only
 * on the opt-in dispatch (--execute --unlink). A redirect GitHub answered
 * in part is skipped for the run, never refused, and makes the unlink plan
 * abstain. A full run leaves its rows for the ledger, the job summary and
 * annotations.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// biome-ignore lint/suspicious/noExplicitAny: fake Payload rows
type Row = Record<string, any>;
const state: {
	projects: Row[];
	repos: Row[];
	writes: Row[];
	/** Claims GitHub fails to answer this run (not a "not found"). */
	failing: Set<string>;
} = {
	failing: new Set(),
	projects: [],
	repos: [],
	writes: [],
};

/** What GitHub answers for each claimed path, after its redirect. */
const GITHUB: Record<string, Row> = {
	"scalemote/flow": {
		nameWithOwner: "Moon-Launch/flow",
		primaryLanguage: null,
		commitCount: 2,
		createdAt: "2024-10-23T15:08:23Z",
	},
	"hyperledger/solang": {
		nameWithOwner: "hyperledger-solang/solang",
		primaryLanguage: "Rust",
		commitCount: 2422,
		createdAt: "2018-12-29T00:00:00Z",
	},
	"brunomlr/stellar-docs": {
		nameWithOwner: "brunomlr/stellar-docs",
		primaryLanguage: "MDX",
		commitCount: 40,
		createdAt: "2023-01-01T00:00:00Z",
	},
	// An honest move whose history GitHub left out of a batched answer.
	"theahaco/attest-contract": {
		nameWithOwner: "stellar-registry/actions",
		primaryLanguage: null,
		commitCount: null,
		unread: ["defaultBranchRef"],
		createdAt: "2026-03-06T00:00:00Z",
	},
};

/** Where each run's ledger artifact and job summary land: a fresh
 * directory, never the repo's own improvements/audits. */
const out = { dir: "", artifact: "", summary: "" };
const read = (path: string) =>
	existsSync(path) ? readFileSync(path, "utf8") : null;

vi.mock("../../../scripts/load-env", () => ({}));
vi.mock("../../payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("../github", () => ({
	gqlBatchStats: () => ({ queries: 1, repos: 1 }),
	listOwnerRepos: async () => [],
	fetchRepoInfo: async () => {
		throw new Error("not in the fake");
	},
	fetchRepoInfoBatch: async (pairs: Array<{ owner: string; name: string }>) =>
		pairs.map(({ owner, name }) => {
			if (state.failing.has(`${owner}/${name}`))
				return { error: "GitHub GraphQL error: timeout" };
			const g = GITHUB[`${owner}/${name}`];
			if (!g) return { error: "Repository not found" };
			return {
				info: {
					...g,
					url: `https://github.com/${g.nameWithOwner}`,
					description: null,
					homepageUrl: null,
					isFork: false,
					isArchived: false,
					topics: [],
					readme: null,
					lastCommitAt: g.createdAt,
					openIssues: 0,
					stargazerCount: 0,
					commits90d: 0,
					lastReleaseAt: null,
					releaseTag: null,
					openPRs: 0,
				},
			};
		}),
}));
vi.mock("payload", () => ({
	getPayload: async () => ({
		// biome-ignore lint/suspicious/noExplicitAny: Payload query shape
		find: async ({ collection, where }: any) => {
			if (collection === "projects") return { docs: state.projects };
			if (collection !== "repos") return { docs: [] };
			const ids: string[] | undefined = where?.id?.in;
			const source: string | undefined = where?.source?.equals;
			const name: string | undefined =
				where?.fullName?.equals ?? where?.fullName?.like;
			const docs = state.repos.filter((r) =>
				ids
					? ids.includes(r.id)
					: source
						? r.source === source
						: String(r.fullName).toLowerCase() === name?.toLowerCase(),
			);
			return { docs };
		},
		findByID: async ({ id }: { id: string }) =>
			state.repos.find((r) => r.id === id) ?? null,
		create: async ({ data }: { data: Row }) => {
			const doc = { id: `r${state.repos.length}`, ...data };
			state.repos.push(doc);
			state.writes.push(doc);
			return doc;
		},
		update: async ({ id, data }: { id: string; data: Row }) => {
			const doc = state.repos.find((r) => r.id === id);
			Object.assign(doc ?? {}, data);
			state.writes.push({ id, ...data });
			return doc;
		},
	}),
}));

class Exit extends Error {}

/** Imported by a variable, so the main tsc program, which leaves scripts/
 * to the scripts type baseline, does not pull the script in. */
const SCRIPT = "../../../scripts/enrich-repos";

/** Runs one enrich pass over these projects and stored repo rows, with
 * these flags; returns what it printed. */
async function enrich(
	projects: Row[],
	flags: string[],
	repos: Row[] = [],
	setup: () => void = () => {},
): Promise<string[]> {
	state.projects = projects;
	state.repos = repos.map((r) => ({ ...r }));
	state.writes = [];
	out.dir = mkdtempSync(join(tmpdir(), "enrich-redirects-"));
	out.artifact = join(out.dir, "repo-redirects-latest.json");
	out.summary = join(out.dir, "summary.md");
	process.env.REPO_REDIRECTS_ARTIFACT = out.artifact;
	setup();
	const lines: string[] = [];
	const argv = process.argv;
	process.argv = [...argv, ...flags];
	vi.spyOn(console, "log").mockImplementation((...a) => {
		lines.push(a.join(" "));
	});
	vi.spyOn(console, "error").mockImplementation(() => {});
	let finish: () => void = () => {};
	const exited = new Promise<void>((r) => {
		finish = r;
	});
	let calls = 0;
	vi.spyOn(process, "exit").mockImplementation(() => {
		// The first exit ends the pass; main().catch calls exit again.
		if (calls++ === 0) {
			finish();
			throw new Exit();
		}
		return undefined as never;
	});
	vi.resetModules();
	try {
		await import(/* @vite-ignore */ SCRIPT);
		await exited;
	} finally {
		process.argv = argv;
	}
	return lines;
}

const claim = (slug: string, owner: string, name: string): Row => ({
	id: slug,
	slug,
	name: slug,
	status: "Live",
	prominence: 1,
	github: { repos: [{ owner, name }] },
	links: {},
});

const PROJECTS = [
	claim("planet-pay", "scalemote", "flow"),
	claim("solang", "hyperledger", "solang"),
	claim("docs-copy", "brunomlr", "stellar-docs"),
];

afterEach(() => {
	vi.restoreAllMocks();
	delete process.env.REPO_REDIRECTS_ARTIFACT;
});

describe("enrich-repos judges a redirect before it writes", () => {
	it("writes the honest transfer and nothing for the taken path or the denied repo", async () => {
		const lines = await enrich(PROJECTS, ["--execute"]);
		const written = state.writes.map((w) => w.fullName);
		expect(written).toContain("hyperledger-solang/solang");
		expect(written).not.toContain("Moon-Launch/flow");
		expect(written).not.toContain("brunomlr/stellar-docs");
		expect(lines).toContain(
			"  refuse scalemote/flow now redirects to Moon-Launch/flow, a repo under another owner with no code and 2 commits, created 2024-10-23",
		);
		expect(lines).toContain(
			"  refuse brunomlr/stellar-docs is on the denied list",
		);
	});

	it("lists every refusal at the end of a dry run", async () => {
		const lines = await enrich(PROJECTS, []);
		expect(state.writes).toEqual([]);
		const at = lines.findIndex((l) =>
			l.includes("2 claim(s) refused, nothing written for them"),
		);
		expect(at).toBeGreaterThan(-1);
		expect(lines[at]).toContain("(claimed by planet-pay)");
		expect(lines[at]).toContain("(claimed by docs-copy)");
	});
});

describe("a refused claim leaves the row it led to unclaimed", () => {
	/** What the takeover redirect wrote before this check existed. */
	const TAKEN_ROW = {
		id: "taken",
		fullName: "Moon-Launch/flow",
		projectSlug: "planet-pay",
		projectName: "Planet Pay",
		source: "project-link",
	};
	const unlinkLine = (lines: string[]) =>
		lines.find((l) => l.startsWith("unlink Moon-Launch/flow from planet-pay"));
	const takenWrites = () => state.writes.filter((w) => w.id === "taken");

	it("the unlink plan lists it, and a dry run writes nothing", async () => {
		const lines = await enrich(PROJECTS, [], [TAKEN_ROW]);
		expect(unlinkLine(lines)).toMatch(
			/\(no project claims it; \d{4}-\d{2}-\d{2}\)$/,
		);
		expect(state.writes).toEqual([]);
	});

	it("an execute without --unlink leaves it linked", async () => {
		const lines = await enrich(PROJECTS, ["--execute"], [TAKEN_ROW]);
		expect(unlinkLine(lines)).toBeDefined();
		expect(lines).toContain(
			"unlink total: 1 (not written: a manual execute with --unlink writes them)",
		);
		expect(takenWrites()).toEqual([]);
	});

	it("the opt-in dispatch writes the unlink", async () => {
		await enrich(PROJECTS, ["--execute", "--unlink"], [TAKEN_ROW]);
		expect(takenWrites()).toHaveLength(1);
		expect(takenWrites()[0]).toMatchObject({
			projectSlug: null,
			projectUnlink: { from: "planet-pay", reason: "no project claims it" },
		});
	});
});

describe("a redirect GitHub answered in part is not judged", () => {
	const PARTIAL = [
		claim("stellar-registry", "theahaco", "attest-contract"),
		claim("planet-pay", "scalemote", "flow"),
	];
	const TAKEN_ROW = {
		id: "taken",
		fullName: "Moon-Launch/flow",
		projectSlug: "planet-pay",
		source: "project-link",
	};
	it("is skipped this run with no refusal wording, and the unlink plan abstains", async () => {
		const lines = await enrich(PARTIAL, ["--execute", "--unlink"], [TAKEN_ROW]);
		const reason =
			"theahaco/attest-contract redirects to stellar-registry/actions, under another owner, and GitHub's answer left out its commit count";
		expect(lines).toContain(`  unjudged ${reason}`);
		expect(lines.some((l) => l.startsWith("  refuse theahaco"))).toBe(false);
		expect(
			lines.find((l) => l.includes("claim(s) could not be judged")),
		).toContain(`1 claim(s) could not be judged (could-not-check`);
		expect(
			lines.some((l) =>
				l.startsWith(
					"  unlinking nothing: 1 read(s) failed, so the claim set is partial: theahaco/attest-contract:",
				),
			),
		).toBe(true);
		expect(state.writes).toEqual([]);
	});
});

describe("refusals reach a consumer", () => {
	const env = { ...process.env };
	afterEach(() => {
		process.env = { ...env };
	});
	it("annotations, the job summary and the ledger artifact on an executed full run", async () => {
		process.env.GITHUB_ACTIONS = "true";
		const lines = await enrich(PROJECTS, ["--execute"], [], () => {
			process.env.GITHUB_STEP_SUMMARY = out.summary;
		});
		expect(lines).toContain(
			"::warning title=Repo redirect refused::scalemote/flow now redirects to Moon-Launch/flow, a repo under another owner with no code and 2 commits, created 2024-10-23 (claimed by planet-pay)",
		);
		expect(
			lines.some(
				(l) => l.includes("brunomlr/stellar-docs") && l.startsWith("::"),
			),
		).toBe(false);
		expect(read(out.summary)).toContain("Repo redirect refused");
		const artifact = JSON.parse(read(out.artifact) ?? "null");
		expect(Date.parse(artifact.generatedAt)).not.toBeNaN();
		expect(
			artifact.rows.map((r: Row) => [r.verdict, r.claimed, r.to, r.project]),
		).toEqual([
			["refuse", "scalemote/flow", "Moon-Launch/flow", "planet-pay"],
			["denied", "brunomlr/stellar-docs", "brunomlr/stellar-docs", "docs-copy"],
		]);
	});
	it("the refusal summary says how to override", async () => {
		const lines = await enrich(PROJECTS, []);
		expect(
			lines.find((l) => l.includes("claim(s) refused, nothing written")),
		).toContain(
			"To follow one, claim the new path directly (GITHUB_REPOS_SET or GITHUB_LINK_FIX): a direct claim involves no redirect.",
		);
	});
	it("a targeted run leaves no artifact and no summary outside Actions", async () => {
		delete process.env.GITHUB_STEP_SUMMARY;
		await enrich(PROJECTS, ["--only", "scalemote/flow"]);
		expect(read(out.artifact)).toBeNull();
		expect(read(out.summary)).toBeNull();
	});
});

describe("the ledger artifact moves only on an executed full run", () => {
	afterEach(() => {
		state.failing = new Set();
	});
	const PREVIOUS = {
		generatedAt: "2026-11-12T00:00:00.000Z",
		rows: [
			{
				verdict: "refuse",
				claimed: "scalemote/flow",
				to: "Moon-Launch/flow",
				project: "planet-pay",
				reason:
					"scalemote/flow now redirects to Moon-Launch/flow, a repo under another owner with no code and 2 commits, created 2024-10-23",
			},
			// Read and followed this run: closed, not carried.
			{
				verdict: "refuse",
				claimed: "hyperledger/solang",
				to: "hyperledger-solang/solang",
				project: "solang",
				reason: "an older verdict",
			},
		],
	};
	const artifact = () => JSON.parse(read(out.artifact) ?? "null");
	const seed = () => writeFileSync(out.artifact, JSON.stringify(PREVIOUS));

	it("a dry run records nothing", async () => {
		await enrich(PROJECTS, []);
		expect(read(out.artifact)).toBeNull();
	});

	it("a refusal whose claim GitHub did not answer this run is carried, not closed", async () => {
		state.failing = new Set(["scalemote/flow"]);
		const lines = await enrich(PROJECTS, ["--execute"], [], seed);
		const rows = artifact().rows as Row[];
		expect(rows.find((r) => r.claimed === "scalemote/flow")).toMatchObject({
			verdict: "refuse",
			carriedFrom: "2026-11-12T00:00:00.000Z",
		});
		expect(rows.some((r) => r.claimed === "hyperledger/solang")).toBe(false);
		expect(lines).toContain(
			"  1 refusal(s) carried forward: their claims were not read this run",
		);
	});

	it("a claim no project makes any more is not carried", async () => {
		state.failing = new Set(["scalemote/flow"]);
		await enrich(
			PROJECTS.filter((p) => p.slug !== "planet-pay"),
			["--execute"],
			[],
			seed,
		);
		expect(
			(artifact().rows as Row[]).some((r) => r.claimed === "scalemote/flow"),
		).toBe(false);
	});
});
