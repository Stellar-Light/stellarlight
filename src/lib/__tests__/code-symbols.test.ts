import { describe, expect, it } from "vitest";
import {
	contractInterfaceEntries,
	detectSdkCapabilities,
	extractCodeSymbols,
	extractContractInterface,
	extractJsSymbols,
	symbolsHaystack,
} from "../code-symbols";

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

const WALLET_TS = `
import { TransactionBuilder, Operation, Keypair } from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";

export async function buildPaymentTx(dest: string, amount: string) {
	const tx = new TransactionBuilder(account, { fee }).addOperation(
		Operation.payment({ destination: dest, amount, asset }),
	).build();
	return tx;
}
export const signWithWallet = async (tx) => kit.signTransaction(tx.toXDR());
export class EscrowClient {}
module.exports.legacyHelper = () => {};
function internalOnly() {}
`;

describe("extractJsSymbols (gap 1 phase 1)", () => {
	it("extracts exported fns/consts/classes and CJS exports", () => {
		const syms = extractJsSymbols([{ path: "src/wallet.ts", text: WALLET_TS }]);
		expect(syms).toContain("buildPaymentTx");
		expect(syms).toContain("signWithWallet");
		expect(syms).toContain("EscrowClient");
		expect(syms).toContain("legacyHelper");
		expect(syms).not.toContain("internalOnly");
	});
	it("skips tests, non-JS files, and null blobs", () => {
		expect(
			extractJsSymbols([
				{ path: "tests/wallet.test.ts", text: "export function fakeApi(){}" },
				{ path: "src/lib.rs", text: "export function notJs(){}" },
				{ path: "src/x.ts", text: null },
			]),
		).toEqual([]);
	});
});

describe("detectSdkCapabilities", () => {
	it("tags real wallet-integration capabilities from call patterns", () => {
		const tags = detectSdkCapabilities([
			{ path: "src/wallet.ts", text: WALLET_TS },
		]);
		expect(tags).toContain("tx-building");
		expect(tags).toContain("signing");
		expect(tags).toContain("wallet-kit");
		expect(tags).not.toContain("sep24-ramp");
	});
	it("boilerplate with no SDK calls gets no tags", () => {
		expect(
			detectSdkCapabilities([
				{
					path: "src/app.tsx",
					text: "export const App = () => <div>hello</div>;",
				},
			]),
		).toEqual([]);
	});

	it("F2: digit-boundary symbols searchable in split AND raw forms", () => {
		const hay = symbolsHaystack(["Groth16Verifier", "ScVal", "ed25519_sign"]);
		// digit→Upper split gives standalone groth16
		expect(hay).toContain("groth16 verifier");
		// raw concatenated forms survive for one-token identifier queries
		expect(hay).toContain("scval");
		expect(hay).toContain("ed25519sign");
		// and split forms still present
		expect(hay).toContain("sc val");
		expect(hay).toContain("ed25519 sign");
	});
});

describe("language-frontier capabilities (py/go/jvm)", () => {
	it("python stellar_sdk idioms fire the shared tags", () => {
		const tags = detectSdkCapabilities([
			{
				path: "stellar_sdk/transaction_builder.py",
				text: "from stellar_sdk import Keypair\nclass TransactionBuilder:\n  def sign(self): kp = Keypair.from_secret(s)\n  def go(self): server.submit_transaction(tx)",
			},
		]);
		expect(tags).toContain("tx-building");
		expect(tags).toContain("signing");
		expect(tags).toContain("horizon");
	});
	it("go txnbuild/horizonclient idioms fire", () => {
		const tags = detectSdkCapabilities([
			{
				path: "clients/horizonclient/main.go",
				text: 'import "github.com/stellar/go/txnbuild"\ntx := txnbuild.NewTransaction(p)\nc := horizonclient.DefaultPublicNetClient\nresp := c.SubmitTransaction(tx)',
			},
		]);
		expect(tags).toContain("tx-building");
		expect(tags).toContain("horizon");
	});
	it("kotlin/java sep-24 anchor idioms fire behind the org.stellar gate", () => {
		const tags = detectSdkCapabilities([
			{
				path: "platform/src/main/kotlin/Sep24Service.kt",
				text: "import org.stellar.anchor.sep24.Sep24Service\nclass Sep24Service { fun interactiveDeposit() {} }\nval c = Sep10Challenge.newChallenge()",
			},
		]);
		expect(tags).toContain("sep24-ramp");
		expect(tags).toContain("sep10-auth");
	});
	it("stellar-context gate blocks cross-fire from other-chain SDKs", () => {
		const tags = detectSdkCapabilities([
			{
				path: "src/main/java/OtherChain.java",
				text: "import com.otherchain.sdk.TransactionBuilder;\nTransactionBuilder b = new TransactionBuilder();",
			},
		]);
		expect(tags).toEqual([]);
	});
});

