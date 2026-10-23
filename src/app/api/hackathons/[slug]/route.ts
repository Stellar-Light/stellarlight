/**
 * Single hackathon detail with full project submissions, winners, and
 * post-hackathon outcome funnel.
 *
 *   GET /api/hackathons/{slug}
 *
 * Returns the hackathon's metadata + every Project that's tagged with
 * `hackathon = {id}`, including placements, prize amounts, prize tracks,
 * and post-hack status (Built / In Progress / Abandoned).
 *
 * The body is built by getHackathonDetail (src/lib/hackathon-detail.ts),
 * which the event page renders too.
 */

import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logApiHit } from "@/lib/api-usage";
import { getHackathonDetail } from "@/lib/hackathon-detail";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ slug: string }> },
) {
	const startedAt = Date.now();
	const { slug } = await params;
	const payload = await getPayloadSafe();
	if (!payload) {
		return apiError({
			status: 503,
			error: "hackathon store unavailable",
			advisory:
				"The hackathon store did not answer. This is an outage, not a statement that the hackathon is unknown. Retry after Retry-After.",
			retryAfterSeconds: 2,
			startedAt,
		});
	}

	try {
		const detail = await getHackathonDetail(payload, slug);
		if (!detail.found) return NextResponse.json(detail.body, { status: 404 });
		logApiHit({
			req,
			endpoint: "/api/hackathons/[slug]",
			filters:
				detail.source === "dorahacks"
					? { slug, source: "dorahacks" }
					: { slug },
		});
		return NextResponse.json(detail.body, {
			headers: {
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
			},
		});
	} catch (err) {
		console.error("hackathon detail failed", err);
		return NextResponse.json({ error: "internal error" }, { status: 500 });
	}
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
