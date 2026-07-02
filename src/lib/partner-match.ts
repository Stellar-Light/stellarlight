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
	freshness: string;
	url: string;
}

export interface ScoredPartner {
	score: number;
	partner: PublicPartner;
	/** The searchable haystack — handed to the chat model to reason over. */
	blob: string;
}

// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
function toPublic(p: any): PublicPartner {
	return {
		slug: p.slug,
		name: p.name,
		partnerType: p.partnerType,
		tagline: p.tagline ?? null,
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
		freshness: p.freshnessStatus ?? "fresh",
		url: `https://stellarlight.xyz/partners/${p.slug}`,
	};
}

/** Words we don't want driving a match (too common to be meaningful). */
const STOPWORDS = new Set([
	"a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "with", "we",
	"i", "need", "looking", "want", "find", "a", "is", "are", "my", "our", "that",
	"can", "who", "someone", "some", "help", "me", "you", "it", "this", "these",
	"stellar", "soroban", "partner", "partners", "please", "hi", "hello",
]);

function tokenize(s: string): string[] {
	return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
		(t) => t.length > 1 && !STOPWORDS.has(t),
	);
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
 * Deterministically score partners against a plain-language need. Keyword
 * overlap across services/sectors/regions/type/tagline/description, with a
 * small nudge for accepting-clients + fresh profiles. Returns top `limit`,
 * best first — including the `blob` so the chat model can explain each.
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
		return docs
			.slice(0, limit)
			.map((p) => ({ score: 0, partner: toPublic(p), blob: partnerBlob(p) }));
	}

	const scored = docs.map((p) => {
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
		return { score, partner: toPublic(p), blob: partnerBlob(p) };
	});

	const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
	// If nothing overlaps, hand back a small sample so the model can still say
	// "closest I found" rather than nothing.
	return (hits.length ? hits : scored).slice(0, limit);
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
		(p.rampTypes ?? []).length ? `ramps: ${(p.rampTypes ?? []).join(", ")}` : "",
		p.country ? `country: ${p.country}` : "",
		services.length ? `services: ${services.join(", ")}` : "",
		(p.sectors ?? []).length ? `sectors: ${(p.sectors ?? []).join(", ")}` : "",
		(p.regions ?? []).length ? `regions: ${(p.regions ?? []).join(", ")}` : "",
		p.acceptingClients ? "accepting clients" : "",
		p.contactEmail || p.contactChannel ? "contactable" : "no direct contact listed",
	].filter(Boolean);
	return parts.join(" · ");
}

export { toPublic as toPublicPartner };
