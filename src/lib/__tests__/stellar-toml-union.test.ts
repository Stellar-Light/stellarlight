/**
 * The one stellar.toml parser serves two readers: the partner enrichment
 * (#1909: what it cannot read is could-not-check, never "declares none") and
 * the stablecoin issuer-of-record read (#1900: ACCOUNTS, a currency's desc,
 * escaped names). Each case below needs both halves at once.
 */
import { describe, expect, it } from "vitest";
import { parseStellarToml } from "@/lib/stellar-toml";
import { tomlCapabilities } from "../../../scripts/lib/stellar-toml";

// Well-formed StrKeys built, not written out, so no fixture reads as a key.
const A = `G${"A".repeat(55)}`;
const B = `G${"B".repeat(55)}`;

describe("stellar.toml parser: partner and issuer readers together", () => {
	it("reads ACCOUNTS, one line or many, and never counts it as unread", () => {
		const one = parseStellarToml(
			`ACCOUNTS = ["${A}", "${B}"]\nTRANSFER_SERVER = "https://x.example"`,
		);
		const many = parseStellarToml(
			`ACCOUNTS = [\n  "${A}",\n  "${B}", # treasury\n]\nTRANSFER_SERVER = "https://x.example"`,
		);
		for (const t of [one, many]) {
			expect(t.accounts).toEqual([A, B]);
			expect(t.unreadKeys).toEqual([]);
			expect(tomlCapabilities(t).seps).toEqual(["sep-6"]);
		}
	});

	it("skips a multi-line desc to its delimiter: its lines are never keys", () => {
		const t = parseStellarToml(
			[
				"[[CURRENCIES]]",
				'code = "USDX"',
				`issuer = "${A}"`,
				'desc = """Issued by Example.',
				'code = "EVIL"',
				`issuer = "${B}"`,
				'"""',
				"[[CURRENCIES]]",
				'code = "EURX"',
				`issuer = "${B}"`,
			].join("\n"),
		);
		expect(t.currencies).toEqual([
			{ code: "USDX", issuer: A },
			{ code: "EURX", issuer: B },
		]);
		expect(t.unreadCurrencies).toEqual([]);
		expect(tomlCapabilities(t).assets).toEqual([
			{ code: "USDX" },
			{ code: "EURX" },
		]);
	});

	it("keeps a triple-quoted desc that closes on its own line", () => {
		const t = parseStellarToml(
			`[[CURRENCIES]]\ncode = "MGUSD"\nissuer = "${A}"\ndesc = """Issued by Bridge on behalf of MoneyGram."""`,
		);
		expect(t.currencies[0]?.desc).toBe(
			"Issued by Bridge on behalf of MoneyGram.",
		);
	});

	it("reads an escaped ORG_NAME and marks an unreadable server key unread", () => {
		const t = parseStellarToml(
			`TRANSFER_SERVER = ["https://x.example"]\n[DOCUMENTATION]\nORG_NAME = "AUDC \\"PTY\\" LTD"`,
		);
		expect(t.documentation.ORG_NAME).toBe('AUDC "PTY" LTD');
		expect(t.unreadKeys).toEqual(["TRANSFER_SERVER"]);
		expect(tomlCapabilities(t).seps).toBeNull();
	});

	it("ends an ACCOUNTS array left open at the next key, which is read or recorded unread", () => {
		const t = parseStellarToml(
			`ACCOUNTS = [\n"${A}",\nTRANSFER_SERVER = ["https://x.example"]\n`,
		);
		expect(t.accounts).toEqual([A]);
		expect(t.unreadKeys).toEqual(["TRANSFER_SERVER"]);
		expect(tomlCapabilities(t).seps).toBeNull();
	});

	it("records a [DOCUMENTATION] key it cannot read as unread, not absent", () => {
		const t = parseStellarToml(
			`[DOCUMENTATION]\nORG_NAME = """AUDC\nPTY LTD"""\nORG_URL = "https://x.example"`,
		);
		expect(t.documentation).toEqual({ ORG_URL: "https://x.example" });
		expect(t.unreadDocumentation).toEqual(["ORG_NAME"]);
	});

	it("leaves the asset list unknown for a linked currency, accounts still read", () => {
		const t = parseStellarToml(
			`ACCOUNTS = ["${A}"]\n[[CURRENCIES]]\ntoml = "https://x.example/USDX.toml"`,
		);
		expect(t.accounts).toEqual([A]);
		expect(t.unreadCurrencies).toEqual(["toml=https://x.example/USDX.toml"]);
		expect(tomlCapabilities(t).assets).toBeNull();
	});
});
