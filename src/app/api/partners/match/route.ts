/**
 * AI partner matchmaker (Partner Connector, Brick 6).
 *
 *   POST /api/partners/match
 *   { "need": "USDC off-ramp in Mexico", "sector": "payments", "limit": 5 }
 *
 * A builder (or a Tyler-style agent) describes what they need in plain
 * language; Sonnet ranks the published partners by fit and explains each
 * pick. The human twin of the /partners directory's filters, but it reasons
 * over services/sectors/regions/verified-signals instead of exact-matching.
 *
 * Design notes:
 *   - Candidates come from the SAME published, non-archived set the public
 *     directory serves. Archived (gone-dark >1y) partners are excluded from
 *     matching entirely — freshness.excludeFromMatching, enforced here.
 *   - The model ranks; it does NOT invent. We validate every returned slug
 *     against the candidate set and drop anything unrecognized, so a
 *     hallucinated partner can never reach the response.
 *   - Cost is bounded: candidates capped, max_tokens capped, IP rate-limited
 *     (this is the one partner endpoint that costs LLM tokens per call).
 *   - Degrades gracefully: no ANTHROPIC_API_KEY → 503 unavailable; no
 *     candidates → empty matches with a note. Never 500s on a missing key.
 */

import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Matchmaker reasoning — Sonnet tier (the builder explicitly wants quality
// ranking, not just extraction). Sonnet 4.6 supports the effort param.
const MODEL = "claude-sonnet-4-6";

// LLM-cost endpoint: keep a firm per-IP floor against runaway agent loops.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Bound the prompt: never feed the model more than this many candidates.
const MAX_CANDIDATES = 40;

const PARTNER_TYPES = [
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
];

const MATCH_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		matches: {
			type: "array",
			description:
				"Ranked partners, best fit first. Include ONLY genuinely relevant partners — omit poor fits rather than padding the list.",
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					slug: {
						type: "string",
						description:
							"Must be one of the candidate slugs provided. Never invent one.",
					},
					score: {
						type: "number",
						description: "Fit for the stated need, 0–100 (100 = ideal).",
					},
					reason: {
						type: "string",
						description:
							"One concrete sentence citing the specific capability/coverage that makes this partner fit.",
					},
				},
				required: ["slug", "score", "reason"],
			},
		},
		summary: {
			type: "string",
			description:
				"One or two sentences for the builder: the overall picture, or — if nothing fits — what's missing in the ecosystem.",
		},
	},
	required: ["matches", "summary"],
} as const;

const MATCH_SYSTEM = `You are the partner matchmaker for Stellar Light. A builder describes what they need to integrate or buy on Stellar; you rank the candidate partners by how well they fit and explain each pick.

Rank on concrete fit: the partner's services, sectors, regions, type, and description versus the builder's stated need. Weigh trust signals too — prefer partners that are accepting clients, have a 'fresh' profile, and carry verified signals (recent GitHub activity, on-chain activity, SCF involvement) over ones that are stale or unverified, when fit is otherwise comparable.

Rules:
- Use ONLY the candidate slugs provided. Never invent a partner or a slug.
- Score 0–100 for fit to THIS need. Include only genuinely relevant partners; it is better to return 2 strong matches than 8 padded ones. Return an empty list if nothing fits, and say so in the summary.
- Each reason must be one sentence naming the specific capability or coverage that matches (e.g. "Offers USDC→MXN off-ramp via SEP-24 and serves Latin America"). No generic praise.
- Do not recommend a partner for something they don't actually list.`;

function getAnthropic(): Anthropic | null {
	const key = process.env.ANTHROPIC_API_KEY;
	if (!key) return null;
	return new Anthropic({ apiKey: key });
}

/** Compact candidate the model reasons over. Public/partner-claimed + verified. */
// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
function toCandidate(p: any) {
	const v = p.verified ?? {};
	return {
		slug: p.slug,
		name: p.name,
		type: p.partnerType,
		tagline: p.tagline ?? null,
		description: p.description ?? null,
		services: (p.services ?? [])
			.map((s: { tag: string }) => s.tag)
			.filter(Boolean),
		sectors: p.sectors ?? [],
		regions: p.regions ?? [],
		acceptingClients: p.acceptingClients ?? null,
		freshness: p.freshnessStatus ?? "fresh",
		verified: {
			scfInvolvement: v.scfInvolvement ?? null,
			onchainActive: v.onchainActive ?? null,
			githubCommits90d: v.githubCommits90d ?? null,
		},
	};
}

/** Public partner shape attached to each match in the response. */
// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
function toPublic(p: any) {
	return {
		slug: p.slug,
		name: p.name,
		partnerType: p.partnerType,
		tagline: p.tagline ?? null,
		websiteUrl: p.websiteUrl ?? null,
		acceptingClients: p.acceptingClients ?? null,
		sectors: p.sectors ?? [],
		regions: p.regions ?? [],
		freshness: { status: p.freshnessStatus ?? "fresh" },
		url: `https://stellarlight.xyz/partners/${p.slug}`,
	};
}

