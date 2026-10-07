/**
 * The point of this markup is that it AGREES with the page. A crawler can
 * check an ItemList against what the HTML actually lists, and an inflated
 * numberOfItems is worse than no markup at all — so the count is pinned to
 * the array, and relative URLs are pinned to absolute.
 */
import { describe, expect, it } from "vitest";
import {
	financialProductNode,
	graph,
	itemListNode,
	organizationNode,
	webSiteNode,
} from "../structured-data";

const BASE = "https://stellarlight.xyz";

describe("itemListNode", () => {
	it("counts the items it carries, never the collection behind them", () => {
		const n = itemListNode(BASE, {
			path: "/directory",
			name: "Stellar Projects Directory",
			items: [
				{ name: "Blend", url: "/project/blend" },
				{ name: "Soroswap", url: "/project/soroswap" },
			],
		});
		expect(n.numberOfItems).toBe(2);
		expect((n.itemListElement as unknown[]).length).toBe(2);
	});

	it("absolutises relative urls and keeps absolute ones", () => {
		const n = itemListNode(BASE, {
			path: "/directory",
			name: "d",
			items: [
				{ name: "a", url: "/project/a" },
				{ name: "b", url: "https://example.com/b" },
			],
		});
		const els = n.itemListElement as Array<{ url: string; position: number }>;
		expect(els[0].url).toBe(`${BASE}/project/a`);
		expect(els[1].url).toBe("https://example.com/b");
		expect(els.map((e) => e.position)).toEqual([1, 2]);
	});

	it("is valid when the page lists nothing", () => {
		const n = itemListNode(BASE, { path: "/directory", name: "d", items: [] });
		expect(n.numberOfItems).toBe(0);
		expect(n.itemListElement).toEqual([]);
	});
});

describe("site nodes", () => {
	it("points the website at the organization by @id, not by repeating it", () => {
		const org = organizationNode(BASE);
		const site = webSiteNode(BASE);
		expect(site.publisher).toEqual({ "@id": org["@id"] });
	});

	it("advertises a search target the site actually serves", () => {
		const site = webSiteNode(BASE) as unknown as {
			potentialAction: { target: { urlTemplate: string } };
		};
		expect(site.potentialAction.target.urlTemplate).toBe(
			`${BASE}/directory?q={search_term_string}`,
		);
	});

	it("wraps nodes in a @graph with the schema.org context", () => {
		const g = graph([organizationNode(BASE)]);
		expect(g["@context"]).toBe("https://schema.org");
		expect((g["@graph"] as unknown[]).length).toBe(1);
	});
});

describe("financialProductNode", () => {
	it("omits provider when the issuer is unknown rather than shipping an empty shell", () => {
		const n = financialProductNode(BASE, {
			path: "/stablecoins/AAA-G1",
			ticker: "AAA",
			issuer: null,
		});
		expect(n.provider).toBeUndefined();
		expect(n.name).toBe("AAA");
		expect(n.url).toBe(`${BASE}/stablecoins/AAA-G1`);
	});

	it("names the issuer when we have one and never invents a rating", () => {
		const n = financialProductNode(BASE, {
			path: "/stablecoins/USDY-G1",
			ticker: "USDY",
			name: "Ondo US Dollar Yield",
			issuer: "Ondo Finance",
			peg: "USD",
			description: "A yield-bearing dollar asset issued on Stellar.",
		});
		expect(n.provider).toEqual({
			"@type": "Organization",
			name: "Ondo Finance",
		});
		expect(n.name).toBe("USDY — Ondo US Dollar Yield");
		expect(n.currenciesAccepted).toBe("USD");
		// The markup must never carry commerce signals we cannot source.
		expect(n.offers).toBeUndefined();
		expect(n.aggregateRating).toBeUndefined();
	});
});
