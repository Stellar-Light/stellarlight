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
import { matchModeMeta } from "@/lib/match-mode";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { serverTiming } from "@/lib/server-timing";
import { getAppUrl } from "@/lib/utils/app-url";

export const dynamic = "force-dynamic";
// The caller gives up at 10 s; a request still working past 20 s is a
// stall, and finishing it helps nobody.
export const maxDuration = 20;

const VALID_PARAMS = ["q", "domain", "limit", "offset"];

export async function GET(req: NextRequest) {
	const startedAt = Date.now();
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
					...serverTiming(startedAt),
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
			{
				error: "index unavailable",
				advisory:
					"The database handle could not be opened. This is an outage, NOT a claim about the contracts. Retry after a moment.",
				retryAfterSeconds: 2,
			},
			{
				status: 503,
				headers: {
					...serverTiming(startedAt),
					...rateLimitHeaders(limit),
					"Retry-After": "2",
				},
			},
		);
	}

	const registry = await buildContractsRegistry(payload, {
		q,
		domain,
		limit: rowLimit,
		offset,
	}).catch(() => null);
	if (!registry) {
		logApiHit({
			req,
			startedAt,
			status: 503,
			endpoint: "/api/contracts",
			query: q,
		});
		return NextResponse.json(
			{
				error: "index read failed",
				advisory:
					"The contracts index could not be read. This is an outage, NOT a claim that no contracts exist. Retry after a moment.",
				retryAfterSeconds: 2,
			},
			{
				status: 503,
				headers: {
					...serverTiming(startedAt),
					...rateLimitHeaders(limit),
					"Retry-After": "2",
				},
			},
		);
	}
	const { contracts, total } = registry;

	logApiHit({
		req,
		startedAt,
		status: 200,
		endpoint: "/api/contracts",
		query: q,
		filters: { domain, limit: rowLimit, offset },
	});

	return NextResponse.json(
		{
			meta: {
				...matchModeMeta(q ? "filtered" : "all"),
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
		{ headers: { ...rateLimitHeaders(limit), ...serverTiming(startedAt) } },
	);
}

export const POST = methodNotAllowed(["GET"]);
