/**
 * Shared partner-matching helpers for the public concierge chat.
 *
 * The concierge (`/api/partners/assistant`) must only ever surface REAL,
 * published partners — never a hallucinated anchor. So candidate selection
 * and scoring are done here, deterministically (no LLM), against the same
 * published set the /partners directory serves. The chat model then explains
 * the pre-selected candidates; it never picks from thin air.
 *
 * (The richer LLM-reranked matcher at POST /api/partners/match stays separate
 * — that's the agent-facing API. This lib powers the conversational surface.)
 */

import type { Payload } from "payload";
import {
	rampLabel,
	regionLabel,
	sectorLabel,
	sepLabel,
	typeLabel,
} from "./partner-labels";

export const PARTNER_TYPES = [
	"anchor",
	"on-off-ramp",
	"infrastructure",
	"tooling",
	"protocol",
	"wallet",
	"audit-firm",
	"legal",
	"agency",
	"other",
] as const;

export type PartnerType = (typeof PARTNER_TYPES)[number];

export interface PublicPartner {
	slug: string;
	name: string;
	partnerType: string;
	tagline: string | null;
	/** Truncated description — card fallback when tagline is empty. */
	description: string | null;
	websiteUrl: string | null;
	acceptingClients: boolean | null;
	sectors: string[];
	regions: string[];
	/** Asset codes (USDC, EURC, NGNT…) from stellar.toml CURRENCIES. */
	assets: string[];
	/** SEP standards implemented (sep-6, sep-24, sep-31). */
	seps: string[];
	/** Real fiat-ramp capability (on-ramp / off-ramp) from the transfer server. */
	rampTypes: string[];
	country: string | null;
	/** True when the partner has a direct contact path (email or channel). */
	contactable: boolean;
	logoUrl: string | null;
	freshness: string;
	url: string;
}

export interface ScoredPartner {
	score: number;
	partner: PublicPartner;
	/** The searchable haystack — handed to the chat model to reason over. */
	blob: string;
	/** Human-readable "why this matched" chips (asset/ramp/SEP/country/…). */
	reasons: string[];
}

// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
function toPublic(p: any): PublicPartner {
	return {
		slug: p.slug,
		name: p.name,
		partnerType: p.partnerType,
		tagline: p.tagline ?? null,
		description: p.description ? String(p.description).slice(0, 180) : null,
		websiteUrl: p.websiteUrl ?? null,
		acceptingClients: p.acceptingClients ?? null,
		sectors: p.sectors ?? [],
		regions: p.regions ?? [],
		assets: (p.assets ?? [])
			.map((a: { code: string }) => a.code)
			.filter(Boolean),
		seps: p.seps ?? [],
		rampTypes: p.rampTypes ?? [],
		country: p.country ?? null,
		contactable: Boolean(p.contactEmail || p.contactChannel),
		logoUrl: p.logoUrl ?? null,
		freshness: p.freshnessStatus ?? "fresh",
		url: `https://stellarlight.xyz/partners/${p.slug}`,
	};
}

/** Words we don't want driving a match (too common to be meaningful). */
const STOPWORDS = new Set([
	"a",
	"an",
	"the",
	"and",
	"or",
	"for",
	"to",
	"of",
	"in",
	"on",
	"with",
	"we",
	"i",
	"need",
	"looking",
	"want",
	"find",
	"a",
	"is",
	"are",
	"my",
	"our",
	"that",
	"can",
	"who",
	"someone",
	"some",
	"help",
	"me",
	"you",
	"it",
	"this",
	"these",
	"stellar",
	"soroban",
	"partner",
	"partners",
	"please",
	"hi",
	"hello",
]);

function tokenize(s: string): string[] {
	return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
		(t) => t.length > 1 && !STOPWORDS.has(t),
	);
}

