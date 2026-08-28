import { describe, expect, it } from "vitest";
import {
	brandTokens,
	classifyIssuerDomain,
	registrableDomain,
} from "../lookalike-domains";

/** Fixtures are the REAL 2026-08-28 fake-issuer farm, byte-for-byte — if the
 * classifier stops catching these, the detector is decorative. */
describe("the fake-issuer farm cases", () => {
	const wisdomtree = {
		brands: brandTokens("WisdomTree"),
		realDomains: ["wisdomtree.com"],
	};
	const dtcc = { brands: brandTokens("DTCC"), realDomains: ["dtcc.com"] };

	it("brand-as-subdomain of an unrelated domain is a lookalike", () => {
		expect(
			classifyIssuerDomain({ homeDomain: "wisdomtree.xlmhq.org", ...wisdomtree }),
		).toMatchObject({ kind: "lookalike", brandHit: "wisdomtree" });
	});

	it("institutional name under a wrong TLD is a lookalike", () => {
		for (const h of [
			"treasury.dtcc.company",
			"stellar.dtcc.network",
			"xrpl.dtcc.markets",
		]) {
			expect(classifyIssuerDomain({ homeDomain: h, ...dtcc })).toMatchObject({
				kind: "lookalike",
				brandHit: "dtcc",
			});
		}
	});

	it("a subdomain of the REAL domain is canonical (the glo-dollar chain)", () => {
		expect(
			classifyIssuerDomain({
				homeDomain: "app.glodollar.org",
				brands: brandTokens("Glo Dollar"),
				realDomains: ["glodollar.org"],
			}),
		).toMatchObject({ kind: "canonical-domain", matchedReal: "glodollar.org" });
	});

	it("farm domains without the brand read as unrelated, not lookalike", () => {
		for (const h of ["lumenvaultx.org", "rwastellar.org", "xminthub.com"]) {
			expect(classifyIssuerDomain({ homeDomain: h, ...wisdomtree }).kind).toBe(
				"unrelated",
			);
		}
	});

	it("no home_domain is its own verdict", () => {
		expect(classifyIssuerDomain({ homeDomain: null, ...wisdomtree }).kind).toBe(
			"no-domain",
		);
	});
});

describe("false-positive guards", () => {
	it("ecosystem vocabulary never counts as a brand", () => {
		expect(brandTokens("Stellar Treasury Fund Network")).toEqual([]);
		expect(
			classifyIssuerDomain({
				homeDomain: "stellar.org",
				brands: brandTokens("Stellar Development Foundation"),
				realDomains: ["example.com"],
			}).kind,
		).toBe("unrelated");
	});

	it("short tokens (<4) never match", () => {
		expect(
			classifyIssuerDomain({
				homeDomain: "dia.xlmhq.org",
				brands: ["dia"],
				realDomains: ["diadata.org"],
			}).kind,
		).toBe("unrelated");
	});
});

describe("registrableDomain", () => {
	it("handles plain and two-part TLDs", () => {
		expect(registrableDomain("treasury.dtcc.company")).toBe("dtcc.company");
		expect(registrableDomain("a.b.example.co.uk")).toBe("example.co.uk");
		expect(registrableDomain("nodot")).toBeNull();
	});
});
