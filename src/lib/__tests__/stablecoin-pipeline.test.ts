import { describe, expect, it } from "vitest";
import { STABLECOIN_REGISTRY } from "@/data/stablecoin-registry";
import {
	carryIssuerOfRecord,
	issuerOfRecordFromToml,
	orgLogoFromToml,
} from "../stablecoin-pipeline";

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

/**
 * sls-107 (2026-11-02): `company` is the brand we curate ("Novatti Group" for
 * AUDD, "Currency One" for the eight C1 rows) and an agent answering "who
 * issues X" from it gave the brand, not the issuer of record. The issuer of
 * record is the ORG_NAME the issuer publishes in its own stellar.toml, read
 * only when that toml lists the issuing account. Fixtures are the real shapes
 * read on 2026-11-04, cut to the lines that matter.
 */
describe("issuerOfRecordFromToml: the legal issuer is the toml's own ORG_NAME", () => {
	const AUDD = "GDC7X2MXTYSAKUUGAIQ7J7RPEIM7GXSAIWFYWWH4GLNFECQVJJLB2EEU";
	const MGUSD = "GAIUGZZZSL47BKH27SUDZESZELFJDPE2UM52RACOSFJ7BIVBGKUEJSUZ";
	const C1USD = "GDCDFF6ZZP3HVODSVJYAN6IRNGWGPLVFKH23RY2OFHFGGVCGBXSDPKTU";
	const VNX = "GDXLSLCOPPHTWOQXLLKSVN4VN3G67WD2ENU7UMVAROEYVJLSPSEWXIZN";

	const auddToml = `ACCOUNTS=[
"${AUDD}"
]
[DOCUMENTATION]
ORG_NAME="AUDC PTY LTD"

[[CURRENCIES]]
code="AUDD"
issuer="${AUDD}"
desc="Australia's fast, stable, secure fiat-backed stablecoin."
`;
	const mgusdToml = `ACCOUNTS = [
"GCQLUTKZ373IUGE7Z33JKH5VLRRRLH2LKTU3WEBAGH2MD6AWNYPHUU2Q"
]
[DOCUMENTATION]
ORG_NAME="MoneyGram Payment Systems, Inc."

[[CURRENCIES]]
code="MGUSD"
issuer="${MGUSD}"
desc="USD-backed stablecoin issued by Bridge on behalf of MoneyGram"
`;
	const c1Toml = `[DOCUMENTATION]
ORG_NAME="Kinesis Money Panama S.A."

[[CURRENCIES]]
code="C1USD"
issuer="${C1USD}"
desc="Currency One USD is a fully collateralized US Dollar stablecoin by Kinesis Money Panama S.A."
`;
	// VNX's toml declares VCHF but not VEUR, and both are issued by one
	// account: the toml still lists that account, so the org behind it is the
	// issuer of record for VEUR too.
	const vnxToml = `[DOCUMENTATION]
ORG_NAME="VNX Global Ltd."

[[CURRENCIES]]
code="VCHF"
issuer="${VNX}"
desc="VNX Swiss Franc (VCHF) is a regulated stablecoin referencing the Swiss franc, issued by VNX Global Ltd. under a Class M digital assets business licence."
`;

	it("AUDD: AUDC PTY LTD, not the brand", () => {
		expect(issuerOfRecordFromToml(auddToml, "AUDD", AUDD)).toEqual({
			name: "AUDC PTY LTD",
			note: null,
		});
	});

	it("C1USD: Kinesis Money Panama S.A.; a desc that names the same org adds no note", () => {
		expect(issuerOfRecordFromToml(c1Toml, "C1USD", C1USD)).toEqual({
			name: "Kinesis Money Panama S.A.",
			note: null,
		});
	});

	it("MGUSD: the ORG_NAME is the issuer of record, and a desc naming another issuing party is kept as a note", () => {
		expect(issuerOfRecordFromToml(mgusdToml, "MGUSD", MGUSD)).toEqual({
			name: "MoneyGram Payment Systems, Inc.",
			note: 'stellar.toml desc for MGUSD: "USD-backed stablecoin issued by Bridge on behalf of MoneyGram"',
		});
	});

	it("a desc is quoted whole, apostrophes included", () => {
		const toml = `[DOCUMENTATION]
ORG_NAME="Example Holdings Ltd"
[[CURRENCIES]]
code="EXD"
issuer="${AUDD}"
desc="Example's dollar, issued by Other Mint (Pty) Ltd, and operated by Example SA"
`;
		expect(issuerOfRecordFromToml(toml, "EXD", AUDD)).toEqual({
			name: "Example Holdings Ltd",
			note: `stellar.toml desc for EXD: "Example's dollar, issued by Other Mint (Pty) Ltd, and operated by Example SA"`,
		});
	});

	it("an account the toml lists under another currency still has that org as its issuer of record (VEUR)", () => {
		expect(issuerOfRecordFromToml(vnxToml, "VEUR", VNX)).toEqual({
			name: "VNX Global Ltd.",
			note: null,
		});
		// VCHF's desc says "issued by VNX Global Ltd.": the same org, no note.
		expect(issuerOfRecordFromToml(vnxToml, "VCHF", VNX)).toEqual({
			name: "VNX Global Ltd.",
			note: null,
		});
	});

	it("a toml that does not list the issuing account names nobody: an account can point its home_domain anywhere", () => {
		// The USDCAllow class: an unrelated issuer set home_domain to
		// circle.com, whose toml never mentions that account.
		const r = issuerOfRecordFromToml(
			c1Toml,
			"USDCAllow",
			"GBADISSUERTHATTHETOMLDOESNOTLISTANYWHEREXXXXXXXXXXXXXXXX",
		);
		expect(r).toEqual({ miss: "the toml does not list the issuer account" });
	});

	it("a toml with no ORG_NAME names nobody", () => {
		const toml = `[[CURRENCIES]]\ncode="AUDD"\nissuer="${AUDD}"\n`;
		expect(issuerOfRecordFromToml(toml, "AUDD", AUDD)).toEqual({
			miss: "the toml declares no ORG_NAME",
		});
	});
});

