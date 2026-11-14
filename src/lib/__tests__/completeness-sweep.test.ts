/**
 * scripts/check-record-completeness.ts reads the public API page by page. A
 * page it could not read used to count as a page with no rows: S0 swept
 * /api/projects/search with no filter, the API answered 200 with
 * meta.error "no_query" and 0 rows, the audits sweep read `projects` from a
 * body that holds `audits`, and S0 printed "0 projects + 0 audits, 0 dangling
 * references" with a tick (found 2026-11-13). These are the parts of that
 * script that can be tested without the network.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	DIRECTORY_SWEEPS,
	SweepUnreadable,
	sweepRows,
} from "../completeness-sweep";
import { PROJECT_CATEGORIES } from "../project-types";

describe("sweepRows: a page that could not be read is never a page with no rows", () => {
	const path = "/api/projects/search?category=Asset&limit=100&offset=0";

	it("returns the rows of a page that answered, an empty last page included", () => {
		expect(sweepRows(path, 200, { projects: [{ slug: "a" }] })).toEqual([
			{ slug: "a" },
		]);
		expect(sweepRows(path, 200, { meta: {}, projects: [] })).toEqual([]);
	});

	it("throws on a 429 or a 5xx, whatever the body holds", () => {
		for (const status of [429, 500, 503])
			expect(() => sweepRows(path, status, { projects: [] })).toThrow(
				SweepUnreadable,
			);
		expect(() => sweepRows(path, 429, null)).toThrow(/HTTP 429/);
	});

	it("throws on an error in the body: a 400's, or meta.error on a 200", () => {
		// What the live API answered /api/projects/search?limit=100 on
		// 2026-11-13: HTTP 200, no rows, and the reason in meta.error.
		const noQuery = {
			meta: { counts: { returned: 0, total: 0 }, error: "no_query" },
			projects: [],
			codeReferences: [],
		};
		expect(() =>
			sweepRows("/api/projects/search?limit=100&offset=0", 200, noQuery),
		).toThrow(/no_query/);
		expect(() =>
			sweepRows(path, 400, { error: "Invalid category 'Nope'." }),
		).toThrow(/HTTP 400.*Invalid category/);
		expect(() => sweepRows(path, 200, { error: "x", projects: [] })).toThrow(
			SweepUnreadable,
		);
	});

	it("throws when the body holds no array under the key it was asked for", () => {
		// /api/audits answers { audits: [...] }; read as `projects` it was
		// 0 audits every night.
		const audits = { meta: {}, audits: [{ reportId: 1 }] };
		expect(() => sweepRows("/api/audits?limit=100", 200, audits)).toThrow(
			/no projects array/,
		);
		expect(sweepRows("/api/audits?limit=100", 200, audits, "audits")).toEqual([
			{ reportId: 1 },
		]);
		expect(() => sweepRows(path, 200, null)).toThrow(SweepUnreadable);
		expect(() => sweepRows(path, 200, "<html>")).toThrow(SweepUnreadable);
	});
});

describe("the directory sweep reads every category the collection holds", () => {
	it("the collection's category options are PROJECT_CATEGORIES", () => {
		const collection = readFileSync(
			resolve(__dirname, "../../collections/Projects.ts"),
			"utf8",
		);
		// [^{}] keeps the match inside the one field definition
		expect(collection).toMatch(
			/name:\s*"category",[^{}]*?options:\s*\[\.\.\.PROJECT_CATEGORIES\]/,
		);
		expect(PROJECT_CATEGORIES.length).toBeGreaterThan(0);
		expect(new Set(PROJECT_CATEGORIES).size).toBe(PROJECT_CATEGORIES.length);
	});

	it("sweeps one path per category, with the name URL-encoded", () => {
		expect(DIRECTORY_SWEEPS).toEqual(
			PROJECT_CATEGORIES.map(
				(c) => `/api/projects/search?category=${encodeURIComponent(c)}`,
			),
		);
		// a search with no filter is the request that answers no_query
		for (const p of DIRECTORY_SWEEPS) expect(p).toMatch(/\?category=[^&]+$/);
		expect(DIRECTORY_SWEEPS.join(" ")).not.toMatch(/[ /]Contract|Partner I/);
	});
});
