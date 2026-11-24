/**
 * GET /api/cohort/journey?slug=<slug>: one project's dated events, oldest
 * first, each with its evidence link, source, strength and basis.
 * Partner-only (COHORT_PARTNERS); see src/lib/sdf-cohort.ts.
 */
import { type NextRequest, NextResponse } from "next/server";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import {
	cohortBadRequest,
	cohortMeta,
	cohortRequest,
	journeyOf,
} from "@/lib/sdf-cohort";

export const dynamic = "force-dynamic";

const JOURNEY_CANNOT_SEE = [
	"Launch dates for most projects funded before 2023: SCF's Legacy awards were paid in full on award, Horizon keeps history only from 2025-10-10, and few of those products published a stellar.toml the web archive captured.",
	"Day-180 rows are computed from the launch date (strength derived) and carry no link; a few other rows have no stable link.",
	"An address, repo or package tied to more than one project proves nothing and is left out, except curated issuer and token families, which carry strength labelled.",
];

const STRENGTHS = {
	strong:
		"The project's own record, or a ledger or registry fact tied to it on strong evidence.",
	labelled:
		"A third party's attribution: an address label, DefiLlama's contract list, an issuer and token family.",
	weaker:
		"A domain, a web archive capture, a team's plan, a whole-organisation repo list. A domain or archive date can belong to an earlier owner.",
	derived: "Computed (day 180 after launch), not observed.",
};

export async function GET(req: NextRequest) {
	const gate = cohortRequest(req, "/api/cohort/journey");
	if ("response" in gate) return gate.response;
	const { bundle, headers } = gate;
	const sp = req.nextUrl.searchParams;
	const unknown = [...sp.keys()].find((k) => k !== "slug");
	if (unknown)
		return cohortBadRequest(`Unknown query param '${unknown}'.`, {
			validParams: ["slug"],
		});
	const slug = sp.get("slug")?.trim().toLowerCase();
	if (!slug)
		return cohortBadRequest("slug is required.", {
			hint: "Pass a project slug from /api/cohort/projects.",
		});
	const events = journeyOf(bundle, slug);
	if (!events)
		return NextResponse.json(
			{
				error: `Unknown project '${slug}'.`,
				hint: "Pass a project slug from /api/cohort/projects.",
			},
			{ status: 404, headers },
		);
	const p = bundle.projects.find((x) => x.slug === slug);
	return NextResponse.json(
		{
			meta: {
				...cohortMeta(bundle, JOURNEY_CANNOT_SEE),
				counts: {
					events: events.length,
					withEvidenceUrl: events.filter((e) => e.evidenceUrl).length,
				},
				order: "Oldest first by date (a window sorts by its earliest date).",
				strengths: STRENGTHS,
			},
			project: {
				slug,
				name: p?.name ?? null,
				status: p?.status ?? null,
				category: p?.category ?? null,
				gaps: p?.gaps ?? [],
			},
			events,
		},
		{ headers },
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
