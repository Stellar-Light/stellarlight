/**
 * Stellar stablecoin registry — ranked by USD market cap.
 *
 *   GET /api/stablecoins                     → all issuers, biggest USD mcap first
 *   GET /api/stablecoins?peg=USD             → only USD-pegged
 *   GET /api/stablecoins?sort=holders        → by trustline holders
 *   GET /api/stablecoins?limit=5             → top N
 *
 * Proxies the authoritative snapshot (stablecoin.stellarlight.xyz — our own
 * live service, refreshed continuously) and normalizes its display values into
 * raw numbers so agents can compare and cite them.
 *
 * WHY it ranks by USD market cap, not raw supply (boxy review 2026-07-21):
 * circulating supply is denominated in each asset's OWN peg, so it is NOT
 * comparable across rows — GYEN's 100.87M is YEN (~$676K), ARST's 243M is
 * Argentine pesos (~$243K). Only marketCapUSD (supply × USD price) is
 * comparable; that is the default order, and every row carries its `peg` so
 * denomination is never ambiguous. `supply` is served too but is meaningful
 * only within a single peg. Absence/null = not tracked at our source, never
 * "zero".
 *
 * Unknown query params are rejected with 400 (never silently ignored).
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { clampLimit } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import {
	normalizeSnapshotRow,
	rankStablecoins,
	type SnapshotRow,
	STABLECOIN_SNAPSHOT_URL,
	STABLECOIN_SORTS,
	type StablecoinSort,
} from "@/lib/stablecoins";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const KNOWN_PARAMS = new Set(["peg", "sort", "limit"]);

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;

	// Reject unknown params (an agent that sends country= must learn it's not
	// a filter, not silently get the unfiltered set).
	const unknown = [...sp.keys()].find((k) => !KNOWN_PARAMS.has(k));
	if (unknown) {
		return NextResponse.json(
			{
				error: `Unknown query param '${unknown}'.`,
				validParams: [...KNOWN_PARAMS],
			},
			{ status: 400 },
		);
	}

	const sort = (sp.get("sort") || "marketcap").toLowerCase();
	if (!(STABLECOIN_SORTS as readonly string[]).includes(sort)) {
		return NextResponse.json(
			{ error: `Invalid sort '${sort}'.`, validSorts: STABLECOIN_SORTS },
			{ status: 400 },
		);
	}
	const pegFilter = sp.get("peg");
	const limit = clampLimit(sp.get("limit"), 50, 100);

	// Proxy the sibling snapshot service. Bounded timeout + graceful failure:
	// a proxy outage returns an HONEST empty set with an advisory, never a 500
	// that reads as "no stablecoins exist".
	let snapshot: SnapshotRow[] = [];
	let upstreamOk = true;
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 8000);
		const res = await fetch(STABLECOIN_SNAPSHOT_URL, {
			signal: controller.signal,
			headers: { accept: "application/json" },
			next: { revalidate: 300 },
		});
		clearTimeout(timer);
		if (!res.ok) throw new Error(`upstream ${res.status}`);
		const body = await res.json();
		snapshot = Array.isArray(body) ? body : [];
	} catch {
		upstreamOk = false;
	}

	let rows = snapshot.map(normalizeSnapshotRow).filter((r) => r.ticker);
	const total = rows.length;
	if (pegFilter) {
		const want = pegFilter.toUpperCase();
		rows = rows.filter((r) => (r.peg ?? "").toUpperCase() === want);
	}
	rows = rankStablecoins(rows, sort as StablecoinSort).slice(0, limit);

	// dataAsOf = the freshest snapshot row timestamp we served.
	let dataAsOf: string | null = null;
	for (const r of rows)
		if (r.updatedAt && (!dataAsOf || r.updatedAt > dataAsOf))
			dataAsOf = r.updatedAt;

	logApiHit({
		req,
		endpoint: "/api/stablecoins",
		filters: { peg: pegFilter, sort, limit },
		resultCount: rows.length,
	});

	const advisory = upstreamOk
		? undefined
		: {
				summary:
					"The stablecoin snapshot service was unreachable; this response is empty but that is a source outage, NOT a claim that Stellar has no stablecoins. Retry shortly.",
			};

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/api/stablecoins",
				upstream: "https://stablecoin.stellarlight.xyz",
				generatedAt: new Date().toISOString(),
				dataAsOf,
				filters: { peg: pegFilter ?? null, sort, limit },
				counts: { total, returned: rows.length },
				methodology:
					"marketCapUSD = circulating supply × USD price (the sibling snapshot's computed value). It is the ONLY cross-row-comparable size metric; `supply` is raw units in each asset's own `peg` and comparable only within a peg. Default sort=marketcap. null on any metric = not tracked at our source, never 'zero'. dataAsOf dates the served rows.",
				...(advisory ? { advisory } : {}),
			},
			stablecoins: rows,
		},
		{
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, OPTIONS",
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
			},
		},
	);
}

export function OPTIONS() {
	return new NextResponse(null, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		},
	});
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
