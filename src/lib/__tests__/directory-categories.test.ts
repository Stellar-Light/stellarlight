/**
 * These become 24 public URLs in the sitemap, so the config has to be coherent
 * before it ships: a duplicate slug silently shadows a page, a type string that
 * does not match the enum stored on rows yields an empty page, and an empty
 * page is a doorway page rather than a category.
 */
import { describe, expect, it } from "vitest";
import {
	categoryBySlug,
	DIRECTORY_CATEGORIES,
	MIN_ROWS,
} from "../directory-categories";

/** The `types` enum as /api/projects/search reports it. */
const VALID_TYPES = new Set([
	"Wallet",
	"DEX",
	"Lending",
	"Bridge",
	"Infrastructure",
	"Payments",
	"Anchor",
	"SDK",
	"Indexer",
	"Explorer",
	"Analytics",
	"AI",
	"Gaming",
	"Education",
	"Security",
	"NFT",
	"RWA",
	"Stablecoin",
	"Social Impact",
	"RPC",
	"Faucet",
	"Card Issuing",
	"Exchange",
	"Oracle",
	"Yield",
]);

describe("DIRECTORY_CATEGORIES", () => {
	it("has unique slugs — a duplicate silently shadows a page", () => {
		const slugs = DIRECTORY_CATEGORIES.map((c) => c.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	it("maps every category to a type the rows actually carry", () => {
		for (const c of DIRECTORY_CATEGORIES)
			expect(VALID_TYPES.has(c.type), `${c.slug} -> ${c.type}`).toBe(true);
	});

	it("uses url-safe slugs", () => {
		for (const c of DIRECTORY_CATEGORIES)
			expect(c.slug, c.slug).toMatch(/^[a-z0-9-]+$/);
	});

	it("gives every category its own written heading and description", () => {
		const headings = new Set<string>();
		const descriptions = new Set<string>();
		for (const c of DIRECTORY_CATEGORIES) {
			expect(c.heading.length, c.slug).toBeGreaterThan(8);
			// Long enough to be a real meta description, not a stub.
			expect(c.description.length, c.slug).toBeGreaterThan(80);
			headings.add(c.heading);
			descriptions.add(c.description);
		}
		// Templated copy across 24 pages is the duplicate-title problem again.
		expect(headings.size).toBe(DIRECTORY_CATEGORIES.length);
		expect(descriptions.size).toBe(DIRECTORY_CATEGORIES.length);
	});

	it("resolves a known slug and refuses an unknown one", () => {
		expect(categoryBySlug("wallets")?.type).toBe("Wallet");
		expect(categoryBySlug("not-a-category")).toBeUndefined();
	});

	it("keeps the inventory bar it documents", () => {
		expect(MIN_ROWS).toBeGreaterThan(0);
	});
});
