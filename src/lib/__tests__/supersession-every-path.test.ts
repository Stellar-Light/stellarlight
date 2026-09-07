/**
 * A repo that was replaced says so on EVERY read path.
 *
 * The supersession map is applied at serve time. Until 2026-09-07 only
 * repo-search applied it, so the same repo answered two different truths:
 *
 *   /api/repos/search?q=defindex  → paltalabs/defindex, superseded by
 *                                   defindex-io/stellar-contracts, 2026-07-01
 *   /api/repos?where[fullName]=…  → isArchived: true, supersededBy absent
 *
 * An agent that hits the collection learns the repo is dead and nothing about
 * what replaced it — the exact case the data exists for.
 */
import { describe, expect, it } from "vitest";
import { REPO_SUPERSESSIONS, repoSupersession } from "../repo-relations";

describe("supersession resolves for any caller", () => {
	it("returns the successor for a known replaced repo", () => {
		const s = repoSupersession("paltalabs/defindex");
		expect(s?.supersededBy).toBe("defindex-io/stellar-contracts");
		expect(s?.deprecatedAt).toBeTruthy();
	});

	it("is case-insensitive, because callers pass GitHub's casing", () => {
		expect(repoSupersession("PaltaLabs/DeFindex")?.supersededBy).toBe(
			repoSupersession("paltalabs/defindex")?.supersededBy,
		);
	});

	it("returns null for a repo with no supersession, never a guess", () => {
		expect(repoSupersession("stellar/js-stellar-sdk")).toBeNull();
	});

	it("every mapped repo resolves through the public helper", () => {
		// A map entry that the helper cannot return is a fact held and never
		// served — the shape this whole fix is about.
		for (const key of Object.keys(REPO_SUPERSESSIONS)) {
			expect(repoSupersession(key)).not.toBeNull();
		}
	});
});
