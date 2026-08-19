/**
 * Stellar stablecoin registry — ranked by USD market cap.
 *
 *   GET /api/stablecoins                     → all issuers, biggest USD mcap first
 *   GET /api/stablecoins?peg=USD             → only USD-pegged
 *   GET /api/stablecoins?sort=holders        → by trustline holders
 *   GET /api/stablecoins?limit=5             → top N
 *
 * Served from OUR OWN `stablecoins` collection (measured every 6h by
 * scripts/refresh-stablecoins.ts from Horizon, Stellar Expert, and live peg
 * FX). Until 2026-08-19 this proxied a Replit-hosted sibling service; that
 * host is being retired. Owning the measurement is the point: the proxy
 * silently dropped Circle USDC for hours while the asset was live on-chain,
 * and a missing row reads to an agent as "this asset does not exist on
 * Stellar" (stellar-raven sls-066). Our writer now emits an `unmeasured` row
 * instead of no row, so a failed fetch can never masquerade as a delisting.
 *
 * WHY it ranks by USD market cap, not raw supply (boxy review 2026-07-21):
 * circulating supply is denominated in each asset's OWN peg, so it is NOT
 * comparable across rows — GYEN's 100.87M is YEN (~$676K), ARST's 243M is
 * Argentine pesos (~$243K). Only marketCapUSD (supply × USD price) is
 * comparable; that is the default order, and every row carries its `peg` so
 * denomination is never ambiguous. `supply` is served too but is meaningful
 * only within a single peg. Null on any metric = not measured, never "zero".
 *
 * Unknown query params are rejected with 400 (never silently ignored).
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { clampLimit } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	rankStablecoins,
	STABLECOIN_SORTS,
	type StablecoinSort,
	type StoreRow,
	storeRowToApi,
} from "@/lib/stablecoins";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const KNOWN_PARAMS = new Set(["peg", "sort", "limit"]);

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
};

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

	// A store outage must NEVER render as an empty 200 — that is precisely the
	// shape an agent reads as "Stellar has no stablecoins". Fail loudly.
	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{
				error: "stablecoin store unavailable",
				advisory:
					"The datastore was unreachable. This is an outage, NOT a claim that Stellar has no stablecoins, and NOT a claim that any asset was delisted. Retry shortly.",
			},
			{ status: 503, headers: CORS },
		);
	}

	// The registry is ~23 rows — fetch all and filter/rank in JS.
	const found = await payload.find({
		collection: "stablecoins",
		limit: 200,
		depth: 0,
	});

	let rows = (found.docs as StoreRow[])
		// A retired row is one we stopped tracking; it is not part of the
		// current inventory (and is still not a claim the issuer stopped).
		.filter((d) => !d.retiredAt)
		.map(storeRowToApi)
		.filter((r) => r.ticker);

	// sls-066: `total` used to be taken BEFORE the peg filter, so peg=USD
	// returned 7 rows under counts.total 22 — while every other endpoint's
	// contract defines counts.total as the filtered count before slicing.
	// `tracked` keeps the whole-inventory number, `total` means what the
	// contract says.
	const tracked = rows.length;
	if (pegFilter) {
		const want = pegFilter.toUpperCase();
		rows = rows.filter((r) => (r.peg ?? "").toUpperCase() === want);
	}
	const total = rows.length;
	rows = rankStablecoins(rows, sort as StablecoinSort).slice(0, limit);

	// dataAsOf = the freshest measurement among the rows we served.
	let dataAsOf: string | null = null;
	for (const r of rows)
		if (r.updatedAt && (!dataAsOf || r.updatedAt > dataAsOf))
			dataAsOf = r.updatedAt;

	// Say how many served rows are actual live measurements. A caller that
	// averages across rows needs to know if some are hand-checked estimates.
	const byBasis = { live: 0, "curated-static": 0, unmeasured: 0 };
	for (const r of rows) if (r.basis && r.basis in byBasis) byBasis[r.basis]++;

	logApiHit({
		req,
		endpoint: "/api/stablecoins",
		filters: { peg: pegFilter, sort, limit },
		resultCount: rows.length,
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/api/stablecoins",
				generatedAt: new Date().toISOString(),
				dataAsOf,
				filters: { peg: pegFilter ?? null, sort, limit },
				counts: { tracked, total, returned: rows.length, byBasis },
				// sls-066: say what this inventory IS. It is a curated registry of
				// hand-verified issuers — not a census of every Stellar stablecoin.
				// A ticker absent here is "not in our registry", never "does not
				// exist on Stellar".
				coverage: {
					basis: "curated-registry",
					note: "Rows are a hand-curated registry of verified (code, issuer) pairs, measured every 6h. Absence from this list means the asset is not tracked here — NOT proof it is not issued on Stellar; verify against Horizon before asserting non-existence. Asset identity is (code, issuer): two assets can share a ticker (Circle's EURC and MyKobo's EURC are different assets), so never merge or match on ticker alone.",
				},
				methodology:
					"marketCapUSD = circulating supply × USD price at the asset's peg (live FX). It is the ONLY cross-row-comparable size metric; `supply` is raw units in each asset's own `peg` and comparable only within a peg. Default sort=marketcap. null on any metric = not measured, never 'zero'. Every row carries `basis`: live = measured this cycle; curated-static = hand-checked figures for an asset no public API reports reliably; unmeasured = the fetch failed and the row is retained so its absence is never read as a delisting. `measuredAt`/`updatedAt` date the figures — cite them. Peg deviation is not measured: priceUSD assumes the peg holds.",
			},
			stablecoins: rows,
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
		headers: {
			...CORS,
			"Access-Control-Allow-Headers": "Content-Type",
		},
	});
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
