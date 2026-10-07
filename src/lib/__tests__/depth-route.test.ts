import { describe, expect, it } from "vitest";
import type { DepthBlob, DepthInput } from "../code-depth";
import { routeCodeDepth } from "../depth-route";

/**
 * Depth routing: the reader is chosen by the SOURCES FETCHED, not the label.
 *
 * The fixtures are shaped after the real mislabels measured live 2026-09-14 on
 * the 509 `lang-sdk` rows — a Rust crate that depends on stellar-xdr rather
 * than soroban-sdk (`rust-infra` marker), a TS SDK that got `lang-sdk` from the
 * allowlist pin because its primaryLanguage was empty at scan time, and a
 * JVM/Dart product carrying a vendored soroban crate. Absolute values are NOT
 * pinned (that would overfit synthetic fixtures — see code-depth.test.ts); what
 * is pinned is WHICH reader ran and the ordering the routing must preserve.
 */

const CONTRACT = `#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Env, Address};
#[contracttype]
pub enum DataKey { Balance(Address), Admin, Paused }
#[contract]
pub struct Vault;
#[contractimpl]
impl Vault {
    pub fn deposit(env: Env, from: Address, amount: i128) {
        from.require_auth();
        let mut bal: i128 = env.storage().persistent().get(&DataKey::Balance(from.clone())).unwrap_or(0);
        if bal < 0 { panic!("bad balance"); }
        let fee = amount * 3 / 1000;
        bal = bal + amount - fee;
        env.storage().persistent().set(&DataKey::Balance(from.clone()), &bal);
        env.storage().instance().extend_ttl(100, 200);
    }
    pub fn withdraw(env: Env, to: Address, amount: i128) {
        to.require_auth();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let mut bal: i128 = env.storage().persistent().get(&DataKey::Balance(to.clone())).unwrap_or(0);
        let interest = bal * 5 / 100;
        bal = bal - amount + interest;
        env.storage().persistent().set(&DataKey::Balance(to.clone()), &bal);
    }
}`;

const DAPP_TS = `import { TransactionBuilder, Keypair, Horizon, rpc } from "@stellar/stellar-sdk";
export async function pay(secret: string, to: string, amount: string) {
  const kp = Keypair.fromSecret(secret);
  const server = new Horizon.Server("https://horizon.stellar.org");
  const account = await server.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: "100" }).setTimeout(30).build();
  tx.sign(kp);
  return server.submitTransaction(tx);
}
export async function invoke(id: string) {
  const s = new rpc.Server("https://soroban-rpc.stellar.org");
  return s.simulateTransaction(await buildInvoke(id));
}
${"export const pad = 1;\n".repeat(300)}`;

const KOTLIN_WALLET = `package org.example
import org.stellar.sdk.TransactionBuilder
import org.stellar.sdk.KeyPair
class Wallet {
  fun pay(): Unit {
    val kp = KeyPair.fromSecretSeed(seed)
    val tx = TransactionBuilder(account, Network.PUBLIC).build()
    tx.sign(kp)
    server.submitTransaction(tx)
  }
${"  val pad = 1\n".repeat(400)}
}`;

const DEPLOY_PY = `import stellar_sdk
from stellar_sdk import SorobanServer
def deploy():
    SorobanServer("https://soroban-rpc.stellar.org").simulate_transaction(tx)
`;

const base = (
	proof: DepthInput["proof"],
	blobs: DepthBlob[],
	over: Partial<DepthInput> = {},
): DepthInput => ({
	fullName: "org/repo",
	proof,
	versionStatus: "current",
	isDeployableContract: true,
	blobs,
	contractCrateDirs: ["."],
	scalars: { isFork: false, tagCount: 20, readmeText: null, topics: [] },
	...over,
});

const route = (depth: DepthInput, stellarJsDep: string | null = null) =>
	routeCodeDepth({ depth, stellarJsDep, nameLooksTemplate: false });

