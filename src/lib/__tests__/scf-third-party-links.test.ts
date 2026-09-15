/**
 * A stray link must never decide a project's identity.
 *
 * scripts/eval/scf-absence-diff.ts treats every external link on an SCF detail
 * page as a website candidate and domain-matches those against the directory.
 * That makes the exclusion list load-bearing: when a third-party dashboard or
 * link-in-bio host survives it, the submission matches whoever owns that host
 * and its genuine absence disappears from the report. Observed 2026-09-14 —
 * minisend-7tt matched `dune` through a Dune dashboard link, and the BWB
 * submission matched `noticias-trading` through a beacons.ai bio. Both are
 * absent from the directory by name AND by domain; both were reported served.
 */
import { describe, expect, it } from "vitest";
import { isThirdPartyLink } from "../../../scripts/eval/scf-official";

describe("isThirdPartyLink", () => {
	it("rejects the dashboards and link-in-bio hosts that caused false matches", () => {
		expect(isThirdPartyLink("https://dune.com/someone/stellar-dashboard")).toBe(
			true,
		);
		expect(isThirdPartyLink("https://beacons.ai/noticiastrading")).toBe(true);
		expect(isThirdPartyLink("https://linktr.ee/someproject")).toBe(true);
		expect(isThirdPartyLink("https://lu.ma/some-event")).toBe(true);
	});

	it("keeps rejecting the socials, docs hosts and asset CDNs it already did", () => {
		for (const u of [
			"https://x.com/someone",
			"https://www.linkedin.com/company/x",
			"https://discord.gg/abc",
			"https://medium.com/@someone/post",
			"https://docs.google.com/document/d/1",
			"https://fonts.googleapis.com/css",
			"https://coinmarketcap.com/currencies/x",
		])
			expect(isThirdPartyLink(u)).toBe(true);
	});

	// Known and deliberately unfixed: entries match as SUBSTRINGS, so a product
	// at e.g. substackclone.dev would also be excluded. That failure direction
	// is the safe one — an over-excluded link costs a domain match, which makes
	// a served project look absent and lands it in a human review queue, where
	// an UNDER-excluded link silently deletes a real gap instead.
	it("passes real product sites through, including the ones it nearly ate", () => {
		for (const u of [
			"https://minisend.xyz/",
			"https://www.bwbi.com.br/",
			"https://lunarfinance.io",
			"https://haven.hn",
			"https://balance.ca/",
			"https://catlog.shop",
		])
			expect(isThirdPartyLink(u)).toBe(false);
	});
});
