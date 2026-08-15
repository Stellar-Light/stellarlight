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

describe("AMM + lending trait markers (2026-08-15, real stored strings)", () => {
	it("soroswap router surface → defi-amm", () => {
		expect(
			deriveCodeDomains({
				contractInterface: [
					"SoroswapRouter.add_liquidity(token_a: Address, token_b: Address, amount_a_desired: i128, amount_b_desired: i128, amount_a_min: i128, amount_b_min: i128, to: Address, deadline: u64) -> Result<(i128, i128, i128), CombinedRouterError>",
					"SoroswapRouter.swap_exact_tokens_for_tokens(amount_in: i128, amount_out_min: i128, path: Vec<Address>, to: Address, deadline: u64) -> Result<Vec<i128>, CombinedRouterError>",
				],
			}),
		).toEqual(["defi-amm"]);
	});

	it("phoenix pool surface (CosmWasm dialect) → defi-amm", () => {
		expect(
			deriveCodeDomains({
				contractInterface: [
					"LiquidityPool.provide_liquidity(sender: Address, desired_a: Option<i128>, min_a: Option<i128>) -> Result<(), ContractError>",
					"LiquidityPool.simulate_reverse_swap(ask_asset: Address, ask_amount: i128) -> SimulateReverseSwapResponse",
				],
			}),
		).toEqual(["defi-amm"]);
	});

	it("blend pool surface → defi-lending", () => {
		expect(
			deriveCodeDomains({
				contractInterface: [
					"PoolContract.queue_set_reserve(asset: Address, metadata: ReserveConfig)",
					"PoolContract.get_positions(address: Address) -> Positions",
				],
			}),
		).toEqual(["defi-lending"]);
	});

	it("negative: swap-adjacent but non-marker fns stay unlabeled", () => {
		expect(
			deriveCodeDomains({
				contractInterface: [
					"SoroswapRouter.router_quote(amount_a: i128, reserve_a: i128, reserve_b: i128) -> Result<i128, CombinedRouterError>",
					"PoolContract.set_admin(new_admin: Address)",
				],
			}),
		).toEqual([]);
	});
});
