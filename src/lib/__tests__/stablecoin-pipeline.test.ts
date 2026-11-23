import { afterEach, describe, expect, it, vi } from "vitest";
import { STABLECOIN_REGISTRY, stablecoinId } from "@/data/stablecoin-registry";
import {
	carryIssuerOfRecord,
	figuresToStore,
	issuerOfRecordFromToml,
	issuerOfRecordPatch,
	issuerOfRecordWriteOn,
	type MeasuredStablecoin,
	measureRegistry,
	measureStablecoin,
	nearestSnapshot,
	nextPaymentsHistory,
	orgLogoFromToml,
	paymentsCount24hFrom,
	RATE_LIMIT_MARK,
	readIssuerOfRecord,
	readIssuerToml,
	replacesDaySnapshot,
	rowIdentity,
	rowsToRetire,
	storedMeasuredAt,
	supplyBaseline,
	supplyBaselineWindow,
} from "../stablecoin-pipeline";
import {
	disclosedIssuer,
	issuerOfRecordLine,
	issuingParty,
	STABLECOIN_ASSET_TYPES,
	type StoreRow,
	storeRowToApi,
} from "../stablecoins";
import { issuedVerdict } from "../verify-claim";

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
	// A Yield Stablecoin or Treasury-Backed row is priced from its market,
	// unless its issuer redeems the unit 1:1 at its peg, said here with why.
	const PRICED_AT_PAR: Record<string, string> = {
		USDM: "its offer pays yield out monthly and redeems USDM 1:1 for USDC",
	};
	it("every Yield Stablecoin and Treasury-Backed row has a marketPrice source, or a stated reason it is priced at par", () => {
		const missing = STABLECOIN_REGISTRY.filter(
			(a) =>
				(a.assetType === "Yield Stablecoin" ||
					a.assetType === "Treasury-Backed") &&
				!a.marketPrice &&
				!PRICED_AT_PAR[a.code],
		).map((a) => `${a.code} (${a.assetType})`);
		expect(missing).toEqual([]);
		for (const code of Object.keys(PRICED_AT_PAR))
			expect(
				STABLECOIN_REGISTRY.find((a) => a.code === code)?.assetType,
				code,
			).toBe("Yield Stablecoin");
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

	it("an ORG_NAME the parser cannot read is could-not-check, never names nobody", () => {
		const toml = `ACCOUNTS = ["${AUDD}"]\n[DOCUMENTATION]\nORG_NAME = """AUDC\nPTY LTD"""\n`;
		expect(issuerOfRecordFromToml(toml, "AUDD", AUDD)).toEqual({
			unread: "the toml sets ORG_NAME in a form this parser cannot read",
		});
	});

	it("a currency linked to its own toml may list the account: could-not-check, not a miss", () => {
		const toml = `[DOCUMENTATION]\nORG_NAME="AUDC PTY LTD"\n[[CURRENCIES]]\ntoml="https://x.example/AUDD.toml"\n`;
		expect(issuerOfRecordFromToml(toml, "AUDD", AUDD)).toEqual({
			unread:
				"the toml may list the issuer account where this parser cannot read it (toml=https://x.example/AUDD.toml)",
		});
	});

	it("an ACCOUNTS written as one string, not an array, still lists the account", () => {
		const toml = `ACCOUNTS = "${AUDD}"\n[DOCUMENTATION]\nORG_NAME="AUDC PTY LTD"\n`;
		expect(issuerOfRecordFromToml(toml, "AUDD", AUDD)).toEqual({
			name: "AUDC PTY LTD",
			note: null,
		});
	});

	it("an account listed only in ACCOUNTS is listed", () => {
		const toml = `ACCOUNTS = [\n  "${MGUSD}",\n]\n[DOCUMENTATION]\nORG_NAME="MoneyGram Payment Systems, Inc."\n`;
		expect(issuerOfRecordFromToml(toml, "MGUSD", MGUSD)).toEqual({
			name: "MoneyGram Payment Systems, Inc.",
			note: null,
		});
	});

	it("an address that appears only in a comment is not listed", () => {
		const toml = `# old issuer, retired: "${AUDD}"
ACCOUNTS = [
# "${AUDD}",
"${MGUSD}"
]
[DOCUMENTATION]
ORG_NAME="AUDC PTY LTD"
[[CURRENCIES]]
code="AUDD"
# issuer="${AUDD}"
`;
		expect(issuerOfRecordFromToml(toml, "AUDD", AUDD)).toEqual({
			miss: "the toml does not list the issuer account",
		});
	});

	it("the note comes only from a block whose issuer is the account, never a code-only block", () => {
		const toml = `[DOCUMENTATION]
ORG_NAME="MoneyGram Payment Systems, Inc."
[[CURRENCIES]]
code="MGUSD"
desc="MGUSD, issued by Decoy Mint Corp"
[[CURRENCIES]]
code="MGUSD"
issuer="${MGUSD}"
desc="USD-backed stablecoin issued by Bridge on behalf of MoneyGram"
`;
		expect(issuerOfRecordFromToml(toml, "MGUSD", MGUSD)).toEqual({
			name: "MoneyGram Payment Systems, Inc.",
			note: 'stellar.toml desc for MGUSD: "USD-backed stablecoin issued by Bridge on behalf of MoneyGram"',
		});
	});
});

/**
 * Review 2026-11-04: the first carry kept the stored name whenever a run read
 * nothing, so "the toml no longer lists the account" and "the read failed"
 * were one path and a name could stay forever. Three outcomes now, each with
 * its own write.
 */
describe("carryIssuerOfRecord: named, not named, or could not read", () => {
	const OLD = {
		issuerOfRecord: "MoneyGram Payment Systems, Inc.",
		issuerOfRecordCheck: "named",
		issuerOfRecordSourceUrl:
			"https://mgusd.moneygram.com/.well-known/stellar.toml",
		issuerOfRecordAsOf: "2026-11-05T00:25:00.000Z",
		issuerOfRecordNote:
			'stellar.toml desc for MGUSD: "USD-backed stablecoin issued by Bridge on behalf of MoneyGram"',
	};
	const AT = "2026-11-05T06:25:00.000Z";

	it("named: the new read replaces the stored one, with its own date", () => {
		expect(
			carryIssuerOfRecord(
				{
					outcome: "named",
					at: AT,
					sourceUrl: OLD.issuerOfRecordSourceUrl,
					name: "MoneyGram Payment Systems, Inc.",
					note: null,
				},
				{ company: "MoneyGram", ...OLD },
			),
		).toEqual({
			...OLD,
			issuerOfRecordAsOf: AT,
			issuerOfRecordNote: null,
		});
	});

	it("not named: a checked absence clears the stored name and is dated, never keeps it", () => {
		expect(
			carryIssuerOfRecord(
				{
					outcome: "not-named",
					at: AT,
					sourceUrl: OLD.issuerOfRecordSourceUrl,
					why: "the toml does not list the issuer account",
				},
				{ company: "MoneyGram", ...OLD },
			),
		).toEqual({
			issuerOfRecord: null,
			issuerOfRecordCheck: "not-named",
			issuerOfRecordSourceUrl: OLD.issuerOfRecordSourceUrl,
			issuerOfRecordAsOf: AT,
			issuerOfRecordNote: "the toml does not list the issuer account",
		});
	});

	it("could not read: the stored check stays whole, its date unchanged", () => {
		expect(
			carryIssuerOfRecord(
				{ outcome: "could-not-read", at: AT, why: "HTTP 503" },
				{ company: "MoneyGram", ...OLD },
			),
		).toEqual(OLD);
		const NOT_NAMED = {
			...OLD,
			issuerOfRecord: null,
			issuerOfRecordCheck: "not-named",
			issuerOfRecordNote: "the toml does not list the issuer account",
		};
		expect(
			carryIssuerOfRecord(
				{ outcome: "could-not-read", at: AT, why: "HTTP 503" },
				NOT_NAMED,
			),
		).toEqual(NOT_NAMED);
	});

	it("could not read with no completed check stored is a dated could-not-read (sls-120): null means only never tried, and never a guess from company", () => {
		const TRIED = {
			issuerOfRecord: null,
			issuerOfRecordCheck: "could-not-read",
			issuerOfRecordSourceUrl: null,
			issuerOfRecordAsOf: AT,
			issuerOfRecordNote: "HTTP 503",
		};
		expect(
			carryIssuerOfRecord(
				{ outcome: "could-not-read", at: AT, why: "HTTP 503" },
				{ company: "Novatti Group" },
			),
		).toEqual(TRIED);
		expect(
			carryIssuerOfRecord(
				{ outcome: "could-not-read", at: AT, why: "HTTP 503" },
				undefined,
			),
		).toEqual(TRIED);
		// A stored could-not-read is the latest try: the next one moves it.
		expect(
			carryIssuerOfRecord(
				{ outcome: "could-not-read", at: AT, why: "HTTP 503" },
				{ ...TRIED, issuerOfRecordAsOf: "2026-11-01T00:00:00.000Z" },
			),
		).toEqual(TRIED);
	});
});

