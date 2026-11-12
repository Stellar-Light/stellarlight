/** The dated SDK table went three months stale (2026-08-11 to 2026-11-12)
 * while soroban-sdk 28 and 29 shipped and mainnet moved to Protocol 29. The
 * comment promised a "CB6 sanity check" that no code ever implemented. These
 * pin the refreshed rows, the check that now exists, and the per-SDK reading
 * the toolchain rollup serves. */
import { describe, expect, it } from "vitest";
import {
	deprecatedBy,
	npmStellarDep,
	LATEST_PROTOCOL,
	upstreamVersions,
	versionStatusOf,
	versionTableStaleness,
} from "../soroban-versions";

// Read on 2026-11-12: crates.io max_stable_version, Horizon mainnet
// current_protocol_version, npm dist-tags.latest.
const UPSTREAM_2026_11_12 = {
	sorobanSdkMaxStable: "29.0.1",
	networkProtocol: 29,
	jsSdkLatest: "17.4.0",
};

describe("SDK table as of 2026-11-12", () => {
	it("tracks mainnet Protocol 29 and soroban-sdk 29", () => {
		expect(LATEST_PROTOCOL).toBe(29);
		expect(versionStatusOf("29.0.1")).toBe("current");
		expect(versionStatusOf("=28.0.0")).toBe("supported");
		// 27 was the newest row, and so "current", until 28 and 29 shipped.
		expect(versionStatusOf("27.0.6")).toBe("supported");
	});

	it("finds nothing stale against the upstream it was refreshed from", () => {
		expect(versionTableStaleness(UPSTREAM_2026_11_12)).toEqual([]);
	});

	it("would have flagged the 2026-08-11 table, which nothing did", () => {
		const stale = versionTableStaleness(UPSTREAM_2026_11_12, {
			newestSdkMajor: 27,
			latestProtocol: 27,
			jsLatestMajor: 17,
		});
		expect(stale).toHaveLength(2);
		expect(stale.join(" ")).toMatch(/soroban-sdk 29\.0\.1/);
		expect(stale.join(" ")).toMatch(/protocol 29/);
	});

	it("flags each upstream line that moves past the table", () => {
		const stale = versionTableStaleness({
			sorobanSdkMaxStable: "30.0.0",
			networkProtocol: 30,
			jsSdkLatest: "18.0.0",
		});
		expect(stale).toHaveLength(3);
	});
});

describe("upstreamVersions: a body without a released version is no check", () => {
	const crate = (v: unknown) => ({ crate: { max_stable_version: v } });
	const horizon = (p: unknown) => ({ current_protocol_version: p });
	const tags = (v: unknown) => ({ latest: v });
	it("reads the three released versions", () => {
		expect(
			upstreamVersions(crate("29.0.1"), horizon(29), tags("17.4.0")),
		).toEqual(UPSTREAM_2026_11_12);
	});
	it("returns null for each malformed shape, never a reading that compares as current", () => {
		for (const [c, h, t] of [
			[crate("n/a"), horizon(29), tags("17.4.0")],
			[crate("503 Service Unavailable"), horizon(29), tags("17.4.0")],
			[crate("0"), horizon(29), tags("17.4.0")],
			[crate("30.0.0-rc.1"), horizon(29), tags("17.4.0")],
			[crate("29.0.1"), horizon(null), tags("17.4.0")],
			[crate("29.0.1"), horizon(""), tags("17.4.0")],
			[crate("29.0.1"), horizon("29"), tags("17.4.0")],
			[crate("29.0.1"), horizon(29), tags("")],
			[{}, {}, {}],
		])
			expect(upstreamVersions(c, h, t)).toBeNull();
	});
});

describe("deprecatedBy names the SDK line behind a deprecated reading", () => {
	it("a supported soroban-sdk with a deprecated JS package is deprecated by the JS SDK only", () => {
		expect(deprecatedBy("26", "stellar-sdk@^10.4.1")).toBe("js-sdk");
		expect(deprecatedBy("22.0.1", "@stellar/stellar-sdk@^12.0.0")).toBe(
			"js-sdk",
		);
	});

	it("an old soroban-sdk is deprecated by the Rust SDK", () => {
		expect(deprecatedBy("20.5.0", null)).toBe("soroban-sdk");
		expect(deprecatedBy("20.5.0", "@stellar/stellar-sdk@^17.0.0")).toBe(
			"soroban-sdk",
		);
		expect(deprecatedBy("20.5.0", "stellar-sdk@^9.0.0")).toBe("both");
	});

	it("is null when neither line is deprecated, or neither could be read", () => {
		expect(deprecatedBy("29.0.1", "@stellar/stellar-sdk@^17.4.0")).toBeNull();
		expect(deprecatedBy("git", "rust-infra:cargo.toml")).toBeNull();
		expect(deprecatedBy(null, null)).toBeNull();
	});
});

describe("the JS side of the table", () => {
	it("honours npm's publisher deprecation of soroban-client", () => {
		// `npm view soroban-client deprecated`, read 2026-11-12: "now
		// deprecated: transition to @stellar/stellar-sdk".
		expect(deprecatedBy("22.0.1", "soroban-client@^1.0.0")).toBe("js-sdk");
	});

	it("serves a JS dependency only when it names an npm package", () => {
		expect(npmStellarDep("@stellar/stellar-sdk@^17.4.0")).toBe(
			"@stellar/stellar-sdk@^17.4.0",
		);
		// an npm alias holds both ":" and "@" and is a real dependency
		expect(npmStellarDep("stellar-sdk@npm:@stellar/stellar-sdk@17.0.1")).toBe(
			"stellar-sdk@npm:@stellar/stellar-sdk@17.0.1",
		);
		expect(npmStellarDep("rust-infra:cargo.toml")).toBeNull();
		expect(npmStellarDep("go:go.mod")).toBeNull();
		expect(npmStellarDep(null)).toBeNull();
	});
});
