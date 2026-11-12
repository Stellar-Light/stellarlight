import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SEEDS, STATUS_FIX } from "../../../scripts/data/curation-maps";
import { isMaintenance, kindOf } from "../improvement-ledger";
import {
	ANOTHER_BUSINESS_VERDICTS,
	classifyPage,
	thirdPartyHost,
} from "../page-verdict";

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
	it("a project domain that now ranks casinos (stabble.org, 2026-11-04)", () => {
		expect(
			classifyPage({
				title: "Best Crypto Casinos Canada 2026: Tested & Ranked | Stabble",
				metaDescription:
					"We deposited and withdrew real crypto to rank the best crypto casinos in Canada.",
			}).verdict,
		).toBe("spam");
	});
	it("the other gambling words, singular and plural", () => {
		for (const title of [
			"Top Sportsbooks for Bitcoin",
			"Online Gambling Guide",
			"Crypto Bookmakers Compared",
			"Bitcoin Casino Reviews",
		])
			expect(classifyPage({ title }).verdict, title).toBe("spam");
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

describe("offsite redirect across a multi-label public suffix", () => {
	it("flags a hop between two different .com.br sites", () => {
		// `parts.slice(-2)` read both of these as "com.br", compared them equal,
		// and let a page that had moved to somebody else's business go on being
		// judged on its own content.
		const v = classifyPage({
			status: 200,
			requestedHost: "bwbi.com.br",
			finalHost: "someoneelse.com.br",
			title: "Outra empresa",
			metaDescription: null,
			bodyText: null,
		} as never);
		expect(v.verdict).toBe("offsite-redirect");
		expect(v.reason).toBe("bwbi.com.br → someoneelse.com.br");
	});

	it("does not flag a www or subdomain hop inside one .com.br site", () => {
		const v = classifyPage({
			status: 200,
			requestedHost: "www.bwbi.com.br",
			finalHost: "app.bwbi.com.br",
			title: "BWB",
			metaDescription: null,
			bodyText: null,
		} as never);
		expect(v.verdict).not.toBe("offsite-redirect");
	});
});

// sls-100 review: a 200 page that reads as another business passed the link
// check and reached no artifact. check-links now lists it (notTheProduct) and
// the ledger files it as a curation refresh, like a proven-dead link.
describe("a page that reads as another business reaches the ledger", () => {
	const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
	it("gambling spam and parked domains are the verdicts that count", () => {
		expect([...ANOTHER_BUSINESS_VERDICTS].sort()).toEqual(["parked", "spam"]);
	});
	it("check-links writes them and the ledger reads them as a refresh", () => {
		expect(src("scripts/check-links.ts")).toMatch(
			/notTheProduct: notProductRows/,
		);
		expect(src("scripts/improvement-ledger.ts")).toMatch(
			/key: "notTheProduct",\s*surface: "directory",\s*mode: "link-not-the-product"/,
		);
		expect(kindOf("link-health", "link-not-the-product")).toBe("world");
		expect(
			isMaintenance({ failureMode: "link-not-the-product" } as Parameters<
				typeof isMaintenance
			>[0]),
		).toBe(true);
	});
});

/** A page on a host the project does not own is about the project, not the
 * product: what it answers describes the host (audit 2026-11-12). */
describe("thirdPartyHost", () => {
	it("names the host behind each known case", () => {
		expect(
			thirdPartyHost(
				"https://communityfund.stellar.org/project/lumenshade-privacy-pools-hnp",
			),
		).toBe("communityfund.stellar.org");
		expect(
			thirdPartyHost("https://github.com/frankszendzielarz/sorobanrpcsdk"),
		).toBe("github.com");
		expect(thirdPartyHost("https://linktr.ee/dobprotocol")).toBe("linktr.ee");
		expect(
			thirdPartyHost("https://moonlight-10.gitbook.io/moonlight-docs"),
		).toBe("gitbook.io");
		expect(thirdPartyHost("https://www.youtube.com/@hififo")).toBe(
			"youtube.com",
		);
		expect(thirdPartyHost("linktr.ee/dobprotocol")).toBe("linktr.ee");
	});
	it("passes a product's own site, one on a hosting platform, and SDF's own products", () => {
		for (const u of [
			"https://rivool.finance/",
			"https://stellar-chef.github.io/",
			"https://zilt.vercel.app/",
			"https://dashboard.stellar.org/",
			"https://quest.stellar.org/",
			"https://notgithub.com/",
			null,
			"",
			"not a url",
		])
			expect(thirdPartyHost(u), String(u)).toBeNull();
	});
	it("no curated status or seed claims liveness or an integration from one", () => {
		const claims = [
			...Object.entries(STATUS_FIX).map(([slug, f]) => ({
				slug,
				basis: f.basis,
				url: f.sourceUrl,
			})),
			...SEEDS.map((s) => {
				const seed = s as {
					slug: string;
					statusBasis?: string;
					statusSourceUrl?: string;
					links?: { website?: string };
				};
				return {
					slug: seed.slug,
					basis: seed.statusBasis,
					url: seed.statusSourceUrl ?? seed.links?.website,
				};
			}),
		];
		const bad = claims.filter(
			(c) =>
				(c.basis === "site-liveness" || c.basis === "product-integration") &&
				thirdPartyHost(c.url),
		);
		expect(bad.map((c) => `${c.slug} ${c.url}`)).toEqual([]);
	});
});
