import { describe, expect, it } from "vitest";
import {
	type CompactPlan,
	PROJECT_COMPACT,
	REPO_COMPACT,
	viewParamError,
	withView,
} from "@/lib/compact-view";
import { spec } from "@/lib/openapi-spec";

/** The view and fields values a route reads from a query string. */
const q = (qs: string) => new URLSearchParams(qs);
const view = (qs: string) => q(qs).get("view");
const check = (qs: string) => viewParamError(view(qs), q(qs).get("fields"));

const PLAN: CompactPlan = {
	keep: { id: true, name: true, confidence: ["score", "label"] },
	counts: { reposCount: "repos", contractsCount: "onchain.contracts" },
	detail: "repeat without view",
};

const body = {
	meta: { source: "s", counts: { returned: 3 } },
	rows: [
		{
			id: "a",
			name: "A",
			confidence: { score: 0.9, label: "high", relevance: 1 },
			repos: [{ x: 1 }, { x: 2 }],
			onchain: { contracts: [] },
			heavy: "x".repeat(50),
		},
		// name and onchain missing, confidence and repos null
		{ id: "b", confidence: null, repos: null },
		{ id: "c", name: "C", confidence: { score: 0.2 }, repos: [] },
	],
	other: [{ id: "untouched", heavy: 1 }],
};

describe("withView", () => {
	it("returns the body itself when view is absent or full", () => {
		expect(withView(view(""), { rows: PLAN })(body)).toBe(body);
		expect(withView(view("view=full"), { rows: PLAN })(body)).toBe(body);
		expect(withView(view("view=FULL"), { rows: PLAN })(body)).toBe(body);
	});

	it("compact: same keys on every row, null never a missing key", () => {
		const out = withView(view("view=compact"), { rows: PLAN })(body) as {
			rows: Record<string, unknown>[];
		};
		for (const row of out.rows)
			expect(Object.keys(row)).toEqual([
				"id",
				"name",
				"confidence",
				"reposCount",
				"contractsCount",
			]);
		expect(out.rows).toEqual([
			{
				id: "a",
				name: "A",
				confidence: { score: 0.9, label: "high" },
				reposCount: 2,
				contractsCount: 0,
			},
			{
				id: "b",
				name: null,
				confidence: null,
				reposCount: null,
				contractsCount: null,
			},
			{
				id: "c",
				name: "C",
				confidence: { score: 0.2, label: null },
				reposCount: 0,
				contractsCount: null,
			},
		]);
	});

	it("compact: meta stays first and says it is compact and how to get full rows", () => {
		const out = withView(view("view=compact"), { rows: PLAN })(body) as Record<
			string,
			unknown
		> & {
			meta: Record<string, unknown> & {
				view: { mode: string; rows: Record<string, unknown>; note: string };
			};
		};
		expect(Object.keys(out)).toEqual(["meta", "rows", "other"]);
		expect(Object.keys(out.meta)[0]).toBe("view");
		expect(out.meta.view.mode).toBe("compact");
		expect(out.meta.view.rows).toEqual({
			rows: {
				counts: { reposCount: "repos", contractsCount: "onchain.contracts" },
				detail: "repeat without view",
			},
		});
		expect(out.meta.view.note).toMatch(/without view=compact/);
		// The rest of meta is untouched; arrays with no plan are untouched.
		expect(out.meta.counts).toEqual({ returned: 3 });
		expect(out.other).toBe(body.other);
	});

	it("the shipped plans keep identity, rank and score keys", () => {
		expect(Object.keys(PROJECT_COMPACT.keep)).toEqual(
			expect.arrayContaining(["id", "slug", "name", "score", "confidence"]),
		);
		expect(Object.keys(REPO_COMPACT.keep)).toEqual(
			expect.arrayContaining(["fullName", "url", "repoScore", "score"]),
		);
	});
});

describe("viewParamError", () => {
	it("accepts absent, full and compact", () => {
		expect(check("")).toBeNull();
		expect(check("view=full")).toBeNull();
		expect(check("view=compact")).toBeNull();
		expect(check("view=Compact")).toBeNull();
	});

	it("an unknown value is an error naming the valid values", () => {
		expect(check("view=tiny")).toMatchObject({
			error: "Invalid view 'tiny'.",
			validValues: ["full", "compact"],
		});
	});

	it("compact with fields is an error rather than two projections", () => {
		expect(check("view=compact&fields=name")?.error).toMatch(/fields/);
		expect(check("view=full&fields=name")).toBeNull();
	});
});

describe("compact project rows keep via", () => {
	it("a semantic fallback row stays tagged; a row without via reads null", () => {
		const out = withView("compact", { projects: PROJECT_COMPACT })({
			meta: {},
			projects: [
				{ id: "a", slug: "a", via: "semantic" },
				{ id: "b", slug: "b" },
			],
		}) as { projects: Record<string, unknown>[] };
		expect(out.projects.map((p) => p.via)).toEqual(["semantic", null]);
		expect(Object.keys(out.projects[1])).toEqual(Object.keys(out.projects[0]));
	});
});

describe("the spec declares the 400 a view can answer", () => {
	const responses = (path: string) =>
		(
			spec.paths[path] as {
				get: { responses: Record<string, { description: string }> };
			}
		).get.responses;
	it.each(["/api/projects/search", "/api/repos/search"])("%s", (path) => {
		const bad = responses(path)["400"];
		expect(bad).toBeDefined();
		expect(bad.description).toMatch(/view/);
		expect(bad.description).toMatch(/validValues/);
	});
});
