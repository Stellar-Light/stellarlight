import { describe, expect, it } from "vitest";
import {
	CANON_SCAFFOLD_SHINGLES,
	computeCodeDepth,
	type DepthBlob,
	type DepthInput,
	isExampleRepo,
	jaccard,
	normalizeRust,
	shinglesOf,
} from "../code-depth";

/**
 * These tests assert STRUCTURAL correctness + RELATIVE separation — that the
 * parser reads sibling files, that substance-not-presence holds, that clones are
 * gated on emptiness, and that a real contract outranks a scaffold. Absolute
 * thresholds (deep>0.75 / shallow<0.35) are calibrated against REAL fetched
 * repos in P2 via the fixture≡production eval — NOT hand-tuned on synthetic
 * fixtures (that would overfit to fiction, the exact trap the review flagged).
 */

// ── Fixtures ─────────────────────────────────────────────────────────────────

const HELLO_WORLD = `#![no_std]
use soroban_sdk::{contract, contractimpl, vec, Env, String, Vec};
#[contract]
pub struct HelloContract;
#[contractimpl]
impl HelloContract {
    pub fn hello(env: Env, to: String) -> Vec<String> {
        vec![&env, String::from_str(&env, "Hello"), to]
    }
}`;

// A real token, but with the logic MOVED to a sibling file (module-split — the
// idiomatic layout the review found v2 was blind to).
const TOKEN_LIB_MANIFEST = `#![no_std]
mod actions;
mod storage;
pub use actions::*;`;

const TOKEN_ACTIONS = `use soroban_sdk::{contractimpl, contracttype, Env, Address};
#[contracttype]
pub enum DataKey { Balance(Address), Admin, TotalSupply }
#[contract]
pub struct Token;
#[contractimpl]
impl Token {
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let mut from_bal: i128 = env.storage().persistent().get(&DataKey::Balance(from.clone())).unwrap_or(0);
        if from_bal < amount { panic!("insufficient balance"); }
        from_bal = from_bal - amount;
        env.storage().persistent().set(&DataKey::Balance(from.clone()), &from_bal);
        let mut to_bal: i128 = env.storage().persistent().get(&DataKey::Balance(to.clone())).unwrap_or(0);
        to_bal = to_bal + amount;
        env.storage().persistent().set(&DataKey::Balance(to.clone()), &to_bal);
    }
    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let mut bal: i128 = env.storage().persistent().get(&DataKey::Balance(to.clone())).unwrap_or(0);
        bal = bal + amount;
        env.storage().persistent().set(&DataKey::Balance(to.clone()), &bal);
        let mut supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0);
        supply = supply + amount;
        env.storage().instance().set(&DataKey::TotalSupply, &supply);
    }
    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Balance(id)).unwrap_or(0)
    }
}`;

// Six EMPTY #[contractimpl] methods — the macro-stuffing attack.
const PADDED_SHELL = `#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Symbol};
#[contract]
pub struct DefiVaultPro;
#[contractimpl]
impl DefiVaultPro {
    pub fn a(env: Env) -> u32 { env.storage().instance().get(&Symbol::new(&env,"a")).unwrap_or(0) }
    pub fn b(env: Env) -> u32 { env.storage().instance().get(&Symbol::new(&env,"b")).unwrap_or(0) }
    pub fn c(env: Env) -> u32 { env.storage().instance().get(&Symbol::new(&env,"c")).unwrap_or(0) }
    pub fn d(env: Env) -> u32 { 0 }
    pub fn e(env: Env) -> u32 { 1 }
    pub fn f(env: Env) -> u32 { 2 }
}`;

const CARGO = `[package]
name = "token"
[dependencies]
soroban-sdk = "22.0.3"
[lib]
crate-type = ["cdylib"]`;

function depthInput(
	over: Partial<DepthInput> & {
		blobs: DepthBlob[];
		contractCrateDirs: string[];
	},
): DepthInput {
	return {
		fullName: "test/repo",
		proof: "cargo-sdk",
		versionStatus: "current",
		isDeployableContract: true,
		scalars: {},
		...over,
	};
}

// ── Structural correctness ───────────────────────────────────────────────────

