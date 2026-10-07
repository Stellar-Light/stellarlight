/**
 * `source` must filter on the value each row actually publishes.
 *
 * The bug (2026-09-06): the code-curated events in src/data/curated-hackathons.ts
 * are served through the DoraHacks fetch and keep `source: "curated"`, while the
 * route skipped that fetch entirely when asked for `source=curated`. So
 * `/api/hackathons?source=curated` returned 0 rows, and `meta.counts` — computed
 * from the two input arrays rather than the merged rows — reported
 * `{curated: 0, dorahacks: 26}` beside six served rows whose own source read
 * "curated". A value a row advertises has to work as a filter for that row.
 *
 * The merge, filter and count shape is reproduced here rather than imported,
 * because the route body is one function with a live DoraHacks fetch in the
 * middle; what is pinned is the RULE both must follow.
 */
import { describe, expect, it } from "vitest";

type Row = { slug: string; source: "curated" | "dorahacks" };

/** The corrected shape: filter and count on each row's own `source`. */
function serve(merged: Row[], sourceFilter?: string) {
	const matched = sourceFilter
		? merged.filter((h) => h.source === sourceFilter)
		: merged;
	return {
		rows: matched,
		counts: {
			curated: matched.filter((h) => h.source === "curated").length,
			dorahacks: matched.filter((h) => h.source === "dorahacks").length,
			total: matched.length,
		},
	};
}

const MERGED: Row[] = [
	{ slug: "summit", source: "curated" },
	{ slug: "philippines", source: "curated" },
	{ slug: "hacks-zk", source: "dorahacks" },
	{ slug: "pulso", source: "dorahacks" },
];

describe("hackathons source filter", () => {
	it("returns the curated rows when asked for curated", () => {
		const { rows } = serve(MERGED, "curated");
		expect(rows.map((r) => r.slug)).toEqual(["summit", "philippines"]);
	});

	it("never reports zero for a source it is serving", () => {
		const { rows, counts } = serve(MERGED);
		const served = rows.filter((r) => r.source === "curated").length;
		expect(served).toBe(2);
		expect(counts.curated).toBe(served);
	});

	it("counts each source from the rows, not from the fetch that carried them", () => {
		// Every row arrives through one fetch; the counts must still split by
		// what each row says it is.
		expect(serve(MERGED).counts).toEqual({
			curated: 2,
			dorahacks: 2,
			total: 4,
		});
	});

	it("filtering by one source zeroes the other, and both agree with the rows", () => {
		const { rows, counts } = serve(MERGED, "dorahacks");
		expect(counts.curated).toBe(0);
		expect(counts.dorahacks).toBe(rows.length);
	});
});
