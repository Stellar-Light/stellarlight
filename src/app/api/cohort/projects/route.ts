/**
 * GET /api/cohort/projects: one row per directory project, the cohort's
 * stage dates, launch, day-180, operating-now and SCF tranche fields.
 * Partner-only (COHORT_PARTNERS); see src/lib/sdf-cohort.ts.
 *
 *   ?scfAwarded=true&firstAwardYear=2024&awardType=build&category=Tooling&status=Live&limit=100&offset=0
 */
import { type NextRequest, NextResponse } from "next/server";
import { clampLimit, clampOffset, triStateBoolParam } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { PROJECT_STATUSES } from "@/lib/project-status";
import {
	AWARD_TYPES,
	COHORT_DEFINITIONS,
	categoriesOf,
	cohortBadRequest,
	cohortMeta,
	cohortRequest,
	filterProjects,
} from "@/lib/sdf-cohort";

export const dynamic = "force-dynamic";

const KNOWN = [
	"scfAwarded",
	"firstAwardYear",
	"awardType",
	"category",
	"status",
	"limit",
	"offset",
];

export async function GET(req: NextRequest) {
	const gate = cohortRequest(req, "/api/cohort/projects");
	if ("response" in gate) return gate.response;
	const { bundle, headers } = gate;
	const sp = req.nextUrl.searchParams;
	const unknown = [...sp.keys()].find((k) => !KNOWN.includes(k));
	if (unknown)
		return cohortBadRequest(`Unknown query param '${unknown}'.`, {
			validParams: KNOWN,
		});
	const scfAwarded = triStateBoolParam(sp.get("scfAwarded"));
	if (scfAwarded === "invalid")
		return cohortBadRequest(`Invalid scfAwarded '${sp.get("scfAwarded")}'.`, {
			validValues: ["true", "false"],
		});
	const firstAwardYear = sp.get("firstAwardYear")?.trim() || undefined;
	if (firstAwardYear && !/^\d{4}$/.test(firstAwardYear))
		return cohortBadRequest(`Invalid firstAwardYear '${firstAwardYear}'.`, {
			hint: "A four-digit year, e.g. 2024.",
		});
	const awardType = sp.get("awardType")?.trim().toLowerCase() || undefined;
	if (awardType && !(AWARD_TYPES as readonly string[]).includes(awardType))
		return cohortBadRequest(`Invalid awardType '${awardType}'.`, {
			validValues: AWARD_TYPES,
		});
	const category = sp.get("category")?.trim() || undefined;
	const categories = categoriesOf(bundle);
	if (
		category &&
		!categories.some((c) => c.toLowerCase() === category.toLowerCase())
	)
		return cohortBadRequest(`Invalid category '${category}'.`, {
			validValues: categories,
		});
	const statusRaw = sp.get("status")?.trim().toLowerCase();
	const status = PROJECT_STATUSES.find((s) => s.toLowerCase() === statusRaw);
	if (statusRaw && !status)
		return cohortBadRequest(`Invalid status '${sp.get("status")}'.`, {
			validValues: PROJECT_STATUSES,
		});
	const limit = clampLimit(sp.get("limit"), 100, 1000);
	const offset = clampOffset(sp.get("offset"));
	const filters = {
		scfAwarded,
		firstAwardYear,
		awardType: awardType as (typeof AWARD_TYPES)[number] | undefined,
		category,
		status,
	};
	const rows = filterProjects(bundle, filters);
	const page = rows.slice(offset, offset + limit);
	return NextResponse.json(
		{
			meta: {
				...cohortMeta(bundle, [
					"gaps on each row names what is not known about that project; it is never filled in.",
				]),
				filters: { ...filters, limit, offset },
				counts: { returned: page.length, total: rows.length },
				order: "Alphabetical by slug. Order is not a rank.",
				definitions: COHORT_DEFINITIONS,
			},
			projects: page,
		},
		{ headers },
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
