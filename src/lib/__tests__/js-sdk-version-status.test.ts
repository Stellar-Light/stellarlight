import { describe, expect, it } from "vitest";
import {
	combinedVersionStatus,
	JS_SDK_LATEST_MAJOR,
	jsSdkVersionStatusOf,
	splitJsDep,
	versionStatusOf,
} from "../soroban-versions";

/**
 * `versionStatus` read "unknown" on 5,356 of 10,876 scanned repos because it
 * was derived from the Rust crate alone — and was assigned before the scan had
 * even populated the JS dependency. The field now feeds repoScore (a dead SDK
 * pin costs a repo 25%), so the blindness had to go.
 */
describe("JS SDK version status", () => {
	it("does NOT reuse the Rust floor — v17 is the current JS SDK", () => {
		// The trap this table exists for: 17 < SUPPORTED_FLOOR_MAJOR (21), so the
		// Rust classifier calls the newest JS SDK in the ecosystem deprecated.
		expect(versionStatusOf("17.0.1")).toBe("deprecated");
		expect(jsSdkVersionStatusOf("@stellar/stellar-sdk@^17.0.1")).toBe("current");
	});

	it("reads the npm dist-tag line: 17 current, 16/15/14 supported", () => {
		expect(jsSdkVersionStatusOf("@stellar/stellar-sdk@^16.3.0")).toBe(
			"supported",
		);
		expect(jsSdkVersionStatusOf("@stellar/stellar-sdk@^15.1.0")).toBe(
			"supported",
		);
		expect(jsSdkVersionStatusOf("@stellar/stellar-sdk@^14.1.1")).toBe(
			"supported",
		);
	});

	it("calls the Protocol-22-era majors deprecated", () => {
		// v13's last publish was 2025-04-21, four protocol generations back.
		expect(jsSdkVersionStatusOf("@stellar/stellar-sdk@^13.3.0")).toBe(
			"deprecated",
		);
		expect(jsSdkVersionStatusOf("@stellar/stellar-sdk@^11.0.0")).toBe(
			"deprecated",
		);
	});

	it("honours npm's own publisher-set deprecation, at any version", () => {
		// npm serves these with a `deprecated` field written by the maintainers:
		// "This package has moved to @stellar/stellar-sdk!". 681 + 39 repos.
		expect(jsSdkVersionStatusOf("stellar-sdk@^13.3.0")).toBe("deprecated");
		expect(jsSdkVersionStatusOf("stellar-sdk@^8.0.0")).toBe("deprecated");
		expect(jsSdkVersionStatusOf("@stellar/stellar-base@^15.0.0")).toBe(
			"deprecated",
		);
	});

	it("never returns deprecated for something it could not read", () => {
		// Same safety doctrine as the Rust table: unknown must never lower a tier.
		for (const d of [
			null,
			undefined,
			"",
			"@stellar/stellar-sdk@*",
			"@stellar/stellar-sdk@workspace",
			"@stellar/stellar-sdk@github:stellar/js-stellar-sdk",
			"@stellar/stellar-sdk@17.0.0-rc.2",
			"@stellar/freighter-api@^4.1.0", // real dep, not the tabled line
			"rust-infra:cargo.toml", // scanner sentinel, not an npm dep
			"go:go.mod",
			"python:requirements.txt",
		]) {
			expect(jsSdkVersionStatusOf(d)).toBe("unknown");
		}
	});

	it("splits scoped names correctly (the @ in the scope is not the separator)", () => {
		expect(splitJsDep("@stellar/stellar-sdk@^17.0.1")).toEqual({
			name: "@stellar/stellar-sdk",
			range: "^17.0.1",
		});
		expect(splitJsDep("stellar-sdk@^13.3.0")).toEqual({
			name: "stellar-sdk",
			range: "^13.3.0",
		});
	});

	it("current major stays in step with the tabled latest", () => {
		expect(
			jsSdkVersionStatusOf(
				`@stellar/stellar-sdk@^${JS_SDK_LATEST_MAJOR}.0.0`,
			),
		).toBe("current");
	});

	describe("combined with the Rust crate", () => {
		it("prefers the Rust crate when both are readable", () => {
			expect(combinedVersionStatus("22.0.8", "@stellar/stellar-sdk@^16.3.0")).toBe(
				"supported",
			);
		});

		it("keeps a deprecated reading from either side", () => {
			expect(combinedVersionStatus("22.0.8", "stellar-sdk@^13.0.0")).toBe(
				"deprecated",
			);
			expect(
				combinedVersionStatus("19.0.0", "@stellar/stellar-sdk@^17.0.1"),
			).toBe("deprecated");
		});

		it("falls back to the JS dep when there is no Cargo.toml", () => {
			// This is the 49% case: a TypeScript repo with no Rust crate at all.
			expect(combinedVersionStatus(null, "@stellar/stellar-sdk@^17.0.1")).toBe(
				"current",
			);
			expect(combinedVersionStatus(null, "@stellar/stellar-sdk@^12.0.0")).toBe(
				"deprecated",
			);
		});

		it("stays unknown when neither side can be read", () => {
			expect(combinedVersionStatus(null, null)).toBe("unknown");
			expect(combinedVersionStatus(null, "go:go.mod")).toBe("unknown");
		});
	});
});
