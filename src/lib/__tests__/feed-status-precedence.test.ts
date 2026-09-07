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
 */
import { describe, expect, it } from "vitest";
import { withoutCuratedFields } from "../utils/curated-fields";

/** The rule the sync applies, in isolation: an explicit list of tiers WE
 *  produced. site-liveness is deliberately absent — see the test below. */
const EARNED = new Set([
	"human-verified",
	"onchain-activity",
	"product-integration",
	"repo-activity",
	"operator-announcement",
]);
const earned = (basis: string | null | undefined) => EARNED.has(String(basis));

/** owned = curation-map ownership, plus status when the row earned it. */
function ownedFor(mapOwned: string[], basis: string | null | undefined): Set<string> {
	const owned = new Set(mapOwned);
	if (earned(basis)) owned.add("status");
	return owned;
}

const feedPatch = { status: "Live", name: "Whatever", links: { website: "https://feed" } };

describe("feed status precedence", () => {
	for (const basis of [
		"human-verified",
		"onchain-activity",
		"product-integration",
		"repo-activity",
		"operator-announcement",
	]) {
		it(`does not overwrite a ${basis} status`, () => {
			const { data, protectedFields } = withoutCuratedFields(
				{ ...feedPatch },
				ownedFor([], basis),
			);
			expect(data).not.toHaveProperty("status");
			expect(protectedFields).toContain("status");
		});
	}

	for (const basis of [null, undefined, "source-inherited", "unverified"]) {
		it(`still refreshes a ${String(basis)} status — the feed is the best we have`, () => {
			const { data } = withoutCuratedFields({ ...feedPatch }, ownedFor([], basis));
			expect(data.status).toBe("Live");
		});
	}

	it("site-liveness is NOT protected, on purpose", () => {
		// It means a page answered, which a parked domain also does, and it is
		// often months stale. Protecting it would mean the feed could never tell
		// us a project died — the one thing an upstream curator is well placed
		// to notice. This is a deliberate trade, not an oversight.
		const { data } = withoutCuratedFields({ ...feedPatch }, ownedFor([], "site-liveness"));
		expect(data.status).toBe("Live");
	});

	it("map ownership still applies alongside the basis rule", () => {
		const { data, protectedFields } = withoutCuratedFields(
			{ ...feedPatch },
			ownedFor(["links.website"], "repo-activity"),
		);
		expect(data).not.toHaveProperty("status");
		expect((data.links as Record<string, unknown>).website).toBeUndefined();
		expect(protectedFields.sort()).toEqual(["links.website", "status"]);
	});
});
