/**
 * GET /api/paid-endpoints — what an agent can actually pay for on Stellar.
 *
 * x402 and MPP are shared standards, so "supports x402" tells a Stellar
 * wallet nothing: the 402 challenge names the networks it accepts, and a
 * caller holding USDC on Stellar can only pay a door that lists
 * `stellar:pubnet`. Measured across the whole public surface on 2026-08-22:
 * of 38 pay.sh providers whose challenge could be read, zero accept Stellar,
 * and 3 of 1,611 hosts in Coinbase's Bazaar do.
 *
 * So every row here is a URL we RE-PROBED, carrying the challenge we read
 * back. Registries supply candidates; only the probe supplies truth.
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { clampLimit } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const KNOWN_PARAMS = new Set([
	"stellarOnly",
	"live",
	"protocol",
	"host",
	"limit",
]);
const PROTOCOLS = ["x402", "mpp", "x402+mpp", "unknown"] as const;

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
};

interface Row {
	url: string;
	host?: string | null;
	title?: string | null;
	description?: string | null;
	protocol?: string | null;
	acceptsStellar?: boolean | null;
	accepts?: Array<{
		network?: string;
		asset?: string;
		amount?: string;
		scheme?: string;
	}> | null;
	priceUSD?: number | null;
	source?: string | null;
	sourceUrl?: string | null;
	lastStatus?: string | null;
	lastCheckedAt?: string | null;
	lastPaidAt?: string | null;
	consecutiveFailures?: number | null;
}

const bool = (v: string | null) => v === "1" || v === "true" || v === "yes";

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const unknown = [...sp.keys()].find((k) => !KNOWN_PARAMS.has(k));
	if (unknown)
		return NextResponse.json(
			{
				error: `Unknown query param '${unknown}'.`,
				validParams: [...KNOWN_PARAMS],
			},
			{ status: 400 },
		);

	const protocol = sp.get("protocol");
	if (protocol && !(PROTOCOLS as readonly string[]).includes(protocol))
		return NextResponse.json(
			{ error: `Invalid protocol '${protocol}'.`, validProtocols: PROTOCOLS },
			{ status: 400 },
		);

	const limit = clampLimit(sp.get("limit"), 50, 200);
	const payload = await getPayloadSafe();
	// An outage must not render as an empty 200 — that reads as "nothing is
	// payable on Stellar", which is a claim, not an absence.
	if (!payload)
		return NextResponse.json(
			{
				error: "endpoint index unavailable",
				advisory:
					"The store did not answer. This is NOT a report that no paid endpoints exist on Stellar — retry, or check /api/status.",
			},
			{ status: 503, headers: CORS },
		);

	const where: Record<string, unknown> = {};
	if (bool(sp.get("stellarOnly"))) where.acceptsStellar = { equals: true };
	if (bool(sp.get("live"))) where.lastStatus = { equals: "402" };
	if (protocol) where.protocol = { equals: protocol };
	const host = sp.get("host");
	if (host) where.host = { equals: host };

	const res = await payload.find({
		collection: "paid-endpoints",
		where: Object.keys(where).length
			? (where as Parameters<typeof payload.find>[0]["where"])
			: undefined,
		limit,
		sort: "-lastPaidAt",
		depth: 0,
	});
	const docs = res.docs as unknown as Row[];
	const rows = docs.map((d) => ({
		url: d.url,
		host: d.host ?? null,
		title: d.title || null,
		description: d.description || null,
		protocol: d.protocol ?? "unknown",
		acceptsStellar: !!d.acceptsStellar,
		accepts: d.accepts ?? [],
		priceUSD: d.priceUSD ?? null,
		source: d.source ?? null,
		sourceUrl: d.sourceUrl ?? null,
		lastStatus: d.lastStatus ?? null,
		lastCheckedAt: d.lastCheckedAt ?? null,
		lastPaidAt: d.lastPaidAt ?? null,
		goingDark: (d.consecutiveFailures ?? 0) >= 3,
	}));
	const stellar = rows.filter((r) => r.acceptsStellar).length;
	const live = rows.filter((r) => r.lastStatus === "402").length;

	logApiHit({
		req,
		endpoint: "/api/paid-endpoints",
		query: sp.toString() || null,
		resultCount: rows.length,
	});
	return NextResponse.json(
		{
			meta: {
				generatedAt: new Date().toISOString(),
				counts: {
					returned: rows.length,
					total: res.totalDocs,
					acceptsStellar: stellar,
					answering402: live,
				},
				coverage: {
					basis: "probed-index",
					note: "Candidates come from public registries (Coinbase x402 Bazaar, Sextant) and curation; LIVENESS comes only from our own probe. `accepts` is the challenge verbatim — never inferred from a listing or a README. Absence from this list is NOT proof an endpoint is unpaid or does not exist; auth-walled endpoints hide their terms from us entirely.",
				},
				methodology:
					"acceptsStellar is true ONLY when a challenge we read listed a stellar network (or an MPP stellar method) — the field this index exists for, because x402/MPP are shared standards and supporting x402 does not make an endpoint payable from Stellar. lastStatus is the last probe's HTTP status: 402 = paid and answering; 200 = free or open; 401/403 = auth-walled, terms unreadable; ERR = transport failure. goingDark = three or more consecutive probes with no challenge; the row is kept, because an endpoint going quiet is the most useful thing here. priceUSD is derived from a USD-stablecoin amount in the challenge (6dp) and is null when the challenge states none.",
			},
			endpoints: rows,
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