describe("normalizeRust + shingles — clone fingerprint", () => {
	it("renaming identifiers does NOT change the normalized token stream", () => {
		const a = normalizeRust(
			"pub fn hello(env: Env, to: String) { let x = foo(); }",
		);
		const b = normalizeRust(
			"pub fn greet(env: Env, name: String) { let y = bar(); }",
		);
		expect(a).toEqual(b); // idents → ID, so rename-the-clone is defeated
	});
	it("a hello_world body matches the canon scaffold shingles", () => {
		const s = shinglesOf(
			normalizeRust(
				'pub fn hello(env: Env, to: String) -> Vec<String> { vec![&env, String::from_str(&env, "Hi"), to] }',
			),
		);
		// its shingles overlap the embedded canon set
		expect(jaccard(s, CANON_SCAFFOLD_SHINGLES)).toBeGreaterThan(0);
	});
});

describe("P1: module-split — logic in sibling files is parsed (not just lib.rs)", () => {
	it("finds the real functions in actions.rs, not the empty lib.rs manifest", () => {
		const r = computeCodeDepth(
			depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: TOKEN_LIB_MANIFEST }, // manifest shell
					{ path: "src/actions.rs", text: TOKEN_ACTIONS }, // real logic
				],
				contractCrateDirs: ["."],
			}),
		);
		expect(r.nonTrivialFns).toBeGreaterThanOrEqual(2); // transfer + mint
		expect(r.reasons).not.toContain("no-proof");
	});
});

describe("substance-not-presence + separation", () => {
	it("a real token (module-split) scores WELL ABOVE a hello-world scaffold", () => {
		const token = computeCodeDepth(
			depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: TOKEN_LIB_MANIFEST },
					{ path: "src/actions.rs", text: TOKEN_ACTIONS },
				],
				contractCrateDirs: ["."],
				scalars: { releaseCount: 3 },
			}),
		);
		const hello = computeCodeDepth(
			depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: HELLO_WORLD },
				],
				contractCrateDirs: ["."],
			}),
		);
		expect(token.codeDepth).toBeGreaterThan(hello.codeDepth + 0.2); // clear separation
		expect(hello.codeDepth).toBeLessThan(0.35); // scaffold stays junk-tier
	});

	it("empty-macro stuffing (6 padded methods) scores near-zero substance", () => {
		const r = computeCodeDepth(
			depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: PADDED_SHELL },
				],
				contractCrateDirs: ["."],
			}),
		);
		expect(r.nonTrivialFns).toBe(0); // none do real work
		expect(r.codeDepth).toBeLessThan(0.35);
	});
});

describe("P8: clone multiplier gates on EMPTINESS, not similarity", () => {
	it("a hello-world clone is crushed (empty + similar)", () => {
		const r = computeCodeDepth(
			depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: HELLO_WORLD },
				],
				contractCrateDirs: ["."],
			}),
		);
		expect(r.cloneMultiplier).toBeLessThan(1); // similar + empty → knocked down
	});
	it("a real token is NOT crushed even if structurally template-like (has real logic)", () => {
		const r = computeCodeDepth(
			depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: TOKEN_LIB_MANIFEST },
					{ path: "src/actions.rs", text: TOKEN_ACTIONS },
				],
				contractCrateDirs: ["."],
			}),
		);
		// emptiness low (nonTrivialFns>=2) → multiplier near 1, not the 0.12 floor
		expect(r.cloneMultiplier).toBeGreaterThan(0.85);
	});
});

describe("P4: per-crate MAX, gated breadth — a many-example workspace can't sum to quality", () => {
	it("38 trivial example crates get ~zero breadth credit", () => {
		const blobs: DepthBlob[] = [{ path: "Cargo.toml", text: CARGO }];
		const dirs: string[] = [];
		for (let i = 0; i < 38; i++) {
			blobs.push({ path: `examples/ex${i}/src/lib.rs`, text: HELLO_WORLD });
			blobs.push({ path: `examples/ex${i}/Cargo.toml`, text: CARGO });
			dirs.push(`examples/ex${i}`);
		}
		const r = computeCodeDepth(depthInput({ blobs, contractCrateDirs: dirs }));
		expect(r.codeDepth).toBeLessThan(0.4); // breadth gate blocks the sum
	});
});

