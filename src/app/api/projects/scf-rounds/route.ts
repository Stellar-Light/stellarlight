/**
 * SCF round coverage (sls-116).
 *
 *   GET /api/projects/scf-rounds
 *   GET /api/projects/scf-rounds?round=44
 *
 * Per numbered SCF round: the awards SCF's own round page lists, against the
 * awards the served project rows carry, page by page. SCF's side is the
 * newest whole read the SCF sync stored (scf-round-reads, one writer); the
 * rows are read now. An award listed and not carried is named with why, so a
 * caller can tell a known gap from a complete round.
 */

import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logApiHit } from "@/lib/api-usage";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	type CoverageRow,
	type ListedRound,
	roundCoverage,
} from "@/lib/scf-round-counts";
import { findWholeSet } from "@/lib/whole-set";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const SOURCE = "https://stellarlight.xyz/api/projects/scf-rounds";
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function GET(req: NextRequest) {
	const startedAt = Date.now();
	const sp = req.nextUrl.searchParams;
	const unknown = [...sp.keys()].find((k) => k !== "round");
	if (unknown) {
		return NextResponse.json(
			{ error: `Unknown query param '${unknown}'.`, validParams: ["round"] },
			{ status: 400, headers: CORS },
		);
	}
	const roundParam = sp.get("round");
	const round = roundParam === null ? null : Number(roundParam);
	if (round !== null && !(Number.isInteger(round) && round > 0)) {
		return NextResponse.json(
			{ error: "`round` must be a positive integer (an SCF round number)." },
			{ status: 400, headers: CORS },
		);
	}

	const outage = () =>
		apiError({
			status: 503,
			error: "store unavailable",
			advisory:
				"The SCF round read or the project rows could not be read. This is an outage, NOT a count: no round is short or complete because of it. Retry after Retry-After.",
			retryAfterSeconds: 2,
			startedAt,
			headers: CORS,
		});
	const payload = await getPayloadSafe();
	if (!payload) return outage();
	let read: { readAt?: unknown; rounds?: unknown } | undefined;
	let rows: CoverageRow[];
	try {
		const [reads, projects] = await Promise.all([
			payload.find({
				collection: "scf-round-reads",
				sort: "-readAt",
				limit: 1,
				depth: 0,
				overrideAccess: true,
			}),
			findWholeSet(payload, {
				collection: "projects",
				where: { "scf.awarded": { equals: true } },
				limit: 0,
				depth: 0,
				select: { slug: true, status: true, scf: true },
			}),
		]);
		// a cut read would turn carried awards into gaps
		if (!projects.complete) return outage();
		read = reads.docs[0];
		rows = projects.docs as unknown as CoverageRow[];
	} catch {
		return outage();
	}

	logApiHit({
		req,
		endpoint: "/api/projects/scf-rounds",
		filters: round === null ? {} : { round: String(round) },
	});

	const meta = {
		source: SOURCE,
		generatedAt: new Date().toISOString(),
		scfSource: "https://communityfund.stellar.org/awards",
		scfReadAt: typeof read?.readAt === "string" ? read.readAt : null,
		basis:
			"listed = the awards SCF's round page lists: its Awarded submissions, plus a project whose own page names the round as its last award while its submission sits in a pipeline status. carried = listed awards a served row (any status but Draft) carries: a row whose award for that round cites that award's own SCF project page (scfRoundAwards[].sourceUrl, else the row's scfSourceUrl). notCarried names each listed award no served row carries, with why. notListed names served rows that claim the round (scfAwardedRounds) with a page the round page does not list. SCF's side is as of scfReadAt (and each round's readAt); the rows are read at generatedAt.",
		order: "rounds newest first; the order is not a rank",
	};
	if (!read || !Array.isArray(read.rounds)) {
		return NextResponse.json(
			{
				meta,
				totals: null,
				rounds: null,
				unavailable:
					"The SCF sync has not stored a whole read of SCF's round pages yet, so no round can be counted. Null means not checked, never zero.",
			},
			{ headers: CORS },
		);
	}
	const rounds = roundCoverage(read.rounds as ListedRound[], rows).filter(
		(r) => round === null || r.round === round,
	);
	const sum = (f: (r: (typeof rounds)[number]) => number) =>
		rounds.reduce((n, r) => n + f(r), 0);
	return NextResponse.json(
		{
			meta,
			totals: {
				rounds: rounds.length,
				listed: sum((r) => r.listed),
				carried: sum((r) => r.carried),
				notCarried: sum((r) => r.notCarried.length),
				carriedOnSeveralRows: sum((r) => r.carriedOnSeveralRows.length),
				notListed: sum((r) => r.notListed.length),
			},
			rounds,
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
