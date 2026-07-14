/**
 * CANONICAL_PAGES registry hygiene (sls-055 / #533).
 *
 * The registry is the single mechanism behind the sdf-org page-family
 * ingester AND the weekly corpus-coverage class guard — a malformed row
 * would silently weaken both, so its invariants are pinned here.
 */
import { describe, expect, it } from "vitest";
import {
	CANONICAL_PAGES,
	canonicalPage,
	parseEffectiveDateLine,
} from "../canonical-pages";

describe("CANONICAL_PAGES registry", () => {
	it("has unique ids and unique canonical URLs", () => {
		const ids = CANONICAL_PAGES.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		const urls = CANONICAL_PAGES.map((p) => p.url);
		expect(new Set(urls).size).toBe(urls.length);
	});

	it("every URL is https and trailing-slash free (chunk urls match verbatim)", () => {
		for (const p of CANONICAL_PAGES) {
			expect(p.url, p.id).toMatch(/^https:\/\//);
			expect(p.url.endsWith("/"), `${p.id} has trailing slash`).toBe(false);
		}
	});

	it("every row carries at least one signature, and signatures are plain text", () => {
		for (const p of CANONICAL_PAGES) {
			expect(p.signatures.length, p.id).toBeGreaterThan(0);
			for (const s of p.signatures) {
				expect(s.trim().length, `${p.id} empty signature`).toBeGreaterThan(3);
				// Signatures match against stripHtml'd chunk text, which does not
				// decode every entity or normalize smart quotes — keep them out.
				expect(s, `${p.id} signature carries HTML entity`).not.toMatch(
					/&#|&[a-z]+;/i,
				);
				expect(s, `${p.id} signature carries smart quote`).not.toMatch(
					/[‘’“”]/,
				);
			}
		}
	});

	it("every row is quotable and belongs to a known ingester", () => {
		for (const p of CANONICAL_PAGES) {
			expect(p.quotable, p.id).toBe(true);
			expect(
				[
					"ingest-sdf-org.ts",
					"ingest-security-program.ts",
					"ingest-sdf-blog.ts",
				].includes(p.ingestedBy),
				p.id,
			).toBe(true);
		}
	});

	it("folds the sls-020 security-program pages into the one registry", () => {
		expect(canonicalPage("security-program-hackerone").url).toBe(
			"https://hackerone.com/stellar",
		);
		expect(canonicalPage("security-program-supersession").url).toBe(
			"https://stellar.org/grants-and-funding/bug-bounty",
		);
	});

	it("carries the sls-055 family: mandate, terms, foundation, team, enterprise fund, quarterly reports", () => {
		const byId = (id: string) => canonicalPage(id);
		expect(byId("mandate").signatures.join(" ")).toContain("self-funded");
		expect(byId("terms-of-service").signatures.join(" ")).toContain("Delaware");
		expect(byId("enterprise-fund").signatures.join(" ")).toContain("$100m");
		expect(byId("foundation-team").signatures.join(" ")).toContain(
			"Denelle Dixon",
		);
		expect(byId("quarterly-reports").family).toBe("quarterly-reports");
		expect(byId("mandate-2019").family).toBe("mandate");
		expect(byId("mandate-2017").family).toBe("mandate");
	});

	it("canonicalPage throws on an unknown id (URL drift is loud)", () => {
		expect(() => canonicalPage("nope")).toThrow(/no registry row/);
	});
});

describe("parseEffectiveDateLine", () => {
	it("parses the Terms page's stated effective-date line", () => {
		expect(parseEffectiveDateLine("EFFECTIVE DATE: MARCH 23, 2026")).toBe(
			"2026-03-23",
		);
		expect(
			parseEffectiveDateLine("noise\nEffective Date: March 3, 2026\nmore"),
		).toBe("2026-03-03");
	});

	it("returns undefined when the wording changes (never invent a date)", () => {
		expect(parseEffectiveDateLine("Last updated 2026")).toBeUndefined();
		expect(parseEffectiveDateLine("EFFECTIVE DATE: SOON")).toBeUndefined();
	});
});
