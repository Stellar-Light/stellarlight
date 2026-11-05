/**
 * Shared stellar.toml (SEP-1) helpers — SIDE-EFFECT-FREE by design.
 *
 * Extracted from enrich-partners-toml.ts the day importing that script's
 * helpers EXECUTED its main inside the onchain enrichment (module top-level
 * run + shared process.argv meant --execute would have propagated to a
 * writer nobody dispatched). Scripts share code through this library, never
 * by importing each other.
 */

const FETCH_TIMEOUT_MS = 10_000;

/* ── minimal stellar.toml parsing (no TOML dep) ─────────────────────────── */

export interface StellarToml {
	topLevel: Record<string, string>;
	documentation: Record<string, string>;
	currencyCodes: string[];
	/** (code, issuer) pairs from [[CURRENCIES]] blocks — the issuer is the
	 *  on-chain evidence key the project-side enrichment joins on. Only pairs
	 *  whose issuer is a well-formed Stellar account (G + 55 base32 chars)
	 *  are collected; a currency block without an issuer contributes to
	 *  currencyCodes but never here. */
	currencies: Array<{ code: string; issuer: string; status?: string }>;
	/** Top-level keys the file sets in a form this parser does not read (a
	 *  multi-line string, an array, a table): could-not-check, never "not
	 *  declared" (#1909). */
	unreadKeys: string[];
	/** [[CURRENCIES]] blocks with no code this parser could read (a linked
	 *  currency `toml`, a `code_template`, an unreadable code): their codes
	 *  are UNKNOWN, so the file's asset list is could-not-check. */
	unreadCurrencies: string[];
}

/** Parse just the shapes we need: top-level `KEY = "v"` or `KEY = 'v'`, the
 *  [DOCUMENTATION] table, and `code`/`issuer` inside [[CURRENCIES]] blocks.
 *  What it cannot read it records as unread, never as absent. */
