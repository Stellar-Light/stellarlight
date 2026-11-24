/** The dated SDK table went three months stale (2026-08-11 to 2026-11-12)
 * while soroban-sdk 28 and 29 shipped and mainnet moved to Protocol 29. The
 * comment promised a "CB6 sanity check" that no code ever implemented. These
 * pin the refreshed rows, the check that now exists, and the per-SDK reading
 * the toolchain rollup serves. */
import { describe, expect, it } from "vitest";
import {
	deprecatedBy,
	LATEST_PROTOCOL,
	MAINNET_UPGRADES,
	npmStellarDep,
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

// Read on 2026-11-24, the day after Protocol 30 reached mainnet.
const UPSTREAM_2026_11_24 = {
	sorobanSdkMaxStable: "30.0.0",
	networkProtocol: 30,
	jsSdkLatest: "17.4.0",
};

describe("SDK table as of 2026-11-24", () => {
	it("tracks mainnet Protocol 30 and soroban-sdk 30", () => {
		expect(LATEST_PROTOCOL).toBe(30);
		expect(versionStatusOf("30.0.0")).toBe("current");
		// 29 was current from 2026-11-12 until Protocol 30 and sdk 30 shipped.
		expect(versionStatusOf("29.0.1")).toBe("supported");
		expect(versionStatusOf("=28.0.0")).toBe("supported");
		// 27 was the newest row, and so "current", until 28 and 29 shipped.
		expect(versionStatusOf("27.0.6")).toBe("supported");
		// The release candidate is no released version: unknown, never current.
		expect(versionStatusOf("30.0.0-rc.1")).toBe("unknown");
	});

	it("finds nothing stale against the upstream it was refreshed from", () => {
		expect(versionTableStaleness(UPSTREAM_2026_11_24)).toEqual([]);
		expect(versionTableStaleness(UPSTREAM_2026_11_12)).toEqual([]);
	});

	it("would have flagged the 2026-11-12 table on 2026-11-24", () => {
		const stale = versionTableStaleness(UPSTREAM_2026_11_24, {
			newestSdkMajor: 29,
			latestProtocol: 29,
			jsLatestMajor: 17,
		});
		expect(stale).toHaveLength(2);
		expect(stale.join(" ")).toMatch(/soroban-sdk 30\.0\.0/);
		expect(stale.join(" ")).toMatch(/LATEST_PROTOCOL is 29/);
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
			sorobanSdkMaxStable: "31.0.0",
			networkProtocol: 31,
			jsSdkLatest: "18.0.0",
		});
		// soroban-sdk, LATEST_PROTOCOL, MAINNET_UPGRADES and the JS line.
		expect(stale).toHaveLength(4);
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

// Read from Horizon on 2026-11-24: the first mainnet ledger whose header
// carries each protocol_version (the ledger before it carries the previous).
describe("MAINNET_UPGRADES: what the network voted in", () => {
	it("ends at Protocol 30, first carried by ledger 65633432", () => {
		expect(MAINNET_UPGRADES.at(-1)).toEqual({
			protocol: 30,
			firstLedger: 65633432,
			activatedAt: "2026-11-23T17:00:06Z",
		});
	});

	it("moves forward in protocol, ledger and time", () => {
		for (let i = 1; i < MAINNET_UPGRADES.length; i++) {
			const [a, b] = [MAINNET_UPGRADES[i - 1], MAINNET_UPGRADES[i]];
			expect(b.protocol).toBe(a.protocol + 1);
			expect(b.firstLedger).toBeGreaterThan(a.firstLedger);
			expect(Date.parse(b.activatedAt)).toBeGreaterThan(
				Date.parse(a.activatedAt),
			);
		}
	});

	it("never lets the SDK table claim a protocol mainnet has not voted in", () => {
		expect(LATEST_PROTOCOL).toBeLessThanOrEqual(
			MAINNET_UPGRADES.at(-1)?.protocol ?? 0,
		);
	});

	it("is flagged by the nightly check once mainnet moves past it", () => {
		const stale = versionTableStaleness({
			sorobanSdkMaxStable: "29.0.1",
			networkProtocol: 31,
			jsSdkLatest: "17.4.0",
		});
		expect(stale.join(" ")).toMatch(/MAINNET_UPGRADES stops at 30/);
	});
});
