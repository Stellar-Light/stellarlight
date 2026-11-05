/** The daily lifecycle snapshot (scripts/data/snapshot-project-status.ts)
 * stored a page that /api/projects/search marked meta.partial whenever its
 * row count still matched: a decoration read had failed (per-project repos,
 * among others), so rows carried repos 0 and no activity, and the survival
 * report reads a stored snapshot as fact. A partial read is never stored. */
import { afterEach, describe, expect, it, vi } from "vitest";

type Page = {
	projects: Record<string, unknown>[];
	meta: Record<string, unknown>;
};
let page: Page;
vi.stubGlobal(
	"fetch",
	vi.fn(async (url: string) => {
		// The route lists its valid statuses on a 400.
		if (url.includes("status=__list__"))
			return new Response(JSON.stringify({ validStatuses: ["Live"] }), {
				status: 400,
			});
		const offset = Number(new URL(url).searchParams.get("offset") ?? 0);
		const projects = page.projects.slice(offset, offset + 100);
		return new Response(JSON.stringify({ ...page, projects }), { status: 200 });
	}),
);
const { servedProjects } = await import(
	"../../../scripts/data/snapshot-project-status"
);

const rows = [
	{ slug: "blend", status: "Live", repos: [{ fullName: "o/blend" }] },
	{ slug: "aquarius", status: "Live", repos: [] },
];
afterEach(() => vi.clearAllMocks());

describe("snapshot-project-status reads every status page whole or stores nothing", () => {
	it("a page marked partial is refused even when its count matches", async () => {
		page = { projects: rows, meta: { counts: { total: 2 }, partial: true } };
		await expect(servedProjects()).rejects.toThrow(/partial/);
	});

	it("a short read is refused", async () => {
		page = { projects: rows.slice(0, 1), meta: { counts: { total: 2 } } };
		await expect(servedProjects()).rejects.toThrow(/read 1 of 2/);
	});

	it("a whole read is stored as served", async () => {
		page = { projects: rows, meta: { counts: { total: 2 } } };
		const { rows: got, byStatus } = await servedProjects();
		expect(byStatus).toEqual({ Live: 2 });
		expect(got.map((r) => [r.slug, r.repos])).toEqual([
			["blend", 1],
			["aquarius", 0],
		]);
	});
});