/** "soroban-audit" → "Soroban Audit". */
function prettyTag(s: string): string {
	return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * The specific fields that made a partner match a need — rendered as ✓ chips in
 * the matchmaker so a builder sees WHY, not just a ranked list. Draws only from
 * the concrete, verifiable fields (assets/ramps/SEPs/country/services/type/
 * sector/region) — never the vague free-text ones.
 */
// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
function matchReasons(needTokens: Set<string>, p: any): string[] {
	const hits = (text: string): boolean => {
		const toks = new Set(tokenize(text));
		for (const t of needTokens) if (toks.has(t)) return true;
		return false;
	};
	const out: string[] = [];
	const assets: string[] = (p.assets ?? [])
		.map((a: { code: string }) => a.code)
		.filter(Boolean);
	for (const a of assets) if (hits(a)) out.push(a.toUpperCase());
	for (const r of p.rampTypes ?? [])
		if (hits(r.replace(/-/g, " "))) out.push(rampLabel(r));
	for (const s of p.seps ?? [])
		if (hits(s.replace(/-/g, " "))) out.push(sepLabel(s));
	if (p.country && hits(p.country)) out.push(p.country);
	const services: string[] = (p.services ?? [])
		.map((s: { tag: string }) => s.tag)
		.filter(Boolean);
	for (const s of services)
		if (hits(s.replace(/-/g, " "))) out.push(prettyTag(s));
	if (p.partnerType && hits(String(p.partnerType).replace(/-/g, " ")))
		out.push(typeLabel(p.partnerType));
	for (const s of p.sectors ?? []) if (hits(s)) out.push(sectorLabel(s));
	for (const r of p.regions ?? [])
		if (hits(r.replace(/-/g, " "))) out.push(regionLabel(r));
	if (p.acceptingClients) out.push("Accepting clients");
	// Format-insensitive dedupe: services often carry lowercase copies of the
	// asset/ramp codes ("off-ramp" → "Off Ramp" vs the ramp label "Off-ramp"),
	// which are the SAME reason. Key on alphanumerics; keep the first (best-
	// formatted) label, since strong fields are pushed before services.
	const seen = new Set<string>();
	const deduped: string[] = [];
	for (const r of out) {
		const key = r.toLowerCase().replace(/[^a-z0-9]/g, "");
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(r);
	}
	return deduped.slice(0, 6);
}

/** Pull the published, non-archived partner set (directory parity). */
export async function fetchEligiblePartners(
	payload: Payload,
	filters: { type?: string; sector?: string; region?: string } = {},
	// biome-ignore lint/suspicious/noExplicitAny: Payload docs
): Promise<any[]> {
	// biome-ignore lint/suspicious/noExplicitAny: Payload Where shape
	const where: any = { status: { equals: "published" } };
	if (filters.type) where.partnerType = { equals: filters.type };
	if (filters.sector) where.sectors = { contains: filters.sector };
	if (filters.region) where.regions = { contains: filters.region };
	const res = await payload.find({
		collection: "partner-accounts",
		where,
		limit: 200,
		depth: 0,
	});
	// Archived (gone dark >1y) never matches — the directory still lists them.
	return res.docs.filter((p) => (p.freshnessStatus ?? "fresh") !== "archived");
}

/**
 * Region/country keywords → our region enum. Lets a plain-language need name a
 * place ("in Mexico", "for Asia", "Nigeria") and have it resolve to a region so
 * we can HARD-filter partners that don't cover it — otherwise a LatAm off-ramp
 * scores on "off-ramp" for an Asia query and surfaces a card that contradicts
 * "no Asia matches".
 */
const REGION_KEYWORDS: Record<string, string[]> = {
	asia: [
		"asia",
		"asian",
		"philippines",
		"philippine",
		"india",
		"indian",
		"indonesia",
		"singapore",
		"vietnam",
		"thailand",
		"japan",
		"japanese",
		"china",
		"chinese",
		"malaysia",
		"korea",
		"hong kong",
	],
	latam: [
		"latam",
		"latin america",
		"mexico",
		"mexican",
		"brazil",
		"brazilian",
		"argentina",
		"argentine",
		"chile",
		"chilean",
		"peru",
		"peruvian",
		"colombia",
		"colombian",
		"pesos",
		"peso",
		"reais",
		"real",
	],
	africa: [
		"africa",
		"african",
		"nigeria",
		"nigerian",
		"kenya",
		"kenyan",
		"tanzania",
		"ghana",
		"ghanaian",
		"south africa",
		"uganda",
		"rand",
	],
	europe: [
		"europe",
		"european",
		"euro",
		"eur",
		"eurozone",
		"germany",
		"france",
		"spain",
		"italy",
		"portugal",
		"netherlands",
		"ukraine",
		"ukrainian",
		"united kingdom",
		"britain",
		"british",
		"gbp",
		"pound",
	],
	"north-america": [
		"usa",
		"u.s.",
		"united states",
		"america",
		"american",
		"canada",
		"canadian",
		"usd",
	],
	mena: ["mena", "middle east", "uae", "dubai", "saudi", "qatar", "emirates"],
	oceania: ["oceania", "australia", "australian", "aud", "new zealand", "nzd"],
	global: ["global", "worldwide", "anywhere", "international", "any region"],
};

/** Which regions a plain-language need is asking for (empty = no preference). */
function requestedRegions(need: string): Set<string> {
	const hay = need.toLowerCase();
	const out = new Set<string>();
	// WORD-BOUNDARY match, not raw substring: otherwise short currency/region
	// codes match inside unrelated words — "usd" inside "USDC", "eur" inside
	// "EURC", "aud" inside "AUDD" — and a stablecoin name silently gates the
	// query to the wrong region (the bug that made "usdc off-ramp" return 0).
	const bounded = (k: string): boolean => {
		const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(hay);
	};
	for (const [region, kws] of Object.entries(REGION_KEYWORDS)) {
		if (kws.some(bounded)) out.add(region);
	}
	// "global" is a wildcard, not a restriction — don't let it filter anything.
	out.delete("global");
	return out;
}

/**
 * Deterministically score partners against a plain-language need. Keyword
 * overlap across services/sectors/regions/type/tagline/description, with a
 * small nudge for accepting-clients + fresh profiles. Returns top `limit`,
 * best first — including the `blob` so the chat model can explain each.
 *
 * Region is a HARD filter: if the need names a place, a partner that declares
 * regions but covers none of the requested ones (and isn't global) is dropped
 * entirely — so an "Asia" query never surfaces a LatAm-only anchor. Partners
 * with no region data are kept (unknown coverage isn't a mismatch).
 */
export function scorePartners(
	need: string,
	// biome-ignore lint/suspicious/noExplicitAny: Payload docs
	docs: any[],
	limit = 6,
): ScoredPartner[] {
	const needTokens = new Set(tokenize(need));
	if (needTokens.size === 0) {
		// No usable signal — return a few accepting/fresh partners as a fallback.
		return docs.slice(0, limit).map((p) => ({
			score: 0,
			partner: toPublic(p),
			blob: partnerBlob(p),
			reasons: [],
		}));
	}

	// Region gate: drop partners that clearly don't serve the requested place.
	const wantRegions = requestedRegions(need);
	const pool =
		wantRegions.size === 0
			? docs
			: docs.filter((p) => {
					const regions: string[] = p.regions ?? [];
					if (regions.length === 0) return true; // unknown coverage — keep
					if (regions.includes("global")) return true;
					return regions.some((r) => wantRegions.has(r));
				});

	const scored = pool.map((p) => {
		const services: string[] = (p.services ?? [])
			.map((s: { tag: string }) => s.tag)
			.filter(Boolean);
		const sectors: string[] = p.sectors ?? [];
		const regions: string[] = p.regions ?? [];
		const assets: string[] = (p.assets ?? [])
			.map((a: { code: string }) => a.code)
			.filter(Boolean);
		const seps: string[] = p.seps ?? [];
		const rampTypes: string[] = p.rampTypes ?? [];

		// Weighted fields: the stellar.toml-verified capabilities (assets, SEPs,
		// real ramp direction, country) are the strongest fit signal — "USDC
		// off-ramp in Mexico" should hit asset+ramp+country, not description
		// luck. services + type next; free text last.
		const weighted: Array<[string, number]> = [
			[assets.join(" "), 5],
			[rampTypes.join(" ").replace(/-/g, " "), 5],
			[seps.join(" ").replace(/-/g, " "), 4],
			[String(p.country ?? ""), 4],
			[services.join(" ").replace(/-/g, " "), 4],
			[String(p.partnerType ?? "").replace(/-/g, " "), 3],
			[sectors.join(" "), 3],
			[regions.join(" ").replace(/-/g, " "), 2],
			[String(p.tagline ?? ""), 2],
			[String(p.description ?? ""), 1],
			[String(p.name ?? ""), 1],
		];

		let score = 0;
		for (const [text, weight] of weighted) {
			const toks = new Set(tokenize(text));
			for (const t of needTokens) if (toks.has(t)) score += weight;
		}
		if (score > 0) {
			if (p.acceptingClients) score += 1;
			if ((p.freshnessStatus ?? "fresh") === "fresh") score += 1;
			// Profile-strength nudge: complete profiles rank slightly ahead of
			// thin ones at equal keyword fit — the "competition" incentive made
			// mechanical. Capped at +2 so it can't beat real relevance.
			score += Math.min(2, Math.round(profileStrength(p) * 2));
		}
		return {
			score,
			partner: toPublic(p),
			blob: partnerBlob(p),
			reasons: score > 0 ? matchReasons(needTokens, p) : [],
		};
	});

	// Only real hits — no fallback sample. Surfacing zero-relevance partners as
	// "matches" is what made the cards contradict the reply ("no match" + a card).
	// Empty → the assistant says there's nothing, with no card.
	const hits = scored
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score);
	return hits.slice(0, limit);
}