describe("carryIssuerOfRecord: one read, kept whole, never from company", () => {
	const NONE = {
		issuerOfRecord: null,
		issuerOfRecordSourceUrl: null,
		issuerOfRecordAsOf: null,
		issuerOfRecordNote: null,
	};
	const OLD = {
		issuerOfRecord: "MoneyGram Payment Systems, Inc.",
		issuerOfRecordSourceUrl:
			"https://mgusd.moneygram.com/.well-known/stellar.toml",
		issuerOfRecordAsOf: "2026-11-05T00:25:00.000Z",
		issuerOfRecordNote:
			'stellar.toml desc for MGUSD: "USD-backed stablecoin issued by Bridge on behalf of MoneyGram"',
	};
	const FRESH = {
		...OLD,
		issuerOfRecordAsOf: "2026-11-05T06:25:00.000Z",
		issuerOfRecordNote: null,
	};

	it("a fresh read replaces the stored one, all four fields from that read", () => {
		expect(
			carryIssuerOfRecord(FRESH, { company: "MoneyGram", ...OLD }),
		).toEqual(FRESH);
	});

	it("a run that read nothing keeps the stored read whole, dated by its own asOf", () => {
		expect(carryIssuerOfRecord(NONE, { company: "MoneyGram", ...OLD })).toEqual(
			OLD,
		);
	});

	it("nothing read and nothing stored stays null: never a guess from company", () => {
		expect(carryIssuerOfRecord(NONE, { company: "Novatti Group" })).toEqual(
			NONE,
		);
		expect(carryIssuerOfRecord(NONE, undefined)).toEqual(NONE);
	});
});
