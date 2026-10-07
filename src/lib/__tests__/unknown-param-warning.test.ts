/**
 * Unknown-param disclosure across the public list endpoints (Q3, 2026-07-23).
 *
 * A param a route never reads is dropped without a trace, so the caller
 * filtered, the server didn't, and the unfiltered list reads as filtered.
 * /api/projects/search answered this in the 2026-07-11 audit with
 * `meta.warnings` — warned rather than 400'd, because the contract is
 * ADDITIVE-ONLY and a request that has always returned 200 cannot start
 * returning 400. Seven sibling endpoints still said nothing at all; they now
 * carry the same disclosure.
 *
 * The rot risk this guards is specific and nasty: the declared list is what
 * the warning calls "supported", so a param ADDED to a route but not to its
 * list would make the endpoint announce that a filter it just honoured was
 * ignored. The source scan below keeps every list equal to what its route
 * actually reads — in BOTH directions.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { unknownParamWarning } from "../http-params";

const sp = (qs: string) => new URLSearchParams(qs);
const API = join(dirname(fileURLToPath(import.meta.url)), "../../app/api");

describe("unknownParamWarning", () => {
	it("says nothing when every param is read", () => {
		expect(
			unknownParamWarning(sp("q=blend&limit=5"), ["q", "limit"]),
		).toBeNull();
	});

	it("names the dropped param and says results are NOT filtered", () => {
		const w = unknownParamWarning(sp("q=blend&slug=boss-pay"), ["q"]);
		expect(w).toContain("slug");
		expect(w).toContain("NOT filtered");
	});

	it("names every dropped param, not just the first", () => {
		const w = unknownParamWarning(sp("q=x&country=NG&sep=24"), ["q"]);
		expect(w).toContain("country");
		expect(w).toContain("sep");
	});

	it("does not repeat a param sent twice", () => {
		const w = unknownParamWarning(sp("sep=1&sep=2"), ["q"]);
		expect(w?.match(/sep/g)).toHaveLength(1);
	});

	it("advertises the curated list, not the internal aliases", () => {
		const w = unknownParamWarning(sp("bogus=1"), ["q", "query", "keyword"], {
			advertise: ["q"],
		});
		expect(w).toContain("Supported: q.");
		expect(w).not.toContain("keyword");
	});

	it("appends the endpoint's hint when given", () => {
		const w = unknownParamWarning(sp("bogus=1"), ["q"], {
			hint: "Put it in q.",
		});
		expect(w?.endsWith("Put it in q.")).toBe(true);
	});

	it("is case-sensitive — ?Limit is not ?limit", () => {
		expect(unknownParamWarning(sp("Limit=5"), ["limit"])).not.toBeNull();
	});
});

/** Endpoints that disclose via the shared helper, with the array literal it is
 * called with. projects/search predates the helper and keeps its own
 * KNOWN_PARAMS set — scanned in the same way below. */
const HELPER_ROUTES = [
	"repos/search",
	"partners",
	"research",
	"clusters",
	"leaderboard",
	"hackathons",
	"skills",
];

/** Params a route reads via sp.get/has/getAll. */
function readsOf(src: string): Set<string> {
	return new Set(
		[...src.matchAll(/\bsp\.(?:get|has|getAll)\("([A-Za-z0-9_]+)"\)/g)].map(
			(m) => m[1],
		),
	);
}

describe("declared param lists match what each route reads", () => {
	it.each(HELPER_ROUTES)("%s", (route) => {
		const src = readFileSync(join(API, route, "route.ts"), "utf8");
		const call = src.match(/unknownParamWarning\(\s*sp,\s*\[([\s\S]*?)\]/)?.[1];
		expect(
			call,
			`${route} does not call unknownParamWarning(sp, [...])`,
		).toBeDefined();
		const declared = new Set(
			[...(call as string).matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1]),
		);
		const reads = readsOf(src);
		expect(reads.size).toBeGreaterThan(0); // the scan must not pass vacuously
		// Read but undeclared → the endpoint would announce a filter it honoured
		// was ignored. Declared but unread → the warning advertises a filter that
		// does nothing. Both are the defect this whole change is about.
		expect([...reads].filter((p) => !declared.has(p))).toEqual([]);
		expect([...declared].filter((p) => !reads.has(p))).toEqual([]);
	});

	it("projects/search (its own KNOWN_PARAMS set)", () => {
		const src = readFileSync(join(API, "projects/search/route.ts"), "utf8");
		const block = src.match(/KNOWN_PARAMS = new Set\(\[([\s\S]*?)\]\)/)?.[1];
		expect(block).toBeDefined();
		const declared = new Set(
			[...(block as string).matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1]),
		);
		const reads = readsOf(src);
		expect(reads.size).toBeGreaterThan(0);
		expect([...reads].filter((p) => !declared.has(p))).toEqual([]);
	});
});
