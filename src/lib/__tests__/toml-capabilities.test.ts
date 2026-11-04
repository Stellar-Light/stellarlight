/**
 * A successful stellar.toml parse writes what the file declares (#1909).
 * The enrichment stamped tomlSourceUrl and tomlFetchedAt on every parse but
 * wrote seps only when a SEP server was declared and assets only when
 * CURRENCIES was non-empty, so an earlier curated value survived under a
 * fresh read stamp and was served as read from the file.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	parseStellarToml,
	tomlCapabilities,
} from "../../../scripts/lib/stellar-toml";

describe("tomlCapabilities", () => {
	it("writes [] for a file that declares no SEP server and no CURRENCIES", () => {
		const toml = parseStellarToml(
			'VERSION="2.0.0"\nNETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"\n\n[DOCUMENTATION]\nORG_NAME="Issuer Only"\n',
		);
		expect(tomlCapabilities(toml)).toEqual({ seps: [], assets: [] });
	});

	it("writes what the file declares, with the case it was written in", () => {
		const toml = parseStellarToml(
			'TRANSFER_SERVER_SEP0024="https://ramp.example/sep24"\nDIRECT_PAYMENT_SERVER="https://ramp.example/sep31"\n\n[[CURRENCIES]]\ncode="gBENJI"\nissuer="GD5J73EKK5IYL5XS3FBTHHX7CZIYRP7QXDL57XFWGC2WVYWT326OBXRP"\n',
		);
		expect(tomlCapabilities(toml)).toEqual({
			seps: ["sep-24", "sep-31"],
			assets: [{ code: "gBENJI" }],
		});
	});

	it("is what the enrichment writes on every successful parse", () => {
		const script = readFileSync(
			join(process.cwd(), "scripts/enrich-partners-toml.ts"),
			"utf8",
		);
		expect(script).toContain("const caps = tomlCapabilities(toml);");
		expect(script).toContain("Object.assign(update, caps);");
	});
});