export function parseStellarToml(text: string): StellarToml {
	const topLevel: Record<string, string> = {};
	const documentation: Record<string, string> = {};
	const currencyCodes: string[] = [];
	const currencies: Array<{ code: string; issuer: string; status?: string }> =
		[];
	const unreadKeys: string[] = [];
	const unreadCurrencies: string[] = [];
	let section: "top" | "doc" | "currency" | "other" = "top";
	// The current [[CURRENCIES]] block accumulates until its next block starts
	// — key order inside a block is not guaranteed by SEP-1.
	let cur: {
		code?: string;
		issuer?: string;
		status?: string;
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
		if (code && !currencyCodes.includes(code)) currencyCodes.push(code);
		// A declared currency whose code we could not read: unknown, so the
		// whole asset list is could-not-check (#1909).
		if (!code) unreadCurrencies.push(cur.unread ?? "a block with no code");
		if (
			code &&
			issuer &&
			/^G[A-Z2-7]{55}$/.test(issuer) &&
			!currencies.some((c) => c.code === code && c.issuer === issuer)
		)
			currencies.push(status ? { code, issuer, status } : { code, issuer });
		cur = {};
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
		if (line.startsWith("[")) {
			if (section === "currency") flushCurrency();
			if (/^\[\[\s*CURRENCIES\s*\]\]/i.test(line)) section = "currency";
			else if (/^\[\s*DOCUMENTATION\s*\]/i.test(line)) section = "doc";
			else section = "other";
			continue;
		}
		// A """multi-line""" or '''multi-line''' value: read when it closes on
		// its own line, otherwise unread (could-not-check) to its delimiter.
		const triple = line.match(/^([A-Za-z0-9_]+)\s*=\s*("""|''')(.*)$/);
		if (triple) {
			const [, tKey, delim, rest] = triple;
			const end = rest.indexOf(delim);
			if (end === -1) {
				multiline = delim;
				if (section === "top") unreadKeys.push(tKey.toUpperCase());
				else if (section === "currency" && tKey.toLowerCase() === "code")
					cur.unread ??= "an unreadable code";
				continue;
			}
			const tValue = rest.slice(0, end);
			if (section === "top") topLevel[tKey.toUpperCase()] = tValue;
			else if (section === "doc") documentation[tKey.toUpperCase()] = tValue;
			else if (section === "currency" && tKey.toLowerCase() === "code")
				cur.code = tValue;
			continue;
		}
		// A basic "string" or a literal 'string', the two one-line forms.
		const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
		if (!m) {
			const key = line.match(/^([A-Za-z0-9_]+)\s*=/)?.[1];
			if (key && section === "top") unreadKeys.push(key.toUpperCase());
			else if (key && section === "currency" && key.toLowerCase() === "code")
				cur.unread ??= "an unreadable code";
			continue;
		}
		const key = m[1];
		const value = m[2] ?? m[3] ?? "";
		if (section === "top") topLevel[key.toUpperCase()] = value;
		else if (section === "doc") documentation[key.toUpperCase()] = value;
		else if (section === "currency") {
			const k = key.toLowerCase();
			if (k === "code") cur.code = value;
			else if (k === "issuer") cur.issuer = value;
			else if (k === "status") cur.status = value;
			else if (k === "toml") cur.unread ??= `toml=${value}`;
			else if (k === "code_template") cur.unread ??= `code_template=${value}`;
		}
	}
	if (section === "currency") flushCurrency();
	return {
		topLevel,
		documentation,
		currencyCodes,
		currencies,
		unreadKeys,
		unreadCurrencies,
	};
}

const SEP_SERVERS: Record<string, string> = {
	TRANSFER_SERVER: "sep-6",
	TRANSFER_SERVER_SEP0024: "sep-24",
	DIRECT_PAYMENT_SERVER: "sep-31",
};

/** The toml-backed partner fields a successful parse supports (#1909): what
 * the file declares, [] when it declares none, and null (could-not-check)
 * when the parser could not read a server key or a currency's code. Writing
 * only non-empty values let an earlier curated value survive under a fresh
 * read stamp; writing [] for what we could not read erased a real one. */
export function tomlCapabilities(toml: StellarToml): {
	seps: string[] | null;
	assets: { code: string }[] | null;
} {
	const serverUnread = Object.keys(SEP_SERVERS).some((k) =>
		toml.unreadKeys.includes(k),
	);
	return {
		seps: serverUnread
			? null
			: Object.entries(SEP_SERVERS)
					.filter(([k]) => toml.topLevel[k])
					.map(([, sep]) => sep),
		assets: toml.unreadCurrencies.length
			? null
			: toml.currencyCodes.slice(0, 25).map((code) => ({ code })),
	};
}

/** The update a successful parse writes: a could-not-check field is left
 * out, so the stored value stands; it is never written as [] or null. */
export function capabilityWrite(caps: ReturnType<typeof tomlCapabilities>): {
	seps?: string[];
	assets?: { code: string }[];
} {
	return {
		...(caps.seps ? { seps: caps.seps } : {}),
		...(caps.assets ? { assets: caps.assets } : {}),
	};
}

const listed = (xs: unknown): string =>
	!Array.isArray(xs)
		? "unset"
		: xs.length
			? xs
					.map((x) =>
						typeof x === "string" ? x : (x as { code?: string })?.code,
					)
					.join(",")
			: "none";

/** The dry run's lines: the stored value beside the planned one, so a wipe
 * or an unread field is visible before an execute. */
export function capabilityReport(
	stored: { seps?: unknown; assets?: unknown },
	toml: StellarToml,
): string[] {
	const caps = tomlCapabilities(toml);
	return [
		`seps ${listed(stored.seps)} → ${caps.seps ? listed(caps.seps) : `unread (${toml.unreadKeys.join(", ")}), kept`}`,
		`assets ${listed(stored.assets)} → ${caps.assets ? listed(caps.assets) : `unread (${toml.unreadCurrencies.join("; ")}), kept`}`,
	];
}

export async function fetchText(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { "User-Agent": "stellarlight-enrich/1.0" },
			redirect: "follow",
		});
		if (!res.ok) return null;
		// Origin-lock (audit N1/S1): a lapsed or parked domain redirecting
		// off-origin must never serve "its" stellar.toml — a SEP-1 claim
		// belongs to the origin that was asked. www ↔ apex is the same
		// operator; anything else is not.
		try {
			const strip = (h: string) => h.replace(/^www\./, "");
			if (strip(new URL(res.url).host) !== strip(new URL(url).host))
				return null;
		} catch {
			return null;
		}
		const text = await res.text();
		// Content sniff: an HTML parking page is not a toml, and the callers'
		// "soft-404 is a skip" claim was only true if someone checked. First
		// meaningful line must look like a toml table or KEY assignment.
		const first =
			text
				.split(/\r?\n/)
				.find((l) => l.trim() && !l.trim().startsWith("#"))
				?.trim() ?? "";
		if (first.startsWith("<") || !/^(\[|[A-Za-z0-9_]+\s*=)/.test(first))
			return null;
		return text;
	} catch {
		return null;
	}
}

export function domainOf(websiteUrl: string): string | null {
	try {
		return new URL(websiteUrl).hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}
