/**
 * GET /api/sources/locate?q=...[&repo=...][&kind=file|symbol|heading][&page=N]
 *
 * Scored, verifiable source pointers into allowlisted Stellar repos: where a
 * flag, option default, function, contract interface or doc section lives.
 * Each pointer names the repo, the commit it was read at, the path, the
 * symbol or heading, the line, the git blob sha, why it matched and a pinned
 * GitHub URL. Never file content: the caller fetches the file.
 *
 * Semantics an agent must not misread:
 *   - pointers [] with total 0: the indexed repos were searched, nothing matched.
 *   - pointers null: could not search (the index is unreadable, a 503, or
 *     the repo is not indexed yet, a 200 with a note). Never [] for that.
 *   - meta.warnings names allowlisted repos not indexed yet; [] covers only
 *     the repos meta.index lists with a ref.
 * Unknown parameters and values outside the closed sets answer 400.
 */

import { type NextRequest, NextResponse } from "next/server";
import { rateLimited } from "@/lib/api-error";
import { logApiHit } from "@/lib/api-usage";
import { DEFAULT_READ_TIMEOUT_MS, degradedRead } from "@/lib/degraded-read";
import { matchModeMeta } from "@/lib/match-mode";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { isContentStopword } from "@/lib/repo-search";
import { serverTiming } from "@/lib/server-timing";
import {
	authorityRole,
	CANDIDATE_CAP,
	candidateTerms,
	type IndexRow,
	LOCATE_MATCH_MODES,
	LOCATE_TOTAL_BASES,
	LOCATOR_KINDS,
	type PointerKind,
	parseQuery,
	rankRows,
	resolveRepo,
	SOURCE_REPO_NAMES,
	verificationUrl,
} from "@/lib/source-locator";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const ENDPOINT = "/api/sources/locate";
const VALID_PARAMS = ["q", "repo", "kind", "page"];
const PAGE_SIZE = 10;
const MAX_Q_CHARS = 300;
const NOTE =
	"Pointers, not content: fetch verificationUrl (the file at the pinned commit, at the line) to read the fact. ref is the commit the pointer was read at; an unchanged file keeps its first ref, which stays valid (same blob, same lines) and was re-confirmed at verifiedAt. Ranking is lexical: an exact symbol or file name scores highest, then an identifier held in a name, then words in a symbol or heading, then path words; score is 0 to 100 against this q. pointers [] means the indexed repos hold no match; null means they could not be searched.";

interface RepoState {
	repo: string;
	ref?: string | null;
	builtAt?: Date | string | null;
	pointers?: number | null;
}

const iso = (d: Date | string | null | undefined) =>
	d ? new Date(d).toISOString() : null;

