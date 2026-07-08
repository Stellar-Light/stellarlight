import { describe, expect, it } from "vitest";
import {
	selectDepthPaths,
	type TreeEntry,
} from "../../../scripts/scan/fetch-repo-code";

// The SHARED path-selection unit (probe + scanner + eval all go through it).
// These tests pin the test/fixture/generated/oversize exclusion rules — the
// templar case (generated test-utils/src/pyth_price_id.rs ate a top-18 source
// slot) and the OLD false-exclusion (substring "test_" matched latest_prices.rs).

const blob = (path: string, size: number): TreeEntry => ({
	path,
	type: "blob",
	size,
	sha: "x",
});

const TREE: TreeEntry[] = [
	blob("Cargo.toml", 400),
	blob("contracts/Cargo.toml", 300),
	blob("test-utils/Cargo.toml", 200),
	blob("contracts/src/lib.rs", 5_000),
	blob("contracts/src/big_logic.rs", 8_000),
	blob("contracts/src/latest_prices.rs", 3_000), // must be KEPT (old "test_" substring bug)
	blob("contracts/src/tests.rs", 10_000), // inline test module file → excluded from sources
	blob("contracts/src/generated_abi.rs", 12_000), // generated → excluded
	blob("contracts/src/huge_blob.rs", 500_000), // oversize (> fetch cap) → excluded
	blob("test-utils/src/pyth_price_id.rs", 900_000), // the templar case → excluded
];

const SOROBAN = new Map<string, boolean>([
	["Cargo.toml", false],
	["contracts/Cargo.toml", true],
	["test-utils/Cargo.toml", true],
]);

describe("selectDepthPaths — source-slot hygiene", () => {
	const sel = selectDepthPaths(TREE, SOROBAN);

	it("keeps real contract sources, incl. names containing 'test' as a substring", () => {
		expect(sel.sources).toContain("contracts/src/lib.rs");
		expect(sel.sources).toContain("contracts/src/big_logic.rs");
		expect(sel.sources).toContain("contracts/src/latest_prices.rs");
	});

	it("excludes test dirs, inline tests.rs, generated and oversize files from SOURCE slots", () => {
		expect(sel.sources).not.toContain("test-utils/src/pyth_price_id.rs");
		expect(sel.sources).not.toContain("contracts/src/tests.rs");
		expect(sel.sources).not.toContain("contracts/src/generated_abi.rs");
		expect(sel.sources).not.toContain("contracts/src/huge_blob.rs");
	});

	it("test files still flow to the TEST budget (testScore keeps seeing them)", () => {
		expect(sel.tests).toContain("contracts/src/tests.rs");
	});
});
