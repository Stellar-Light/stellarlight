/**
 * Trust report — the code-truth composite for one repo.
 *
 *   GET /api/repos/trust?repo=owner/name
 *
 * One evidence-grounded answer to "should I depend on this?": code truth
 * (proof, depth, domains, full scanned contract interface), live on-chain
 * usage, audit reports with drift since the latest one, succession both
 * directions, activity — joined server-side instead of five client calls.
 * `signals` is a closed deterministic vocabulary of facts that hold; no
 * synthetic scores or verdicts. The interface block doubles as a codegen
 * guard: verify generated calls against the real scanned signatures.
 *
 * Unknown query params 400 (never silently ignored). Unindexed repo 404 —
 * absence is NOT a claim the repo doesn't exist on GitHub.
 */

import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logApiHit } from "@/lib/api-usage";
import { unknownParamWarning } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { buildTrustReport } from "@/lib/trust-report";
import { getAppUrl } from "@/lib/utils/app-url";

export const dynamic = "force-dynamic";

const VALID_PARAMS = ["repo"];

export async function GET(req: NextRequest) {
	const startedAt = Date.now();
	const limit = rateLimit(req, {
		endpoint: "/api/repos/trust",
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
	const paramWarning = unknownParamWarning(sp, ["repo"]);
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

	const repo = sp.get("repo")?.trim() ?? "";
	if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
		return NextResponse.json(
			{
				error:
					"Pass ?repo=owner/name (e.g. reflector-network/reflector-contract).",
			},
			{ status: 400 },
		);
	}

	const payload = await getPayloadSafe();
	if (!payload) {
		return apiError({
			status: 503,
			error: "index unavailable",
			advisory:
				"The repository index did not answer. This is an outage, not a trust verdict about the repository. Retry after Retry-After.",
			retryAfterSeconds: 2,
			startedAt,
			headers: rateLimitHeaders(limit),
		});
	}

	const report = await buildTrustReport(payload, repo);
	if (!report) {
		return NextResponse.json(
			{
				error: `Repo '${repo}' is not in the index.`,
				note: "Absence here is NOT a claim the repo doesn't exist on GitHub — only that we hold no verified data for it.",
			},
			{ status: 404, headers: rateLimitHeaders(limit) },
		);
	}

	logApiHit({ req, endpoint: "/api/repos/trust", query: repo, filters: {} });

	return NextResponse.json(
		{
			meta: {
				source: `${getAppUrl()}/api/repos/trust`,
				generatedAt: new Date().toISOString(),
				...(paramWarning ? { warnings: [paramWarning] } : {}),
				note: "Every field is evidence-grounded (scanner, on-chain enrichment, audits registry); signals is a closed deterministic vocabulary — absence of a signal means the evidence doesn't hold, not that the opposite is proven. codeTruth.contractInterface carries the real scanned signatures: verify generated calls against it before shipping code that invokes this contract.",
			},
			report,
		},
		{ headers: rateLimitHeaders(limit) },
	);
}

export const POST = methodNotAllowed(["GET"]);
