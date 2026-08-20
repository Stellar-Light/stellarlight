/**
 * Historical-name resolution.
 *
 *   GET /api/projects/resolve?q=passport
 *   → subject "passport" (Inactive) · current "stellar-passport"
 *
 * The agent-facing half of something we already do for people: a dead slug
 * 307s to its survivor in a browser, but a machine reading an old post,
 * changelog or repo had no way to ask what a stale name is now. This is that
 * question, answered as data.
 *
 * Three rules it will not break:
 *   - a MISS is an answer. "Not tracked here" is true and useful; guessing a
 *     near-match would attribute one company's history to another.
 *   - an inactive status with no source says so. We hold ~80 inactive rows
 *     and 10 carry a source URL, so most of what this returns is our own
 *     unverified record — and it is labelled that way rather than laundered
 *     into a fact about a named company.
 *   - "no successor recorded" is never "nothing succeeded it".
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { type ResolvableProject, resolveProject } from "@/lib/resolve-project";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const KNOWN_PARAMS = new Set(["q"]);
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const unknown = [...sp.keys()].find((k) => !KNOWN_PARAMS.has(k));
	if (unknown) {
		return NextResponse.json(
			{ error: `Unknown query param '${unknown}'.`, validParams: ["q"] },
			{ status: 400, headers: CORS },
		);
	}

	const q = (sp.get("q") ?? "").trim();
	if (!q) {
		return NextResponse.json(
			{
				error:
					"`q` is required — the name, slug, or project URL an agent encountered.",
			},
			{ status: 400, headers: CORS },
		);
	}

	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{
				error: "project store unavailable",
				advisory:
					"The datastore was unreachable. This is an outage — NOT a resolution miss, and NOT a claim the name is untracked. Retry before concluding anything about it.",
			},
			{ status: 503, headers: CORS },
		);
	}

	// The whole set, matched in JS: resolution is normalization-aware
	// (case, punctuation, aliases) which a Payload `contains` cannot express
	// without the substring trap.
	const found = await payload.find({
		collection: "projects",
		limit: 5000,
		depth: 0,
		select: {
			slug: true,
			name: true,
			status: true,
			statusAsOf: true,
			statusBasis: true,
			statusSourceUrl: true,
			canonicalSlug: true,
			aliases: true,
		},
	});

	const resolution = resolveProject(q, found.docs as ResolvableProject[]);

	logApiHit({
		req,
		endpoint: "/api/projects/resolve",
		filters: { q },
		resultCount: resolution.found ? 1 : 0,
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/api/projects/resolve",
				generatedAt: new Date().toISOString(),
				searched: found.totalDocs,
				methodology:
					"Matches the query against project slugs, then aliases, then normalized names, strongest first; `matchedOn` reports which, so an exact slug can be weighted differently from a name collision. A name matching two projects returns a MISS naming both rather than picking one. `found: false` means the name is NOT TRACKED in this directory — never that it never existed and never that it is defunct. When a record carries a successor, `current` is where to look now and `superseded` is true. `evidence.unsourced: true` means we assert that status with no citable source, so it is our unverified record rather than an established fact about a named company.",
			},
			...resolution,
		},
		{
			headers: {
				...CORS,
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
			},
		},
	);
}

export function OPTIONS() {
	return new NextResponse(null, {
		headers: { ...CORS, "Access-Control-Allow-Headers": "Content-Type" },
	});
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
