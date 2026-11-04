/**
 * A minimal stellar.toml (SEP-1) parser, shared by the scripts and the
 * stablecoin pipeline. Moved from scripts/lib/stellar-toml.ts (which
 * re-exports it) when the issuer-of-record read needed the same structure
 * rather than a substring search: an address in a comment is not a listing.
 *
 * Line-based on purpose: issuer tomls in the wild are often malformed enough
 * that a strict TOML parser rejects the whole file, and only a few shapes are
 * needed. Comment lines are skipped, a value is read up to its own closing
 * quote (double or single, with \" and \\ escapes in a double-quoted one),
 * and nothing outside the shapes below is read.
 */

export interface StellarToml {
	topLevel: Record<string, string>;
	documentation: Record<string, string>;
	currencyCodes: string[];
	/** (code, issuer) pairs from [[CURRENCIES]] blocks; the issuer is the
	 *  on-chain evidence key the project-side enrichment joins on. Only pairs
	 *  whose issuer is a well-formed Stellar account (G + 55 base32 chars)
	 *  are collected; a currency block without an issuer contributes to
	 *  currencyCodes but never here. `desc` is the block's own description,
	 *  when it has one. */
	currencies: Array<{
		code: string;
		issuer: string;
		status?: string;
		desc?: string;
	}>;
	/** The top-level ACCOUNTS array (SEP-1: the accounts this domain
	 *  controls), well-formed StrKeys only, uppercased. */
	accounts: string[];
}

const STRKEY = /^G[A-Z2-7]{55}$/;

/** `KEY = "value"` or `KEY = 'value'`, the value up to its own closing quote. */
const ASSIGN = /^([A-Za-z0-9_]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/;

/** Parse just the shapes we need: top-level `KEY = "v"`, the ACCOUNTS array,
 *  the [DOCUMENTATION] table, and `code`/`issuer`/`status`/`desc` inside
 *  [[CURRENCIES]] blocks. */
export function parseStellarToml(text: string): StellarToml {
	const topLevel: Record<string, string> = {};
	const documentation: Record<string, string> = {};
	const currencyCodes: string[] = [];
	const currencies: StellarToml["currencies"] = [];
	const accounts: string[] = [];
	let section: "top" | "doc" | "currency" | "other" = "top";
	// Inside a multi-line ACCOUNTS = [ ... ] array.
	let inAccounts = false;
	// The current [[CURRENCIES]] block accumulates until its next block starts:
	// key order inside a block is not guaranteed by SEP-1.
	let cur: { code?: string; issuer?: string; status?: string; desc?: string } =
		{};
	const flushCurrency = () => {
		// Asset codes are case-sensitive on Stellar (nBTC and NBTC are two
		// assets), so the code keeps the case the operator wrote; only the
		// issuer is a StrKey, which is uppercase by definition. Uppercasing the
		// code sent the on-chain join to a 404 for normalfinance.io's nBTC
		// (2026-09-28) while the real asset had 65 trustlines.
		const code = cur.code?.trim();
		const issuer = cur.issuer?.trim().toUpperCase();
		// SEP-1 `status`: live | dead | test | private. Kept so a join can
		// decline an asset the operator itself has retired.
		const status = cur.status?.trim().toLowerCase() || undefined;
		const desc = cur.desc?.trim() || undefined;
		if (code && !currencyCodes.includes(code)) currencyCodes.push(code);
		if (
			code &&
			issuer &&
			STRKEY.test(issuer) &&
			!currencies.some((c) => c.code === code && c.issuer === issuer)
		)
			currencies.push({
				code,
				issuer,
				...(status ? { status } : {}),
				...(desc ? { desc } : {}),
			});
		cur = {};
	};
	const collectAccounts = (line: string) => {
		// Only quoted StrKeys count; a trailing comment is not read.
		for (const m of line
			.replace(/#.*$/, "")
			.matchAll(/["']([A-Za-z2-7]{56})["']/g)) {
			const key = m[1].toUpperCase();
			if (STRKEY.test(key) && !accounts.includes(key)) accounts.push(key);
		}
	};

	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		if (inAccounts) {
			collectAccounts(line);
			if (line.replace(/#.*$/, "").includes("]")) inAccounts = false;
			continue;
		}
		if (line.startsWith("[")) {
			if (section === "currency") flushCurrency();
			if (/^\[\[\s*CURRENCIES\s*\]\]/i.test(line)) section = "currency";
			else if (/^\[\s*DOCUMENTATION\s*\]/i.test(line)) section = "doc";
			else section = "other";
			continue;
		}
		const arr = line.match(/^ACCOUNTS\s*=\s*\[(.*)$/i);
		if (section === "top" && arr) {
			collectAccounts(arr[1]);
			if (!arr[1].replace(/#.*$/, "").includes("]")) inAccounts = true;
			continue;
		}
		const m = line.match(ASSIGN);
		if (!m) continue;
		const key = m[1];
		const value =
			m[2] !== undefined ? m[2].replace(/\\(["\\])/g, "$1") : (m[3] ?? "");
		if (section === "top") topLevel[key.toUpperCase()] = value;
		else if (section === "doc") documentation[key.toUpperCase()] = value;
		else if (section === "currency") {
			const k = key.toLowerCase();
			if (k === "code") cur.code = value;
			else if (k === "issuer") cur.issuer = value;
			else if (k === "status") cur.status = value;
			else if (k === "desc") cur.desc = value;
		}
	}
	if (section === "currency") flushCurrency();
	return { topLevel, documentation, currencyCodes, currencies, accounts };
}
