import { describe, expect, it } from "vitest";
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
