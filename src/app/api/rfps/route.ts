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

import { NextResponse, type NextRequest } from "next/server";
import {
	CATEGORIES,
	CATEGORY_LABELS,
	IDEAS,
	QUARTERS,
	QUARTER_LABELS,
	type Category,
	type Idea,
	type Quarter,
} from "@/data/ideas";
import { logApiHit } from "@/lib/api-usage";

// force-dynamic so the query-param filters (q, category, quarter) actually
// apply — static generation collapses params at build time and would
// always return the full unfiltered set.
export const dynamic = "force-dynamic";
export const revalidate = 300;

interface RfpRow extends Idea {
	categoryLabel: string;
	quarterLabel: string;
	url: string;
}

function toRow(i: Idea): RfpRow {
	return {
		...i,
		categoryLabel: CATEGORY_LABELS[i.category],
		quarterLabel: QUARTER_LABELS[i.quarter],
		url: `https://stellarlight.xyz/ideas/${i.id}`,
	};
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const q = sp.get("q")?.toLowerCase().trim();
	const categoryFilter = sp.get("category") as Category | null;
	const quarterFilter = sp.get("quarter") as Quarter | null;
	const limit = Math.min(Number(sp.get("limit") || "100") || 100, 200);

	let rfps: RfpRow[] = IDEAS.map(toRow);

	if (categoryFilter && (CATEGORIES as readonly string[]).includes(categoryFilter)) {
		rfps = rfps.filter((r) => r.category === categoryFilter);
	}
	if (quarterFilter && (QUARTERS as readonly string[]).includes(quarterFilter)) {
		rfps = rfps.filter((r) => r.quarter === quarterFilter);
	}
	if (q) {
		const tokens = q.split(/\s+/).filter(Boolean);
		rfps = rfps.filter((r) => {
			const hay = `${r.title} ${r.description} ${r.technicalRequirements ?? ""} ${r.categoryLabel}`.toLowerCase();
			return tokens.every((t) => hay.includes(t));
		});
	}

	rfps = rfps.slice(0, limit);

	logApiHit({
		req,
		endpoint: "/api/rfps",
		query: q,
		filters: { category: categoryFilter, quarter: quarterFilter, limit },
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/ideas",
				generatedAt: new Date().toISOString(),
				filters: {
					q: q ?? null,
					category: categoryFilter,
					quarter: quarterFilter,
					limit,
				},
				counts: {
					total: IDEAS.length,
					returned: rfps.length,
				},
				categories: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
					value,
					label,
				})),
				quarters: Object.entries(QUARTER_LABELS).map(([value, label]) => ({
					value,
					label,
				})),
			},
			funding:
				"Stellar Community Fund (SCF) — winners of these RFPs are eligible for SCF grant funding.",
			rfps,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
			},
		},
	);
}
