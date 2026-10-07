/**
 * extractContractInterface — the Soroban ABI surface (repo-intel slice 4).
 * Fixtures mirror real soroban-examples shapes: #[contractimpl] blocks,
 * host-injected env params, multi-contract files, neighbouring non-contract
 * impls, and doc-comment noise. Missing beats lying: fns the bounded regex
 * can't capture cleanly are skipped, never truncated mid-type.
 */
import { describe, expect, it } from "vitest";
import { extractContractInterface } from "../code-symbols";

const swapSrc = `
#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env, token};

#[contract]
pub struct AtomicSwapContract;

#[contractimpl]
impl AtomicSwapContract {
    /// Swap token A for token B atomically.
    pub fn swap(
        env: Env,
        a: Address,
        b: Address,
        token_a: Address,
        amount_a: i128,
    ) -> i128 {
        a.require_auth();
        amount_a
    }

    pub fn version() -> u32 {
        1
    }
}

// A plain helper impl in the same file must NOT leak into the interface.
pub struct Helpers;
impl Helpers {
    pub fn internal_math(x: i128) -> i128 {
        x * 2
    }
}
`;

const multiSrc = `
use soroban_sdk::{contract, contractimpl, Env, String};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(env: Env, to: String) -> String {
        to
    }
    pub fn reset(env: Env) {
        // returns unit — no arrow rendered
    }
}
`;

describe("extractContractInterface", () => {
	it("captures full signatures, strips env, prefixes the contract name", () => {
		const iface = extractContractInterface([
			{ path: "src/lib.rs", text: swapSrc },
		]);
		expect(iface).toEqual([
			"AtomicSwapContract.swap(a: Address, b: Address, token_a: Address, amount_a: i128) -> i128",
			"AtomicSwapContract.version() -> u32",
		]);
	});

	it("never leaks pub fns from a neighbouring non-contract impl", () => {
		const iface = extractContractInterface([
			{ path: "src/lib.rs", text: swapSrc },
		]);
		expect(iface.join(" ")).not.toContain("internal_math");
	});

	it("handles multiple contract files and omits unit returns", () => {
		const iface = extractContractInterface([
			{ path: "hello/src/lib.rs", text: multiSrc },
			{ path: "swap/src/lib.rs", text: swapSrc },
		]);
		expect(iface).toContain("HelloContract.hello(to: String) -> String");
		expect(iface).toContain("HelloContract.reset()");
		expect(iface.some((s) => s.startsWith("AtomicSwapContract.swap("))).toBe(
			true,
		);
	});

	it("trait impls export BARE fns (FxDAO idiom — pub is illegal there)", () => {
		const traitSrc = `
use soroban_sdk::{contract, contractimpl, Address, Env};
#[contract]
pub struct VaultsContract;
#[contractimpl]
impl VaultsContractTrait for VaultsContract {
    fn init(e: Env, admin: Address) {
        admin.require_auth();
    }
    fn get_admin(e: Env) -> Address {
        e.storage().instance().get(&0).unwrap()
    }
}
`;
		const iface = extractContractInterface([
			{ path: "contracts/vaults/src/contract.rs", text: traitSrc },
		]);
		expect(iface).toEqual([
			"VaultsContract.init(admin: Address)",
			"VaultsContract.get_admin() -> Address",
		]);
	});

	it("inherent impls export ONLY pub fns — private helpers never enter the ABI", () => {
		const inherentSrc = `
use soroban_sdk::{contract, contractimpl, Env};
#[contract]
pub struct C;
#[contractimpl]
impl C {
    pub fn public_op(env: Env) -> u32 {
        Self::helper()
    }
    fn helper() -> u32 {
        7
    }
}
`;
		const iface = extractContractInterface([
			{ path: "src/lib.rs", text: inherentSrc },
		]);
		expect(iface).toEqual(["C.public_op() -> u32"]);
	});

	it("skips test paths and files without #[contractimpl]", () => {
		const iface = extractContractInterface([
			{ path: "tests/swap_test.rs", text: swapSrc },
			{ path: "src/util.rs", text: "pub fn helper(x: u32) -> u32 { x }" },
			{ path: "src/lib.rs", text: null },
		]);
		expect(iface).toEqual([]);
	});
});