describe("P7: single-crate compensation lifts a real single contract", () => {
	it("a real single-crate token scores meaningfully higher than without its logic", () => {
		const real = computeCodeDepth(
			depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: TOKEN_ACTIONS },
				],
				contractCrateDirs: ["."],
				scalars: { releaseCount: 2 },
			}),
		);
		// it must at least clear the community/quality boundary neighborhood —
		// exact gate calibrated in P2; here we assert it's not wrongly junk-tier.
		expect(real.codeDepth).toBeGreaterThan(0.35);
		expect(real.nonTrivialFns).toBeGreaterThanOrEqual(2);
	});
});

describe("fork-of-scaffold hard cap", () => {
	it("a low-commit fork of a known scaffold is capped at 0.40", () => {
		const r = computeCodeDepth(
			depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: TOKEN_ACTIONS },
				],
				contractCrateDirs: ["."],
				scalars: {
					isFork: true,
					parentFullName: "stellar/soroban-examples",
					commitCount: 3,
				},
			}),
		);
		expect(r.codeDepth).toBeLessThanOrEqual(0.4);
	});
});

describe("example/tutorial cap — real-code examples don't reach quality", () => {
	it("a curated known-example repo is capped below the 0.6 gate even with real code", () => {
		const r = computeCodeDepth({
			...depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: TOKEN_ACTIONS },
				],
				contractCrateDirs: ["."],
			}),
			fullName: "stellar/soroban-examples",
		});
		expect(r.codeDepth).toBeLessThanOrEqual(0.45);
		expect(r.reasons).toContain("example-repo");
	});
	it("a MATURE (released) project named '*-demo' is NOT capped — no over-filter", () => {
		const r = computeCodeDepth({
			...depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: TOKEN_ACTIONS },
				],
				contractCrateDirs: ["."],
				scalars: { releaseCount: 5, tagCount: 8 },
			}),
			fullName: "acme/payments-demo",
		});
		expect(r.reasons).not.toContain("example-repo");
	});
});

describe("baseline hard-cap invariant", () => {
	it("a bare compilable contract (cdylib + current, no logic) can never clear 0.6 on baseline", () => {
		const r = computeCodeDepth(
			depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: "#[contract] pub struct X;" },
				],
				contractCrateDirs: ["."],
			}),
		);
		expect(r.baseline).toBeLessThanOrEqual(0.2);
		expect(r.codeDepth).toBeLessThan(0.6);
	});
});

// ── Tooling cap: soroban-DEP code without entry macros is not a contract ─────

describe("tooling cap — depends-on-soroban-sdk ≠ IS-a-contract (stellar-cli class)", () => {
	// CLI/indexer-style application logic: uses contract-adjacent strings
	// (require_auth in tx-building, storage in ledger tooling) inside a crate
	// that depends on soroban-sdk — but has ZERO #[contract]/#[contractimpl].
	const CLI_MAIN = `use soroban_sdk::xdr::{ScVal, Transaction};
pub fn build_auth_entry(tx: &Transaction) -> ScVal {
    // tooling code that mentions require_auth in strings and helpers
    let entry = sign_require_auth(tx);
    if entry.expired() { panic!("expired"); }
    entry.to_scval()
}
pub fn snapshot_ledger(env_dir: &str) -> u64 {
    let mut count = 0;
    for e in read_storage_entries(env_dir) {
        count += e.size();
    }
    count
}`;

	it("zero entry macros ⇒ capped at 0.35 with reason no-contract-macros", () => {
		const r = computeCodeDepth(
			depthInput({
				blobs: [
					{
						path: "Cargo.toml",
						text: '[package]\nname = "some-cli"\n[dependencies]\nsoroban-sdk = "22.0.1"\n[lib]\ncrate-type = ["cdylib"]\n',
					},
					{ path: "src/main.rs", text: CLI_MAIN },
					{ path: "src/ledger.rs", text: CLI_MAIN },
				],
				contractCrateDirs: ["."],
				scalars: { tagCount: 50 }, // mature tooling (stellar-cli has many releases)
			}),
		);
		expect(r.codeDepth).toBeLessThanOrEqual(0.35);
		expect(r.reasons).toContain("no-contract-macros");
	});

	it("a real contract (entry macros present) is NOT capped by this rule", () => {
		const r = computeCodeDepth(
			depthInput({
				blobs: [
					{
						path: "Cargo.toml",
						text: '[package]\nname = "token"\n[dependencies]\nsoroban-sdk = "22.0.3"\n[lib]\ncrate-type = ["cdylib"]\n',
					},
					{ path: "src/lib.rs", text: TOKEN_LIB_MANIFEST },
					{ path: "src/actions.rs", text: TOKEN_ACTIONS },
				],
				contractCrateDirs: ["."],
			}),
		);
		expect(r.reasons).not.toContain("no-contract-macros");
	});

	it("module-split rescue: #[contracttype] in big module files (blend class) is NOT capped", () => {
		// entry #[contract] file fell below the top-N size cut; the analyzed big
		// module files carry DataKey #[contracttype] enums — contract evidence.
		const MODULE = `use soroban_sdk::{contracttype, Env, Address};
#[contracttype]
pub enum DataKey { Balance(Address), Admin }
pub fn do_transfer(env: &Env, from: Address, amount: i128) {
    from.require_auth();
    let b: i128 = env.storage().persistent().get(&DataKey::Balance(from.clone())).unwrap_or(0);
    if b < amount { panic!("insufficient"); }
    env.storage().persistent().set(&DataKey::Balance(from), &(b - amount));
}`;
		const r = computeCodeDepth(
			depthInput({
				blobs: [
					{
						path: "Cargo.toml",
						text: '[package]\nname = "pool"\n[dependencies]\nsoroban-sdk = "22.0.3"\n[lib]\ncrate-type = ["cdylib"]\n',
					},
					{ path: "src/pool.rs", text: MODULE },
				],
				contractCrateDirs: ["."],
			}),
		);
		expect(r.reasons).not.toContain("no-contract-macros");
	});
});

