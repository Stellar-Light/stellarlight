/**
 * One field, one writer — enforced on the two maps that both write
 * `statusSourceUrl`.
 *
 * STATUS_SOURCE_BACKFILL sets a citation; STATUS_SOURCE_RETRACT nulls one.
 * Both are value-keyed, so a slug in both is usually a REPLACE: retract the
 * bad url, set the good one. That is fine and six slugs do it.
 *
 * What is never fine is the same slug carrying the SAME url in both. On
 * 2026-09-07 pactta and mimoto did, so curate applied a write and replanned it
 * on every single run — 46 applied, 1 still planned, forever. The idempotence
 * gate caught it; this stops it coming back.
 */
import { describe, expect, it } from "vitest";
import {
	STATUS_SOURCE_BACKFILL,
	STATUS_SOURCE_RETRACT,
} from "../../../scripts/data/curation-maps";

const norm = (u: string) => u.replace(/\/+$/, "");

describe("statusSourceUrl has one writer per value", () => {
	it("no slug sets and retracts the SAME url", () => {
		const clashes = Object.keys(STATUS_SOURCE_BACKFILL)
			.filter((slug) => slug in STATUS_SOURCE_RETRACT)
			.filter(
				(slug) =>
					norm(STATUS_SOURCE_BACKFILL[slug]) ===
					norm(STATUS_SOURCE_RETRACT[slug]),
			);
		expect(clashes).toEqual([]);
	});

	it("a slug in both maps with different urls is allowed (retract then replace)", () => {
		// Documents the intent, so the rule above is not read as "never overlap".
		const overlap = Object.keys(STATUS_SOURCE_BACKFILL).filter(
			(slug) => slug in STATUS_SOURCE_RETRACT,
		);
		for (const slug of overlap) {
			expect(norm(STATUS_SOURCE_BACKFILL[slug])).not.toBe(
				norm(STATUS_SOURCE_RETRACT[slug]),
			);
		}
	});
});