describe("issuerOfRecordPatch: the write is off unless the owner turns it on", () => {
	const read = {
		outcome: "named" as const,
		at: "2026-11-05T06:25:00.000Z",
		sourceUrl: "https://audd.digital/.well-known/stellar.toml",
		name: "AUDC PTY LTD",
		note: null,
	};
	it("off: no issuer-of-record key at all, so the stored fields are left alone", () => {
		expect(issuerOfRecordPatch(read, null, false)).toEqual({});
	});
	it("on: the carried fields", () => {
		expect(issuerOfRecordPatch(read, null, true)).toMatchObject({
			issuerOfRecord: "AUDC PTY LTD",
			issuerOfRecordCheck: "named",
		});
	});
	it("the switch reads exactly STABLECOIN_ISSUER_OF_RECORD_WRITE=on", () => {
		expect(issuerOfRecordWriteOn({})).toBe(false);
		expect(
			issuerOfRecordWriteOn({ STABLECOIN_ISSUER_OF_RECORD_WRITE: "" }),
		).toBe(false);
		expect(
			issuerOfRecordWriteOn({ STABLECOIN_ISSUER_OF_RECORD_WRITE: "true" }),
		).toBe(false);
		expect(
			issuerOfRecordWriteOn({ STABLECOIN_ISSUER_OF_RECORD_WRITE: "on" }),
		).toBe(true);
	});
});

/** A stubbed network: each URL answers with its own Response; any other URL
 *  is a test failure, so a refused redirect target is proven never fetched. */
function stubFetch(routes: Record<string, () => Response>) {
	const calls: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string | URL) => {
			const url = String(input);
			calls.push(url);
			const route = routes[url];
			if (!route) throw new Error(`unexpected fetch ${url}`);
			return route();
		}),
	);
	return calls;
}

describe("readIssuerToml: strict, because it becomes a legal fact", () => {
	afterEach(() => vi.unstubAllGlobals());
	const TOML = 'ACCOUNTS=["GABC"]\n[DOCUMENTATION]\nORG_NAME="X Ltd"\n';

	it("reads the home_domain's toml and records the URL it read", async () => {
		stubFetch({
			"https://r1.example/.well-known/stellar.toml": () => new Response(TOML),
		});
		expect(await readIssuerToml("r1.example")).toEqual({
			kind: "read",
			url: "https://r1.example/.well-known/stellar.toml",
			text: TOML,
		});
	});

	it("follows a same-host https redirect and records the final URL", async () => {
		stubFetch({
			"https://r2.example/.well-known/stellar.toml": () =>
				new Response(null, {
					status: 301,
					headers: { location: "/stellar.toml" },
				}),
			"https://r2.example/stellar.toml": () => new Response(TOML),
		});
		expect(await readIssuerToml("r2.example")).toMatchObject({
			kind: "read",
			url: "https://r2.example/stellar.toml",
		});
	});

	it("refuses a redirect to another host and never fetches it", async () => {
		const calls = stubFetch({
			"https://r3.example/.well-known/stellar.toml": () =>
				new Response(null, {
					status: 302,
					headers: {
						location: "https://elsewhere.example/.well-known/stellar.toml",
					},
				}),
		});
		const r = await readIssuerToml("r3.example");
		expect(r.kind).toBe("failed");
		expect(calls).toEqual(["https://r3.example/.well-known/stellar.toml"]);
	});

	it("refuses a redirect down to http on the same host", async () => {
		const calls = stubFetch({
			"https://r4.example/.well-known/stellar.toml": () =>
				new Response(null, {
					status: 301,
					headers: { location: "http://r4.example/.well-known/stellar.toml" },
				}),
		});
		expect((await readIssuerToml("r4.example")).kind).toBe("failed");
		expect(calls).toHaveLength(1);
	});

	it("a 404 is a checked absence; a 403 is a failed read", async () => {
		stubFetch({
			"https://r5.example/.well-known/stellar.toml": () =>
				new Response("nope", { status: 404 }),
			"https://r6.example/.well-known/stellar.toml": () =>
				new Response("denied", { status: 403 }),
		});
		expect(await readIssuerToml("r5.example")).toEqual({
			kind: "absent",
			url: "https://r5.example/.well-known/stellar.toml",
		});
		expect(await readIssuerToml("r6.example")).toMatchObject({
			kind: "failed",
		});
	});

	it("a body over 100 KB is not read", async () => {
		stubFetch({
			"https://r7.example/.well-known/stellar.toml": () =>
				new Response("#".repeat(100 * 1024 + 1)),
		});
		const r = await readIssuerToml("r7.example");
		expect(r.kind).toBe("failed");
		expect(r.kind === "failed" && r.why).toContain("100 KB");
	});

	it("an HTML page at the toml path is a failed read, not a toml", async () => {
		stubFetch({
			"https://r8.example/.well-known/stellar.toml": () =>
				new Response("<!doctype html><title>Just a moment</title>"),
		});
		expect((await readIssuerToml("r8.example")).kind).toBe("failed");
	});
});

describe("readIssuerOfRecord: the three outcomes, end to end", () => {
	afterEach(() => vi.unstubAllGlobals());
	const ISSUER = "GDC7X2MXTYSAKUUGAIQ7J7RPEIM7GXSAIWFYWWH4GLNFECQVJJLB2EEU";
	const account = (home?: string) => () =>
		new Response(JSON.stringify(home ? { home_domain: home } : {}), {
			headers: { "content-type": "application/json" },
		});
	const HORIZON = `https://horizon.stellar.org/accounts/${ISSUER}`;
	const asset = { code: "AUDD", issuer: ISSUER };

	it("named: the toml at the account's home_domain lists it", async () => {
		stubFetch({
			[HORIZON]: account("n1.example"),
			"https://n1.example/.well-known/stellar.toml": () =>
				new Response(
					`ACCOUNTS=["${ISSUER}"]\n[DOCUMENTATION]\nORG_NAME="AUDC PTY LTD"\n`,
				),
		});
		expect(await readIssuerOfRecord(asset)).toMatchObject({
			outcome: "named",
			name: "AUDC PTY LTD",
			sourceUrl: "https://n1.example/.well-known/stellar.toml",
			note: null,
		});
	});

	it("not named: the account sets no home_domain", async () => {
		stubFetch({ [HORIZON]: account() });
		expect(await readIssuerOfRecord(asset)).toMatchObject({
			outcome: "not-named",
			sourceUrl: null,
			why: "the issuer account sets no home_domain",
		});
	});

	it("not named: the toml was read and does not list the account", async () => {
		stubFetch({
			[HORIZON]: account("n2.example"),
			"https://n2.example/.well-known/stellar.toml": () =>
				new Response('[DOCUMENTATION]\nORG_NAME="Someone Else Inc."\n'),
		});
		expect(await readIssuerOfRecord(asset)).toMatchObject({
			outcome: "not-named",
			sourceUrl: "https://n2.example/.well-known/stellar.toml",
			why: "the toml does not list the issuer account",
		});
	});

	it("could not read: the toml host answered 503", async () => {
		stubFetch({
			[HORIZON]: account("n3.example"),
			"https://n3.example/.well-known/stellar.toml": () =>
				new Response("busy", { status: 503 }),
		});
		const r = await readIssuerOfRecord(asset);
		expect(r.outcome).toBe("could-not-read");
	});
});

