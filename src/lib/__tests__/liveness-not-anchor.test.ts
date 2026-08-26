/**
 * "is X live" was the worst query shape we had.
 *
 * Liveness words were treated as identity anchors. Nearly every project's text
 * says "live", so the F2 anchor rule (a row admitted at a relaxed tier must hit
 * at least one anchor token) admitted EVERY row — at matchMode "majority" with
 * HIGH confidence — while the actually-named project was often absent entirely.
 *
 * That matters beyond ranking: every honesty guard we have (the semantic
 * confidence cap, the "neighbours, not matches" advisory) is gated on
 * matchMode === "semantic". A query that lands in a keyword tier believes it
 * succeeded and bypasses all of them, so the caller gets a confidently-wrong
 * answer instead of an honest refusal.
 *
 * Engine A measured 206 P-PHRASE failures on this shape, nearly all returning
 * the same three rows.
 */
import { describe, expect, it } from "vitest";
import { anchorTokens, hitsAnyToken, tokenize } from "../project-search-match";

// A row that says "live" in its prose, like most real projects do.
const SAYS_LIVE = "dia oracle · live price feeds on stellar mainnet";

describe("liveness words are state, not identity", () => {
	it("does not treat 'live' as an anchor in 'is X live'", () => {
		const anchors = anchorTokens(tokenize("is Sorobix live"));
		expect(anchors).toEqual(["sorobix"]);
	});

	it("stops a row matching only on the word 'live'", () => {
		const anchors = anchorTokens(tokenize("is Sorobix live"));
		// This is the exact admission check the relaxed tiers apply. Before the
		// fix "live" was an anchor, this returned true, and dia/band/beamable
		// were admitted for every "is <anything> live" query.
		expect(hitsAnyToken(SAYS_LIVE, anchors)).toBe(false);
	});

	it("still anchors on the real subject when one is present", () => {
		expect(hitsAnyToken("sorobix build tooling", anchorTokens(tokenize("is Sorobix live")))).toBe(true);
	});

	it("leaves ordinary topic queries alone", () => {
		// The fix must not strip meaning from queries where the words carry it.
		expect(anchorTokens(tokenize("non-custodial wallet for Stellar"))).toContain("wallet");
		expect(anchorTokens(tokenize("cross-border payment corridor"))).toContain("payment");
	});

	it("covers the sibling status words, not just 'live'", () => {
		for (const q of ["is Foo active", "is Foo maintained", "is Foo abandoned"]) {
			expect(anchorTokens(tokenize(q)), q).toEqual(["foo"]);
		}
	});
});
