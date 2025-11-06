import { describe, it, expect } from "vitest";
import { generateSlug, normalizeUrl } from "../normalize";

describe("intake validation and duplicate guard logic", () => {
	describe("duplicate detection", () => {
		it("should generate same slug for similar names", () => {
			const slug1 = generateSlug("My Project");
			const slug2 = generateSlug("my-project");
			const slug3 = generateSlug("My   Project!!!");
			expect(slug1).toBe(slug2);
			expect(slug1).toBe(slug3);
		});

		it("should normalize URLs to same domain for duplicate detection", () => {
			const domain1 = normalizeUrl("https://www.example.com");
			const domain2 = normalizeUrl("http://example.com/");
			const domain3 = normalizeUrl("https://example.com/path/to/page");
			expect(domain1).toBe("example.com");
			expect(domain2).toBe("example.com");
			expect(domain3).toBe("example.com");
		});

		it("should handle URLs with different subdomains differently", () => {
			const domain1 = normalizeUrl("https://api.example.com");
			const domain2 = normalizeUrl("https://www.example.com");
			expect(domain1).toBe("api.example.com");
			expect(domain2).toBe("example.com");
			expect(domain1).not.toBe(domain2);
		});
	});

	describe("slug uniqueness", () => {
		it("should generate unique slugs for different names", () => {
			expect(generateSlug("Project A")).not.toBe(generateSlug("Project B"));
			expect(generateSlug("Wallet")).not.toBe(generateSlug("Anchor"));
		});
	});
});
