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
import { boolParam, clampLimit } from "@/lib/http-params";
import { logApiHit } from "@/lib/api-usage";
import { partnerTrust } from "@/lib/confidence";
import { getPayloadSafe } from "@/lib/payload-client";
import { methodNotAllowed } from "@/lib/method-not-allowed";

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

/**
 * Map a Payload partner doc → the public shape. Drops auth/internal fields,
 * flattens the verified group, and derives a freshness object consumers
 * can act on without knowing our day thresholds.
 */
// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape varies; we read a known subset
function toPublic(p: any) {
	const verified = p.verified ?? {};
	const freshnessStatus = p.freshnessStatus ?? "fresh";
	return {
		slug: p.slug,
		name: p.name,
		partnerType: p.partnerType,
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
		assets: (p.assets ?? []).map((a: { code: string }) => a.code).filter(Boolean),
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
	const accepting = boolParam(sp.get("accepting"));
	const q = sp.get("q")?.toLowerCase().trim();
	const limit = clampLimit(sp.get("limit"), 50, 100);
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	if (type && !PARTNER_TYPES.includes(type)) {
		return NextResponse.json(
			{ error: `Unknown type '${type}'`, validTypes: PARTNER_TYPES },
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
			if (accepting) where.acceptingClients = { equals: true };

			const result = await payload.find({
				collection: "partner-accounts",
				where,
				limit: 200,
				depth: 0,
			});

			let mapped = result.docs.map(toPublic);

			// Free-text filter across name/tagline/description/services — in
			// memory, same approach as projects/builders search.
			if (q) {
				const tokens = q.split(/\s+/).filter(Boolean);
				mapped = mapped.filter((m) => {
					const hay =
						`${m.name} ${m.tagline ?? ""} ${m.description ?? ""} ${m.services.join(" ")}`.toLowerCase();
					return tokens.every((t) => hay.includes(t));
				});
			}

			// Fresh partners first — never lead a builder toward a stale one.
			const rank = { fresh: 0, aging: 1, stale: 2, archived: 3 } as Record<
				string,
				number
			>;
			mapped.sort(
				(a, b) =>
					(rank[a.freshness.status] ?? 9) - (rank[b.freshness.status] ?? 9),
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
		filters: { type, sector, region, accepting, limit, offset },
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
					accepting,
					q: q ?? null,
					limit,
					offset,
				},
				counts: { returned: partners.length, total: totalMatching },
				validTypes: PARTNER_TYPES,
				note: "Published partners only. `verified` fields are system-computed; `freshness.excludeFromMatching` flags partners too stale for AI matching.",
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