describe("routeCodeDepth — the label does not pick the reader", () => {
	it("a Rust contract mislabelled `lang-sdk` is read as Rust, not stranded at 0.3", () => {
		const blobs = [
			{ path: "Cargo.toml", text: '[dependencies]\nsoroban-sdk = "21"' },
			{ path: "src/lib.rs", text: CONTRACT },
		];
		const mislabelled = route(base("lang-sdk", blobs));
		const honest = route(base("cargo-sdk", blobs));
		expect(mislabelled.route).toBe("rust");
		expect(mislabelled.codeDepth).toBe(honest.codeDepth);
		expect(mislabelled.codeDepth).toBeGreaterThan(0.3);
	});

	it("a TS SDK mislabelled `lang-sdk` is read as JS (the xBull/soroswap class)", () => {
		const r = route(
			base("lang-sdk", [
				{ path: "package.json", text: '{"name":"@org/sdk"}' },
				{ path: "src/sdk.ts", text: DAPP_TS },
			]),
			"@stellar/stellar-sdk@^13",
		);
		expect(r.route).toBe("js");
		expect(r.codeDepth).toBeGreaterThan(0.3);
		expect(r.readings.label).toBe(0.3); // what it used to keep forever
	});

	it("a js-sdk repo keeps its calibrated jsDepth — boilerplate still scores under 0.3", () => {
		// The floor is the LABEL-DRIVEN reading, not the flat constant: jsDepth is
		// calibrated so boilerplate sits at or below 0.3, and a floor at 0.3 would
		// undo that.
		const r = route(
			base("js-sdk", [
				{ path: "package.json", text: "{}" },
				{ path: "src/app.ts", text: "export const x = 1;\n".repeat(20) },
			]),
		);
		expect(r.route).toBe("js");
		expect(r.codeDepth).toBeLessThan(0.3);
	});

	it("a re-route only ADDS a reading — an incidental-file reading never lowers a repo", () => {
		// OpenZeppelin/openzeppelin-monitor: a Rust project labelled `lang-sdk`
		// whose only fetched JS was 163 lines of peripheral tooling. Reading that
		// gave 0.272 against the flat 0.300 — false precision, not a better
		// answer, so the floor holds. stellar/freighter-developer-docs was the
		// same shape at 0.119.
		const r = route(
			base("lang-sdk", [
				{ path: "package.json", text: "{}" },
				{ path: "docs/nav.js", text: "export const nav = [];\n".repeat(10) },
			]),
		);
		expect(r.readings.js).not.toBeNull();
		expect(r.readings.js ?? 1).toBeLessThan(0.3);
		expect(r.codeDepth).toBe(0.3);
		expect(r.route).toBe("label");
	});

	it("a Soroban contract repo is NOT re-graded on its dapp frontend", () => {
		// Measured: allowing the JS reading to lift a Rust proof moved 15 of 180
		// sampled repos up by as much as +0.454 (kalepail/passkey-kit 0.659 →
		// 1.000). jsDepth is calibrated against JS products, not contracts.
		const contract = base("cargo-sdk", [
			{ path: "Cargo.toml", text: '[dependencies]\nsoroban-sdk = "21"' },
			{ path: "src/lib.rs", text: CONTRACT },
		]);
		const withDapp = base("cargo-sdk", [
			...contract.blobs,
			{ path: "web/src/pay.ts", text: DAPP_TS },
		]);
		const r = route(withDapp, "@stellar/stellar-sdk@^13");
		expect(r.readings.js).not.toBeNull(); // computed and reported…
		expect(r.route).toBe("rust"); // …but it does not decide the repo
		expect(r.codeDepth).toBe(route(contract).codeDepth);
	});

	it("`none` scores 0 however much source was fetched — depth is Stellar depth", () => {
		const r = route(
			base("none", [
				{ path: "package.json", text: '{"name":"x"}' },
				{ path: "src/sdk.ts", text: DAPP_TS },
			]),
			"@stellar/stellar-sdk@^13",
		);
		expect(r.route).toBe("label");
		expect(r.codeDepth).toBe(0);
	});

	it("nothing readable in any scored language → today's flat value, unchanged", () => {
		const r = route(
			base("lang-sdk", [
				{ path: "pubspec.yaml", text: "stellar_flutter_sdk: ^1.0.0" },
				{ path: "lib/main.dart", text: null },
			]),
		);
		expect(r.route).toBe("label");
		expect(r.codeDepth).toBe(0.3);
	});

	it("Rust TEST files alone are not Rust sources (the rs-stellar-xdr shape)", () => {
		// Its crates declare no soroban-sdk, so selectDepthPaths samples no
		// source — only three test files land. Routing on raw ".rs present"
		// graded that repo 0.350 out of `#[test]` bodies.
		const r = route(
			base("lang-sdk", [
				{ path: "Cargo.toml", text: '[dependencies]\nstellar-xdr = "21"' },
				{ path: "tests/str.rs", text: `#[test]\nfn t() { assert_eq!(1, 1); }` },
			]),
		);
		expect(r.readings.rust).toBeNull();
		expect(r.sloc.rust).toBe(0);
		expect(r.codeDepth).toBe(0.3);
	});
});

describe("routeCodeDepth — the hybrid-repo rule survives as a mass gate", () => {
	const VENDORED = [
		{ path: "Cargo.toml", text: '[dependencies]\nsoroban-sdk = "21"' },
		{ path: "vendor/src/lib.rs", text: CONTRACT },
	];

	it("a JVM product whose Rust is a vendored sliver takes the better reading", () => {
		const blobs = [
			...VENDORED,
			{ path: "app/src/main/kotlin/Wallet.kt", text: KOTLIN_WALLET },
		];
		const r = route(base("cargo-sdk", blobs));
		expect(r.sloc.lang).toBeGreaterThan(r.sloc.rust);
		expect(r.codeDepth).toBe(
			Math.max(r.readings.rust ?? 0, r.readings.lang ?? 0),
		);
		// and the vendored sliver alone never decides the repo
		expect(r.codeDepth).toBeGreaterThanOrEqual(r.readings.lang ?? 0);
	});

	it("a pure-Rust repo with an incidental deploy script is UNTOUCHED", () => {
		const rustOnly = base("cargo-sdk", [
			{ path: "Cargo.toml", text: '[dependencies]\nsoroban-sdk = "21"' },
			{ path: "src/lib.rs", text: CONTRACT },
		]);
		const withScript = base("cargo-sdk", [
			...rustOnly.blobs,
			{ path: "scripts/deploy.py", text: DEPLOY_PY },
		]);
		const a = route(rustOnly);
		const b = route(withScript);
		expect(b.sloc.lang).toBeLessThan(b.sloc.rust);
		expect(b.route).toBe("rust");
		expect(b.codeDepth).toBe(a.codeDepth); // the script cannot lift it
	});

	it("a cargo-sdk repo never loses depth to the routing, whatever sits beside it", () => {
		const rustOnly = base("cargo-sdk", [
			{ path: "Cargo.toml", text: '[dependencies]\nsoroban-sdk = "21"' },
			{ path: "src/lib.rs", text: CONTRACT },
		]);
		const withFrontend = base("cargo-sdk", [
			...rustOnly.blobs,
			{ path: "web/src/app.ts", text: "export const x = 1;\n".repeat(500) },
		]);
		expect(route(withFrontend).codeDepth).toBeGreaterThanOrEqual(
			route(rustOnly).codeDepth,
		);
	});
});