describe("v3 frontier calibration (2026-07-08)", () => {
	it("education/demo names are example-capped when immature", () => {
		expect(isExampleRepo("nrxschool/stellar-bootcamp", [], false)).toBe(true);
		expect(isExampleRepo("warp-driver/oracle-demo", [], false)).toBe(true);
		expect(isExampleRepo("acme/soroban-course", [], false)).toBe(true);
	});

	it("a MATURE project named *-demo keeps full score (no over-filter)", () => {
		expect(isExampleRepo("warp-driver/oracle-demo", [], true)).toBe(false);
	});

	it("real product names stay uncapped", () => {
		expect(isExampleRepo("hoops-finance/contracts", [], false)).toBe(false);
		expect(
			isExampleRepo(
				"bandprotocol/band-std-reference-contracts-soroban",
				[],
				false,
			),
		).toBe(false);
	});
});

describe("v3 verified-mainnet deployment term", () => {
	const base = (scalars: Partial<DepthInput["scalars"]>): DepthInput => ({
		fullName: "acme/contracts",
		proof: "cargo-sdk",
		versionStatus: "current",
		isDeployableContract: true,
		blobs: [
			{
				path: "src/lib.rs",
				text: `#![no_std]\nuse soroban_sdk::{contract, contractimpl, Address, Env};\n#[contract]\npub struct C;\n#[contractimpl]\nimpl C {\n pub fn deposit(env: Env, from: Address, amount: i128) { from.require_auth(); env.storage().persistent().set(&from, &amount); }\n pub fn withdraw(env: Env, to: Address, amount: i128) { to.require_auth(); env.storage().persistent().set(&to, &amount); }\n}`,
			},
		],
		contractCrateDirs: ["."],
		scalars: {
			isFork: false,
			parentFullName: null,
			releaseCount: 0,
			tagCount: 0,
			readmeText: null,
			topics: [],
			...scalars,
		},
	});

	it("verified mainnet contract scores above bare address mention, which scores above none", () => {
		const none = computeCodeDepth(base({ readmeText: "just docs" })).codeDepth;
		const mention = computeCodeDepth(
			base({
				readmeText:
					"Deployed: CAC5SKP5FJT2ZZ7YLV4UCOM6Z5SQCCVPZWHLLLVQNQG2RWWOOSP3IYRL",
			}),
		).codeDepth;
		const verified = computeCodeDepth(
			base({
				readmeText:
					"Deployed: CAC5SKP5FJT2ZZ7YLV4UCOM6Z5SQCCVPZWHLLLVQNQG2RWWOOSP3IYRL",
				mainnetContractId:
					"CAC5SKP5FJT2ZZ7YLV4UCOM6Z5SQCCVPZWHLLLVQNQG2RWWOOSP3IYRL",
			}),
		).codeDepth;
		expect(mention).toBeGreaterThan(none);
		expect(verified).toBeGreaterThan(mention);
	});
});

