/**
 * Every registry that WRITES a field must OWN it.
 *
 * A curation map that writes a field the feed sync also writes, without
 * declaring ownership, is a lane fight that no single run can detect: curate
 * writes, the sync overwrites hours later, and each run's own idempotence check
 * passes because the other lane has not run yet.
 *
 * This has now happened twice with the same field:
 *   2026-09-05  the-blue-marble's hijacked casino link came back nightly until
 *               WEBSITE_REMOVE was granted ownership of links.website.
 *   2026-09-07  44 dead websites and 37 dead GitHub links, removed in the
 *               morning, were all back by the afternoon — WEBSITE_REMOVE_DEAD
 *               and GITHUB_LINK_REMOVE were new maps and nobody granted them
 *               ownership.
 *
 * Ownership is granted map-by-map by hand, so the fix is not to remember
 * harder: OWNERSHIP_COVERAGE states which map owns which field, and this walks
 * it against the function that actually applies it.
 */
import { describe, expect, it } from "vitest";
import { curatedFieldsFor, OWNERSHIP_COVERAGE } from "../../../scripts/data/curation-maps";

describe("a map that writes a field owns it", () => {
	for (const { map, name, field } of OWNERSHIP_COVERAGE) {
		it(`${name} owns ${field}`, () => {
			const slug = Object.keys(map)[0];
			expect(slug, `${name} is empty — nothing to check`).toBeTruthy();
			expect(curatedFieldsFor(slug as string)).toContain(field);
		});
	}

	it("every slug in every covered map is protected for that map's field", () => {
		// Not just the first key: a map with a mistyped entry would otherwise
		// pass on its first slug and lose the rest to the sync.
		for (const { map, name, field } of OWNERSHIP_COVERAGE) {
			for (const slug of Object.keys(map)) {
				expect(
					curatedFieldsFor(slug),
					`${name}: ${slug} does not own ${field}`,
				).toContain(field);
			}
		}
	});

	it("a slug in no registry owns nothing", () => {
		expect(curatedFieldsFor("definitely-not-a-curated-slug").size).toBe(0);
	});
});
