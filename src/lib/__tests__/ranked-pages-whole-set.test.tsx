// @vitest-environment node

/**
 * /leaderboard and /digest/<month> rank active projects by repo stars, and
 * both read the projects with `limit: 300` while 905 were active (2026-11-04):
 * the ranking ran over the newest 300, so 32 of the top 50 by stars on
 * /leaderboard differed from GET /api/leaderboard's. They read the whole set
 * now. The double sorts an unsorted read newest first and caps at the limit,
 * as Payload does.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

type Doc = Record<string, unknown>;
const ACTIVE = 301;
const at = (h: number) =>
	new Date(Date.UTC(2025, 0, 1) + h * 3_600_000).toISOString();
// p0 is the oldest active project and has by far the most stars
const projects: Doc[] = Array.from({ length: ACTIVE }, (_, i) => ({
	id: `p${i}`,
	name: `Project ${i}`,
	slug: `p${i}`,
	status: "Live",
	category: "Tooling",
	createdAt: at(i),
}));
const repos: Doc[] = projects.map((p, i) => ({
	id: `r${i}`,
	projectSlug: p.slug,
	stars: i === 0 ? 100_000 : i,
	openIssues: 0,
	lastCommitAt: "2026-10-01T00:00:00Z",
}));

type Where = Record<string, unknown>;
const matches = (d: Doc, w: Where | undefined): boolean =>
	Object.entries(w ?? {}).every(([k, c]) => {
		if (k === "and") return (c as Where[]).every((x) => matches(d, x));
		if (k === "or") return (c as Where[]).some((x) => matches(d, x));
		const v = String(d[k] ?? "");
		const op = c as Record<string, unknown>;
		// Payload: exists means present, not null and not empty
		if ("exists" in op)
			return (d[k] != null && d[k] !== "") === Boolean(op.exists);
		if ("equals" in op) return v === String(op.equals);
		if ("in" in op) return (op.in as unknown[]).map(String).includes(v);
		if ("greater_than" in op) return v > String(op.greater_than);
		if ("less_than" in op) return v < String(op.less_than);
		throw new Error(`unsupported where on ${k}: ${JSON.stringify(c)}`);
	});
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async (args: {
			collection: string;
			where?: Where;
			limit?: number;
		}) => {
			const rows =
				args.collection === "projects"
					? projects
					: args.collection === "repos"
						? repos
						: [];
			const hit = rows
				.filter((d) => matches(d, args.where))
				.sort((a, b) =>
					String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
				);
			const limit = args.limit ?? 10;
			const docs = limit === 0 ? hit : hit.slice(0, limit);
			return {
				docs,
				totalDocs: hit.length,
				hasNextPage: docs.length < hit.length,
			};
		},
		count: async () => ({ totalDocs: projects.length }),
	})),
}));
// client widgets the server markup does not need
vi.mock("@/components/ecosystem-dev-stats", () => ({
	EcosystemDevStats: () => null,
}));
vi.mock("@/components/leaderboard-export-buttons", () => ({
	LeaderboardExportButtons: () => null,
}));
vi.mock("@/components/leaderboard-filters", () => ({
	LeaderboardFilters: () => null,
}));

describe("pages that rank active projects read every one", () => {
	it("/leaderboard?sort=stars ranks the oldest active project too", async () => {
		const { default: LeaderboardPage } = await import(
			"@/app/(frontend)/leaderboard/page"
		);
		const html = renderToStaticMarkup(
			await LeaderboardPage({
				searchParams: Promise.resolve({ sort: "stars" }),
			}),
		);
		expect(html).toContain('href="/project/p0"');
	});

	it("/digest/<month> lists the oldest active project in its top by stars", async () => {
		const { default: DigestPage } = await import(
			"@/app/(frontend)/digest/[yearMonth]/page"
		);
		const html = renderToStaticMarkup(
			await DigestPage({ params: Promise.resolve({ yearMonth: "2026-10" }) }),
		);
		expect(html).toContain("/project/p0");
	});
});
