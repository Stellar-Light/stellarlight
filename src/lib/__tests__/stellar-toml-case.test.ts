import { describe, expect, it } from "vitest";
import { parseStellarToml } from "../../../scripts/lib/stellar-toml";

// 2026-09-28: the parser uppercased asset codes, so normalfinance.io's nBTC
// became NBTC and the on-chain join fetched a 404 for an asset that had 65
// trustlines. Codes are case-sensitive on Stellar; issuers are StrKeys.
describe("stellar.toml currencies keep the operator's asset-code case", () => {
	const toml = `
VERSION = "2.0.0"
[[CURRENCIES]]
code = "nBTC"
issuer = "gaoatrjgnrponpbrhumw6owbj6djnr3b7fbjai3y3lqirie4s7vcbwmb"
status = "dead"
[[CURRENCIES]]
code = "USDC"
issuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
status = "live"
[[CURRENCIES]]
code = "NOISSUER"
`;
	const parsed = parseStellarToml(toml);

	it("keeps nBTC as nBTC and uppercases only the issuer", () => {
		expect(parsed.currencies[0]).toEqual({
			code: "nBTC",
			issuer: "GAOATRJGNRPONPBRHUMW6OWBJ6DJNR3B7FBJAI3Y3LQIRIE4S7VCBWMB",
			status: "dead",
		});
		expect(parsed.currencyCodes).toEqual(["nBTC", "USDC", "NOISSUER"]);
	});

	it("carries the SEP-1 status so a join can decline a retired asset", () => {
		expect(parsed.currencies.map((c) => c.status)).toEqual(["dead", "live"]);
		expect(
			parsed.currencies.filter((c) => !c.status || c.status === "live"),
		).toHaveLength(1);
	});
});
