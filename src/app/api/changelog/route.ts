/**
 * Changelog endpoint for Stellar Scout.
 *
 *   GET /api/changelog
 *   GET /api/changelog?since=2026-06-20   (entries on/after a date)
 *   GET /api/changelog?limit=10           (cap, latest-first)
 *
 * A curated, agent-readable feed of notable changes to the public API,
 * MCP tools, and typed client — so a consuming agent (or its owner) can
 * point at one URL to see "what changed lately" without reading git history.
 *
 * Static (no Payload/DB) and CDN-cacheable.
 */

import { NextResponse } from "next/server";
import { CHANGELOG } from "@/lib/changelog";
import { methodNotAllowed } from "@/lib/method-not-allowed";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const SCOUT_SKILL_VERSION = "scout-1.0.0";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);

	const since = searchParams.get("since");
	if (since && !ISO_DATE.test(since)) {
		return NextResponse.json(
			{ ok: false, error: "invalid_since", message: "`since` must be an ISO date (YYYY-MM-DD)." },
			{ status: 400 },
		);
	}

	const limitRaw = searchParams.get("limit");
	const limit = limitRaw ? Math.max(1, Math.min(100, Number.parseInt(limitRaw, 10) || 0)) : undefined;

	// CHANGELOG is authored latest-first; filter then cap.
	let entries = CHANGELOG;
	if (since) entries = entries.filter((e) => e.date >= since);
	const total = entries.length;
	if (limit) entries = entries.slice(0, limit);

	return NextResponse.json(
		{
			ok: true,
			service: "Stellar Scout",
			version: SCOUT_SKILL_VERSION,
			generatedAt: new Date().toISOString(),
			meta: {
				returned: entries.length,
				total,
				latest: CHANGELOG[0]?.date ?? null,
				filters: { since: since ?? null, limit: limit ?? null },
				note: "Curated feed of contract-affecting changes (endpoints, tools, params, descriptions). Latest-first.",
			},
			entries,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
			},
		},
	);
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
