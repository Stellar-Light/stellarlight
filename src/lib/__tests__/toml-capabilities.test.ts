/**
 * A successful stellar.toml parse writes what the file declares (#1909), and
 * a value the parser could not read is could-not-check, never [].
 *
 * Round 2: the enrichment stamped tomlSourceUrl and tomlFetchedAt on every
 * parse but wrote seps only when a SEP server was declared and assets only
 * when CURRENCIES was non-empty, so an earlier curated value survived under a
 * fresh read stamp. Round 3: writing [] whenever the parser collected nothing
 * turned a parser miss into a stamped "declares none" that erased a real
 * value: a linked currency file, a code_template, a single-quoted server key.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	capabilityReport,
	capabilityWrite,
	parseStellarToml,
	tomlCapabilities,
} from "../../../scripts/lib/stellar-toml";

const ISSUER = "GD5J73EKK5IYL5XS3FBTHHX7CZIYRP7QXDL57XFWGC2WVYWT326OBXRP";
const caps = (text: string) => tomlCapabilities(parseStellarToml(text));

describe("tomlCapabilities", () => {
	it("writes [] for a file that declares no SEP server and no CURRENCIES", () => {
		expect(
			caps(
				'VERSION="2.0.0"\nNETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"\n\n[DOCUMENTATION]\nORG_NAME="Issuer Only"\n',
			),
		).toEqual({ seps: [], assets: [] });
	});

	it("writes what the file declares, with the case it was written in", () => {
		expect(
			caps(
				`TRANSFER_SERVER_SEP0024="https://ramp.example/sep24"\nDIRECT_PAYMENT_SERVER="https://ramp.example/sep31"\n\n[[CURRENCIES]]\ncode="gBENJI"\nissuer="${ISSUER}"\n`,
			),
		).toEqual({ seps: ["sep-24", "sep-31"], assets: [{ code: "gBENJI" }] });
	});

	it("(a) a linked currency file leaves assets could-not-check", () => {
		const c = caps(
			'[[CURRENCIES]]\ntoml="https://x.example/.well-known/USDC.toml"\n',
		);
		expect(c.assets).toBeNull();
	});

	it("(b) a code_template block leaves assets could-not-check", () => {
		const c = caps(
			`[[CURRENCIES]]\ncode_template="DEMO??"\nissuer="${ISSUER}"\n`,
		);
		expect(c.assets).toBeNull();
	});

	it("(c) a single-quoted server key is read", () => {
		expect(
			caps("TRANSFER_SERVER_SEP0024 = 'https://x.example/sep24'\n").seps,
		).toEqual(["sep-24"]);
	});

	it("one unread currency block makes the whole asset list could-not-check", () => {
		const c = caps(
			`[[CURRENCIES]]\ncode="USDC"\nissuer="${ISSUER}"\n\n[[CURRENCIES]]\ntoml="https://x.example/.well-known/EURC.toml"\n`,
		);
		expect(c.assets).toBeNull();
	});

	it("a server key whose value cannot be read leaves seps could-not-check", () => {
		expect(
			caps('TRANSFER_SERVER = """\nhttps://x.example/sep6\n"""\n').seps,
		).toBeNull();
	});
});

describe("what the enrichment writes and prints", () => {
	it("never writes a could-not-check field, so the stored value stands", () => {
		expect(capabilityWrite({ seps: null, assets: [] })).toEqual({ assets: [] });
		expect(capabilityWrite({ seps: ["sep-24"], assets: null })).toEqual({
			seps: ["sep-24"],
		});
	});

	it("prints the stored value beside the planned one", () => {
		expect(
			capabilityReport(
				{ seps: ["sep-24"], assets: [{ code: "USDC" }] },
				parseStellarToml(
					'[[CURRENCIES]]\ntoml="https://x.example/.well-known/USDC.toml"\n',
				),
			),
		).toEqual([
			"seps sep-24 → none",
			"assets USDC → unread (toml=https://x.example/.well-known/USDC.toml), kept",
		]);
	});

	it("is how the enrichment writes and reports every successful parse", () => {
		const script = readFileSync(
			join(process.cwd(), "scripts/enrich-partners-toml.ts"),
			"utf8",
		);
		expect(script).toContain("Object.assign(update, capabilityWrite(caps));");
		expect(script).toContain("report.push(...capabilityReport(doc, toml));");
		expect(script).not.toContain("Object.assign(update, caps);");
	});
});