// ── Kind-aware depth (2026-09-14): libraries and tools are read as what they are ──

describe("kind-aware depth — a crate that defines no contract is read on library terms", () => {
	// Bodies with ≤2 statements are TRIVIAL on the contract terms, so what
	// these fixtures earn comes from the library reading, not from the
	// contract reading leaking through.
	const pubFns = (n: number, prefix = "f") =>
		Array.from(
			{ length: n },
			(_, i) =>
				`pub fn ${prefix}${i}(a: i128, b: i128) -> i128 { let x = a + b; x }`,
		).join("\n");
	const tests = (n: number) =>
		Array.from(
			{ length: n },
			(_, i) => `#[test]\nfn t${i}() { assert_eq!(1, 1); assert!(true); }`,
		).join("\n");
	const RLIB = `[package]\nname = "soroban-sdk"\n[lib]\ndoctest = false\n[dependencies]\nsoroban-env-common = "22"\n`;

	// stellar/rs-soroban-sdk-like: one big rlib crate, a wide pub surface, a
	// real test suite, many tags. Zero #[contract] in its code — the SDK's
	// docs mention the macros constantly, which is why comments are stripped.
	const sdk = (
		over: Partial<DepthInput> & { scalars?: Partial<DepthInput["scalars"]> },
	): DepthInput => ({
		fullName: "stellar/rs-soroban-sdk",
		proof: "cargo-sdk",
		versionStatus: "unknown",
		isDeployableContract: false,
		blobs: [
			{ path: "Cargo.toml", text: '[workspace]\nmembers = ["soroban-sdk"]\n' },
			{ path: "soroban-sdk/Cargo.toml", text: RLIB },
			{
				path: "soroban-sdk/src/env.rs",
				text: `/// Use \`#[contract]\` and \`#[contractimpl]\` on your type.\npub trait Env { fn a(&self); }\npub struct Storage;\npub enum Kind { A, B }\n${pubFns(30)}`,
			},
			{ path: "soroban-sdk/src/address.rs", text: pubFns(30, "g") },
			{ path: "soroban-sdk/src/tests/env.rs", text: tests(8) },
		],
		contractCrateDirs: ["soroban-sdk"],
		...over,
		scalars: { tagCount: 40, ...(over.scalars ?? {}) },
	});

	it("an SDK (rlib, wide API, tests, releases) reads deep on the library track", () => {
		const r = computeCodeDepth(sdk({}));
		expect(r.reasons).toContain("library-track");
		expect(r.codeDepth).toBeGreaterThanOrEqual(0.6);
		expect(r.nonTrivialFns).toBe(0); // the contract terms saw nothing here
	});

	it("an unreleased, untested crate with the same API is not a deep library", () => {
		const r = computeCodeDepth(
			sdk({
				blobs: [
					{ path: "soroban-sdk/Cargo.toml", text: RLIB },
					{ path: "soroban-sdk/src/env.rs", text: pubFns(60) },
				],
				scalars: { tagCount: 0 },
			}),
		);
		expect(r.codeDepth).toBeLessThan(0.55);
	});

	it("a hackathon fork of the SDK keeps only the contract reading; a fork that cut its own releases is its own library", () => {
		const canonical = computeCodeDepth(sdk({}));
		const fork = computeCodeDepth(
			sdk({
				fullName: "student/rs-soroban-sdk",
				scalars: {
					isFork: true,
					parentFullName: "stellar/rs-soroban-sdk",
					tagCount: 0,
				},
			}),
		);
		expect(fork.reasons).toContain("fork:library-track-withheld");
		expect(fork.reasons).not.toContain("library-track");
		expect(fork.codeDepth).toBeLessThan(0.35);
		expect(fork.codeDepth).toBeLessThan(canonical.codeDepth - 0.3);
		const maintained = computeCodeDepth(
			sdk({
				fullName: "org/rs-soroban-sdk",
				scalars: { isFork: true, parentFullName: "stellar/rs-soroban-sdk" },
			}),
		);
		expect(maintained.reasons).toContain("library-track");
		expect(maintained.codeDepth).toBe(canonical.codeDepth);
	});

	// OpenZeppelin/stellar-contracts-like: `["lib", "cdylib"]` library
	// packages whose #[contract] structs live only in test.rs, plus thin
	// example wrappers that ARE contracts (one-line delegations).
	const OZ_LIB = `[package]\nname = "stellar-tokens"\n[lib]\ncrate-type = ["lib", "cdylib"]\n[dependencies]\nsoroban-sdk = { workspace = true }\n`;
	const OZ_STORAGE = `use soroban_sdk::{contracterror, contracttype, Address, Env};
#[contracttype]
pub enum StorageKey { Balance(Address), TotalSupply, Allowance(Address, Address) }
#[contracterror]
pub enum FungibleTokenError { InsufficientBalance = 200, InsufficientAllowance = 201 }
pub trait FungibleToken { fn transfer(e: &Env, from: Address, to: Address, amount: i128); fn balance(e: &Env, id: Address) -> i128; }
pub fn balance(e: &Env, id: &Address) -> i128 { e.storage().persistent().get(&StorageKey::Balance(id.clone())).unwrap_or(0) }
pub fn total_supply(e: &Env) -> i128 { e.storage().instance().get(&StorageKey::TotalSupply).unwrap_or(0) }
${pubFns(50, "helper")}`;
	const OZ_EXAMPLE = `use soroban_sdk::{contract, contractimpl, Address, Env};
use stellar_tokens::fungible::{Base, FungibleToken};
#[contract]
pub struct ExampleContract;
#[contractimpl]
impl FungibleToken for ExampleContract {
    fn transfer(e: &Env, from: Address, to: Address, amount: i128) { Base::transfer(e, &from, &to, amount) }
    fn balance(e: &Env, id: Address) -> i128 { Base::balance(e, &id) }
}`;
	const ozBlobs = (withPackages: boolean): DepthBlob[] => [
		{ path: "Cargo.toml", text: "[workspace]\n" },
		...(withPackages
			? [
					{ path: "packages/tokens/Cargo.toml", text: OZ_LIB },
					{ path: "packages/tokens/src/fungible/storage.rs", text: OZ_STORAGE },
					{
						path: "packages/tokens/src/fungible/test.rs",
						text: `#[contract]\npub struct MockContract;\n${tests(8)}`,
					},
				]
			: []),
		{ path: "examples/fungible-pausable/Cargo.toml", text: CARGO },
		{ path: "examples/fungible-pausable/src/contract.rs", text: OZ_EXAMPLE },
		{ path: "examples/nft-royalties/Cargo.toml", text: CARGO },
		{ path: "examples/nft-royalties/src/contract.rs", text: OZ_EXAMPLE },
	];
	const oz = (withPackages: boolean): DepthInput => ({
		fullName: "OpenZeppelin/stellar-contracts",
		proof: "cargo-sdk",
		versionStatus: "current",
		isDeployableContract: true,
		blobs: ozBlobs(withPackages),
		contractCrateDirs: withPackages
			? [
					"packages/tokens",
					"examples/fungible-pausable",
					"examples/nft-royalties",
				]
			: ["examples/fungible-pausable", "examples/nft-royalties"],
		scalars: { tagCount: 26 },
	});

	it("a contract LIBRARY (lib+cdylib packages, contracts only in test.rs) reads deep; its thin example wrappers alone do not", () => {
		const lib = computeCodeDepth(oz(true));
		expect(lib.reasons).toContain("library-track");
		expect(lib.codeDepth).toBeGreaterThanOrEqual(0.6);
		const examplesOnly = computeCodeDepth(oz(false));
		expect(examplesOnly.reasons).not.toContain("library-track");
		expect(examplesOnly.codeDepth).toBeLessThan(0.5);
	});

	// stellar/stellar-cli-like: a bin crate with a clap command tree, a test
	// suite, many releases — and a hello-world VENDORED under its src/ as a
	// template. The template is its own crate, not the CLI's contract, and
	// its scaffold fingerprint must not crush the tool's reading.
	it("a CLI tool (bin crate, command tree) reads deep, and a vendored hello-world template does not drag it down", () => {
		const CLI = `use clap::{Parser, Subcommand};
#[derive(Parser)]
#[command(name = "stellar")]
pub struct Root { #[command(subcommand)] pub cmd: Cmd }
#[derive(Subcommand)]
pub enum Cmd { Deploy(deploy::Cmd), Invoke(invoke::Cmd) }
${pubFns(40, "run")}`;
		const r = computeCodeDepth({
			fullName: "stellar/stellar-cli",
			proof: "cargo-sdk",
			versionStatus: "supported",
			isDeployableContract: true,
			blobs: [
				{ path: "Cargo.toml", text: "[workspace]\n" },
				{
					path: "cmd/soroban-cli/Cargo.toml",
					text: '[package]\nname = "stellar-cli"\n[[bin]]\nname = "stellar"\n[dependencies]\nsoroban-sdk = "22"\n',
				},
				{ path: "cmd/soroban-cli/src/commands/mod.rs", text: CLI },
				{
					path: "cmd/soroban-cli/src/utils/contract-template/Cargo.toml",
					text: CARGO,
				},
				{
					path: "cmd/soroban-cli/src/utils/contract-template/src/lib.rs",
					text: HELLO_WORLD,
				},
				{ path: "cmd/crates/soroban-test/tests/it/deploy.rs", text: tests(10) },
			],
			contractCrateDirs: [
				"cmd/soroban-cli",
				"cmd/soroban-cli/src/utils/contract-template",
			],
			scalars: { tagCount: 89 },
		});
		expect(r.reasons).toContain("library-track");
		expect(r.reasons).not.toContain("no-contract-macros");
		expect(r.codeDepth).toBeGreaterThanOrEqual(0.6);
		expect(r.cloneMultiplier).toBe(1);
	});

	it("a scaffold with a small helper crate stays junk-tier — a handful of pub items, no tag, one test", () => {
		const r = computeCodeDepth(
			depthInput({
				fullName: "student/soroban-dapp",
				blobs: [
					{ path: "contracts/hello/Cargo.toml", text: CARGO },
					{ path: "contracts/hello/src/lib.rs", text: HELLO_WORLD },
					{
						path: "shared/Cargo.toml",
						text: '[package]\nname = "shared"\n[lib]\n',
					},
					{
						path: "shared/src/lib.rs",
						text: `${pubFns(10)}\n#[test]\nfn t() { assert!(true); }`,
					},
				],
				contractCrateDirs: ["contracts/hello", "shared"],
			}),
		);
		expect(r.codeDepth).toBeLessThan(0.35);
	});

	it("an immature repo that calls itself a template is example-capped even when its root crate holds real logic", () => {
		const blobs: DepthBlob[] = [
			{ path: "Cargo.toml", text: CARGO },
			{ path: "src/lib.rs", text: TOKEN_LIB_MANIFEST },
			{ path: "src/contract/actions.rs", text: TOKEN_ACTIONS },
		];
		const template = computeCodeDepth({
			...depthInput({ blobs, contractCrateDirs: ["."] }),
			fullName: "bigger-tech/template-stellar-smart-contract",
		});
		expect(template.reasons).toContain("example-repo");
		expect(template.codeDepth).toBeLessThanOrEqual(0.45);
		// a released project named the same keeps its reading
		const mature = computeCodeDepth({
			...depthInput({
				blobs,
				contractCrateDirs: ["."],
				scalars: { tagCount: 8 },
			}),
			fullName: "bigger-tech/template-stellar-smart-contract",
		});
		expect(mature.reasons).not.toContain("example-repo");
	});

	it("root-crate sources are one crate whatever their subdirectory (src/contract/actions.rs is not a separate crate)", () => {
		// The old grouping split src/ by subdirectory, so a single-crate repo
		// with nested modules was scored as several thin crates.
		const nested = computeCodeDepth(
			depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: TOKEN_LIB_MANIFEST },
					{ path: "src/contract/actions.rs", text: TOKEN_ACTIONS },
				],
				contractCrateDirs: ["."],
			}),
		);
		const flat = computeCodeDepth(
			depthInput({
				blobs: [
					{ path: "Cargo.toml", text: CARGO },
					{ path: "src/lib.rs", text: TOKEN_LIB_MANIFEST },
					{ path: "src/actions.rs", text: TOKEN_ACTIONS },
				],
				contractCrateDirs: ["."],
			}),
		);
		expect(nested.codeDepth).toBe(flat.codeDepth);
	});
});
