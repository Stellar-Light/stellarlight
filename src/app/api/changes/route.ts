/**
 * Change feed — "what moved since T" for memory-carrying consumers.
 *
 *   GET /api/changes?since=2026-08-12T00:00:00Z
 *   GET /api/changes?since=2026-08-01&surfaces=projects,repos&limit=200
 *
 * A consumer holding cached/remembered claims (an agent memory, an
 * institutional cache) reconciles against this instead of re-reading the
 * corpus. Built entirely from stored per-row timestamps — no new write path.
 *
 * Semantics agents must not misread:
 *   - `changedAt` is the row's last write (Payload updatedAt). `facets` names
 *     which DATED fact families moved past `since` where sub-field dating
 *     exists (status, scf-awards, code-facts, toml); `["row"]` means the row
 *     changed but no dated facet localizes it — re-read the row.
 *   - A row absent here changed nothing SINCE `since` — it is not a liveness
 *     or existence claim. Deletions are not represented (rows are pruned
 *     rarely and deliberately; a 404 on re-read is the deletion signal).
 *   - Ordering is newest-first per surface; `meta.truncated.<surface>` true
 *     means more rows changed than `limit` returned — page with a later
 *     `since` from the oldest `changedAt` you received.
 *
 * Unknown params are rejected with 400 (never silently ignored).
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { clampLimit } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const VALID_PARAMS = ["since", "surfaces", "limit"];
const SURFACES = ["projects", "repos", "partners"] as const;
type Surface = (typeof SURFACES)[number];

interface ChangeRow {
	surface: Surface;
	/** projects/partners identity */
	slug?: string;
	/** repos identity */
	fullName?: string;
	changedAt: string;
	/** dated fact families that moved past `since`; ["row"] = undated change */
	facets: string[];
}

const afterSince = (v: unknown, since: number): boolean => {
	if (typeof v !== "string" || !v) return false;
	const t = Date.parse(v);
	return !Number.isNaN(t) && t > since;
};

export async function GET(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/changes",
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
				error: `unknown parameter${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`,
				validParams: VALID_PARAMS,
			},
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const sinceRaw = sp.get("since")?.trim() || null;
	if (!sinceRaw) {
		return NextResponse.json(
			{
				error:
					"`since` is required — an ISO date or datetime, e.g. since=2026-08-01 or since=2026-08-12T00:00:00Z",
			},
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}
	// Accept date-only or full ISO; reject anything that doesn't parse to a
	// real instant (a typo'd date silently matching nothing is the trap).
	const sinceIsoInput = /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw)
		? `${sinceRaw}T00:00:00Z`
		: sinceRaw;
	const sinceMs = Date.parse(sinceIsoInput);
	if (Number.isNaN(sinceMs) || sinceMs < Date.parse("2020-01-01T00:00:00Z")) {
		return NextResponse.json(
			{
				error: `invalid \`since\`: '${sinceRaw}' — use ISO date/datetime (YYYY-MM-DD or full ISO), not before 2020`,
			},
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}
	if (sinceMs > Date.now() + 60_000) {
		return NextResponse.json(
			{ error: `\`since\` is in the future: '${sinceRaw}'` },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}
	const sinceIso = new Date(sinceMs).toISOString();

	const surfacesRaw = sp.get("surfaces")?.trim() || null;
	let surfaces: Surface[] = [...SURFACES];
	if (surfacesRaw) {
		const asked = surfacesRaw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		const bad = asked.find((s) => !(SURFACES as readonly string[]).includes(s));
		if (bad !== undefined) {
			return NextResponse.json(
				{ error: `invalid surface '${bad}'`, validSurfaces: SURFACES },
				{ status: 400, headers: rateLimitHeaders(limit) },
			);
		}
		surfaces = asked as Surface[];
	}
	const perSurface = clampLimit(sp.get("limit"), 100, 500);

	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{ error: "backing store unavailable" },
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}

	const changes: ChangeRow[] = [];
	const counts: Record<string, number> = {};
	const truncated: Record<string, boolean> = {};

	const where = { updatedAt: { greater_than: sinceIso } } as const;

	if (surfaces.includes("projects")) {
		const r = await payload.find({
			collection: "projects",
			where,
			sort: "-updatedAt",
			limit: perSurface,
			depth: 0,
			overrideAccess: true,
			select: {
				slug: true,
				updatedAt: true,
				statusAsOf: true,
				scf: true,
			},
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		for (const d of r.docs as any[]) {
			const facets: string[] = [];
			if (afterSince(d.statusAsOf, sinceMs)) facets.push("status");
			if (afterSince(d.scf?.asOf, sinceMs)) facets.push("scf-awards");
			changes.push({
				surface: "projects",
				slug: String(d.slug),
				changedAt: String(d.updatedAt),
				facets: facets.length ? facets : ["row"],
			});
		}
		counts.projects = r.totalDocs;
		truncated.projects = r.totalDocs > perSurface;
	}

	if (surfaces.includes("repos")) {
		const r = await payload.find({
			collection: "repos",
			where,
			sort: "-updatedAt",
			limit: perSurface,
			depth: 0,
			overrideAccess: true,
			select: { fullName: true, updatedAt: true, codeScannedAt: true },
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		for (const d of r.docs as any[]) {
			const facets: string[] = [];
			if (afterSince(d.codeScannedAt, sinceMs)) facets.push("code-facts");
			changes.push({
				surface: "repos",
				fullName: String(d.fullName),
				changedAt: String(d.updatedAt),
				facets: facets.length ? facets : ["row"],
			});
		}
		counts.repos = r.totalDocs;
		truncated.repos = r.totalDocs > perSurface;
	}

	if (surfaces.includes("partners")) {
		const r = await payload.find({
			collection: "partner-accounts",
			where,
			sort: "-updatedAt",
			limit: perSurface,
			depth: 0,
			overrideAccess: true,
			select: { slug: true, updatedAt: true, tomlFetchedAt: true },
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		for (const d of r.docs as any[]) {
			const facets: string[] = [];
			if (afterSince(d.tomlFetchedAt, sinceMs)) facets.push("toml");
			changes.push({
				surface: "partners",
				slug: String(d.slug),
				changedAt: String(d.updatedAt),
				facets: facets.length ? facets : ["row"],
			});
		}
		counts.partners = r.totalDocs;
		truncated.partners = r.totalDocs > perSurface;
	}

	logApiHit({ req, endpoint: "/api/changes" });
	return NextResponse.json(
		{
			changes,
			meta: {
				since: sinceIso,
				asOf: new Date().toISOString(),
				// generatedAt = asOf, under the standard name every other op uses.
				// Raven's provenance sidecar (their product lane, 2026-08-26)
				// captures an exact-path allowlist — generatedAt and counts.total
				// among them — into the judge-visible SOURCE METADATA block, so a
				// dialect difference here silently drops our provenance from an
				// agent's evidence chain even when the data was retrieved.
				generatedAt: new Date().toISOString(),
				surfaces,
				limitPerSurface: perSurface,
				counts: {
					...counts,
					total: Object.values(counts).reduce((a, b) => a + b, 0),
				},
				truncated,
			},
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
				...rateLimitHeaders(limit),
			},
		},
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
