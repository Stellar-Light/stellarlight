import { describe, expect, it } from "vitest";
import { passesQualityBar } from "../partner-quality";

describe("passesQualityBar", () => {
	it("passes a complete, live profile", () => {
		expect(
			passesQualityBar({
				tagline: "BRL anchor",
				contactEmail: "hi@x.com",
				websiteUrl: "https://x.com",
				freshnessStatus: "fresh",
			}),
		).toBe(true);
	});

	it("passes with a website but no contact email (website is a contact path)", () => {
		expect(
			passesQualityBar({
				tagline: "t",
				contactEmail: null,
				websiteUrl: "https://x.com",
			}),
		).toBe(true);
	});

	it("passes with a contact email but no website", () => {
		expect(
			passesQualityBar({
				tagline: "t",
				contactEmail: "hi@x.com",
				websiteUrl: null,
			}),
		).toBe(true);
	});

	it("fails without a tagline (placeholder-looking row)", () => {
		expect(
			passesQualityBar({
				tagline: null,
				contactEmail: "hi@x.com",
				websiteUrl: "https://x.com",
			}),
		).toBe(false);
		expect(passesQualityBar({ tagline: "", contactEmail: "hi@x.com" })).toBe(
			false,
		);
	});

	it("fails without any contact path", () => {
		expect(
			passesQualityBar({ tagline: "t", contactEmail: null, websiteUrl: null }),
		).toBe(false);
		expect(
			passesQualityBar({ tagline: "t", contactEmail: "", websiteUrl: "" }),
		).toBe(false);
	});

	it("fails when archived (owner-confirmed dead), regardless of completeness", () => {
		expect(
			passesQualityBar({
				tagline: "t",
				contactEmail: "hi@x.com",
				websiteUrl: "https://x.com",
				freshnessStatus: "archived",
			}),
		).toBe(false);
	});

	it("treats missing freshnessStatus as fresh (aging/stale still pass)", () => {
		expect(
			passesQualityBar({ tagline: "t", websiteUrl: "https://x.com" }),
		).toBe(true);
		expect(
			passesQualityBar({
				tagline: "t",
				websiteUrl: "https://x.com",
				freshnessStatus: "stale",
			}),
		).toBe(true);
	});
});
