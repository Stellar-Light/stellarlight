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
 * and nothing outside the shapes below is read: a key set in another form
 * is recorded as unread (could-not-check), never as absent.
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
	/** Top-level keys the file sets in a form this parser does not read (a
	 *  multi-line string, an array other than ACCOUNTS, a table):
	 *  could-not-check, never "not declared" (#1909). */
	unreadKeys: string[];
	/** [[CURRENCIES]] blocks with no code this parser could read (a linked
	 *  currency `toml`, a `code_template`, an unreadable code): their codes
	 *  are UNKNOWN, so the file's asset list is could-not-check. */
	unreadCurrencies: string[];
	/** [DOCUMENTATION] keys set in a form this parser does not read: an
	 *  ORG_NAME among them is could-not-check, never "declares none". */
	unreadDocumentation: string[];
}

const STRKEY = /^G[A-Z2-7]{55}$/;

/** Whether a body reads as a stellar.toml at all: its first meaningful line
 *  (not blank, not a comment) opens a table or assigns a key. An HTML page,
 *  a "Not Found" text, a JSON error or an empty body does not. */
export function looksLikeStellarToml(text: string): boolean {
	const first =
		text
			.split(/\r?\n/)
			.map((l) => l.trim())
			.find((l) => l && !l.startsWith("#")) ?? "";
	return /^(\[|[A-Za-z0-9_]+\s*=)/.test(first);
}

/** `KEY = "value"` or `KEY = 'value'`, the value up to its own closing quote. */
const ASSIGN = /^([A-Za-z0-9_]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/;

/** Parse just the shapes we need: top-level `KEY = "v"`, the ACCOUNTS array,
 *  the [DOCUMENTATION] table, and `code`/`issuer`/`status`/`desc` inside
 *  [[CURRENCIES]] blocks, each as a one-line string or a triple-quoted one
 *  that closes on its own line. What it cannot read it records as unread,
 *  never as absent (#1909). */
export function parseStellarToml(text: string): StellarToml {
	const topLevel: Record<string, string> = {};
	const documentation: Record<string, string> = {};
	const currencyCodes: string[] = [];
	const currencies: StellarToml["currencies"] = [];
	const accounts: string[] = [];
	const unreadKeys: string[] = [];
	const unreadCurrencies: string[] = [];
	const unreadDocumentation: string[] = [];
	let section: "top" | "doc" | "currency" | "other" = "top";
	// Inside a multi-line ACCOUNTS = [ ... ] array.
	let inAccounts = false;
	// The current [[CURRENCIES]] block accumulates until its next block starts:
	// key order inside a block is not guaranteed by SEP-1.
	let cur: {
		code?: string;
		issuer?: string;
		status?: string;
		desc?: string;
		unread?: string;
	} = {};
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
		// A declared currency whose code we could not read: unknown, so the
		// whole asset list is could-not-check (#1909).
		if (!code) unreadCurrencies.push(cur.unread ?? "a block with no code");
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
	const assign = (key: string, value: string) => {
		if (section === "top") {
			topLevel[key.toUpperCase()] = value;
			// ACCOUNTS written as one string, not an array: still a listing.
			if (key.toUpperCase() === "ACCOUNTS")
				collectAccounts(`"${value.trim()}"`);
		} else if (section === "doc") documentation[key.toUpperCase()] = value;
		else if (section === "currency") {
			const k = key.toLowerCase();
			if (k === "code") cur.code = value;
			else if (k === "issuer") cur.issuer = value;
			else if (k === "status") cur.status = value;
			else if (k === "desc") cur.desc = value;
			else if (k === "toml") cur.unread ??= `toml=${value}`;
			else if (k === "code_template") cur.unread ??= `code_template=${value}`;
		}
	};
	// A key set in a form this parser does not read: could-not-check.
	const unread = (key: string) => {
		if (section === "top") unreadKeys.push(key.toUpperCase());
		else if (section === "doc") unreadDocumentation.push(key.toUpperCase());
		else if (section === "currency" && key.toLowerCase() === "code")
			cur.unread ??= "an unreadable code";
	};

	// Inside a multi-line string, the delimiter that closes it.
	let multiline: string | null = null;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (multiline) {
			if (line.includes(multiline)) multiline = null;
			continue;
		}
		if (!line || line.startsWith("#")) continue;
		if (inAccounts) {
			// A header or a key assignment means the array was left open: end
			// it there and read the line as what it is, so an unclosed
			// ACCOUNTS cannot swallow the [DOCUMENTATION] table after it.
			if (line.startsWith("[") || /^[A-Za-z0-9_]+\s*=/.test(line))
				inAccounts = false;
			else {
				collectAccounts(line);
				if (line.replace(/#.*$/, "").includes("]")) inAccounts = false;
				continue;
			}
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
		// A """multi-line""" or '''multi-line''' value: read when it closes on
		// its own line, otherwise unread up to its delimiter. Checked before
		// ASSIGN, which would read `KEY = """x` as an empty string and then
		// parse the string's lines as keys.
		const triple = line.match(/^([A-Za-z0-9_]+)\s*=\s*("""|''')(.*)$/);
		if (triple) {
			const [, key, delim, rest] = triple;
			const end = rest.indexOf(delim);
			if (end === -1) {
				multiline = delim;
				unread(key);
			} else assign(key, rest.slice(0, end));
			continue;
		}
		const m = line.match(ASSIGN);
		if (!m) {
			const key = line.match(/^([A-Za-z0-9_]+)\s*=/)?.[1];
			if (key) unread(key);
			continue;
		}
		assign(
			m[1],
			m[2] !== undefined ? m[2].replace(/\\(["\\])/g, "$1") : (m[3] ?? ""),
		);
	}
	if (section === "currency") flushCurrency();
	return {
		topLevel,
		documentation,
		currencyCodes,
		currencies,
		accounts,
		unreadKeys,
		unreadCurrencies,
		unreadDocumentation,
	};
}
