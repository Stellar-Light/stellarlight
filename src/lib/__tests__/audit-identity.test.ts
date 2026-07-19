import { describe, expect, it } from "vitest";
import {
	AUDIT_PROJECT_ALIASES,
	canonicalAuditor,
	normalizeIdentityText,
	resolveAuditProjectSlug,
} from "../audit-identity";

describe("normalizeIdentityText", () => {
	it("repairs the Cyrillic Es homoglyph the portal ships in 'Сoinspect'", () => {
		// First char is U+0421 (Cyrillic capital Es), as observed live.
		const mangled = "Сoinspect";
		expect(mangled).not.toBe("Coinspect");
		expect(normalizeIdentityText(mangled)).toBe("Coinspect");
	});

	it("trims and collapses whitespace ('Reflector Oracle Protocol ')", () => {
		expect(normalizeIdentityText("Reflector Oracle  Protocol ")).toBe(
			"Reflector Oracle Protocol",
		);
	});

	it("folds PDF ligatures via NFKC (ﬁ → fi)", () => {
		expect(normalizeIdentityText("Veriﬁcation")).toBe("Verification");
	});
});

describe("canonicalAuditor", () => {
	it("canonicalizes casing for known firms", () => {
		expect(canonicalAuditor("certora")).toBe("Certora");
		expect(canonicalAuditor("OtterSec")).toBe("OtterSec");
	});

	it("repairs homoglyph + canonicalizes in one pass", () => {
		expect(canonicalAuditor("Сoinspect")).toBe("Coinspect");
	});

	it("passes unknown firms through normalized, never drops them", () => {
		expect(canonicalAuditor("  New Audit  Firm ")).toBe("New Audit Firm");
	});
});

describe("resolveAuditProjectSlug", () => {
	it("links a known protocol (case-insensitive)", () => {
		const r = resolveAuditProjectSlug("Blend Protocol V2");
		expect(r).toEqual({ slug: "blend", basis: "name-exact", mapped: true });
	});

	it("resolves through normalization (trailing space, homoglyph-safe)", () => {
		const r = resolveAuditProjectSlug("Reflector Oracle Protocol ");
		expect(r.slug).toBe("reflector");
		expect(r.mapped).toBe(true);
	});

	it("distinguishes verified no-match from untriaged", () => {
		// Triaged, verified no directory project exists:
		expect(resolveAuditProjectSlug("ICON xCall")).toEqual({
			slug: null,
			basis: "unmatched",
			mapped: true,
		});
		// Never-seen protocol → untriaged, so ingest can flag it loudly:
		expect(resolveAuditProjectSlug("Totally New Protocol 2027")).toEqual({
			slug: null,
			basis: null,
			mapped: false,
		});
	});

	it("alias map never links to an empty slug", () => {
		for (const [key, v] of Object.entries(AUDIT_PROJECT_ALIASES)) {
			expect(key).toBe(key.toLowerCase());
			if (v.slug !== null) expect(v.slug.length).toBeGreaterThan(0);
			if (v.basis === "unmatched") expect(v.slug).toBeNull();
		}
	});
});