/**
 * Review 2026-11-04: paymentsCount24h took the newest snapshot at or before a
 * day back with no lower bound, so a gap in the series turned a lifetime of
 * payments into a "24h" figure. supplyChange7d had the same unbounded
 * lookback. A baseline now has to fall inside a stated window.
 */
describe("nearestSnapshot: a baseline only from inside its window", () => {
	const H = 3600e3;
	const now = Date.parse("2026-11-05T00:25:00.000Z");
	const snap = (hoursAgo: number, v: number) => ({
		measuredAt: new Date(now - hoursAgo * H).toISOString(),
		paymentsCountLifetime: v,
	});

	it("24h: a 10-day-old snapshot is no baseline (it would count ten days)", () => {
		expect(nearestSnapshot([snap(240, 1)], now - 24 * H, 12 * H)).toBeNull();
	});

	it("24h: a 6-hour-old snapshot is too recent; one from 30 hours back is used", () => {
		expect(
			nearestSnapshot([snap(6, 1), snap(30, 2)], now - 24 * H, 12 * H),
		).toEqual(snap(30, 2));
	});

	it("24h: the snapshot nearest a day back wins", () => {
		expect(
			nearestSnapshot(
				[snap(30, 2), snap(24, 3), snap(14, 4)],
				now - 24 * H,
				12 * H,
			),
		).toEqual(snap(24, 3));
	});

	it("7d: a 30-day-old snapshot is no baseline; one about a week back is", () => {
		expect(
			nearestSnapshot([snap(24 * 30, 1)], now - 7 * 24 * H, 24 * H),
		).toBeNull();
		expect(
			nearestSnapshot([snap(24 * 7 + 6, 5)], now - 7 * 24 * H, 24 * H),
		).toEqual(snap(24 * 7 + 6, 5));
	});

	it("a snapshot with no readable date is skipped, never treated as in range", () => {
		expect(
			nearestSnapshot(
				[{ measuredAt: "not a date", paymentsCountLifetime: 9 }],
				now - 24 * H,
				12 * H,
			),
		).toBeNull();
	});
});

/** A body that sends its headers and a first chunk, then fails: what a
 *  host that stalls past the timeout or resets mid-body looks like. */
const brokenBody = () =>
	new Response(
		new ReadableStream({
			start(c) {
				c.enqueue(new TextEncoder().encode('ACCOUNTS=["'));
				c.error(new Error("socket reset mid-body"));
			},
		}),
	);

/** Route the given URLs; every other URL answers 404 (fast, never thrown). */
function stubFetch404(routes: Record<string, () => Response>) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string | URL) => {
			const route = routes[String(input)];
			return route ? route() : new Response("not found", { status: 404 });
		}),
	);
}

describe("a failed body read is one row's could-not-read, never a run-wide failure (re-check item 1)", () => {
	afterEach(() => vi.unstubAllGlobals());
	const ISSUER = "GBROKENBODYISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
	const account = () =>
		new Response(JSON.stringify({ home_domain: "broken.example" }));

	it("readIssuerToml answers failed when the body read rejects", async () => {
		stubFetch404({
			"https://broken.example/.well-known/stellar.toml": brokenBody,
		});
		const r = await readIssuerToml("broken.example");
		expect(r.kind).toBe("failed");
	});

	it("readIssuerOfRecord answers could-not-read", async () => {
		stubFetch404({
			[`https://horizon.stellar.org/accounts/${ISSUER}`]: account,
			"https://broken.example/.well-known/stellar.toml": brokenBody,
		});
		expect(
			(await readIssuerOfRecord({ code: "TST", issuer: ISSUER })).outcome,
		).toBe("could-not-read");
	});

	it("measureStablecoin still resolves with that row, as its contract says", async () => {
		stubFetch404({
			[`https://horizon.stellar.org/accounts/${ISSUER}`]: account,
			"https://broken.example/.well-known/stellar.toml": brokenBody,
		});
		const m = await measureStablecoin({
			code: "TST",
			issuer: ISSUER,
			domain: "logo-broken.example",
			company: "Test Brand",
			peg: "USD",
			assetType: "Unclassified",
			assetTypeSource: { url: null, checkedOn: "2026-11-11", note: "test" },
		});
		expect(m.issuerOfRecordRead.outcome).toBe("could-not-read");
		expect(m.code).toBe("TST");
	});
});

describe("a 200 that is not a stellar.toml is a failed read, never a checked absence (re-check item 2)", () => {
	afterEach(() => vi.unstubAllGlobals());
	const ISSUER = "GNOTATOMLISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
	const bodies: Array<[string, () => Response]> = [
		[
			"text/plain Not Found",
			() =>
				new Response("Not Found", {
					headers: { "content-type": "text/plain" },
				}),
		],
		[
			"JSON error",
			() =>
				new Response('{"error":"not found"}', {
					headers: { "content-type": "application/json" },
				}),
		],
		["empty body", () => new Response("")],
	];
	for (const [label, body] of bodies)
		it(`${label}: could-not-read, so a stored name is kept`, async () => {
			stubFetch404({
				[`https://horizon.stellar.org/accounts/${ISSUER}`]: () =>
					new Response(JSON.stringify({ home_domain: "notoml.example" })),
				"https://notoml.example/.well-known/stellar.toml": body,
			});
			expect((await readIssuerToml("notoml.example")).kind).toBe("failed");
			expect(
				(await readIssuerOfRecord({ code: "TST", issuer: ISSUER })).outcome,
			).toBe("could-not-read");
		});
});

describe("a 404 at the home_domain keeps the stored check (re-check item 10)", () => {
	afterEach(() => vi.unstubAllGlobals());
	it("could-not-read: a lapsed or parked domain does not prove the issuer stopped issuing", async () => {
		const ISSUER = "GPARKEDDOMAINISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
		stubFetch404({
			[`https://horizon.stellar.org/accounts/${ISSUER}`]: () =>
				new Response(JSON.stringify({ home_domain: "parked.example" })),
		});
		expect(
			(await readIssuerOfRecord({ code: "TST", issuer: ISSUER })).outcome,
		).toBe("could-not-read");
	});
});

/**
 * Re-check items 5 and 6: one snapshot per UTC day, upserted by every run,
 * left the 24h baseline at the day's last run, so the span ran 30, 12, 18
 * and 24 hours by the hour of the run. The row now keeps its own recent
 * readings and the figure needs one 20 to 28 hours back; the windows live in
 * these functions, so the writer passes no numbers of its own.
 */
