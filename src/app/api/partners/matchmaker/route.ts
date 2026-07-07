import { NextResponse } from "next/server";
import { fetchEligiblePartners, scorePartners } from "@/lib/partner-match";
import { getPayloadSafe } from "@/lib/payload-client";

/**
 * GET /api/partners/matchmaker?q=&type=&region=&asset=
 *
 * The guided-matchmaker UI helper — DETERMINISTIC (no LLM), so it's instant.
 * Returns published partners ranked by the shared scorer, each with the
 * concrete "why this matched" reasons (asset/ramp/SEP/country/…). Browser-only:
 * NOT in the OpenAPI spec/status. The agent-facing, LLM-reranked matcher is
 * POST /api/partners/match.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
	const url = new URL(req.url);
	const q = (url.searchParams.get("q") ?? "").trim();
	const type = (url.searchParams.get("type") ?? "").trim();
	const region = (url.searchParams.get("region") ?? "").trim();
	const asset = (url.searchParams.get("asset") ?? "").trim();

	const payload = await getPayloadSafe();
	if (!payload)
		return NextResponse.json(
			{ matches: [], unavailable: true },
			{ status: 503 },
		);

	// Type hard-filters the candidate pool; region is folded into the need string
	// so the scorer's own region gate drops non-matching coverage; q + asset are
	// free keywords.
	const docs = await fetchEligiblePartners(payload, {
		type: type || undefined,
	});
	const need = [q, asset, region].filter(Boolean).join(" ").trim();
	const scored = scorePartners(need, docs, 8);
	const matches = scored.map((s) => ({
		...s.partner,
		reasons: s.reasons,
		score: s.score,
	}));

	return NextResponse.json(
		{ matches, meta: { total: matches.length, need } },
		{ headers: { "Cache-Control": "no-store" } },
	);
}
