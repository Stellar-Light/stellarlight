import { describe, expect, it } from "vitest";
import {
	ALLOWED_DOMAIN_MISMATCHES,
	PARTNER_PROJECT_LINKS,
	registrableDomain,
} from "../partner-project-identity";

describe("registrableDomain", () => {
	it("strips scheme, www, path, and port", () => {
		expect(registrableDomain("https://www.bossmoney.com/send")).toBe(
			"bossmoney.com",
		);
		expect(registrableDomain("http://blend.capital:443/")).toBe(
			"blend.capital",
		);
		expect(registrableDomain("stellar.expert/explorer")).toBe("stellar.expert");
	});
	it("collapses subdomains to eTLD+1 (the gmo z.com split)", () => {
		expect(registrableDomain("https://stablecoin.z.com/gyen")).toBe("z.com");
		expect(registrableDomain("https://trust.z.com")).toBe("z.com");
	});
	it("keeps two-label public suffixes intact", () => {
		// coins.ph is itself a registrable 2-label form and must survive.
		expect(registrableDomain("https://coins.ph")).toBe("coins.ph");
		// foo.com.ng vs bar.com.ng must NOT collapse to a shared com.ng.
		expect(registrableDomain("https://foo.com.ng")).not.toBe(
			registrableDomain("https://bar.com.ng"),
		);
		expect(registrableDomain("https://app.foo.com.br")).toBe("foo.com.br");
	});
	it("empty/null-safe", () => {
		expect(registrableDomain(null)).toBe("");
		expect(registrableDomain("")).toBe("");
	});
});

describe("ALLOWED_DOMAIN_MISMATCHES hygiene", () => {
	it("every allowlisted partner is in the link map", () => {
		for (const slug of Object.keys(ALLOWED_DOMAIN_MISMATCHES)) {
			expect(PARTNER_PROJECT_LINKS[slug]).toBeDefined();
		}
	});
	it("entries pin exact domains with evidence", () => {
		for (const entry of Object.values(ALLOWED_DOMAIN_MISMATCHES)) {
			// Exact-domain keying is the drift guard: a blanket exemption would
			// hide the very class this map exists to catch.
			expect(entry.partner).toMatch(/^[a-z0-9.-]+$/);
			expect(entry.project).toMatch(/^[a-z0-9.-]+$/);
			expect(entry.partner).not.toBe(entry.project);
			expect(entry.reason.length).toBeGreaterThan(20);
		}
	});
});