export async function GET(req: NextRequest) {
	const startedAt = Date.now();
	const limit = rateLimit(req, {
		endpoint: ENDPOINT,
		limit: 60,
		windowMs: 60_000,
	});
	if (!limit.allowed) return rateLimited(limit, { startedAt });
	const headers = { ...rateLimitHeaders(limit) };
	const bad = (error: string, extra: Record<string, unknown> = {}) =>
		NextResponse.json(
			{ error, ...extra },
			{ status: 400, headers: { ...serverTiming(startedAt), ...headers } },
		);

	const sp = req.nextUrl.searchParams;
	const unknown = [...sp.keys()].filter((k) => !VALID_PARAMS.includes(k));
	if (unknown.length)
		return bad(`unknown parameter: ${unknown.join(", ")}`, {
			validParams: VALID_PARAMS,
			hint: "Supported: q (required), repo, kind, page. Unknown parameters are rejected, never ignored, so a list that looks filtered is never returned.",
		});
	const q = sp.get("q")?.trim() ?? "";
	if (!q)
		return bad("q is required", {
			hint: "Name what to locate: a symbol, flag, option, config key or topic, e.g. q=--enable-core-manual-close or q=getTransactions default limit.",
		});
	if (q.length > MAX_Q_CHARS)
		return bad(`q is longer than ${MAX_Q_CHARS} characters`);
	const repoParam = sp.get("repo")?.trim() || null;
	const repo = repoParam ? resolveRepo(repoParam) : null;
	if (repoParam && !repo)
		return bad(`unknown repo: ${repoParam}`, {
			validValues: SOURCE_REPO_NAMES,
			hint: "repo takes an allowlisted repo, as owner/name or name.",
		});
	const kindParam = sp.get("kind")?.trim() || null;
	if (kindParam && !(LOCATOR_KINDS as readonly string[]).includes(kindParam))
		return bad(`unknown kind: ${kindParam}`, { validValues: LOCATOR_KINDS });
	const kind = kindParam as PointerKind | null;
	const pageParam = sp.get("page");
	const page = pageParam === null ? 1 : Number(pageParam);
	if (!Number.isInteger(page) || page < 1)
		return bad("page must be a whole number from 1");
	const pq = parseQuery(q, isContentStopword);
	if (!pq.units.length)
		return bad("q has no searchable words", {
			hint: "Every word of q is a stopword or locator filler (where, defined, file). Add the name or topic to locate.",
		});

	const filters = { q, repo, kind, page };
	const unavailable = () => {
		logApiHit({ req, startedAt, status: 503, endpoint: ENDPOINT, query: q });
		return NextResponse.json(
			{
				error: "source-locator index read failed",
				advisory:
					"The index could not be read. This is an outage, NOT a claim that no source matches. Retry after a moment.",
				retryAfterSeconds: 2,
				pointers: null,
				total: null,
			},
			{
				status: 503,
				headers: { ...serverTiming(startedAt), ...headers, "Retry-After": "2" },
			},
		);
	};

	const payload = await getPayloadSafe();
	// biome-ignore lint/suspicious/noExplicitAny: payload.db mongoose internals
	const db = (payload?.db as any)?.connection?.db;
	if (!db) return unavailable();
	const states = (
		await degradedRead(
			"source-locator-repos",
			() =>
				db
					.collection("source-locator-repos")
					.find(
						{},
						{
							projection: { _id: 0, repo: 1, ref: 1, builtAt: 1, pointers: 1 },
						},
					)
					.toArray() as Promise<RepoState[]>,
			null,
			DEFAULT_READ_TIMEOUT_MS,
		)
	).value;
	if (!states) return unavailable();

	const searched = repo ? [repo] : SOURCE_REPO_NAMES;
	const stateOf = new Map(
		states.filter((s) => s.ref && s.builtAt).map((s) => [s.repo, s]),
	);
	const indexed = searched.filter((r) => stateOf.has(r));
	const index = searched.map((r) => ({
		repo: r,
		ref: stateOf.get(r)?.ref ?? null,
		builtAt: iso(stateOf.get(r)?.builtAt),
		pointers: stateOf.get(r)?.pointers ?? null,
	}));
	const missing = searched.filter((r) => !stateOf.has(r));
	const warnings = missing.length
		? [
				`not indexed yet: ${missing.join(", ")}; pointers cover only the repos meta.index lists with a ref.`,
			]
		: [];
	const meta = (extra: Record<string, unknown>) => ({
		...matchModeMeta(LOCATE_MATCH_MODES[0]),
		source: `https://stellarlight.xyz${ENDPOINT}`,
		generatedAt: new Date().toISOString(),
		filters,
		index,
		note: NOTE,
		...extra,
	});

	if (!indexed.length) {
		logApiHit({
			req,
			startedAt,
			status: 200,
			endpoint: ENDPOINT,
			query: q,
			filters,
			resultCount: 0,
		});
		return NextResponse.json(
			{
				meta: meta({
					counts: {
						total: null,
						returned: 0,
						totalBasis: LOCATE_TOTAL_BASES[0],
					},
					note: `${repo ?? "No allowlisted repo"} is not indexed yet, so nothing was searched: pointers is null (could not check), not an empty result. ${NOTE}`,
				}),
				pointers: null,
				total: null,
				page,
				pageSize: PAGE_SIZE,
				truncated: false,
				indexAsOf: null,
			},
			{ headers: { ...serverTiming(startedAt), ...headers } },
		);
	}

	const cand = candidateTerms(pq);
	const found = (
		await degradedRead(
			"source-locators",
			() =>
				db
					.collection("source-locators")
					.find(
						{
							terms: {
								$in: [
									...cand.exact,
									...cand.prefixes.map((p) => new RegExp(`^${p}`)),
								],
							},
							repo: { $in: indexed },
							...(kind ? { locatorKind: kind } : {}),
						},
						{ projection: { _id: 0, createdAt: 0, updatedAt: 0 } },
					)
					.limit(CANDIDATE_CAP + 1)
					.toArray() as Promise<IndexRow[]>,
			null,
			DEFAULT_READ_TIMEOUT_MS,
		)
	).value;
	if (!found) return unavailable();
	if (found.length > CANDIDATE_CAP)
		warnings.push(
			`q matched more than ${CANDIDATE_CAP} candidate pointers; ranked the first ${CANDIDATE_CAP} read. Add a repo or a more specific word.`,
		);

	const ranked = rankRows(pq, found.slice(0, CANDIDATE_CAP), { repo, kind });
	const start = (page - 1) * PAGE_SIZE;
	const pointers = ranked.slice(start, start + PAGE_SIZE).map((s, i) => {
		const r = s.row;
		return {
			id: `s${start + i + 1}`,
			rank: start + i + 1,
			repo: r.repo,
			ref: r.ref,
			path: r.path,
			locatorKind: r.locatorKind,
			locator: r.locator ?? null,
			line: r.line ?? null,
			authorityRole: authorityRole(r.repo, r.path),
			matchReason: s.matchReason,
			verifiedAt: iso(stateOf.get(r.repo)?.builtAt),
			blobSha: r.blobSha,
			verificationUrl: verificationUrl(r.repo, r.ref, r.path, r.line ?? null),
			score: s.score,
			factors: s.factors,
		};
	});
	const builtAts = indexed
		.map((r) => iso(stateOf.get(r)?.builtAt))
		.filter((d): d is string => !!d)
		.sort();

	logApiHit({
		req,
		startedAt,
		status: 200,
		endpoint: ENDPOINT,
		query: q,
		filters,
		resultCount: pointers.length,
	});
	return NextResponse.json(
		{
			meta: meta({
				counts: { total: ranked.length, returned: pointers.length },
				...(warnings.length ? { warnings } : {}),
			}),
			pointers,
			total: ranked.length,
			page,
			pageSize: PAGE_SIZE,
			truncated: start + PAGE_SIZE < ranked.length,
			indexAsOf: builtAts[0] ?? null,
		},
		{
			headers: {
				...serverTiming(startedAt),
				...headers,
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
			},
		},
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
