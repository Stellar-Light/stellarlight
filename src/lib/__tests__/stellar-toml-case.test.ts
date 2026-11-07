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

/**
 * Re-check items 7 and 8 (2026-11-04): the parser moved to src/lib and
 * learned ACCOUNTS. An unclosed `ACCOUNTS = [` must not swallow the table
 * after it (enrich-partners-toml would then read [DOCUMENTATION] as missing
 * and skip the partner), and single-quoted TOML literal strings, which SEP-1
 * allows and the old reader dropped, are read.
 */
describe("stellar.toml parser edge cases", () => {
	const G = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

	it("a header line ends an ACCOUNTS array left open, and its table is read", () => {
		const parsed = parseStellarToml(
			`ACCOUNTS = [\n"${G}"\n[DOCUMENTATION]\nORG_NAME="Example Org"\n[[CURRENCIES]]\ncode="USDC"\nissuer="${G}"\n`,
		);
		expect(parsed.accounts).toEqual([G]);
		expect(parsed.documentation.ORG_NAME).toBe("Example Org");
		expect(parsed.topLevel.ORG_NAME).toBeUndefined();
		expect(parsed.currencies).toEqual([{ code: "USDC", issuer: G }]);
	});

	it("an assignment line ends an ACCOUNTS array left open, too", () => {
		const parsed = parseStellarToml(
			`ACCOUNTS = [\n"${G}"\nVERSION = "2.0.0"\n`,
		);
		expect(parsed.accounts).toEqual([G]);
		expect(parsed.topLevel.VERSION).toBe("2.0.0");
	});

	it("single-quoted literal strings are read, as SEP-1 (TOML) allows", () => {
		const parsed = parseStellarToml(
			`[DOCUMENTATION]\nORG_NAME = 'Literal Org'\n[[CURRENCIES]]\ncode = 'XLIT'\nissuer = '${G}'\ndesc = 'It is "quoted" inside'\n`,
		);
		expect(parsed.documentation.ORG_NAME).toBe("Literal Org");
		expect(parsed.currencies).toEqual([
			{ code: "XLIT", issuer: G, desc: 'It is "quoted" inside' },
		]);
	});
});
