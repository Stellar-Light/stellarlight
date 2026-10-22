/**
 * The consumer safety checks `pnpm contract:check` runs
 * (scripts/contract/consumer-safety.ts): every non-GET operation declares
 * x-side-effecting, and an operationId leaves the spec only when a
 * changelog entry at the new version announces it as
 * `BREAKING: <operationId>`.
 */
import { describe, expect, it } from "vitest";
import {
	operationIds,
	sideEffectingProblems,
	unannouncedRemovals,
} from "../../../scripts/contract/consumer-safety";
import type { ChangelogEntry } from "../changelog";
import { spec } from "../openapi-spec";

describe("x-side-effecting on every non-GET operation", () => {
	it("the spec declares it on all five POSTs; matchPartners only reads, so false", () => {
		expect(sideEffectingProblems(spec)).toEqual([]);
		const paths = spec.paths as Record<
			string,
			Record<string, Record<string, unknown>>
		>;
		// The main consumer exposes matchPartners and refuses to build its
		// catalog when an exposed operation is marked true.
		expect(paths["/api/partners/match"].post["x-side-effecting"]).toBe(false);
	});

	it("names an operation that leaves it out or gives a non-boolean, and ignores GETs", () => {
		const problems = sideEffectingProblems({
			paths: {
				"/a": { get: { operationId: "getA" } },
				"/b": { post: { operationId: "postB" } },
				"/c": { delete: { operationId: "deleteC", "x-side-effecting": "yes" } },
				"/d": { put: { operationId: "putD", "x-side-effecting": false } },
			},
		});
		expect(problems).toHaveLength(2);
		expect(problems[0]).toMatch(/^postB \(POST \/b\) must declare/);
		expect(problems[1]).toMatch(/^deleteC \(DELETE \/c\)/);
	});
});

describe("an operationId leaves the spec only as BREAKING: <operationId>", () => {
	const entry = (version: string, detail: string): ChangelogEntry => ({
		date: "2026-10-22",
		surfaces: ["api"],
		version,
		type: "removed",
		summary: "Two operations change.",
		detail,
	});
	const removed = (detail: string, version = "spec@1.9.89") =>
		unannouncedRemovals(
			new Set(["getFoo", "getBar", "getKeep"]),
			new Set(["getKeep", "getFooV2"]),
			[entry(version, detail)],
			"1.9.89",
		);

	it("reads the operationId of every operation, whatever the method", () => {
		expect(
			operationIds({
				paths: {
					"/a": {
						get: { operationId: "getA" },
						post: { operationId: "postA" },
					},
					"/b": { parameters: [], get: { operationId: "getB" } },
				},
			}),
		).toEqual(new Set(["getA", "postA", "getB"]));
		const ids = operationIds(spec);
		for (const item of Object.values(spec.paths))
			for (const op of Object.values(item as Record<string, unknown>))
				if (op && typeof op === "object" && "operationId" in op)
					expect(ids.has(String(op.operationId))).toBe(true);
		expect(ids.has("matchPartners")).toBe(true);
	});

	it("a removal or rename with no announcement fails, naming the ids", () => {
		expect(removed("")).toEqual(["getBar", "getFoo"]);
		expect(
			unannouncedRemovals(
				new Set(["getKeep"]),
				new Set(["getKeep"]),
				[],
				"1.9.89",
			),
		).toEqual([]);
	});

	it("prose that mentions BREAKING announces nothing", () => {
		for (const detail of [
			"Not a BREAKING change: getFoo and getBar keep working.",
			"A removal must name the operationId and say BREAKING; getFoo, getBar.",
			"BREAKING getFoo, getBar",
			"breaking: getFoo, getBar",
		])
			expect(removed(detail)).toEqual(["getBar", "getFoo"]);
	});

	it("BREAKING: getFoo announces getFoo and nothing else", () => {
		// getBar sits in the same sentence, after the list, so it is not listed.
		expect(
			removed("BREAKING: getFoo is now getFooV2, replacing getBar."),
		).toEqual(["getBar"]);
		expect(removed("BREAKING: getFoo, getBar.")).toEqual([]);
	});

	it("only an entry at this spec version counts", () => {
		expect(removed("BREAKING: getFoo, getBar", "spec@1.9.88")).toEqual([
			"getBar",
			"getFoo",
		]);
	});
});
