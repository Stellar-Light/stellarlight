import { afterEach, describe, expect, it, vi } from "vitest";
import { STABLECOIN_REGISTRY } from "@/data/stablecoin-registry";
import {
	carryIssuerOfRecord,
	issuerOfRecordFromToml,
	issuerOfRecordPatch,
	issuerOfRecordWriteOn,
	measureStablecoin,
	nearestSnapshot,
	nextPaymentsHistory,
	orgLogoFromToml,
	paymentsCount24hFrom,
	readIssuerOfRecord,
	readIssuerToml,
	supplyBaseline,
	supplyBaselineWindow,
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
				{ outcome: "could-not-read", why: "HTTP 503" },
				{ company: "MoneyGram", ...OLD },
			),
		).toEqual(OLD);
	});

	it("could not read with nothing stored stays null: never a guess from company", () => {
		const NONE = {
			issuerOfRecord: null,
			issuerOfRecordCheck: null,
			issuerOfRecordSourceUrl: null,
			issuerOfRecordAsOf: null,
			issuerOfRecordNote: null,
		};
		expect(
			carryIssuerOfRecord(
				{ outcome: "could-not-read", why: "HTTP 503" },
				{ company: "Novatti Group" },
			),
		).toEqual(NONE);
		expect(
			carryIssuerOfRecord({ outcome: "could-not-read", why: "x" }, undefined),
		).toEqual(NONE);
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
