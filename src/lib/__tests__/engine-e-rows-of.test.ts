/**
 * Engine E calls a param inert when every valid value returns rowsOf()
 * identical to the baseline, so rowsOf must see what a param changes.
 *
 * /api/hackathons/analyze (flagged from 2026-10-11): an aggregate with no
 * top-level array and a constant meta.counts. rowsOf compared only that
 * constant, so facet, winnersOnly and category read as silent while each one
 * changed the served totals.
 */
import { describe, expect, it } from "vitest";
import { rowsOf } from "../../../scripts/eval/engine-e-contract";

const analyze = (facetEcho: string, top: string) => ({
	text: "",
	body: {
		meta: { facet: { id: facetEcho }, counts: { indexedBuilds: 1371 } },
		total: { field: 1371, values: [{ value: top, builds: 249 }] },
	},
});

describe("Engine E rowsOf", () => {
	it("sees an aggregate body change when meta.counts is constant", () => {
		expect(rowsOf(analyze("category", "Payments"))).not.toBe(
			rowsOf(analyze("package", "@stellar/stellar-sdk")),
		);
	});

	it("still ignores meta, which echoes the applied filter", () => {
		expect(rowsOf(analyze("category", "Payments"))).toBe(
			rowsOf(analyze("echoed-filter", "Payments")),
		);
	});
});
