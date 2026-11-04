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
export {
	parseStellarToml,
	type StellarToml,
} from "../../src/lib/stellar-toml";

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