describe("interfaces carry their source path; test folders stay out (issue #1906)", () => {
	const impl = (name: string) =>
		`#[contract]\npub struct ${name};\n#[contractimpl]\nimpl ${name} {\n\tpub fn bump(env: Env, n: u32) -> u32 { n }\n}\n`;

	it("each signature comes with the file it was read from, in the same order", () => {
		const blobs = [
			{ path: "contracts/vault/src/lib.rs", text: impl("Vault") },
			{ path: "examples/demo/src/contract.rs", text: impl("Demo") },
		];
		expect(contractInterfaceEntries(blobs)).toEqual([
			{
				signature: "Vault.bump(n: u32) -> u32",
				path: "contracts/vault/src/lib.rs",
			},
			// an example folder stays in; its path is what marks it
			{
				signature: "Demo.bump(n: u32) -> u32",
				path: "examples/demo/src/contract.rs",
			},
		]);
		// the string list existing consumers read is unchanged
		expect(extractContractInterface(blobs)).toEqual([
			"Vault.bump(n: u32) -> u32",
			"Demo.bump(n: u32) -> u32",
		]);
	});

	it.each([
		// stellar/stellar-horizon: the six interfaces it served live
		"internal/integration/contracts/increment/src/lib.rs",
		// stellar/rs-soroban-env: its test wasms
		"soroban-test-wasms/wasm-workspace/auth/src/lib.rs",
		"e2e/contracts/token/src/lib.rs",
		"testdata/contract/src/lib.rs",
		"contracts/tests/fixture/src/lib.rs",
		// review finding 3: an integration-test folder by name
		"integration-tests/src/lib.rs",
	])(
		"%s is a test folder: left out of the interface and the symbols",
		(path) => {
			const blobs = [{ path, text: impl("Fixture") }];
			expect(extractCodeSymbols(blobs)).toEqual([]);
			expect(contractInterfaceEntries(blobs)).toEqual([]);
		},
	);

	it("JS under a test folder stays out of the symbols and the capability tags", () => {
		const blobs = [
			{
				path: "e2e/flows/pay.ts",
				text: "export function payFlow(a) { return new TransactionBuilder(a); }",
			},
		];
		expect(extractJsSymbols(blobs)).toEqual([]);
		expect(detectSdkCapabilities(blobs)).toEqual([]);
	});

	// review finding 3: the test layouts of every language the scanner reads
	it.each([
		[
			"__tests__/pay.ts",
			"export function payFlow(a) { return new TransactionBuilder(a); }",
		],
		[
			"src/pay.test.ts",
			"export function payFlow(a) { return new TransactionBuilder(a); }",
		],
		[
			"src/pay.spec.tsx",
			"export function payFlow(a) { return new TransactionBuilder(a); }",
		],
		[
			"internal/pay_test.go",
			'import "github.com/stellar/go/txnbuild"\ntx := txnbuild.NewTransaction(p)',
		],
		[
			"pkg/test_pay.py",
			"from stellar_sdk import TransactionBuilder\nTransactionBuilder(a)",
		],
		[
			"src/main/kotlin/PayTest.kt",
			"import org.stellar.sdk.TransactionBuilder\nval b = TransactionBuilder(a)",
		],
	])(
		"%s is test code in its language: no symbols, no capability tags",
		(path, text) => {
			const blobs = [{ path, text }];
			expect(extractJsSymbols(blobs)).toEqual([]);
			expect(detectSdkCapabilities(blobs)).toEqual([]);
		},
	);

	// review finding 3: the integration clause covers a crate kept inside an
	// integration/ folder, never a module or a crate merely named integration
	it.each(["src/integration/mod.rs", "integration/src/lib.rs"])(
		"%s is product code: its interface and symbols stay in",
		(path) => {
			const blobs = [{ path, text: impl("Bridge") }];
			expect(extractCodeSymbols(blobs)).toEqual(["bump", "Bridge"]);
			expect(contractInterfaceEntries(blobs)).toEqual([
				{ signature: "Bridge.bump(n: u32) -> u32", path },
			]);
		},
	);

	it("a JS integration/ folder stays in: it can hold product code", () => {
		const blobs = [
			{
				path: "src/integration/wallet.ts",
				text: "export function connectWallet() { return new TransactionBuilder(a); }",
			},
		];
		expect(extractJsSymbols(blobs)).toEqual(["connectWallet"]);
		expect(detectSdkCapabilities(blobs)).toEqual(["tx-building"]);
	});
});
