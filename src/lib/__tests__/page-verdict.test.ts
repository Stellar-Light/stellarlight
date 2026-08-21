import { describe, expect, it } from "vitest";
import { classifyPage } from "../page-verdict";

// Every fixture is a real page the 2026-08-21 liveness sweep fetched from a
// row that was `Live` on a site-liveness basis.
describe("classifyPage — a 200 is not a business", () => {
	it("Kulipa's post-shutdown placeholder", () => {
		expect(
			classifyPage({
				title: "Home changing",
				bodyStart: "Kulipa is changing home. Join our waitlist",
			}).verdict,
		).toBe("placeholder");
	});
	it("GetBlockCard's hijacked domain (lottery spam)", () => {
		expect(
			classifyPage({
				title: "Online138 | Situs Partner Resmi Jawatogel Bocoran Syair",
			}).verdict,
		).toBe("spam");
	});
	it("a domain for sale", () => {
		expect(
			classifyPage({ title: "StellarBattle.com is for sale | HugeDomains" })
				.verdict,
		).toBe("parked");
	});
	it("an unbuilt Next.js scaffold", () => {
		expect(classifyPage({ title: "Create Next App" }).verdict).toBe("scaffold");
	});
	it("a redirect to another company's domain", () => {
		expect(
			classifyPage({
				title: "Rain",
				requestedHost: "planetpay.io",
				finalHost: "asslama.news",
			}).verdict,
		).toBe("offsite-redirect");
	});
	it("www and subdomains are the same site", () => {
		expect(
			classifyPage({
				title: "Bridge",
				requestedHost: "bridge.xyz",
				finalHost: "www.bridge.xyz",
			}).verdict,
		).toBe("product");
	});
	it("a live product with marketing that mentions a waitlist stays product", () => {
		expect(
			classifyPage({
				title: "Bridge | Stablecoin Infrastructure and APIs for Developers",
				metaDescription:
					"Move money with stablecoins. Issue your own stablecoin. Cards.",
				bodyStart: "Join the waitlist for our new feature",
			}).verdict,
		).toBe("product");
	});
	it("nothing to judge is unknown, not dead", () => {
		expect(classifyPage({}).verdict).toBe("unknown");
	});
});
