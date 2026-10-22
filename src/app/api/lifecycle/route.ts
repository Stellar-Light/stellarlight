/**
 * GET /api/lifecycle: the project lifecycle report (launched, alive under
 * three definitions, SCF vs everyone else, cohorts, changes, N-day survival),
 * computed daily from dated snapshots of what the directory serves. The
 * human view is /lifecycle. Internal for now: not in the public spec.
 */
import { type NextRequest, NextResponse } from "next/server";
import { rateLimited } from "@/lib/api-error";
import {
	getLifecycleReport,
	LIFECYCLE_REPORT_URL,
} from "@/lib/lifecycle-report";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { serverTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
	const startedAt = Date.now();
	const limit = rateLimit(req, {
		endpoint: "/api/lifecycle",
		limit: 60,
		windowMs: 60_000,
	});
	if (!limit.allowed) return rateLimited(limit, { startedAt });
	const { report, from } = await getLifecycleReport();
	return NextResponse.json(
		{
			meta: {
				source:
					from === "repository"
						? LIFECYCLE_REPORT_URL
						: "the copy bundled at the last deploy",
				generatedAt: report.generatedAt,
				page: "https://stellarlight.xyz/lifecycle",
				note: "Percentages on the page are of launched projects. Every count comes from a dated snapshot in data/snapshots/projects/.",
			},
			...report,
		},
		{
			headers: {
				...rateLimitHeaders(limit),
				...serverTiming(startedAt),
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
			},
		},
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