describe("paymentsCount24h measures about 24 hours", () => {
	const H = 3600e3;
	const at = "2026-11-05T00:25:00.000Z";
	const atMs = Date.parse(at);
	const reading = (hoursAgo: number, count: number) => ({
		at: new Date(atMs - hoursAgo * H).toISOString(),
		count,
	});

	it("uses the reading nearest 24 hours back", () => {
		const h = [
			reading(30, 100),
			reading(24, 110),
			reading(18, 120),
			reading(6, 140),
		];
		expect(paymentsCount24hFrom(h, at, 150)).toBe(40);
	});

	it("null when the nearest readings are 18 and 30 hours back: never a span stretched or cut to fit", () => {
		expect(
			paymentsCount24hFrom([reading(30, 100), reading(18, 120)], at, 150),
		).toBeNull();
	});

	it("the band is 20 to 28 hours, both ends inside", () => {
		expect(paymentsCount24hFrom([reading(20, 100)], at, 150)).toBe(50);
		expect(paymentsCount24hFrom([reading(28, 100)], at, 150)).toBe(50);
		expect(paymentsCount24hFrom([reading(19.9, 100)], at, 150)).toBeNull();
		expect(paymentsCount24hFrom([reading(28.1, 100)], at, 150)).toBeNull();
	});

	it("no count now, or a counter that went backwards, is null", () => {
		expect(paymentsCount24hFrom([reading(24, 100)], at, null)).toBeNull();
		expect(paymentsCount24hFrom([reading(24, 200)], at, 150)).toBeNull();
	});

	it("the history appends this run, keeps two days, drops junk and repeats", () => {
		const prev = [
			reading(49, 1),
			reading(24, 2),
			{ at: "not a date", count: 3 },
			{ at: reading(12, 0).at, count: Number.NaN },
			reading(6, 4),
		];
		expect(nextPaymentsHistory(prev, at, 5)).toEqual([
			reading(24, 2),
			reading(6, 4),
			{ at, count: 5 },
		]);
		// No count this run: nothing appended; a repeated run is not doubled.
		expect(nextPaymentsHistory([reading(6, 4)], at, null)).toEqual([
			reading(6, 4),
		]);
		expect(nextPaymentsHistory([{ at, count: 5 }], at, 5)).toEqual([
			{ at, count: 5 },
		]);
		expect(nextPaymentsHistory(undefined, at, 5)).toEqual([{ at, count: 5 }]);
	});
});

describe("supplyChange7d's baseline window", () => {
	const D = 864e5;
	const atMs = Date.parse("2026-11-05T00:25:00.000Z");
	const snap = (daysAgo: number, supply: number) => ({
		measuredAt: new Date(atMs - daysAgo * D).toISOString(),
		supply,
	});

	it("queries 6 to 8 days back", () => {
		expect(supplyBaselineWindow(atMs)).toEqual({
			from: new Date(atMs - 8 * D).toISOString(),
			to: new Date(atMs - 6 * D).toISOString(),
		});
	});

	it("takes the snapshot nearest 7 days back inside the window, else none", () => {
		expect(supplyBaseline([snap(6.25, 1), snap(7.25, 2)], atMs)).toEqual(
			snap(7.25, 2),
		);
		expect(supplyBaseline([snap(30, 1)], atMs)).toBeNull();
		expect(supplyBaseline([snap(5.9, 1), snap(8.1, 2)], atMs)).toBeNull();
	});
});

/**
 * sls-107, the write itself: what the next refresh sends for a row once the
 * owner sets STABLECOIN_ISSUER_OF_RECORD_WRITE=on, composed by rowIdentity
 * exactly as scripts/refresh-stablecoins.ts composes it, from the registry's
 * own rows. The network is stubbed with the tomls' real shapes (read
 * 2026-11-11, cut to the lines that matter); any other URL answers 404, so
 * supply is never measured here and the issuer of record must not need it.
 */
