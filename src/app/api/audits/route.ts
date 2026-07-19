/**
 * Public security-audit registry.
 *
 *   GET /api/audits                          → all reports, newest first
 *   GET /api/audits?project=blend            → audits linked to a directory project
 *   GET /api/audits?auditor=OtterSec         → audits by firm (case-insensitive)
 *   GET /api/audits?q=oracle                 → title/protocol substring match
 *   GET /api/audits?since=2025-01-01         → published on/after a date
 *
 * One row per audit REPORT (not per finding), ingested from
 * stellarsecurityportal.com. This is the enumerable, filterable half of the
 * audit corpus; the full report text is served chunk-wise by /api/research
 * (source=audit). Semantics agents must not misread:
 *   - A project absent here has no audit ON RECORD at our source — that is
 *     NOT a claim the project is unaudited.
 *   - findingsTotal/severityCounts null = not extracted, NOT zero.
 *
 * Unknown query params are rejected with a 400 (never silently ignored) —
 * an agent that sends severity=critical must learn the filter doesn't
 * exist rather than believe it filtered.
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { normalizeIdentityText } from "@/lib/audit-identity";
import { clampLimit } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const VALID_PARAMS = ["project", "auditor", "q", "since", "limit", "offset"];

interface AuditRow {
	reportId: number;
	title: string;
	reportUrl: string | null;
	auditor: string | null;
	protocol: string | null;
	projectSlug: string | null;
	projectName: string | null;
	linkBasis: string | null;
	publishedAt: string | null;
	observedAt: string | null;
	findingsTotal: number | null;
	severityCounts: Record<string, number> | null;
	chunksIndexed: number;
}

export async function GET(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/audits",
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

	// Strict param surface: reject unknowns instead of silently ignoring them.
	const unknown = [...sp.keys()].filter((k) => !VALID_PARAMS.includes(k));
	if (unknown.length) {
		return NextResponse.json(
			{
				error: `unknown parameter${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`,
				validParams: VALID_PARAMS,
				hint: "severity-level filtering is not available yet: severityCounts is null until deterministic extraction lands (null = not extracted, NOT zero findings)",
			},
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const project = sp.get("project")?.trim() || null;
	const auditor = sp.get("auditor")?.trim() || null;
	const q = sp.get("q")?.trim() || null;
	const since = sp.get("since")?.trim() || null;
	const limitParam = clampLimit(sp.get("limit"), 100, 100);
	const offset = Math.max(0, Number.parseInt(sp.get("offset") ?? "0", 10) || 0);

	if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
		return NextResponse.json(
			{ error: "invalid `since` — use YYYY-MM-DD" },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{ error: "payload unavailable" },
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}

	// The registry is small (tens of rows) — fetch once, filter in JS so
	// matching is normalization-aware (never Payload `contains` on identity
	// strings; see the substring-vs-membership trap).
	const found = await payload.find({
		collection: "audits",
		limit: 500,
		depth: 0,
		sort: "-publishedAt",
	});

	let rows = (found.docs as unknown as AuditRow[]).map((d) => ({
		reportId: d.reportId,
		title: d.title,
		reportUrl: d.reportUrl ?? null,
		auditor: d.auditor ?? null,
		protocol: d.protocol ?? null,
		projectSlug: d.projectSlug ?? null,
		projectName: d.projectName ?? null,
		linkBasis: d.linkBasis ?? null,
		publishedAt: d.publishedAt ?? null,
		observedAt: d.observedAt ?? null,
		findingsTotal: d.findingsTotal ?? null,
		severityCounts: d.severityCounts ?? null,
		chunksIndexed: d.chunksIndexed ?? 0,
	}));
	const total = rows.length;

	if (project) {
		const want = project.toLowerCase();
		rows = rows.filter((r) => r.projectSlug?.toLowerCase() === want);
	}
	if (auditor) {
		const want = normalizeIdentityText(auditor).toLowerCase();
		rows = rows.filter(
			(r) =>
				r.auditor && normalizeIdentityText(r.auditor).toLowerCase() === want,
		);
	}
	if (q) {
		const want = normalizeIdentityText(q).toLowerCase();
		rows = rows.filter(
			(r) =>
				r.title.toLowerCase().includes(want) ||
				(r.protocol?.toLowerCase().includes(want) ?? false) ||
				(r.projectName?.toLowerCase().includes(want) ?? false),
		);
	}
	if (since) {
		rows = rows.filter((r) => r.publishedAt && r.publishedAt >= since);
	}

	const matched = rows.length;
	rows = rows.slice(offset, offset + limitParam);

	logApiHit({
		req,
		endpoint: "/api/audits",
		query: q ?? project ?? auditor ?? null,
		filters: { project, auditor, since, limit: limitParam, offset },
		resultCount: rows.length,
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/api/audits",
				generatedAt: new Date().toISOString(),
				filters: { project, auditor, q, since, limit: limitParam, offset },
				counts: { total, matched, returned: rows.length },
				note: "One row per audit report from stellarsecurityportal.com. A project absent here has no audit on record at our source — NOT a claim that it is unaudited. findingsTotal/severityCounts null = not extracted, NOT zero. Full report text: /api/research?source=audit.",
			},
			audits: rows,
		},
		{
			headers: {
				...rateLimitHeaders(limit),
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
			},
		},
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
