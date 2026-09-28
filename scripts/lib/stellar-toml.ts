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
}

/** Parse just the shapes we need: top-level `KEY = "v"`, the [DOCUMENTATION]
 *  table, and `code`/`issuer` inside [[CURRENCIES]] blocks. */
export function parseStellarToml(text: string): StellarToml {
	const topLevel: Record<string, string> = {};
	const documentation: Record<string, string> = {};
	const currencyCodes: string[] = [];
	const currencies: Array<{ code: string; issuer: string; status?: string }> =
		[];
	let section: "top" | "doc" | "currency" | "other" = "top";
	// The current [[CURRENCIES]] block accumulates until its next block starts
	// — key order inside a block is not guaranteed by SEP-1.
	let cur: { code?: string; issuer?: string; status?: string } = {};
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
		if (
			code &&
			issuer &&
			/^G[A-Z2-7]{55}$/.test(issuer) &&
			!currencies.some((c) => c.code === code && c.issuer === issuer)
		)
			currencies.push(status ? { code, issuer, status } : { code, issuer });
		cur = {};
	};

	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		if (line.startsWith("[")) {
			if (section === "currency") flushCurrency();
			if (/^\[\[\s*CURRENCIES\s*\]\]/i.test(line)) section = "currency";
			else if (/^\[\s*DOCUMENTATION\s*\]/i.test(line)) section = "doc";
			else section = "other";
			continue;
		}
		const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/);
		if (!m) continue;
		const [, key, value] = m;
		if (section === "top") topLevel[key.toUpperCase()] = value;
		else if (section === "doc") documentation[key.toUpperCase()] = value;
		else if (section === "currency") {
			const k = key.toLowerCase();
			if (k === "code") cur.code = value;
			else if (k === "issuer") cur.issuer = value;
			else if (k === "status") cur.status = value;
		}
	}
	if (section === "currency") flushCurrency();
	return { topLevel, documentation, currencyCodes, currencies };
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
