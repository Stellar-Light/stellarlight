/**
 * A feed label never overwrites a status the evidence earned.
 *
 * sync-lumenloop refreshes 686 project rows from an upstream file per project.
 * Curation maps protect the fields they name, but a status a LANE earned —
 * repo-activity, onchain-activity, product-integration — is not in any map, so
 * it was not protected: measured 2026-09-07, the sync would touch 309 rows
 * carrying a strong basis and only 161 were protected. The other 148 (84
 * repo-activity, 52 product-integration, 11 onchain-activity, 1 human-verified)
 * would have taken the feed's label instead.
 *
 * It had not bitten because the two labels usually agree. The damage lands
 * precisely when we know better, which is the reason to hold the row at all.
 *
 * This file used to test its own copy of the rule, and the copy drifted: on
 * 2026-09-07 the sync's list became STRONG_STATUS_BASES, which adds
 * package-release and leaves operator-announcement out, while the copy kept
 * the first list and kept passing. It now runs feedOwnedFields, the function
 * the sync calls (sls-113 review, 2026-11-07).
 */
import { describe, expect, it } from "vitest";
import { STATUS_BASES, STRONG_STATUS_BASES } from "../project-status";
import {
	feedOwnedFields,
	feedStampsProvenance,
	withoutCuratedFields,
} from "../utils/curated-fields";

const feedPatch = {
	status: "Live",
	name: "Whatever",
	links: { website: "https://feed" },
};
const strong = new Set<string>(STRONG_STATUS_BASES);

describe("feed status precedence", () => {
	for (const basis of STRONG_STATUS_BASES) {
		it(`does not overwrite a ${basis} status`, () => {
			const { data, protectedFields } = withoutCuratedFields(
				{ ...feedPatch },
				feedOwnedFields(new Set(), basis),
			);
			expect(data).not.toHaveProperty("status");
			expect(protectedFields).toContain("status");
		});
	}

	for (const basis of [
		null,
		undefined,
		...STATUS_BASES.filter((b) => !strong.has(b)),
	]) {
		it(`still refreshes a ${String(basis)} status`, () => {
			const { data } = withoutCuratedFields(
				{ ...feedPatch },
				feedOwnedFields(new Set(), basis),
			);
			expect(data.status).toBe("Live");
		});
	}

	it("site-liveness is NOT protected, on purpose", () => {
		// It means a page answered, which a parked domain also does, and it is
		// often months stale. Protecting it would mean the feed could never tell
		// us a project died — the one thing an upstream curator is well placed
		// to notice. This is a deliberate trade, not an oversight.
		expect(feedOwnedFields(new Set(), "site-liveness").has("status")).toBe(
			false,
		);
	});

	it("map ownership still applies alongside the basis rule", () => {
		const { data, protectedFields } = withoutCuratedFields(
			{ ...feedPatch },
			feedOwnedFields(new Set(["links.website"]), "repo-activity"),
		);
		expect(data).not.toHaveProperty("status");
		expect((data.links as Record<string, unknown>).website).toBeUndefined();
		expect(protectedFields.sort()).toEqual(["links.website", "status"]);
	});
});

/** The sync stamped source-inherited and its own file over a weak basis even
 * where a STATUS_FIX entry owns the row's status, so a dated unverified stamp
 * (2026-11-12: 27 of the 36 third-party-host rows are in the feed) would be
 * flipped back every morning and rewritten every Tuesday. */
describe("the feed's provenance stamp", () => {
	it("never lands on a row whose status a curation map owns", () => {
		for (const basis of [null, "source-inherited", "unverified"])
			expect(
				feedStampsProvenance(
					feedOwnedFields(new Set(["status"]), basis),
					basis,
				),
				String(basis),
			).toBe(false);
	});
	it("still dates an unowned row with no evidence behind it", () => {
		for (const basis of [null, undefined, "source-inherited", "unverified"])
			expect(
				feedStampsProvenance(feedOwnedFields(new Set(), basis), basis),
				String(basis),
			).toBe(true);
	});
	it("never replaces evidence a lane or a person recorded", () => {
		for (const basis of STATUS_BASES.filter(
			(b) => b !== "source-inherited" && b !== "unverified",
		))
			expect(
				feedStampsProvenance(feedOwnedFields(new Set(), basis), basis),
				basis,
			).toBe(false);
	});
});