describe("what the next refresh writes with the issuer-of-record write on (sls-107)", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
	const AT = "2026-11-12T00:25:00.000Z";
	const reg = (code: string) => {
		const a = STABLECOIN_REGISTRY.find((r) => r.code === code);
		if (!a) throw new Error(`${code} is not in the registry`);
		return a;
	};
	const AUDD = reg("AUDD");
	const MGUSD = reg("MGUSD");
	const C1 = STABLECOIN_REGISTRY.filter((a) => a.company === "Currency One");
	const account = (home?: string) => () =>
		new Response(JSON.stringify(home ? { home_domain: home } : {}));
	/** Run a measurement on fake timers, stepping the clock until it settles,
	 *  so the pipeline's retry back-offs cost the test no real time. */
	const settle = async <T>(work: () => Promise<T>): Promise<T> => {
		vi.useFakeTimers();
		let done = false;
		const p = work().finally(() => {
			done = true;
		});
		while (!done) await vi.advanceTimersByTimeAsync(500);
		vi.useRealTimers();
		return p;
	};
	const horizon = (issuer: string) =>
		`https://horizon.stellar.org/accounts/${issuer}`;
	const auddToml = `ACCOUNTS=[
"${AUDD.issuer}"
]
VERSION="2.0.0"

[DOCUMENTATION]
ORG_NAME="AUDC PTY LTD"
ORG_URL="https://www.audd.digital"

[[CURRENCIES]]
code="AUDD"
issuer="${AUDD.issuer}"
is_asset_anchored=true
anchor_asset_type="fiat"
desc="Australia's fast, stable, secure fiat-backed stablecoin. Get AUDD today at https://get.audd.digital"
`;
	// The real file lists eight other accounts in ACCOUNTS and each C1 issuer
	// only as a [[CURRENCIES]] issuer.
	const c1Toml = `ACCOUNTS=[
    "GBVR7YGVSPOB2LCFYJABKCCWZLLOQVPIE7ASW55PKWTGJWOB3ZWG67ES",
    "GB7URPVETXTG7RHRKQQJHRD2F4YMC26H55JI2KKN5OBA3PAYPD72OS6R"
]

[DOCUMENTATION]
ORG_NAME="Kinesis Money Panama S.A."
ORG_DESCRIPTION="Kinesis Money Panama is the issuer of institutional asset backed digital currencies"
${C1.map(
	(a) => `
[[CURRENCIES]]
code="${a.code}"
name="Currency One ${a.peg}"
issuer="${a.issuer}"
is_asset_anchored=false
desc="Currency One ${a.peg} is a fully collateralized ${a.peg} stablecoin by Kinesis Money Panama S.A."
`,
).join("")}`;
	const mgusdToml = `ACCOUNTS = [
"GCQLUTKZ373IUGE7Z33JKH5VLRRRLH2LKTU3WEBAGH2MD6AWNYPHUU2Q",
"GDYC7FS3JIBLYIJGDARQXJKM5VQBVM4ZCBB7IMAJJ7BJ3ARQRTHCTIA3"
]

[DOCUMENTATION]
ORG_NAME="MoneyGram Payment Systems, Inc."
ORG_URL="https://www.moneygram.com/"

[[CURRENCIES]]
code="MGUSD"
issuer="${MGUSD.issuer}"
contract="CDK2LDSYUKPEFN3HNE7K7ETUT3VIOBHSOXAK5CTO4A4RKKZQUCAIWCJA"
name="MoneyGram USD"
desc="USD-backed stablecoin issued by Bridge on behalf of MoneyGram"
anchor_asset_type="fiat"
is_asset_anchored=true
`;
	const routes: Record<string, () => Response> = {
		[horizon(AUDD.issuer)]: account("audd.digital"),
		[horizon(MGUSD.issuer)]: account("mgusd.moneygram.com"),
		...Object.fromEntries(
			C1.map((a) => [horizon(a.issuer), account("currency.one")]),
		),
		"https://audd.digital/.well-known/stellar.toml": () =>
			new Response(auddToml),
		"https://currency.one/.well-known/stellar.toml": () => new Response(c1Toml),
		"https://mgusd.moneygram.com/.well-known/stellar.toml": () =>
			new Response(mgusdToml),
	};

	it("the nine rows Raven checks and MGUSD: the toml's ORG_NAME with its URL and date, the brand kept as company", async () => {
		expect(C1.map((a) => a.code).sort()).toEqual(
			[
				"C1AED",
				"C1AUD",
				"C1CAD",
				"C1CHF",
				"C1EUR",
				"C1GBP",
				"C1SGD",
				"C1USD",
			].sort(),
		);
		expect(new Set(C1.map((a) => a.issuer)).size).toBe(8);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(AT));
		stubFetch404(routes);
		const measured = await measureRegistry([AUDD, ...C1, MGUSD], {
			concurrency: 10,
			staggerMs: 0,
		});
		const written = measured.map((m) => rowIdentity(m, undefined, true));
		const facts = (code: string) => {
			const w = written.find((r) => r.code === code);
			return (
				w && {
					company: w.company,
					issuerOfRecord: w.issuerOfRecord,
					issuerOfRecordCheck: w.issuerOfRecordCheck,
					issuerOfRecordSourceUrl: w.issuerOfRecordSourceUrl,
					issuerOfRecordAsOf: w.issuerOfRecordAsOf,
					issuerOfRecordNote: w.issuerOfRecordNote,
				}
			);
		};
		expect(facts("AUDD")).toEqual({
			company: "Novatti Group",
			issuerOfRecord: "AUDC PTY LTD",
			issuerOfRecordCheck: "named",
			issuerOfRecordSourceUrl: "https://audd.digital/.well-known/stellar.toml",
			issuerOfRecordAsOf: AT,
			issuerOfRecordNote: null,
		});
		for (const a of C1)
			expect(facts(a.code), a.code).toEqual({
				company: "Currency One",
				issuerOfRecord: "Kinesis Money Panama S.A.",
				issuerOfRecordCheck: "named",
				issuerOfRecordSourceUrl:
					"https://currency.one/.well-known/stellar.toml",
				issuerOfRecordAsOf: AT,
				issuerOfRecordNote: null,
			});
		expect(facts("MGUSD")).toEqual({
			company: "MoneyGram",
			issuerOfRecord: "MoneyGram Payment Systems, Inc.",
			issuerOfRecordCheck: "named",
			issuerOfRecordSourceUrl:
				"https://mgusd.moneygram.com/.well-known/stellar.toml",
			issuerOfRecordAsOf: AT,
			issuerOfRecordNote:
				'stellar.toml desc for MGUSD: "USD-backed stablecoin issued by Bridge on behalf of MoneyGram"',
		});
		// None of these rows could be measured (every other URL answered 404),
		// and each is named all the same.
		expect(measured.every((m) => m.basis !== "live")).toBe(true);
		// What the API then serves from those rows, the class included.
		const served = storeRowToApi(
			written.find((r) => r.code === "AUDD") as StoreRow,
		);
		expect(served).toMatchObject({
			company: "Novatti Group",
			issuerOfRecord: "AUDC PTY LTD",
			issuerOfRecordCheck: "named",
			issuerOfRecordAsOf: AT,
			assetType: "Fiat-Backed",
			assetTypeSourceUrl: "https://www.audd.digital",
			assetTypeNote: expect.stringContaining("cash or cash equivalents"),
		});
		expect(Date.parse(String(served.assetTypeAsOf))).toBe(
			Date.parse("2026-11-11"),
		);
	});

	it("a failed Horizon read leaves the row unmeasured and still named", async () => {
		stubFetch404({
			...routes,
			[`https://horizon.stellar.org/assets?asset_code=MGUSD&asset_issuer=${MGUSD.issuer}&limit=1`]:
				() => new Response("unavailable", { status: 503 }),
		});
		const [m] = await settle(() =>
			measureRegistry([MGUSD], { concurrency: 1, staggerMs: 0 }),
		);
		expect(m.basis).toBe("unmeasured");
		expect(m.note).toBe("Measurement failed: HTTP 503");
		expect(rowIdentity(m, undefined, true)).toMatchObject({
			company: "MoneyGram",
			issuerOfRecord: "MoneyGram Payment Systems, Inc.",
			issuerOfRecordCheck: "named",
		});
	});

	it("supply and trustlines come from Horizon's asset record; the paid explorer is never asked", async () => {
		const explorer = vi.fn(
			() => new Response('{"error":"Payment Required"}', { status: 402 }),
		);
		stubFetch404({
			...routes,
			[`https://horizon.stellar.org/assets?asset_code=MGUSD&asset_issuer=${MGUSD.issuer}&limit=1`]:
				() =>
					new Response(
						JSON.stringify({
							_embedded: {
								records: [
									{
										balances: {
											authorized: "1000.5000000",
											authorized_to_maintain_liabilities: "0.0000000",
											unauthorized: "0.0000000",
										},
										claimable_balances_amount: "10.0000000",
										liquidity_pools_amount: "0.0000000",
										contracts_amount: "0.0000000",
										accounts: {
											authorized: 120,
											authorized_to_maintain_liabilities: 1,
											unauthorized: 2,
										},
									},
								],
							},
						}),
					),
			[`https://api.stellar.expert/explorer/public/asset/MGUSD-${MGUSD.issuer}`]:
				explorer,
		});
		const [m] = await settle(() =>
			measureRegistry([MGUSD], { concurrency: 1, staggerMs: 0 }),
		);
		expect(m.holders).toBe(123);
		expect(m.supply).toBe(1010.5);
		expect(m.volume24hUSD).toBeNull();
		expect(m.paymentsCountLifetime).toBeNull();
		expect(explorer).not.toHaveBeenCalled();
	});

	const horizonUrl = `https://horizon.stellar.org/assets?asset_code=MGUSD&asset_issuer=${MGUSD.issuer}&limit=1`;

	it("Horizon answering with no record reads as not listed, not as a lookup failure", async () => {
		stubFetch404({
			...routes,
			[horizonUrl]: () =>
				new Response(JSON.stringify({ _embedded: { records: [] } })),
		});
		const [m] = await settle(() =>
			measureRegistry([MGUSD], { concurrency: 1, staggerMs: 0 }),
		);
		expect(m.basis).toBe("unmeasured");
		expect(m.note).toMatch(/^Horizon answered and lists no asset/);
	});

	it("a record with no balances is unmeasured, said in Horizon's name", async () => {
		stubFetch404({
			...routes,
			[horizonUrl]: () =>
				new Response(JSON.stringify({ _embedded: { records: [{}] } })),
		});
		const [m] = await settle(() =>
			measureRegistry([MGUSD], { concurrency: 1, staggerMs: 0 }),
		);
		expect(m.basis).toBe("unmeasured");
		expect(m.note).toBe("Supply unavailable from Horizon at measurement time.");
	});

	it("a Horizon rate limit is could-not-check, with the mark the retry pass keys on", async () => {
		stubFetch404({
			...routes,
			[horizonUrl]: () => new Response("slow down", { status: 429 }),
		});
		const [m] = await settle(() =>
			measureRegistry([MGUSD], { concurrency: 1, staggerMs: 0 }),
		);
		expect(m.basis).toBe("unmeasured");
		expect(m.note).toContain(RATE_LIMIT_MARK);
	});

	it("USDT0: not named, with the reason, what it leaves unconfirmed and the date, and no name taken from the brand", async () => {
		const USDT0 = reg("USDT0");
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(AT));
		stubFetch404({ [horizon(USDT0.issuer)]: account() });
		const [m] = await measureRegistry([USDT0], {
			concurrency: 1,
			staggerMs: 0,
		});
		const row = rowIdentity(m, undefined, true);
		const why =
			"the issuer account sets no home_domain: usdt0.to's stellar.toml (https://usdt0.to/.well-known/stellar.toml, read 2026-11-11) names ORG_NAME Everdawn Labs Limited and lists this account as the USDT0 issuer, but the account sets no home_domain pointing to it, so the link cannot be confirmed from the account side";
		expect(row).toMatchObject({
			company: "Tether (USDT0)",
			issuerOfRecord: null,
			issuerOfRecordCheck: "not-named",
			issuerOfRecordSourceUrl: null,
			issuerOfRecordAsOf: AT,
			issuerOfRecordNote: why,
		});
		expect(storeRowToApi(row as StoreRow)).toMatchObject({
			company: "Tether (USDT0)",
			issuerOfRecord: null,
			issuerOfRecordCheck: "not-named",
			issuerOfRecordNote: why,
		});
	});

	it("USDT0's note is the reason only while the account sets no home_domain: pointed at a toml that lists it, the account is named from there", async () => {
		const USDT0 = reg("USDT0");
		stubFetch404({
			[horizon(USDT0.issuer)]: account("usdt0.to"),
			"https://usdt0.to/.well-known/stellar.toml": () =>
				new Response(
					`ACCOUNTS = ["${USDT0.issuer}"]\n[DOCUMENTATION]\nORG_NAME = "Everdawn Labs Limited"\n`,
				),
		});
		const [m] = await measureRegistry([USDT0], {
			concurrency: 1,
			staggerMs: 0,
		});
		expect(m.issuerOfRecordRead).toMatchObject({
			outcome: "named",
			name: "Everdawn Labs Limited",
			note: null,
		});
	});

	it("BRLT: a toml host that cannot be reached writes back a stored check, and otherwise a dated could-not-read naming the one-sided toml (sls-120)", async () => {
		const BRLT = reg("BRLT");
		const brltRoutes = {
			[horizon(BRLT.issuer)]: account("sep.stablex.cloud"),
			// The runner's read: DNS has no such host, so fetch throws as
			// Node's does (checked 2026-11-23: cause.code ENOTFOUND).
			"https://sep.stablex.cloud/.well-known/stellar.toml": () => {
				throw Object.assign(new TypeError("fetch failed"), {
					cause: Object.assign(
						new Error("getaddrinfo ENOTFOUND sep.stablex.cloud"),
						{ code: "ENOTFOUND" },
					),
				});
			},
		};
		stubFetch404(brltRoutes);
		const [m] = await settle(() =>
			measureRegistry([BRLT], { concurrency: 1, staggerMs: 0 }),
		);
		expect(m.issuerOfRecordRead.outcome).toBe("could-not-read");
		// A check stored by an earlier read comes back whole, its date unmoved.
		const STORED = {
			issuerOfRecord: "Stored Issuer Ltd",
			issuerOfRecordCheck: "named",
			issuerOfRecordSourceUrl:
				"https://sep.stablex.cloud/.well-known/stellar.toml",
			issuerOfRecordAsOf: "2026-11-05T00:25:00.000Z",
			issuerOfRecordNote: null,
		};
		expect(
			rowIdentity(m, { company: "Settle Network", ...STORED }, true),
		).toMatchObject({ company: "Settle Network", ...STORED });
		// Nothing completed is stored for BRLT: the try is stored, dated, with
		// what failed and the toml that lists the account from the other side.
		const tried = rowIdentity(m, { company: "Settle Network" }, true);
		const at =
			m.issuerOfRecordRead.outcome === "could-not-read" &&
			m.issuerOfRecordRead.at;
		expect(at).toMatch(/^\d{4}-\d\d-\d\dT/);
		expect(tried).toMatchObject({
			company: "Settle Network",
			issuerOfRecord: null,
			issuerOfRecordCheck: "could-not-read",
			issuerOfRecordSourceUrl: null,
			issuerOfRecordAsOf: at,
		});
		const note = String(tried.issuerOfRecordNote);
		expect(note).toMatch(
			/^https:\/\/sep\.stablex\.cloud\/\.well-known\/stellar\.toml: the host name does not resolve \(ENOTFOUND\)\. The stellar\.toml at /,
		);
		expect(note).toContain(
			"https://pubnet-sep.latamex.com/.well-known/stellar.toml (read 2026-11-23) names ORG_NAME Relay Tech Services Ltd and lists this account as the BRLT issuer",
		);
		expect(note).toContain("cannot be confirmed from the account side");
		expect(storeRowToApi(tried as StoreRow)).toMatchObject({
			issuerOfRecord: null,
			issuerOfRecordCheck: "could-not-read",
			issuerOfRecordAsOf: at,
			issuerOfRecordNote: note,
		});
	});

	it("BRLT's curated note rides only on the unresolvable home_domain: another failure is stored without it", async () => {
		const BRLT = reg("BRLT");
		const whyOf = async (routes: Record<string, () => Response>) => {
			vi.unstubAllGlobals();
			stubFetch404(routes);
			const [m] = await settle(() =>
				measureRegistry([BRLT], { concurrency: 1, staggerMs: 0 }),
			);
			const r = m.issuerOfRecordRead;
			return r.outcome === "could-not-read"
				? r.why
				: `not a failed read: ${r.outcome}`;
		};
		// The name resolves again and the host answers 404.
		expect(
			await whyOf({ [horizon(BRLT.issuer)]: account("sep.stablex.cloud") }),
		).toBe(
			"https://sep.stablex.cloud/.well-known/stellar.toml answered not found; kept as a failed read, since a lapsed or parked domain answers the same",
		);
		// Horizon cannot be reached.
		expect(
			await whyOf({
				[horizon(BRLT.issuer)]: () => {
					throw new TypeError("fetch failed");
				},
			}),
		).not.toContain("Relay Tech Services Ltd");
		// Another name that does not resolve is not the one the note was
		// written for.
		expect(
			await whyOf({
				[horizon(BRLT.issuer)]: account("other.example"),
				"https://other.example/.well-known/stellar.toml": () => {
					throw Object.assign(new TypeError("fetch failed"), {
						cause: { code: "ENOTFOUND" },
					});
				},
			}),
		).toBe(
			"https://other.example/.well-known/stellar.toml: the host name does not resolve (ENOTFOUND)",
		);
	});

	it("EURC: the toml's ORG_NAME stays the issuer of record, and the note quotes Circle's EURC terms naming the legal issuer (sls-119)", async () => {
		const EURC = STABLECOIN_REGISTRY.find(
			(a) =>
				a.issuer === "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
		);
		if (!EURC) throw new Error("Circle's EURC is not in the registry");
		// Circle's toml as read 2026-11-23: one ORG_NAME, no issuing party in
		// the EURC desc.
		const circleToml = (orgName: string) => () =>
			new Response(
				`ACCOUNTS=["${EURC.issuer}"]\n[DOCUMENTATION]\nORG_NAME="${orgName}"\n\n[[CURRENCIES]]\ncode="EURC"\nissuer="${EURC.issuer}"\ndesc="EURC is a fully collateralized euro stablecoin."\n`,
			);
		const run = async (orgName: string) => {
			stubFetch404({
				[horizon(EURC.issuer)]: account("circle.com"),
				"https://circle.com/.well-known/stellar.toml": circleToml(orgName),
			});
			const [m] = await measureRegistry([EURC], {
				concurrency: 1,
				staggerMs: 0,
			});
			return rowIdentity(m, undefined, true);
		};
		const row = await run("Circle Internet Financial, LLC");
		expect(row).toMatchObject({
			company: "Circle",
			issuerOfRecord: "Circle Internet Financial, LLC",
			issuerOfRecordCheck: "named",
			issuerOfRecordSourceUrl: "https://circle.com/.well-known/stellar.toml",
		});
		const note = String(row.issuerOfRecordNote);
		expect(note).toContain(
			"https://www.circle.com/legal/eurc-terms, read 2026-11-23",
		);
		expect(note).toContain(
			"EURC is a digital token issued by Circle Internet Financial Europe SAS",
		);
		expect(note).toContain("acts as a reseller of EURC");
		// Every reader of the note finds the legal issuer: "is EURC issued by
		// Circle Internet Financial Europe SAS" is supported from this row.
		const v = issuedVerdict({
			ticker: "EURC",
			company: "Circle Internet Financial Europe SAS",
			rows: [{ ticker: "EURC", ...row }],
			corpusTotal: 1,
		});
		expect(v.verdict).toBe("supported");
		expect(v.statement).toMatch(
			/^Circle Internet Financial Europe SAS, the issuer its own terms name, issues EURC/,
		);
		// The LLC those terms call a reseller is contradicted by them, never
		// supported as issuing EURC because the toml names it.
		const llc = issuedVerdict({
			ticker: "EURC",
			company: "Circle Internet Financial, LLC",
			rows: [{ ticker: "EURC", ...row }],
			corpusTotal: 1,
		});
		expect(llc.verdict).toBe("contradicted");
		expect(llc.statement).toMatch(
			/^The issuer's own terms say Circle Internet Financial Europe SAS issues EURC \(issuer account GDHU6WRG/,
		);
		expect(llc.statement).not.toMatch(
			/Circle Internet Financial, LLC[^.;]* issues/,
		);
		// The brand still matches.
		expect(
			issuedVerdict({
				ticker: "EURC",
				company: "Circle",
				rows: [{ ticker: "EURC", ...row }],
				corpusTotal: 1,
			}).verdict,
		).toBe("supported");
		// The asset page says who issues it, and what the toml names.
		const apiRow = storeRowToApi(row as StoreRow);
		expect(issuingParty(apiRow)).toBe("Circle Internet Financial Europe SAS");
		expect(issuerOfRecordLine(apiRow, "Nov 23, 2026")).toBe(
			"Issued by Circle Internet Financial Europe SAS, per its issuer's own terms; its stellar.toml, as read Nov 23, 2026, names Circle Internet Financial, LLC",
		);
		// Until the refresh stores the note, the row says what it holds.
		const unread = { ...apiRow, issuerOfRecordNote: null };
		expect(disclosedIssuer(unread)).toBeNull();
		expect(issuerOfRecordLine(unread, "Nov 23, 2026")).toBe(
			"Issued by Circle Internet Financial, LLC, per its stellar.toml as read Nov 23, 2026",
		);
		// The note is served only while the toml names another party: were the
		// ORG_NAME the legal issuer, it would add nothing.
		vi.unstubAllGlobals();
		expect(
			(await run("Circle Internet Financial Europe SAS")).issuerOfRecordNote,
		).toBeNull();
	});

	it("USDC and MGUSD keep their wording: no issuer terms override the toml there", () => {
		const usdc = {
			ticker: "USDC",
			issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
			issuerOfRecord: "Circle Internet Financial, LLC",
			issuerOfRecordCheck: "named",
			issuerOfRecordNote: null,
		};
		expect(issuingParty(usdc)).toBe("Circle Internet Financial, LLC");
		expect(issuerOfRecordLine(usdc, "Nov 23, 2026")).toBe(
			"Issued by Circle Internet Financial, LLC, per its stellar.toml as read Nov 23, 2026",
		);
		const mgusd = {
			ticker: "MGUSD",
			issuer: MGUSD.issuer,
			issuerOfRecord: "MoneyGram Payment Systems, Inc.",
			issuerOfRecordCheck: "named",
			issuerOfRecordNote:
				'stellar.toml desc for MGUSD: "MGUSD is a USD-backed stablecoin issued by Bridge on behalf of MoneyGram."',
		};
		expect(disclosedIssuer(mgusd)).toBeNull();
		expect(issuerOfRecordLine(mgusd, "Nov 23, 2026")).toBe(
			"Issued by MoneyGram Payment Systems, Inc., per its stellar.toml as read Nov 23, 2026",
		);
		const bridge = issuedVerdict({
			ticker: "MGUSD",
			company: "Bridge",
			rows: [mgusd],
			corpusTotal: 1,
		});
		expect(bridge.statement).toMatch(
			/^Bridge, the party its stellar\.toml's desc names as issuing it, issues MGUSD/,
		);
		expect(
			issuedVerdict({
				ticker: "MGUSD",
				company: "MoneyGram Payment Systems, Inc.",
				rows: [mgusd],
				corpusTotal: 1,
			}).verdict,
		).toBe("supported");
	});

	it("with the write off, the run sends no issuer-of-record key and still sends the brand", async () => {
		stubFetch404(routes);
		const [m] = await measureRegistry([AUDD], { concurrency: 1, staggerMs: 0 });
		const row = rowIdentity(m, { issuerOfRecord: "AUDC PTY LTD" }, false);
		expect(row.company).toBe("Novatti Group");
		expect(
			Object.keys(row).filter((k) => k.startsWith("issuerOfRecord")),
		).toEqual([]);
	});
});

