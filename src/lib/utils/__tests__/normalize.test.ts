import { describe, it, expect } from "vitest";
import { generateSlug, normalizeUrl } from "../normalize";

describe("normalize utilities", () => {
	describe("generateSlug", () => {
		it("should generate a URL-friendly slug from text", () => {
			expect(generateSlug("Hello World")).toBe("hello-world");
			expect(generateSlug("My Awesome Project!")).toBe("my-awesome-project");
			expect(generateSlug("  Spaces  Everywhere  ")).toBe("spaces-everywhere");
			expect(generateSlug("Special@Chars#Here")).toBe("specialcharshere");
			expect(generateSlug("Multiple---Dashes")).toBe("multiple-dashes");
		});

		it("should handle edge cases", () => {
			expect(generateSlug("")).toBe("");
			expect(generateSlug("   ")).toBe("");
			expect(generateSlug("---")).toBe("");
		});
	});

	describe("normalizeUrl", () => {
		it("should extract and normalize domain from URLs", () => {
			expect(normalizeUrl("https://example.com")).toBe("example.com");
			expect(normalizeUrl("http://example.com")).toBe("example.com");
			expect(normalizeUrl("https://www.example.com")).toBe("example.com");
			expect(normalizeUrl("https://www.example.com/path")).toBe("example.com");
			expect(normalizeUrl("https://www.example.com/path/")).toBe("example.com");
		});

		it("should handle URLs without protocol", () => {
			expect(normalizeUrl("example.com")).toBe("example.com");
			expect(normalizeUrl("www.example.com")).toBe("example.com");
		});

		it("should handle null/undefined", () => {
			expect(normalizeUrl(null)).toBeNull();
			expect(normalizeUrl(undefined)).toBeNull();
			expect(normalizeUrl("")).toBeNull();
		});

		it("should handle invalid URLs gracefully", () => {
			// Should return null or a fallback value
			const result = normalizeUrl("not-a-valid-url");
			expect(result).toBeTruthy(); // Should not throw
		});
	});
});
