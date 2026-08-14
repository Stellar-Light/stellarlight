import { describe, expect, it } from "vitest";
import { deriveCodeDomains } from "../code-domains";

describe("deriveCodeDomains", () => {
	it("maps dependency evidence to domains", () => {
		expect(
			deriveCodeDomains({
				stellarDeps: ["@blend-capital/blend-sdk", "@x402/core", "passkey-kit"],
			}),
		).toEqual(["defi-lending", "payments-x402", "wallet-infra"]);
	});
	it("sep24-ramp capability marks anchor-ramp", () => {
		expect(deriveCodeDomains({ sdkCapabilities: ["sep24-ramp", "signing"] })).toEqual([
			"anchor-ramp",
		]);
	});
	it("SEP-40 lastprice interface trait marks oracle", () => {
		expect(
			deriveCodeDomains({ contractInterface: ["lastprice(asset: Asset) -> Option<PriceData>"] }),
		).toEqual(["oracle"]);
	});
	it("no evidence = honest empty, never a guess", () => {
		expect(
			deriveCodeDomains({ stellarDeps: ["@stellar/stellar-sdk"], sdkCapabilities: ["signing"] }),
		).toEqual([]);
	});
});
