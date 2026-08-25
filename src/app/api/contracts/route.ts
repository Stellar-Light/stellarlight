/**
 * Contracts as first-class entities — the verified mainnet contract registry.
 *
 *   GET /api/contracts                     → evidence-gated contracts, most-evidenced first
 *   GET /api/contracts?q=blend             → repo/project/contract-id substring
 *   GET /api/contracts?domain=oracle       → filter by code-evidenced domain
 *
 * MEMBERSHIP IS EVIDENCE-GATED: a row exists only when the scanner verified
 * a README-claimed contract id live on mainnet (stellar.expert echo-check)
 * OR weekly on-chain enrichment attributed real activity to the repo. Each
 * row joins code truth (proof, depth, interface, domains), live usage,
 * per-project audit records, and succession. Absence here is NOT a claim a
 * contract doesn't exist — the registry grows exactly as fast as scans and
 * on-chain passes reach repos.
 *
 * Unknown query params 400 (never silently ignored).
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { CODE_DOMAINS } from "@/lib/code-domains";
import { buildContractsRegistry } from "@/lib/contracts-registry";
import { clampLimit } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getAppUrl } from "@/lib/utils/app-url";

export const dynamic = "force-dynamic";

const VALID_PARAMS = ["q", "domain", "limit", "offset"];

export async function GET(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/contracts",
		limit: 60,
		windowMs: 60_000,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{
				error: "rate limit exceeded",
				retryAfterSeconds: Math.ceil((limit.resetAt - Date.now()) / 1000),
			},
			{
				status: 429,
				headers: {
					...rateLimitHeaders(limit),
					"Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
				},
			},
		);
	}

	const sp = req.nextUrl.searchParams;
	const unknown = [...sp.keys()].filter((k) => !VALID_PARAMS.includes(k));
	if (unknown.length) {
		return NextResponse.json(
			{
				error: `Unknown query param(s): ${unknown.join(", ")}`,
				validParams: VALID_PARAMS,
			},
			{ status: 400 },
		);
	}

	const q = sp.get("q")?.trim() ?? "";
	const domain = sp.get("domain")?.trim().toLowerCase() ?? "";
	if (domain && !(CODE_DOMAINS as readonly string[]).includes(domain)) {
		return NextResponse.json(
			{ error: `Invalid domain value '${domain}'.`, validValues: CODE_DOMAINS },
			{ status: 400 },
		);
	}
	const rowLimit = clampLimit(sp.get("limit"), 20, 100);
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{ error: "index unavailable" },
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}

	const { contracts, total } = await buildContractsRegistry(payload, {
		q,
		domain,
		limit: rowLimit,
		offset,
	});

	logApiHit({
		req,
		endpoint: "/api/contracts",
		query: q,
		filters: { domain, limit: rowLimit, offset },
	});

	return NextResponse.json(
		{
			meta: {
				source: `${getAppUrl()}/api/contracts`,
				generatedAt: new Date().toISOString(),
				filters: {
					q: q || null,
					domain: domain || null,
					limit: rowLimit,
					offset,
				},
				counts: { returned: contracts.length, total },
				note: "Evidence-gated: rows exist only for contracts the scanner verified live on mainnet or on-chain enrichment attributed real activity to. Absence is NOT a claim a contract doesn't exist — coverage grows as scans reach repos. Lead with rows that carry codeInUse (live usage is the strongest signal).",
			},
			contracts,
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const POST = methodNotAllowed(["GET"]);
