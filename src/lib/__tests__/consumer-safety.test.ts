/**
 * The consumer safety checks `pnpm contract:check` runs
 * (scripts/contract/consumer-safety.ts): every non-GET operation declares
 * x-side-effecting, and an operationId leaves the spec only with a BREAKING
 * changelog entry at the new version.
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

describe("an operationId leaves the spec only when the changelog says BREAKING", () => {
	const base = new Set(["getA", "getB"]);
	const renamed = new Set(["getA", "getBee"]);
	const entry = (version: string, detail: string): ChangelogEntry => ({
		date: "2026-10-22",
		surfaces: ["api"],
		version,
		type: "removed",
		summary: "getB is renamed.",
		detail,
	});

	it("reads every operationId the spec serves", () => {
		expect(operationIds(spec).size).toBe(41);
		expect(operationIds(spec).has("matchPartners")).toBe(true);
	});

	it("a rename with no changelog entry names the old id", () => {
		expect(unannouncedRemovals(base, renamed, [], "1.9.89")).toEqual(["getB"]);
		expect(unannouncedRemovals(base, base, [], "1.9.89")).toEqual([]);
	});

	it("an entry at this version that names it and says BREAKING announces it", () => {
		const log = [entry("spec@1.9.89", "BREAKING: getB is now getBee.")];
		expect(unannouncedRemovals(base, renamed, log, "1.9.89")).toEqual([]);
	});

	it("an entry at another version, without the word BREAKING, or naming another id does not", () => {
		for (const log of [
			[entry("spec@1.9.88", "BREAKING: getB is now getBee.")],
			[entry("spec@1.9.89", "No breaking change: getB is now getBee.")],
			[
				{
					...entry("spec@1.9.89", "BREAKING: getBee replaces getBees."),
					summary: "Renamed.",
				},
			],
		])
			expect(unannouncedRemovals(base, renamed, log, "1.9.89")).toEqual([
				"getB",
			]);
	});
});
