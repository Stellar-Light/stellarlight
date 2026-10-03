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
import { apiError } from "@/lib/api-error";
import { logApiHit } from "@/lib/api-usage";
import { CODE_DOMAINS } from "@/lib/code-domains";
import { buildContractsRegistry } from "@/lib/contracts-registry";
import { DEFAULT_READ_TIMEOUT_MS, degradedRead } from "@/lib/degraded-read";
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
		return apiError({
			status: 429,
			error: "rate limit exceeded",
			advisory:
				"This instance's per-minute window is spent (counters are per serverless instance: X-RateLimit-Scope: instance). Wait Retry-After and resend; this says nothing about the data.",
			retryAfterSeconds: Math.max(
				1,
				Math.ceil((limit.resetAt - Date.now()) / 1000),
			),
			startedAt,
			headers: rateLimitHeaders(limit),
		});
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

	// Bounded like the other listing reads (2026-10-03). Unbounded, a stalled
	// read held the request to the function cap and a partner's 10 s deadline
	// passed with no answer at all; now it is the 503 below, early enough to
	// retry.
	const { value: registry } = await degradedRead(
		"contracts registry",
		() =>
			buildContractsRegistry(payload, {
				q,
				domain,
				limit: rowLimit,
				offset,
			}),
		null,
		DEFAULT_READ_TIMEOUT_MS,
	);
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
