/**
 * Every surface that lists a project's repos leaves out a repo marked gone,
 * and every aggregate beside the list still counts it.
 *
 * Review of lane r1112-dq2-repos (2026-11-12): project-repos.test.ts pinned
 * the helper, but deleting `codeScanState: true` from the route's select, or
 * the route's call to groupProjectRepos, left every test green. These tests
 * drive the routes themselves through a fake store that honours `select` the
 * way Payload does, so a field the route forgets to read is a field it does
 * not have. The project page and getLeaderboard listed gone repos too.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadProjectPageGithub } from "../project-repos";

type Row = Record<string, unknown>;
type FindArgs = {
	collection: string;
	limit?: number;
	where?: unknown;
	select?: Record<string, unknown>;
};

/** Payload's select: `true` fields only come back (plus id); a select of
 *  `false` fields returns everything else. */
const pick = (doc: Row, select?: Record<string, unknown>) => {
	if (!select) return doc;
	const exclude = Object.values(select).some((v) => v === false);
	return Object.fromEntries(
		Object.entries(doc).filter(([k]) =>
			exclude ? select[k] !== false : k === "id" || select[k],
		),
	);
};

const project = {
	id: "p1",
	name: "Soroswap",
	slug: "soroswap",
	category: "Protocol/Contract",
	shortDescription: "AMM decentralized exchange on Soroban.",
	status: "Live",
	types: [],
	scf: { awarded: false },
	tvlUSD: null,
	tvlAsOf: null,
	onchain: null,
};
// Score-sorted, as the store returns them: the gone repo ranks first and
// holds the newest commit and the stars.
const repos: Row[] = [
	{
		id: "r1",
		projectSlug: "soroswap",
		fullName: "soroswap/v2-frontend",
		codeScanState: "gone",
		lastCommitAt: "2026-10-19T00:00:00.000Z",
		repoScore: 40,
		stars: 7,
		openIssues: 2,
		stellarProof: "imports",
		activitySignals: { commits90d: 5, asOf: "2026-10-19T00:00:00.000Z" },
	},
	{
		id: "r2",
		projectSlug: "soroswap",
		fullName: "soroswap/core",
		codeScanState: "scanned",
		lastCommitAt: "2026-06-01T00:00:00.000Z",
		repoScore: 30,
		stars: 3,
		openIssues: 1,
		stellarProof: "imports",
		activitySignals: { commits90d: 1, asOf: "2026-10-19T00:00:00.000Z" },
	},
];

const find = vi.fn(async (args: FindArgs) => {
	let docs: Row[] = [];
	if (args.collection === "projects") docs = [project];
	if (args.collection === "repos") docs = repos;
	docs = docs.map((d) => pick(d, args.select));
	return { docs, totalDocs: docs.length };
});
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({ find })),
}));
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async () => ({ repos: [], warnings: [] })),
}));

beforeEach(() => {
	vi.stubEnv("VOYAGE_API_KEY", "");
	find.mockClear();
});

describe("searchProjects rows", () => {
	it("a repo marked gone leaves `repos` and still dates lastActivityAt", async () => {
		const { GET } = await import("@/app/api/projects/search/route");
		const body = await (
			await GET(
				new NextRequest("https://x.test/api/projects/search?q=soroswap"),
			)
		).json();
		const row = body.projects.find(
			(p: { slug: string }) => p.slug === "soroswap",
		);
		expect(row.repos.map((r: { fullName: string }) => r.fullName)).toEqual([
			"soroswap/core",
		]);
		expect(row.lastActivityAt).toBe("2026-10-19T00:00:00.000Z");
	});
});

describe("getLeaderboard rows", () => {
	it("lists a gone repo under goneRepos, not repos, and still counts it", async () => {
		const { GET } = await import("@/app/api/leaderboard/route");
		const body = await (
			await GET(new NextRequest("https://x.test/api/leaderboard"))
		).json();
		const gh = body.projects.find(
			(p: { slug: string }) => p.slug === "soroswap",
		).github;
		expect(gh.repos).toEqual(["soroswap/core"]);
		expect(gh.goneRepos).toEqual(["soroswap/v2-frontend"]);
		expect(gh.repoCount).toBe(gh.repos.length + gh.goneRepos.length);
		expect(gh.totalStars).toBe(10);
		expect(gh.commits90d).toBe(6);
		expect(gh.lastActivityAt).toBe("2026-10-19T00:00:00.000Z");
	});

	it("the CSV keeps every older column and appends gone_repos", async () => {
		const { GET } = await import("@/app/api/leaderboard/route");
		const [header, line] = (
			await (
				await GET(new NextRequest("https://x.test/api/leaderboard?format=csv"))
			).text()
		)
			.trim()
			.split("\n");
		const cols = header.split(",");
		expect(cols.at(-1)).toBe("gone_repos");
		expect(cols.at(-2)).toBe("tvl_stale");
		const cells = line.split(",");
		expect(cells[cols.indexOf("repos")]).toBe("soroswap/core");
		expect(cells.at(-1)).toBe("soroswap/v2-frontend");
	});
});

describe("the project page", () => {
	it("lists no gone repo and still counts it in the totals", async () => {
		const gh = await loadProjectPageGithub({ find }, "soroswap");
		expect(gh?.repos.map((r) => `${r.owner}/${r.name}`)).toEqual([
			"soroswap/core",
		]);
		expect(gh?.lastActivityAt).toBe("2026-10-19T00:00:00.000Z");
		expect(gh?.totalStars).toBe(10);
		expect(gh?.openIssuesTotal).toBe(3);
		// The caption under the totals counts the same rows the totals do.
		expect(gh?.repoCount).toBe(2);
	});

	it("no indexed repo is no GitHub block", async () => {
		const empty = vi.fn(async () => ({ docs: [], totalDocs: 0 }));
		expect(await loadProjectPageGithub({ find: empty }, "x")).toBeNull();
	});
});
