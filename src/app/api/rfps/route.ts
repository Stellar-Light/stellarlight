/**
 * Public read-only Stellar RFPs endpoint.
 *
 *   GET /api/rfps
 *   GET /api/rfps?category=defi
 *   GET /api/rfps?quarter=q2-2026
 *   GET /api/rfps?q=stablecoin
 *
 * Returns the curated set of confirmed RFPs (Requests for Proposals) for
 * the Stellar ecosystem — sponsor briefs that will be funded by the
 * Stellar Community Fund when winners are picked. Mirrors what's on the
 * /ideas page; powers Stellar Scout so the agent can answer "what
 * upcoming RFPs match my idea?" without an external lookup.
 */

import { type NextRequest, NextResponse } from "next/server";
import { clampLimit } from "@/lib/http-params";
import {
	ACTIVE_QUARTER,
	CATEGORIES,
	CATEGORY_LABELS,
	type Category,
	IDEAS,
	type Idea,
	QUARTER_LABELS,
	QUARTERS,
	type Quarter,
	type RfpStatus,
	rfpStatus,
} from "@/data/ideas";
import { logApiHit } from "@/lib/api-usage";
import { jsonSafe } from "@/lib/json-safe";
import { methodNotAllowed } from "@/lib/method-not-allowed";

// force-dynamic so the query-param filters (q, category, quarter) actually
// apply — static generation collapses params at build time and would
// always return the full unfiltered set.
export const dynamic = "force-dynamic";
export const revalidate = 300;

interface RfpRow extends Idea {
	categoryLabel: string;
	quarterLabel: string;
	status: RfpStatus;
	url: string;
}

function toRow(i: Idea): RfpRow {
	return {
		...i,
		categoryLabel: CATEGORY_LABELS[i.category],
		quarterLabel: QUARTER_LABELS[i.quarter],
		status: rfpStatus(i.quarter),
		url: `https://stellarlight.xyz/ideas/${i.id}`,
	};
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const q = sp.get("q")?.toLowerCase().trim();
	const categoryFilter = sp.get("category") as Category | null;
	const quarterFilter = sp.get("quarter") as Quarter | null;
	const statusFilter = sp.get("status") as RfpStatus | null;
	const limit = clampLimit(sp.get("limit"), 100, 200);
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	// Reject an unrecognized category instead of silently returning ALL rows
	// (a footgun — the caller believes they filtered). Matches the 400+validX
	// pattern used by /api/hackathons, /api/research, /api/skills.
	if (
		categoryFilter &&
		!(CATEGORIES as readonly string[]).includes(categoryFilter)
	) {
		return NextResponse.json(
			{ error: `Invalid category '${categoryFilter}'.`, validCategories: CATEGORIES },
			{ status: 400 },
		);
	}
	if (statusFilter && statusFilter !== "open" && statusFilter !== "closed") {
		return NextResponse.json(
			{ error: `Invalid status '${statusFilter}'.`, validStatuses: ["open", "closed"] },
			{ status: 400 },
		);
	}
	if (quarterFilter && !(QUARTERS as readonly string[]).includes(quarterFilter)) {
		return NextResponse.json(
			{ error: `Invalid quarter '${quarterFilter}'.`, validQuarters: QUARTERS },
			{ status: 400 },
		);
	}

	let rfps: RfpRow[] = IDEAS.map(toRow);

	if (
		categoryFilter &&
		(CATEGORIES as readonly string[]).includes(categoryFilter)
	) {
		rfps = rfps.filter((r) => r.category === categoryFilter);
	}
	if (
		quarterFilter &&
		(QUARTERS as readonly string[]).includes(quarterFilter)
	) {
		rfps = rfps.filter((r) => r.quarter === quarterFilter);
	}
	if (statusFilter === "open" || statusFilter === "closed") {
		rfps = rfps.filter((r) => r.status === statusFilter);
	}
	if (q) {
		const tokens = q.split(/\s+/).filter(Boolean);
		rfps = rfps.filter((r) => {
			const hay =
				`${r.title} ${r.description} ${r.technicalRequirements ?? ""} ${r.categoryLabel}`.toLowerCase();
			return tokens.every((t) => hay.includes(t));
		});
	}

	// Matched count is post-filter, pre-slice — paging consumers compare it
	// against offset+returned to know when they've reached the end.
	const matchedCount = rfps.length;
	rfps = rfps.slice(offset, offset + limit);

	const allRows = IDEAS.map(toRow);
	const openCount = allRows.filter((r) => r.status === "open").length;
	const closedCount = allRows.length - openCount;

	logApiHit({
		req,
		endpoint: "/api/rfps",
		query: q,
		filters: {
			category: categoryFilter,
			quarter: quarterFilter,
			status: statusFilter,
			limit,
		},
	});

	return NextResponse.json(
		jsonSafe({
			meta: {
				source: "https://stellarlight.xyz/ideas",
				generatedAt: new Date().toISOString(),
				filters: {
					q: q ?? null,
					category: categoryFilter,
					quarter: quarterFilter,
					status: statusFilter,
					limit,
					offset,
				},
				counts: {
					total: IDEAS.length,
					open: openCount,
					closed: closedCount,
					matched: matchedCount,
					returned: rfps.length,
				},
				activeQuarter: ACTIVE_QUARTER,
				activeQuarterLabel: QUARTER_LABELS[ACTIVE_QUARTER],
				categories: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
					value,
					label,
				})),
				quarters: Object.entries(QUARTER_LABELS).map(([value, label]) => ({
					value,
					label,
				})),
				submitNewBriefAt: "https://stellarlight.xyz/ideas",
			},
			funding:
				"Stellar Community Fund (SCF) — winners of open RFPs (status: open) are eligible for SCF grant funding in the current round. Closed RFPs are past rounds, surfaced for context but no longer fundable.",
			rfps,
		}),
		{
			headers: {
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
			},
		},
	);
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
