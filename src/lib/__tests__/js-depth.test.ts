import { describe, expect, it } from "vitest";
import { computeJsDepth, type JsDepthInput } from "../js-depth";

const WALLET_APP = `
import { TransactionBuilder, Operation, Keypair, Horizon } from "@stellar/stellar-sdk";
export async function buildAndSign(dest: string) {
	const server = new Horizon.Server("https://horizon.stellar.org");
	const account = await server.loadAccount(pub);
	const tx = new TransactionBuilder(account, { fee })
		.addOperation(Operation.payment({ destination: dest, amount: "1", asset }))
		.build();
	const signed = await kit.signTransaction(tx.toXDR());
	return server.submitTransaction(signed);
}
export class PaymentService {}
export const validateDestination = (d: string) => d.startsWith("G");
`;

const BOILERPLATE = `
import "@stellar/stellar-sdk";
export const App = () => { return "hello stellar"; };
`;

const base = (over: Partial<JsDepthInput>): JsDepthInput => ({
	fullName: "acme/wallet-app",
	blobs: [{ path: "src/payments.ts", text: WALLET_APP }],
	stellarJsDep: "@stellar/stellar-sdk",
	scalars: {
		isFork: false,
		tagCount: 0,
		readmeText: null,
		topics: [],
		nameLooksTemplate: false,
	},
	...over,
});

describe("computeJsDepth", () => {
	it("real wallet flow (tx-building + signing + horizon) scores well above boilerplate", () => {
		const real = computeJsDepth(base({}));
		const boiler = computeJsDepth(
			base({ blobs: [{ path: "src/app.tsx", text: BOILERPLATE }] }),
		);
		expect(real.capabilities).toContain("tx-building");
		expect(real.capabilities).toContain("signing");
		expect(real.jsDepth).toBeGreaterThan(0.55);
		expect(boiler.reasons).toContain("no-sdk-calls");
		expect(boiler.jsDepth).toBeLessThanOrEqual(0.3);
		expect(real.jsDepth - boiler.jsDepth).toBeGreaterThan(0.2);
	});

	it("immature template names are capped; mature ones are not", () => {
		const immature = computeJsDepth(base({ fullName: "acme/wallet-template" }));
		expect(immature.reasons).toContain("example-repo");
		expect(immature.jsDepth).toBeLessThanOrEqual(0.4);
		const mature = computeJsDepth(
			base({
				fullName: "acme/wallet-template",
				scalars: {
					isFork: false,
					tagCount: 5,
					readmeText: null,
					topics: [],
					nameLooksTemplate: false,
				},
			}),
		);
		expect(mature.reasons).not.toContain("example-repo");
	});

	it("no JS sources → 0 with reason", () => {
		const r = computeJsDepth(
			base({ blobs: [{ path: "src/lib.rs", text: "pub fn x(){}" }] }),
		);
		expect(r.jsDepth).toBe(0);
		expect(r.reasons).toContain("no-js-sources");
	});

	it("baseline alone can never look deep (imports-only caps at 0.3)", () => {
		const r = computeJsDepth(
			base({ blobs: [{ path: "src/a.ts", text: BOILERPLATE }] }),
		);
		expect(r.jsDepth).toBeLessThanOrEqual(0.3);
	});
});
