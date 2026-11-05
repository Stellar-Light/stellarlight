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

/* ── stellar.toml parsing lives in src/lib/stellar-toml.ts (shared with the
 * stablecoin pipeline); re-exported so the scripts' imports stay as they are. */
import {
	looksLikeStellarToml,
	type StellarToml,
} from "../../src/lib/stellar-toml";

export {
	looksLikeStellarToml,
	parseStellarToml,
	type StellarToml,
} from "../../src/lib/stellar-toml";

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

/** The read stamps and toml-backed fields one parse writes (#1909). The
 * stamps mark the row as read, and the API then serves its seps and assets
 * as what the file declares (an absent seps as []). So a parse that could
 * not read seps or assets stamps the row only when it already holds a
 * recorded read; a partial first read writes nothing here. */
export function tomlReadWrite(
	caps: ReturnType<typeof tomlCapabilities>,
	stamp: { tomlSourceUrl: string; tomlFetchedAt: string },
	priorRead: boolean,
): {
	seps?: string[];
	assets?: { code: string }[];
	tomlSourceUrl?: string;
	tomlFetchedAt?: string;
} {
	const complete = caps.seps !== null && caps.assets !== null;
	return complete || priorRead ? { ...stamp, ...capabilityWrite(caps) } : {};
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
		return looksLikeStellarToml(text) ? text : null;
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