export async function OPTIONS() {
	// CORS preflight — headers themselves come from next.config headers().
	return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/partners/match",
		limit: RATE_LIMIT_MAX,
		windowMs: RATE_LIMIT_WINDOW_MS,
	});
	if (!limit.allowed) {
		const retry = Math.ceil((limit.resetAt - Date.now()) / 1000);
		return NextResponse.json(
			{ error: "rate limit exceeded", retryAfterSeconds: retry },
			{
				status: 429,
				headers: { ...rateLimitHeaders(limit), "Retry-After": String(retry) },
			},
		);
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "Invalid JSON" },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const need = String((body as { need?: unknown }).need ?? "").trim();
	if (!need) {
		return NextResponse.json(
			{ error: "Provide a `need` — what are you trying to integrate or buy?" },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}
	const type = (body as { type?: unknown }).type;
	const sector = (body as { sector?: unknown }).sector;
	const region = (body as { region?: unknown }).region;
	const maxResults = Math.min(
		Math.max(Number((body as { limit?: unknown }).limit) || 5, 1),
		10,
	);

	if (type && (typeof type !== "string" || !PARTNER_TYPES.includes(type))) {
		return NextResponse.json(
			{ error: `Unknown type '${String(type)}'`, validTypes: PARTNER_TYPES },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const anthropic = getAnthropic();
	if (!anthropic) {
		return NextResponse.json(
			{
				error:
					"AI matchmaking isn't available right now — try the /partners directory filters.",
				unavailable: true,
			},
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}

	// ── Candidate set: same published source the directory serves ──
	const payload = await getPayloadSafe();
	// biome-ignore lint/suspicious/noExplicitAny: Payload docs
	let docs: any[] = [];
	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload Where shape
			const where: any = { status: { equals: "published" } };
			if (type) where.partnerType = { equals: type };
			if (sector) where.sectors = { contains: sector };
			if (region) where.regions = { contains: region };
			const res = await payload.find({
				collection: "partner-accounts",
				where,
				limit: 200,
				depth: 0,
			});
			docs = res.docs;
		} catch {
			docs = [];
		}
	}

	// Archived = gone dark >1y → never matchable. (Public directory still lists
	// them; the matchmaker must not.)
	const eligible = docs.filter(
		(p) => (p.freshnessStatus ?? "fresh") !== "archived",
	);

	logApiHit({
		req,
		endpoint: "/api/partners/match",
		query: need.slice(0, 100),
		filters: { type, sector, region, limit: maxResults },
	});

	if (eligible.length === 0) {
		return NextResponse.json(
			{
				meta: {
					source: "https://stellarlight.xyz/partners",
					generatedAt: new Date().toISOString(),
					model: MODEL,
					candidatesConsidered: 0,
				},
				need,
				matches: [],
				summary:
					"No partners are currently listed that could match — the directory is still onboarding its pilot cohort.",
			},
			{ headers: rateLimitHeaders(limit) },
		);
	}

	const bySlug = new Map(eligible.map((p) => [p.slug, p]));
	const candidates = eligible.slice(0, MAX_CANDIDATES).map(toCandidate);

	try {
		const res = await anthropic.messages.create({
			model: MODEL,
			max_tokens: 1500,
			thinking: { type: "adaptive" },
			system: MATCH_SYSTEM,
			messages: [
				{
					role: "user",
					content: `Builder's need:\n"${need}"\n\nCandidate partners (JSON):\n${JSON.stringify(candidates)}\n\nRank the partners that genuinely fit this need.`,
				},
			],
			// effort (Sonnet supports it) + structured output live in ONE
			// output_config object.
			output_config: {
				effort: "medium",
				format: {
					type: "json_schema",
					schema: MATCH_SCHEMA as unknown as Record<string, unknown>,
				},
			},
		});

		if (res.stop_reason === "refusal") {
			return NextResponse.json(
				{ error: "Could not process that request." },
				{ status: 422, headers: rateLimitHeaders(limit) },
			);
		}

		const text = res.content
			.filter((b): b is Anthropic.TextBlock => b.type === "text")
			.map((b) => b.text)
			.join("");
		let parsed: { matches?: unknown; summary?: unknown };
		try {
			parsed = JSON.parse(text);
		} catch {
			return NextResponse.json(
				{ error: "Matchmaker produced malformed output — try again." },
				{ status: 502, headers: rateLimitHeaders(limit) },
			);
		}

		// Validate every slug against the candidate set; drop hallucinations,
		// clamp scores, sort by score, attach public data, cap to maxResults.
		const rawMatches = Array.isArray(parsed.matches) ? parsed.matches : [];
		const matches = rawMatches
			.map((m) => {
				const slug = String((m as { slug?: unknown }).slug ?? "");
				const partner = bySlug.get(slug);
				if (!partner) return null;
				const score = Math.max(
					0,
					Math.min(
						100,
						Math.round(Number((m as { score?: unknown }).score) || 0),
					),
				);
				const reason = String((m as { reason?: unknown }).reason ?? "").trim();
				return { score, reason, partner: toPublic(partner) };
			})
			.filter((x): x is NonNullable<typeof x> => x !== null)
			.sort((a, b) => b.score - a.score)
			.slice(0, maxResults);

		return NextResponse.json(
			{
				meta: {
					source: "https://stellarlight.xyz/partners",
					generatedAt: new Date().toISOString(),
					model: MODEL,
					candidatesConsidered: candidates.length,
					note: "Slugs are validated against the published partner set; archived partners are excluded from matching.",
				},
				need,
				matches,
				summary: String(parsed.summary ?? "").trim(),
			},
			{ headers: rateLimitHeaders(limit) },
		);
	} catch (err) {
		if (err instanceof Anthropic.RateLimitError) {
			return NextResponse.json(
				{ error: "Busy right now — try again in a moment." },
				{ status: 429, headers: rateLimitHeaders(limit) },
			);
		}
		if (err instanceof Anthropic.APIError) {
			return NextResponse.json(
				{
					error:
						"Matchmaking hit a snag — try the /partners directory filters.",
				},
				{ status: 502, headers: rateLimitHeaders(limit) },
			);
		}
		return NextResponse.json(
			{ error: "Unexpected error" },
			{ status: 500, headers: rateLimitHeaders(limit) },
		);
	}
}