/**
 * sls-107, the class: every row's class is the issuer's own statement of what
 * backs the unit, curated in the registry with its URL and read date, and the
 * refresh writes it as it is. One row per class, through the same measure,
 * write and serve path the refresh and the API use.
 */
describe("a class on every row, from the issuer's own statement (sls-107)", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
	const reg = (code: string) => {
		const a = STABLECOIN_REGISTRY.find((r) => r.code === code);
		if (!a) throw new Error(`${code} is not in the registry`);
		return a;
	};
	const ONE_PER_CLASS: Array<[string, string, string | null, string]> = [
		["USDC", "Fiat-Backed", "https://www.circle.com/usdc", "redeemable 1:1"],
		["USDT0", "Crypto-Backed", "https://docs.usdt0.to", "USDT locked"],
		["USDV", "Multi-Asset-Backed", "https://valtorum.com/", "gold"],
		["USDM1", "Treasury-Backed", "https://usdm1.com", "US Treasury"],
		["USDY", "Yield Stablecoin", "https://ondo.finance/usdy", "yield"],
		["BRLT", "Unclassified", null, "Checked 2026-11-11"],
	];

	it("one row per class: the class, the issuer's page, the day read and what it says, written and served as curated", async () => {
		expect(new Set(ONE_PER_CLASS.map(([, c]) => c))).toEqual(
			new Set(STABLECOIN_ASSET_TYPES),
		);
		stubFetch404({});
		const measured = await measureRegistry(
			ONE_PER_CLASS.map(([code]) => reg(code)),
			{ concurrency: 10, staggerMs: 0 },
		);
		for (const [code, cls, url, says] of ONE_PER_CLASS) {
			const m = measured.find((x) => x.code === code);
			const served = storeRowToApi(
				rowIdentity(m as MeasuredStablecoin, undefined, false) as StoreRow,
			);
			expect(served.assetType, code).toBe(cls);
			expect(served.assetTypeSourceUrl, code).toBe(url);
			expect(served.assetTypeAsOf, code).toBe("2026-11-11");
			expect(served.assetTypeNote, code).toContain(says);
		}
	});

	it("never from a toml's anchor fields: USDZ's toml says crypto, its issuer's words say fiat, and the row is Fiat-Backed", async () => {
		const USDZ = reg("USDZ");
		stubFetch404({
			"https://zeam.money/.well-known/stellar.toml": () =>
				new Response(
					`[[CURRENCIES]]\ncode = "USDZ"\nissuer = "${USDZ.issuer}"\nis_asset_anchored = true\nanchor_asset_type = "crypto"\n`,
				),
		});
		const [m] = await measureRegistry([USDZ], {
			concurrency: 1,
			staggerMs: 0,
		});
		expect(m.assetType).toBe("Fiat-Backed");
		expect(m.assetTypeNote).toContain("1:1 backed by fiat");
	});

	it("BRLT: its curated note is served after a measurement failure, not dropped", async () => {
		const BRLT = reg("BRLT");
		stubFetch404({
			[`https://horizon.stellar.org/assets?asset_code=BRLT&asset_issuer=${BRLT.issuer}&limit=1`]:
				() => new Response("unavailable", { status: 503 }),
		});
		vi.useFakeTimers();
		let done = false;
		const p = measureRegistry([BRLT], { concurrency: 1, staggerMs: 0 }).finally(
			() => {
				done = true;
			},
		);
		while (!done) await vi.advanceTimersByTimeAsync(500);
		const [m] = await p;
		expect(m.note).toBe(
			"Measurement failed: HTTP 503. The issuer account's home_domain, sep.stablex.cloud, did not resolve when checked on 2026-11-11, so its stellar.toml cannot be read: neither the issuer of record nor the toml's listing of the account can be checked.",
		);
		expect(m.assetType).toBe("Unclassified");
	});
});

