import { describe, expect, it } from "vitest";
import { extractCodeSymbols, symbolsHaystack } from "../code-symbols";

const ESCROW_RS = `
#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
	pub fn initialize_escrow(env: Env, buyer: Address, seller: Address, amount: i128) {
		buyer.require_auth();
	}
	pub fn release_escrow(env: Env, buyer: Address) {}
	pub fn refund(env: Env) {}
	pub(crate) fn milestone_state(env: &Env) -> u32 { 0 }
	fn internal_only(env: &Env) {}
	pub fn new(env: Env) {}
}

pub enum EscrowStatus { Funded, Released }
pub trait MilestonePolicy {}
`;

describe("extractCodeSymbols", () => {
	const blobs = [{ path: "contracts/escrow/src/lib.rs", text: ESCROW_RS }];

	it("extracts pub fns and pub types from Rust sources", () => {
		const syms = extractCodeSymbols(blobs);
		expect(syms).toContain("initialize_escrow");
		expect(syms).toContain("release_escrow");
		expect(syms).toContain("milestone_state"); // pub(crate) counts
		expect(syms).toContain("EscrowContract");
		expect(syms).toContain("EscrowStatus");
		expect(syms).toContain("MilestonePolicy");
	});

	it("skips private fns, noise names, and short names", () => {
		const syms = extractCodeSymbols(blobs);
		expect(syms).not.toContain("internal_only"); // not pub
		expect(syms).not.toContain("new"); // noise
		// "refund" is short but ≥4 chars and meaningful — kept
		expect(syms).toContain("refund");
	});

	it("skips test paths, non-Rust files, and null blobs", () => {
		const syms = extractCodeSymbols([
			{ path: "tests/escrow_test.rs", text: "pub fn totally_real_api(){}" },
			{ path: "Cargo.toml", text: 'pub fn not_rust_anyway = "1"' },
			{ path: "src/lib.rs", text: null },
		]);
		expect(syms).toEqual([]);
	});

	it("dedupes case-insensitively and caps output", () => {
		const many = Array.from(
			{ length: 100 },
			(_, i) => `pub fn handler_number_${i}(env: Env) {}`,
		).join("\n");
		const syms = extractCodeSymbols([
			{ path: "src/a.rs", text: `${ESCROW_RS}\n${ESCROW_RS}` },
			{ path: "src/b.rs", text: many },
		]);
		expect(new Set(syms.map((s) => s.toLowerCase())).size).toBe(syms.length);
		expect(syms.length).toBeLessThanOrEqual(60);
	});
});

describe("symbolsHaystack", () => {
	it("splits snake_case and camelCase so word-boundary matching works", () => {
		const hay = symbolsHaystack(["release_escrow", "EscrowContract"]);
		expect(hay).toContain("release escrow");
		expect(hay).toContain("escrow contract");
		// The actual matching contract: \bescrow\b must hit
		expect(/\bescrow\b/.test(hay)).toBe(true);
	});

	it("is defensive about non-array / mixed input", () => {
		expect(symbolsHaystack(null)).toBe("");
		expect(symbolsHaystack([1, "swap_exact_tokens", null])).toContain(
			"swap exact tokens",
		);
	});
});
