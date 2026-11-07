/** Review 2026-11-04: scripts/report-coverage-gaps.ts paged each category
 * until a page came back short and never read meta.partial or counts.total,
 * so a partial 200 page ended the category and every project past it read as
 * missing from the directory: a false coverage gap. A partial or short read
 * is refused, as the lifecycle snapshot now refuses one. */
import { afterEach, describe, expect, it, vi } from "vitest";

type Page = {
	projects: Record<string, unknown>[];
	meta: Record<string, unknown>;
};
let page: Page;
vi.stubGlobal(
	"fetch",
	vi.fn(async (url: string) => {
		// The route lists its valid categories on a 400.
		if (url.includes("category=bogus"))
			return new Response(JSON.stringify({ validCategories: ["Asset"] }), {
				status: 400,
			});
		// BASE_URL may be relative in the test env: resolve against any origin.
		const offset = Number(
			new URL(url, "https://stellarlight.xyz").searchParams.get("offset") ?? 0,
		);
		const projects = page.projects.slice(offset, offset + 100);
		return new Response(JSON.stringify({ ...page, projects }), { status: 200 });
	}),
);
const { fetchDirectory } = await import(
	"../../../scripts/report-coverage-gaps"
);

const rows = [
	{ slug: "usdc", name: "USDC", status: "Live" },
	{ slug: "eurc", name: "EURC", status: "Live" },
];
afterEach(() => vi.clearAllMocks());

describe("report-coverage-gaps reads each category whole or reports nothing", () => {
	it("a page marked partial is refused, even one that ends the category", async () => {
		page = { projects: rows, meta: { counts: { total: 2 }, partial: true } };
		await expect(fetchDirectory()).rejects.toThrow(/partial/);
	});

	it("a short read is refused", async () => {
		page = { projects: rows.slice(0, 1), meta: { counts: { total: 2 } } };
		await expect(fetchDirectory()).rejects.toThrow(/read 1 of 2/);
	});

	it("a whole read is the directory frame", async () => {
		page = { projects: rows, meta: { counts: { total: 2 } } };
		expect((await fetchDirectory()).map((r) => r.slug)).toEqual([
			"usdc",
			"eurc",
		]);
	});
});
