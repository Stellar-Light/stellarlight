/**
 * The repo-existence verdict, pinned on the shapes that decide it.
 *
 * This guard exists because of one measurement, on 2026-09-14. A check over
 * the 162 curated rows whose codeScanError said no-tree/unfetchable reported
 * "162 alive, 0 gone" — and 126 of them were deleted repositories, three of
 * which were ranking FIRST for their own name in live search. The check ran
 * `gh api repos/<x> --jq .full_name` and treated any output as proof of
 * existence; on a 404 the gh CLI prints GitHub's error JSON to stdout, so
 * "there was output" is the one thing it never proves.
 *
 * So the rule the tests below hold: the verdict comes from the STATUS, and a
 * status we did not get is never death.
 */
import { describe, expect, it } from "vitest";
import { repoExistence } from "../github";
import { CODE_SCAN_STATES, NOT_GONE } from "../repo-grade";

describe("the false-alive trap (2026-09-14)", () => {
	it("a 404 is gone no matter what the response body contains", () => {
		// The exact body the trap read as a name. It cannot reach the verdict:
		// repoExistence takes a status, so there is no parameter to pass it to.
		expect(repoExistence(404)).toBe("gone");
	});

	it("a body is not an argument — content can never make a 404 look alive", () => {
		// Pinning the signature is the guard: the day someone adds a body
		// parameter, this length assertion fails and they have to justify it.
		expect(repoExistence.length).toBe(2);
		expect(repoExistence(404, 4096)).toBe("gone");
	});

	it("only 404 is gone — every other failure is unchecked", () => {
		for (const status of [401, 403, 429, 451, 500, 502, 503, 522])
			expect(repoExistence(status)).toBe("unchecked");
	});

	it("no answer at all (thrown fetch, timeout, no token) is unchecked", () => {
		expect(repoExistence(null)).toBe("unchecked");
		expect(repoExistence(null, 0)).toBe("unchecked");
	});
});

describe("the trinary", () => {
	const cases: Array<[number | null, number | null | undefined, string]> = [
		[404, null, "gone"],
		[200, 0, "empty"],
		[200, 51, "alive"],
		[200, 1, "alive"],
		[200, undefined, "alive"],
		[200, null, "alive"],
		[403, null, "unchecked"],
		[null, null, "unchecked"],
	];
	for (const [status, size, want] of cases)
		it(`${status ?? "no answer"}${size === undefined ? "" : ` size=${size}`} → ${want}`, () => {
			expect(repoExistence(status, size)).toBe(want);
		});

	it("a 200 with an unreadable size is alive, not empty — absence of a size is not a size of 0", () => {
		expect(repoExistence(200, null)).not.toBe("empty");
	});
});

describe("the serving filter", () => {
	it("gone is a scan state the collection and the spec both know", () => {
		expect(CODE_SCAN_STATES).toContain("gone");
	});

	it("NOT_GONE keeps rows that carry no scan state at all", () => {
		// Mongo `$ne` matches a missing field, which is what `not_equals` maps
		// to — most rows have never been scanned and must stay searchable.
		expect(NOT_GONE).toEqual({ codeScanState: { not_equals: "gone" } });
	});
});