/**
 * sls-107, owner decision 2026-11-11: ZUSD and GYEN (wound down by their
 * issuer, initial redemption period ending 11 November 2026), VEUR (VNX
 * discontinued its exchange services, holders to settle by 22 May 2026) and
 * GBPZ (its issuer calls it a derivative, not redeemable for fiat) leave the
 * registry the way BRL and UAH did: the entry is dropped with a dated
 * reason, and the next refresh stamps retiredAt on the stored row.
 */
describe("retiring ZUSD, GYEN, VEUR and GBPZ, as BRL and UAH were", () => {
	const RETIRED = [
		"GBPZ-GCTG4YT2",
		"GYEN-GDF6VOEG",
		"VEUR-GDXLSLCO",
		"ZUSD-GDF6VOEG",
	];
	// The 41 rows GET /api/stablecoins served on 2026-11-11, and a row
	// retired earlier, which is never stamped again.
	const SERVED_2026_11_11 = [
		"APSEURM-GB7OUO5N",
		"APSUSDM-GB7OUO5N",
		"ARS-GCYE7C77",
		"ARST-GCSAZVWX",
		"AUDD-GDC7X2MX",
		"BRLT-GCHQ3F2B",
		"C1AED-GD7VYLR6",
		"C1AUD-GDG3E67K",
		"C1CAD-GDJNFIHU",
		"C1CHF-GDVQ56KP",
		"C1EUR-GCCMR4S7",
		"C1GBP-GBH6CRMD",
		"C1SGD-GB6CWDUN",
		"C1USD-GDCDFF6Z",
		"CLPX-GDYSPBVZ",
		"EURC-GAQRF3UG",
		"EURC-GDHU6WRG",
		"EURMTL-GACKTN5D",
		"EURS-GC5FGCDE",
		"GBPZ-GCTG4YT2",
		"GYEN-GDF6VOEG",
		"MGUSD-GAIUGZZZ",
		"MXNe-GCQCNWT2",
		"NGNC-GASBV6W7",
		"PEN-GA4TDPNU",
		"PYUSD-GDQE7IXJ",
		"SBC-GCQCNWT2",
		"USDC-GA5ZSEJY",
		"USDGLO-GBBS25EG",
		"USDM-GDHDC4GB",
		"USDM1-GDM5QWWX",
		"USDT0-GATISXX6",
		"USDV-GBLAJOKB",
		"USDY-GAJMPX5N",
		"USDZ-GAKTLPC4",
		"VCHF-GDXLSLCO",
		"VEUR-GDXLSLCO",
		"YLDS-GAC7MOPT",
		"ZARZ-GAROH4EV",
		"ZUSD-GDF6VOEG",
		"mZAR-GCBNWTCC",
	];
	const listed = STABLECOIN_REGISTRY.map(stablecoinId);

	it("the registry no longer lists them; VCHF, from VEUR's issuer account, stays", () => {
		for (const id of RETIRED) expect(listed, id).not.toContain(id);
		expect(listed).toContain("VCHF-GDXLSLCO");
		expect(listed).toHaveLength(37);
	});

	it("the next refresh retires exactly these four of the rows served on 2026-11-11, and never re-stamps a retired row", () => {
		const stored = [
			...SERVED_2026_11_11.map((assetId) => ({ assetId })),
			{ assetId: "OLD-RETIRED", retiredAt: "2026-09-03T00:25:00.000Z" },
		];
		expect(
			rowsToRetire(stored, listed)
				.map((d) => d.assetId)
				.sort(),
		).toEqual(RETIRED);
	});

	it("no class goes unused once GBPZ is gone: Synthetic is not in the vocabulary", () => {
		expect(STABLECOIN_ASSET_TYPES as readonly string[]).not.toContain(
			"Synthetic",
		);
		for (const t of STABLECOIN_ASSET_TYPES)
			if (t !== "Unclassified")
				expect(
					STABLECOIN_REGISTRY.some((a) => a.assetType === t),
					t,
				).toBe(true);
	});
});

