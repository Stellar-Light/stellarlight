import { describe, expect, it } from "vitest";
import { computeLangDepth } from "../lang-depth";

const SCALARS = {
	isFork: false,
	tagCount: 20,
	readmeText: null,
	topics: [],
	nameLooksTemplate: false,
};

describe("computeLangDepth", () => {
	it("SDK-grade python with real flows clears the deep floor", () => {
		const d = computeLangDepth({
			fullName: "org/py-sdk",
			blobs: [
				{
					path: "stellar_sdk/transaction_builder.py",
					text: `from stellar_sdk import Keypair\nclass TransactionBuilder:\n${"  x = 1\n".repeat(400)}  def sign(self): kp = Keypair.from_secret(s)\n  def rpc(self): SorobanServer().simulate_transaction(tx)\n  def go(self): server.submit_transaction(tx)`,
				},
				{ path: "tests/test_builder.py", text: "def test_ok(): pass" },
			],
			scalars: SCALARS,
		});
		expect(d.langDepth).toBeGreaterThanOrEqual(0.5);
		expect(d.capabilities).toContain("tx-building");
	});
	it("context-free lang repo caps at the old flat 0.3", () => {
		const d = computeLangDepth({
			fullName: "org/random-go-tool",
			blobs: [
				{
					path: "main.go",
					text: `package main\n${"// x\n".repeat(200)}func main() {}`,
				},
			],
			scalars: SCALARS,
		});
		expect(d.reasons).toContain("no-sdk-calls");
		expect(d.langDepth).toBeLessThanOrEqual(0.3);
	});
	it("immature example-named repo is capped at 0.4", () => {
		const d = computeLangDepth({
			fullName: "org/stellar-python-quickstart",
			blobs: [
				{
					path: "app.py",
					text: "from stellar_sdk import Keypair\nTransactionBuilder()\nkp = Keypair.from_secret(s)\ntx.sign(kp)\nserver.submit_transaction(tx)",
				},
			],
			scalars: { ...SCALARS, tagCount: 0 },
		});
		expect(d.reasons).toContain("example-repo");
		expect(d.langDepth).toBeLessThanOrEqual(0.4);
	});
	it("no lang sources → zero with the honest reason", () => {
		const d = computeLangDepth({
			fullName: "org/rust-only",
			blobs: [{ path: "src/lib.rs", text: "pub fn x() {}" }],
			scalars: SCALARS,
		});
		expect(d.langDepth).toBe(0);
		expect(d.reasons).toContain("no-lang-sources");
	});
});
