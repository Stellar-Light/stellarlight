import { describe, expect, it } from "vitest";
import {
	orderManifests,
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

describe("selectDepthPaths — tiered JS selection budget rollover", () => {
	const js = (name: string, size: number) => blob(name, size);

	it("strong-tier Stellar paths win slots over bigger generic files", () => {
		const tree = [
			js("src/stellar/swap.ts", 1_000),
			js("src/soroban/invoke.ts", 1_000),
			js("src/evm/bridge_core.ts", 90_000),
			js("src/tron/bridge_core.ts", 90_000),
		];
		const sel = selectDepthPaths(tree, new Map());
		expect(sel.jsSources.slice(0, 2)).toEqual([
			"src/stellar/swap.ts",
			"src/soroban/invoke.ts",
		]);
	});

	it("a repo with NO strong-tier paths still fills its full 10-file budget (blend-sdk case)", () => {
		const tree = Array.from({ length: 12 }, (_, i) =>
			js(`src/pool/pool_contract_${i}.ts`, 2_000 + i),
		);
		const sel = selectDepthPaths(tree, new Map());
		expect(sel.jsSources).toHaveLength(10);
	});
});

describe("orderManifests — the 40-manifest budget reads product crates first", () => {
	it("packages/ come before examples/ even though the tree lists examples/ first", () => {
		// OpenZeppelin/stellar-contracts: 61 manifests, 53 under examples/. In
		// tree order the budget was spent before packages/ — the library — was
		// read, so its sources were never sampled.
		const tree: TreeEntry[] = [blob("Cargo.toml", 100)];
		for (let i = 0; i < 53; i++)
			tree.push(
				blob(`examples/ex${String(i).padStart(2, "0")}/Cargo.toml`, 100),
			);
		for (const p of ["access", "accounts", "governance", "macros", "tokens"])
			tree.push(blob(`packages/${p}/Cargo.toml`, 100));
		tree.push(blob("packages/tokens/tests/fixtures/Cargo.toml", 100));
		const first40 = orderManifests(tree)
			.slice(0, 40)
			.map((e) => e.path);
		expect(first40[0]).toBe("Cargo.toml");
		for (const p of ["access", "accounts", "governance", "macros", "tokens"])
			expect(first40).toContain(`packages/${p}/Cargo.toml`);
		expect(first40).not.toContain("packages/tokens/tests/fixtures/Cargo.toml");
		expect(first40.filter((p) => p.startsWith("examples/"))).toHaveLength(34);
	});

	it("is a pure reorder — every manifest survives, and a small tree is untouched in content", () => {
		const tree: TreeEntry[] = [
			blob("contracts/token/Cargo.toml", 1),
			blob("Cargo.toml", 1),
			blob("tests/fixtures/Cargo.toml", 1),
		];
		expect(orderManifests(tree).map((e) => e.path)).toEqual([
			"Cargo.toml",
			"contracts/token/Cargo.toml",
			"tests/fixtures/Cargo.toml",
		]);
		expect(tree.map((e) => e.path)).toEqual([
			"contracts/token/Cargo.toml",
			"Cargo.toml",
			"tests/fixtures/Cargo.toml",
		]); // input not mutated
	});
});

describe("selectDepthPaths — a repo with no soroban crate still gets its sources", () => {
	// stellar/rs-stellar-xdr, rs-stellar-strkey, rs-stellar-archivist,
	// rs-stellar-rpc-client, OpenZeppelin/openzeppelin-monitor: Stellar Rust that
	// depends on stellar-xdr / soroban-client, never soroban-sdk. With
	// `sorobanCrateDirs` empty the source gate excluded EVERY .rs, so the only
	// Rust that reached the scorer was whatever the test budget happened to pick
	// — 4,830 lines of rs-stellar-archivist, 6,635 of openzeppelin-monitor, all
	// test code, zero source. They are libraries; #1572 taught depth to grade
	// libraries; it had nothing to grade.
	const INFRA: TreeEntry[] = [
		blob("Cargo.toml", 400),
		blob("src/lib.rs", 9_000),
		blob("src/curr.rs", 40_000),
		blob("tests/str.rs", 12_000),
	];
	const NO_SOROBAN = new Map<string, boolean>([["Cargo.toml", false]]);

	it("samples every crate's src/ when nothing declares soroban-sdk", () => {
		const sel = selectDepthPaths(INFRA, NO_SOROBAN);
		expect(sel.sources).toContain("src/curr.rs");
		expect(sel.sources).toContain("src/lib.rs");
		expect(sel.sources).not.toContain("tests/str.rs"); // still the test budget
		expect(sel.tests).toContain("tests/str.rs");
	});

	it("a repo WITH a soroban crate keeps the narrow gate (vendored code stays out)", () => {
		const tree: TreeEntry[] = [
			blob("Cargo.toml", 100),
			blob("contracts/token/Cargo.toml", 100),
			blob("contracts/token/src/lib.rs", 8_000),
			blob("vendor/other/src/huge.rs", 90_000), // not a soroban crate
		];
		const sel = selectDepthPaths(
			tree,
			new Map([
				["Cargo.toml", false],
				["contracts/token/Cargo.toml", true],
			]),
		);
		expect(sel.sources).toEqual(["contracts/token/src/lib.rs"]);
	});
});
