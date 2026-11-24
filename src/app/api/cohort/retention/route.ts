/**
 * GET /api/cohort/retention: launched, launch known by basis, day-180
 * readings, operating now and SCF-confirmed launch retention, SCF against
 * the rest and by first award year, type and size, each with its
 * denominator; the facts register's own rows for these figures; SCF
 * delivery by round. Partner-only (COHORT_PARTNERS); see src/lib/sdf-cohort.ts.
 */
import { type NextRequest, NextResponse } from "next/server";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import {
	COHORT_DEFINITIONS,
	cohortBadRequest,
	cohortMeta,
	cohortRequest,
	cohortRetention,
} from "@/lib/sdf-cohort";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
	const gate = cohortRequest(req, "/api/cohort/retention");
	if ("response" in gate) return gate.response;
	const { bundle, headers } = gate;
	const unknown = [...req.nextUrl.searchParams.keys()][0];
	if (unknown)
		return cohortBadRequest(`Unknown query param '${unknown}'.`, {
			validParams: [],
		});
	return NextResponse.json(
		{
			meta: {
				...cohortMeta(bundle),
				definitions: COHORT_DEFINITIONS,
			},
			...cohortRetention(bundle),
			register: bundle.register,
		},
		{ headers },
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
