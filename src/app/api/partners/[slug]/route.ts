/**
 * Single partner detail.
 *
 *   GET /api/partners/{slug}
 *
 * Published partners only. The list endpoint's row, from the same
 * serializer (partnerToPublic). 404 for unknown or
 * unpublished slugs — drafts and archived-but-unpublished partners stay
 * invisible to the public + to agents.
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { partnerRowOpts, partnerToPublic } from "@/lib/partner-public";
import { getPayloadSafe } from "@/lib/payload-client";
import { serverTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";
// The caller gives up at 10 s; a request still working past 20 s is a
// stall, and finishing it helps nobody.
export const maxDuration = 20;
export const revalidate = 300;

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ slug: string }> },
) {
	const startedAt = Date.now();
	const { slug } = await params;

	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{
				error: "directory temporarily unavailable",
				advisory:
					"The database handle could not be opened. This is an outage, NOT a claim that the partner does not exist. Retry after a moment.",
				retryAfterSeconds: 2,
			},
			{
				status: 503,
				headers: { ...serverTiming(startedAt), "Retry-After": "2" },
			},
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
				{
					error: `Partner '${slug}' not found`,
					hint: "See /api/partners for the published directory.",
				},
				{ status: 404 },
			);
		}

		logApiHit({
			req,
			startedAt,
			status: 200,
			endpoint: "/api/partners/[slug]",
			query: slug,
		});

		return NextResponse.json(
			{
				meta: {
					source: `https://stellarlight.xyz/partners/${slug}`,
					generatedAt: new Date().toISOString(),
				},
				partner: partnerToPublic(doc, partnerRowOpts(req)),
			},
			{
				headers: {
					...serverTiming(startedAt),
					"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
				},
			},
		);
	} catch {
		logApiHit({
			req,
			startedAt,
			status: 503,
			endpoint: "/api/partners/[slug]",
			query: slug,
		});
		return NextResponse.json(
			{
				error: "directory lookup failed",
				advisory:
					"The partner record could not be read. This is an outage, NOT a claim that the partner does not exist. Retry after a moment.",
				retryAfterSeconds: 2,
			},
			{
				status: 503,
				headers: { ...serverTiming(startedAt), "Retry-After": "2" },
			},
		);
	}
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
