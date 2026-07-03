/**
 * Single partner detail.
 *
 *   GET /api/partners/{slug}
 *
 * Published partners only. Same public shape as the list endpoint's items
 * (partner-claimed + verified signals + freshness). 404 for unknown or
 * unpublished slugs — drafts and archived-but-unpublished partners stay
 * invisible to the public + to agents.
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { getPayloadSafe } from "@/lib/payload-client";
import { methodNotAllowed } from "@/lib/method-not-allowed";

export const dynamic = "force-dynamic";
export const revalidate = 300;

// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape varies
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
		services: (p.services ?? []).map((s: { tag: string }) => s.tag).filter(Boolean),
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
		verified: {
			githubLastCommitAt: verified.githubLastCommitAt ?? null,
			githubCommits90d: verified.githubCommits90d ?? null,
			onchainActive: verified.onchainActive ?? null,
			onchainNote: verified.onchainNote ?? null,
			scfInvolvement: verified.scfInvolvement ?? null,
			lastAutoVerifyAt: verified.lastAutoVerifyAt ?? null,
		},
		freshness: {
			status: freshnessStatus,
			lastPartnerUpdateAt: p.lastPartnerUpdateAt ?? null,
			isCurrent: freshnessStatus === "fresh",
			excludeFromMatching: freshnessStatus === "archived",
		},
		url: `https://stellarlight.xyz/partners/${p.slug}`,
	};
}

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ slug: string }> },
) {
	const { slug } = await params;

	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{ error: "directory temporarily unavailable" },
			{ status: 503 },
		);
	}

	try {
		const result = await payload.find({
			collection: "partner-accounts",
			where: {
				and: [{ slug: { equals: slug } }, { status: { equals: "published" } }],
			},
			limit: 1,
			depth: 0,
		});

		const doc = result.docs[0];
		if (!doc) {
			return NextResponse.json(
				{ error: `Partner '${slug}' not found`, hint: "See /api/partners for the published directory." },
				{ status: 404 },
			);
		}

		logApiHit({ req, endpoint: "/api/partners/[slug]", query: slug });

		return NextResponse.json(
			{
				meta: {
					source: `https://stellarlight.xyz/partners/${slug}`,
					generatedAt: new Date().toISOString(),
				},
				partner: toPublic(doc),
			},
			{
				headers: {
					"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
				},
			},
		);
	} catch {
		return NextResponse.json(
			{ error: "directory lookup failed" },
			{ status: 500 },
		);
	}
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