/**
 * Profile completeness, 0..1 — the honest v1 of the partner "competition":
 * complete profiles get a small matcher boost + a visible meter in the
 * dashboard telling partners exactly what to add next. One signal, two
 * surfaces, so the incentive and the ranking can't drift apart.
 */
// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
export function profileStrength(p: any): number {
	const checks: boolean[] = [
		Boolean(p.tagline),
		Boolean(p.description),
		(p.services ?? []).length > 0,
		(p.sectors ?? []).length > 0,
		(p.regions ?? []).length > 0 || Boolean(p.country),
		Boolean(p.contactEmail || p.contactChannel),
		Boolean(p.websiteUrl),
		Boolean(p.logoUrl),
		(p.freshnessStatus ?? "fresh") === "fresh",
	];
	return checks.filter(Boolean).length / checks.length;
}

/** Compact one-line description of a partner for the chat model's context. */
// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
function partnerBlob(p: any): string {
	const services: string[] = (p.services ?? [])
		.map((s: { tag: string }) => s.tag)
		.filter(Boolean);
	const assets: string[] = (p.assets ?? [])
		.map((a: { code: string }) => a.code)
		.filter(Boolean);
	const parts = [
		`${p.name} (${p.partnerType})`,
		p.tagline,
		assets.length ? `assets: ${assets.join(", ")}` : "",
		(p.seps ?? []).length ? `standards: ${(p.seps ?? []).join(", ")}` : "",
		(p.rampTypes ?? []).length
			? `ramps: ${(p.rampTypes ?? []).join(", ")}`
			: "",
		p.country ? `country: ${p.country}` : "",
		services.length ? `services: ${services.join(", ")}` : "",
		(p.sectors ?? []).length ? `sectors: ${(p.sectors ?? []).join(", ")}` : "",
		(p.regions ?? []).length ? `regions: ${(p.regions ?? []).join(", ")}` : "",
		p.acceptingClients ? "accepting clients" : "",
		p.contactEmail || p.contactChannel
			? "contactable"
			: "no direct contact listed",
	].filter(Boolean);
	return parts.join(" · ");
}

export { toPublic as toPublicPartner };