describe("the date a row's figures carry", () => {
	it("an unmeasured run keeps the date of the figures it keeps, never its own time", () => {
		const run = "2026-11-22T18:25:00.000Z";
		const live = "2026-11-22T12:25:00.000Z";
		// the previous row was live: its figures are that reading's
		expect(
			storedMeasuredAt(
				"unmeasured",
				run,
				{ basis: "live", measuredAt: live },
				"2026-11-21T18:25:00.000Z",
			),
		).toBe(live);
		// the previous row was itself kept forward: the newest live snapshot
		expect(
			storedMeasuredAt(
				"unmeasured",
				run,
				{ basis: "unmeasured", measuredAt: live },
				"2026-11-20T12:00:00.000Z",
			),
		).toBe("2026-11-20T12:00:00.000Z");
		// no live snapshot on record: the row's own date stays
		expect(
			storedMeasuredAt(
				"unmeasured",
				run,
				{ basis: "unmeasured", measuredAt: "2026-10-01T00:00:00.000Z" },
				null,
			),
		).toBe("2026-10-01T00:00:00.000Z");
		// a new row with nothing to keep: every metric is null at the run
		expect(storedMeasuredAt("unmeasured", run, null, null)).toBe(run);
		expect(
			storedMeasuredAt("live", run, { basis: "live", measuredAt: live }, null),
		).toBe(run);
	});

	it("a failed run never replaces a live snapshot taken the same day", () => {
		expect(replacesDaySnapshot({ basis: "live" }, "unmeasured")).toBe(false);
		expect(replacesDaySnapshot({ basis: "live" }, "live")).toBe(true);
		expect(replacesDaySnapshot({ basis: "unmeasured" }, "unmeasured")).toBe(
			true,
		);
		expect(replacesDaySnapshot(undefined, "unmeasured")).toBe(true);
	});

	it("keeps unread figures forward, never volume or the payment count", () => {
		const prev = {
			supply: 100,
			priceUSD: 1,
			priceBasis: "assumed-peg",
			marketCapUSD: 100,
			holders: 7,
			volume24hUSD: 5000,
			paymentsCountLifetime: 123456,
		};
		const failed = figuresToStore(
			{
				supply: null,
				priceUSD: null,
				priceBasis: null,
				marketCapUSD: null,
				holders: null,
				volume24hUSD: null,
				paymentsCountLifetime: null,
			},
			prev,
		);
		expect(failed.kept).toBe(true);
		expect(failed.figures).toMatchObject({ supply: 100, holders: 7 });
		expect(failed.figures.volume24hUSD).toBeNull();
		expect(failed.figures.paymentsCountLifetime).toBeNull();
	});

	it("hand-checked figures carry the day they were checked", async () => {
		const AUDD = STABLECOIN_REGISTRY.find((a) => a.code === "AUDD");
		if (!AUDD?.hardcodedData) throw new Error("AUDD carries curated figures");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("not found", { status: 404 })),
		);
		const m = await measureStablecoin(AUDD);
		vi.unstubAllGlobals();
		expect(m.basis).toBe("curated-static");
		expect(m.measuredAt.slice(0, 10)).toBe(AUDD.hardcodedData.checkedAt);
	});
});
