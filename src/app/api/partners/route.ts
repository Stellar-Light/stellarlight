/**
 * Public partner directory.
 *
 *   GET /api/partners
 *   GET /api/partners?type=anchor&sector=payments&region=latam&accepting=1
 *   GET /api/partners?q=off-ramp
 *
 * Read-only, published partners only. The surface the AI matchmaker and
 * Tyler-style agents consume. Every entry carries:
 *   - partner-claimed facts (services, regions, pricing, capacity)
 *   - verified signals (GitHub activity, on-chain, SCF) — system-computed
 *   - a freshness object so consumers never recommend a stale partner
 *     (the Okashi problem, applied to partners)
 *
 * Pagination matches the rest of the API: limit + offset, counts.total.
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { partnerTrust } from "@/lib/confidence";
import { isExperimentOn } from "@/lib/experiments";
import { boolParam, clampLimit } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { scorePartners } from "@/lib/partner-match";
import { passesQualityBar } from "@/lib/partner-quality";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 300;

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

// Mirrors Partners.rampTypes select options.
const RAMP_TYPES = ["on-ramp", "off-ramp"];

/**
 * Map a Payload partner doc → the public shape. Drops auth/internal fields,
 * flattens the verified group, and derives a freshness object consumers
 * can act on without knowing our day thresholds.
 */
// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape varies; we read a known subset
function toPublic(
	p: any,
	opts: { compliance?: boolean; onchain?: boolean } = {},
) {
	const verified = p.verified ?? {};
	const freshnessStatus = p.freshnessStatus ?? "fresh";
	// EXPERIMENT partner-compliance-api (default OFF): expose curator-verified
	// compliance/corridor facts to agents. Gated so it's not in the stable
	// contract until it graduates. Only present when the experiment is on AND
	// the partner actually has compliance data.
	// biome-ignore lint/suspicious/noExplicitAny: gated experimental fields
	const gated: any = {};
	if (opts.compliance && p.compliance) {
		const c = p.compliance;
		gated.compliance = {
			licenses: (c.licenses ?? []).map(
				(l: { authority?: string; jurisdiction?: string; type?: string }) => ({
					authority: l.authority ?? null,
					jurisdiction: l.jurisdiction ?? null,
					type: l.type ?? null,
				}),
			),
			kycRequired: c.kycRequired ?? null,
			travelRule: c.travelRule ?? null,
			currencies: c.currencies ?? null,
			settlementTime: c.settlementTime ?? null,
			notableCustomers: c.notableCustomers ?? null,
		};
	}
	// EXPERIMENT partner-onchain-live (default OFF): expose the domain-matched
	// on-chain reality of each anchor's OWN issued assets (git-free trust
	// signal). Same gating discipline as compliance — not in the stable contract
	// until it graduates. Only present when opted in AND the partner has data.
	if (opts.onchain && Array.isArray(p.onchain) && p.onchain.length > 0) {
		gated.onchain = p.onchain.map(
			(a: {
				code?: string;
				issuer?: string;
				holders?: number;
				payments?: number;
				rating?: number;
				asOf?: string;
			}) => ({
				code: a.code ?? null,
				issuer: a.issuer ?? null,
				holders: a.holders ?? null,
				payments: a.payments ?? null,
				rating: a.rating ?? null,
				asOf: a.asOf ?? null,
			}),
		);
	}
	return {
		...gated,
		slug: p.slug,
		name: p.name,
		partnerType: p.partnerType,
		// Pilot cohort — the select partners featured first in the directory.
		pilot: Boolean(p.pilot),
		tagline: p.tagline ?? null,
		description: p.description ?? null,
		logoUrl: p.logoUrl ?? null,
		websiteUrl: p.websiteUrl ?? null,
		foundedYear: p.foundedYear ?? null,
		services: (p.services ?? [])
			.map((s: { tag: string }) => s.tag)
			.filter(Boolean),
		sectors: p.sectors ?? [],
		regions: p.regions ?? [],
		// Anchor capabilities from stellar.toml (SEP-1) — same source as
		// anchors.stellar.org. Empty for non-anchors.
		assets: (p.assets ?? [])
			.map((a: { code: string }) => a.code)
			.filter(Boolean),
		seps: p.seps ?? [],
		rampTypes: p.rampTypes ?? [],
		country: p.country ?? null,
		acceptingClients: p.acceptingClients ?? null,
		typicalEngagement: p.typicalEngagement ?? null,
		leadTime: p.leadTime ?? null,
		pricingModel: p.pricingModel ?? null,
		pricingNotes: p.pricingNotes ?? null,
		docsUrl: p.docsUrl ?? null,
		githubOrg: p.githubOrg ?? null,
		contactEmail: p.contactEmail ?? null,
		contactChannel: p.contactChannel ?? null,
		responseSla: p.responseSla ?? null,
		caseStudies: (p.caseStudies ?? []).map(
			(c: { title: string; url?: string; projectSlug?: string }) => ({
				title: c.title,
				url: c.url ?? null,
				projectSlug: c.projectSlug ?? null,
			}),
		),
		// System-verified signals — what an agent trusts over self-claims.
		verified: {
			githubLastCommitAt: verified.githubLastCommitAt ?? null,
			githubCommits90d: verified.githubCommits90d ?? null,
			onchainActive: verified.onchainActive ?? null,
			onchainNote: verified.onchainNote ?? null,
			scfInvolvement: verified.scfInvolvement ?? null,
			lastAutoVerifyAt: verified.lastAutoVerifyAt ?? null,
		},
		// Freshness — consumers should down-rank or skip non-current partners.
		freshness: {
			status: freshnessStatus,
			lastPartnerUpdateAt: p.lastPartnerUpdateAt ?? null,
			isCurrent: freshnessStatus === "fresh",
			// archived = partner went dark >1y; usable for display, never for AI matches
			excludeFromMatching: freshnessStatus === "archived",
		},
		// Single profile-trust score (0–1 + label) blending freshness with how
		// much of the profile is system-verified (on-chain, recent commits,
		// SCF) — so a consumer gets one number instead of interpreting five
		// fields. Same trust vocabulary as /api/research confidence.
		trust: partnerTrust({
			freshnessStatus,
			verified: {
				onchainActive: verified.onchainActive ?? null,
				githubCommits90d: verified.githubCommits90d ?? null,
				scfInvolvement: verified.scfInvolvement ?? null,
			},
		}),
		url: `https://stellarlight.xyz/partners/${p.slug}`,
	};
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const type = sp.get("type");
	const sector = sp.get("sector");
	const region = sp.get("region");
	const ramps = sp.get("ramps");
	const accepting = boolParam(sp.get("accepting"));
	const all = boolParam(sp.get("all"));
	const q = sp.get("q")?.toLowerCase().trim();
	const limit = clampLimit(sp.get("limit"), 50, 100);
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	if (type && !PARTNER_TYPES.includes(type)) {
		return NextResponse.json(
			{ error: `Unknown type '${type}'`, validTypes: PARTNER_TYPES },
			{ status: 400 },
		);
	}

	// Fiat-ramp capability filter (Partners.rampTypes). Comma-separated values
	// require ALL listed ramps; unknown values 400 rather than the silently-
	// ignored-param trap this filter was born from (stellar-scout#7).
	const rampList = ramps
		? ramps
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		: [];
	const badRamp = rampList.find((r) => !RAMP_TYPES.includes(r));
	if (badRamp) {
		return NextResponse.json(
			{ error: `Unknown ramp '${badRamp}'`, validRamps: RAMP_TYPES },
			{ status: 400 },
		);
	}

	let partners: ReturnType<typeof toPublic>[] = [];
	let totalMatching = 0;

	const payload = await getPayloadSafe();
	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload Where type is awkward
			const where: any = { status: { equals: "published" } };
			if (type) where.partnerType = { equals: type };
			if (sector) where.sectors = { contains: sector };
			if (region) where.regions = { contains: region };
			if (rampList.length)
				where.and = rampList.map((r) => ({ rampTypes: { contains: r } }));
			if (accepting) where.acceptingClients = { equals: true };

			const result = await payload.find({
				collection: "partner-accounts",
				where,
				limit: 200,
				depth: 0,
			});

			// Directory quality gate (default ON; ?all=1 bypasses): only complete,
			// non-archived profiles show by default — 28/47 seeds are placeholder
			// rows without a tagline. In-memory on ≤200 docs; display-only (the
			// concierge matcher keeps its own eligibility rule).
			const eligible = all ? result.docs : result.docs.filter(passesQualityBar);
			const bySlug = new Map(eligible.map((d) => [String(d.slug), d]));

			// Ranking:
			//  - with q: relevance via the SHARED scorer (scorePartners) — the same
			//    engine the concierge matchmaker uses: partial/OR match weighted by
			//    the structured capability fields (assets, ramps, SEPs, country…)
			//    and region-gated. Replaces the old strict all-token-AND text filter
			//    that returned 1 partner for "USDC off-ramp" when 8 actually fit —
			//    and perversely returned FEWER results the more keywords you added.
			//  - without q: pilot cohort first, then freshness.
			const freshRank = { fresh: 0, aging: 1, stale: 2, archived: 3 } as Record<
				string,
				number
			>;
			const ordered = q
				? (scorePartners(q, eligible, eligible.length)
						.map((s) => bySlug.get(s.partner.slug))
						.filter(Boolean) as typeof eligible)
				: [...eligible].sort(
						(a, b) =>
							Number(Boolean(b.pilot)) - Number(Boolean(a.pilot)) ||
							(freshRank[String(a.freshnessStatus ?? "fresh")] ?? 9) -
								(freshRank[String(b.freshnessStatus ?? "fresh")] ?? 9),
					);

			// EXPERIMENTS (default off): include the gated blocks only when opted
			// in via ?exp=<id> / X-Experiments header / env canary.
			const withCompliance = isExperimentOn("partner-compliance-api", req);
			const withOnchain = isExperimentOn("partner-onchain-live", req);
			const mapped = ordered.map((p) =>
				toPublic(p, { compliance: withCompliance, onchain: withOnchain }),
			);

			totalMatching = mapped.length;
			partners = mapped.slice(offset, offset + limit);
		} catch {
			// fall through with empty
		}
	}

	logApiHit({
		req,
		endpoint: "/api/partners",
		query: q,
		filters: { type, sector, region, ramps, accepting, all, limit, offset },
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/partners",
				generatedAt: new Date().toISOString(),
				filters: {
					type,
					sector,
					region,
					ramps: ramps ?? null,
					accepting,
					all,
					q: q ?? null,
					limit,
					offset,
				},
				counts: { returned: partners.length, total: totalMatching },
				validTypes: PARTNER_TYPES,
				validRamps: RAMP_TYPES,
				note: "Published partners only. Default results pass a directory quality bar (tagline + contact path, non-archived); pass all=1 for the unfiltered set. With `q`, results are relevance-ranked by fit — weighted across the structured capability fields (assets, ramps, SEPs, country, services) and region, not exact-keyword text — so a natural query like 'USDC off-ramp' surfaces anchors by capability; without `q`, pilot partners sort first, then freshness. `verified` fields are system-computed; `freshness.excludeFromMatching` flags partners too stale for AI matching.",
			},
			partners,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
			},
		},
	);
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
