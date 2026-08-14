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
	it("SEP-40 lastprice interface trait marks oracle (real stored shape)", () => {
		// Stored entries are "ContractType.fn(args) -> Ret" strings — verified
		// against reflector-network/reflector-contract's live row 2026-08-14.
		expect(
			deriveCodeDomains({
				contractInterface: [
					"BeamOracleContract.decimals() -> u32",
					"BeamOracleContract.lastprice(asset: Asset) -> Option<PriceData>",
				],
			}),
		).toEqual(["oracle"]);
		// Bare-fn shape still matches.
		expect(
			deriveCodeDomains({ contractInterface: ["lastprice(asset: Asset) -> Option<PriceData>"] }),
		).toEqual(["oracle"]);
		// A fn merely CONTAINING the word does not.
		expect(
			deriveCodeDomains({ contractInterface: ["Oracle.get_lastprice_history() -> Vec<u64>"] }),
		).toEqual([]);
	});
	it("no evidence = honest empty, never a guess", () => {
		expect(
			deriveCodeDomains({ stellarDeps: ["@stellar/stellar-sdk"], sdkCapabilities: ["signing"] }),
		).toEqual([]);
	});
});
