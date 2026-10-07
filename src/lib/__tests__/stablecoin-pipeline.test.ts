import { describe, expect, it } from "vitest";
import { STABLECOIN_REGISTRY } from "@/data/stablecoin-registry";
import { orgLogoFromToml } from "../stablecoin-pipeline";

describe("orgLogoFromToml", () => {
	// APS Money's real toml shape: 13 CURRENCIES blocks, none with an
	// `image=`, and one ORG_LOGO in [DOCUMENTATION] — the case that motivated
	// this fallback (its own ORG_LOGO happens to 404, verified separately by
	// urlResolves; this function only parses, it never fetches).
	const apsToml = `
[DOCUMENTATION]
ORG_NAME="Advanced Payment Solutions Ltd."
ORG_URL="https://www.aps.money"
ORG_LOGO="https://aps.money/wp-content/uploads/2022/05/APS-footer-logo.png"

[[CURRENCIES]]
code="APSUSDM"
issuer="GB7OUO5NY5WQKXJJ7PFFZEJOKN4BA7IOEN3Z6SWAY26LGTREJJYZH2ZT"
name="APS USD"
`;

	it("reads an absolute ORG_LOGO URL as-is", () => {
		expect(orgLogoFromToml(apsToml, "aps.money")).toBe(
			"https://aps.money/wp-content/uploads/2022/05/APS-footer-logo.png",
		);
	});

	it("resolves a relative ORG_LOGO against the domain", () => {
		const toml = `[DOCUMENTATION]\nORG_LOGO="/logo.png"\n`;
		expect(orgLogoFromToml(toml, "example.com")).toBe(
			"https://example.com/logo.png",
		);
	});

	it("returns null when the toml declares no ORG_LOGO", () => {
		const toml = `[DOCUMENTATION]\nORG_NAME="No Logo Inc."\n`;
		expect(orgLogoFromToml(toml, "example.com")).toBeNull();
	});

	it("returns null on an empty or malformed toml, never throws", () => {
		expect(orgLogoFromToml("", "example.com")).toBeNull();
		expect(orgLogoFromToml("not even toml {{{", "example.com")).toBeNull();
	});
});

/**
 * The USDY defect (2026-09-09): the pipeline priced every unit at its peg, so
 * Ondo's USDY — a Treasury claim whose NAV accrues, $1.14 that day — was
 * valued at $1.00 and the largest asset on the board was served ~$65M light.
 * `assetType` is the registry's own marker for "not a plain peg", so a row
 * that carries one and does NOT declare where its real price comes from is
 * the same bug being added again by omission.
 */
describe("a unit that is not a plain peg declares where its price comes from", () => {
	it("every assetType row has a marketPrice source", () => {
		const missing = STABLECOIN_REGISTRY.filter(
			(a) => a.assetType && !a.marketPrice,
		).map((a) => `${a.code} (${a.assetType})`);
		expect(missing).toEqual([]);
	});

	it("USDY is one of them, priced from its own market", () => {
		const usdy = STABLECOIN_REGISTRY.find((a) => a.code === "USDY");
		expect(usdy?.marketPrice).toEqual({
			source: "coingecko",
			id: "ondo-us-dollar-yield",
		});
	});

	it("a plain peg does NOT declare one — the peg is the honest price there", () => {
		const usdc = STABLECOIN_REGISTRY.find(
			(a) =>
				a.code === "USDC" &&
				a.issuer === "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
		);
		expect(usdc?.marketPrice).toBeUndefined();
	});
});
