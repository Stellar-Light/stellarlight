import { describe, expect, it } from "vitest";
import {
	CANON_SCAFFOLD_SHINGLES,
	computeCodeDepth,
	type DepthBlob,
	type DepthInput,
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

function depthInput(over: Partial<DepthInput> & { blobs: DepthBlob[]; contractCrateDirs: string[] }): DepthInput {
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
		const a = normalizeRust("pub fn hello(env: Env, to: String) { let x = foo(); }");
		const b = normalizeRust("pub fn greet(env: Env, name: String) { let y = bar(); }");
		expect(a).toEqual(b); // idents → ID, so rename-the-clone is defeated
	});
	it("a hello_world body matches the canon scaffold shingles", () => {
		const s = shinglesOf(normalizeRust("pub fn hello(env: Env, to: String) -> Vec<String> { vec![&env, String::from_str(&env, \"Hi\"), to] }"));
		// its shingles overlap the embedded canon set
		expect(jaccard(s, CANON_SCAFFOLD_SHINGLES)).toBeGreaterThan(0);
	});
});

describe("P1: module-split — logic in sibling files is parsed (not just lib.rs)", () => {
	it("finds the real functions in actions.rs, not the empty lib.rs manifest", () => {
		const r = computeCodeDepth(depthInput({
			blobs: [
				{ path: "Cargo.toml", text: CARGO },
				{ path: "src/lib.rs", text: TOKEN_LIB_MANIFEST }, // manifest shell
				{ path: "src/actions.rs", text: TOKEN_ACTIONS }, // real logic
			],
			contractCrateDirs: ["."],
		}));
		expect(r.nonTrivialFns).toBeGreaterThanOrEqual(2); // transfer + mint
		expect(r.reasons).not.toContain("no-proof");
	});
});

describe("substance-not-presence + separation", () => {
	it("a real token (module-split) scores WELL ABOVE a hello-world scaffold", () => {
		const token = computeCodeDepth(depthInput({
			blobs: [
				{ path: "Cargo.toml", text: CARGO },
				{ path: "src/lib.rs", text: TOKEN_LIB_MANIFEST },
				{ path: "src/actions.rs", text: TOKEN_ACTIONS },
			],
			contractCrateDirs: ["."],
			scalars: { releaseCount: 3 },
		}));
		const hello = computeCodeDepth(depthInput({
			blobs: [{ path: "Cargo.toml", text: CARGO }, { path: "src/lib.rs", text: HELLO_WORLD }],
			contractCrateDirs: ["."],
		}));
		expect(token.codeDepth).toBeGreaterThan(hello.codeDepth + 0.2); // clear separation
		expect(hello.codeDepth).toBeLessThan(0.35); // scaffold stays junk-tier
	});

	it("empty-macro stuffing (6 padded methods) scores near-zero substance", () => {
		const r = computeCodeDepth(depthInput({
			blobs: [{ path: "Cargo.toml", text: CARGO }, { path: "src/lib.rs", text: PADDED_SHELL }],
			contractCrateDirs: ["."],
		}));
		expect(r.nonTrivialFns).toBe(0); // none do real work
		expect(r.codeDepth).toBeLessThan(0.35);
	});
});

describe("P8: clone multiplier gates on EMPTINESS, not similarity", () => {
	it("a hello-world clone is crushed (empty + similar)", () => {
		const r = computeCodeDepth(depthInput({
			blobs: [{ path: "Cargo.toml", text: CARGO }, { path: "src/lib.rs", text: HELLO_WORLD }],
			contractCrateDirs: ["."],
		}));
		expect(r.cloneMultiplier).toBeLessThan(1); // similar + empty → knocked down
	});
	it("a real token is NOT crushed even if structurally template-like (has real logic)", () => {
		const r = computeCodeDepth(depthInput({
			blobs: [
				{ path: "Cargo.toml", text: CARGO },
				{ path: "src/lib.rs", text: TOKEN_LIB_MANIFEST },
				{ path: "src/actions.rs", text: TOKEN_ACTIONS },
			],
			contractCrateDirs: ["."],
		}));
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
		const real = computeCodeDepth(depthInput({
			blobs: [{ path: "Cargo.toml", text: CARGO }, { path: "src/lib.rs", text: TOKEN_ACTIONS }],
			contractCrateDirs: ["."],
			scalars: { releaseCount: 2 },
		}));
		// it must at least clear the community/quality boundary neighborhood —
		// exact gate calibrated in P2; here we assert it's not wrongly junk-tier.
		expect(real.codeDepth).toBeGreaterThan(0.35);
		expect(real.nonTrivialFns).toBeGreaterThanOrEqual(2);
	});
});

describe("fork-of-scaffold hard cap", () => {
	it("a low-commit fork of a known scaffold is capped at 0.40", () => {
		const r = computeCodeDepth(depthInput({
			blobs: [{ path: "Cargo.toml", text: CARGO }, { path: "src/lib.rs", text: TOKEN_ACTIONS }],
			contractCrateDirs: ["."],
			scalars: { isFork: true, parentFullName: "stellar/soroban-examples", commitCount: 3 },
		}));
		expect(r.codeDepth).toBeLessThanOrEqual(0.4);
	});
});

describe("example/tutorial cap — real-code examples don't reach quality", () => {
	it("a curated known-example repo is capped below the 0.6 gate even with real code", () => {
		const r = computeCodeDepth({
			...depthInput({
				blobs: [{ path: "Cargo.toml", text: CARGO }, { path: "src/lib.rs", text: TOKEN_ACTIONS }],
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
				blobs: [{ path: "Cargo.toml", text: CARGO }, { path: "src/lib.rs", text: TOKEN_ACTIONS }],
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
		const r = computeCodeDepth(depthInput({
			blobs: [{ path: "Cargo.toml", text: CARGO }, { path: "src/lib.rs", text: "#[contract] pub struct X;" }],
			contractCrateDirs: ["."],
		}));
		expect(r.baseline).toBeLessThanOrEqual(0.2);
		expect(r.codeDepth).toBeLessThan(0.6);
	});
});
