import { type NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/collections/access";
import { buildDemandReport, type UsageGroup } from "@/lib/demand-report";
import { getPayloadSafe } from "@/lib/payload-client";

/**
 * GET /api/admin/demand-report?from=YYYY-MM-DD&to=YYYY-MM-DD[&minTermCount=5]
 *
 * What each client class asked Scout over a UTC date window (both days
 * included, default the last 7, at most 92): calls per operation, empty,
 * partial, error and rejected rates, and the query terms asked at least
 * minTermCount times. Client class is the CF-Worker zone for calls a
 * Cloudflare Worker made, otherwise the User-Agent bucket.
 *
 * Admin-only: a 404 for anyone not signed in from the `users` collection,
 * partners included. Not in the public spec, never cached, and never run
 * from a workflow, whose logs are public. See
 * improvements/audits/2026-10-23-demand-report/README.md.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY = 86_400_000;
const MAX_DAYS = 92;
const NO_STORE = { "Cache-Control": "private, no-store" };

const json = (body: unknown, status = 200) =>
	NextResponse.json(body, { status, headers: NO_STORE });

const day = (s: string | null, fallback: Date): Date | null => {
	if (s === null) return fallback;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
	const d = new Date(`${s}T00:00:00.000Z`);
	return Number.isNaN(d.getTime()) ? null : d;
};

const intParam = (s: string | null, dflt: number, min: number, max: number) => {
	const n = s === null ? dflt : Number.parseInt(s, 10);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

export async function GET(req: NextRequest) {
	const payload = await getPayloadSafe();
	if (!payload) return json({ error: "database unavailable" }, 503);
	const { user } = await payload.auth({ headers: req.headers });
	if (!isAdmin(user as { collection?: string } | null))
		return json({ error: "Not found" }, 404);

	const sp = req.nextUrl.searchParams;
	const today = new Date(new Date().toISOString().slice(0, 10));
	const to = day(sp.get("to"), today);
	const from = to && day(sp.get("from"), new Date(to.getTime() - 6 * DAY));
	if (
		!to ||
		!from ||
		from > to ||
		to.getTime() - from.getTime() >= MAX_DAYS * DAY
	)
		return json(
			{
				error: `from and to are UTC dates (YYYY-MM-DD), from <= to, a window of at most ${MAX_DAYS} days`,
			},
			400,
		);
	const end = new Date(to.getTime() + DAY);
	const minTermCount = intParam(sp.get("minTermCount"), 5, 2, 1_000);
	const topTerms = intParam(sp.get("topTerms"), 25, 1, 100);

	// One $group over the window, keyed on everything the report splits by,
	// so the read is one bucket per distinct (client, operation, query,
	// outcome) instead of one document per call. createdAt is matched as a
	// Date and as an ISO string, so either storage type is counted.
	// biome-ignore lint/suspicious/noExplicitAny: payload.db internals
	const coll = (payload.db as any)?.connection?.db?.collection("api-usage");
	if (!coll) return json({ error: "database unavailable" }, 503);
	const raw = (await coll
		.aggregate(
			[
				{
					$match: {
						$or: [
							{ createdAt: { $gte: from, $lt: end } },
							{
								createdAt: { $gte: from.toISOString(), $lt: end.toISOString() },
							},
						],
					},
				},
				{
					$group: {
						_id: {
							cfWorker: "$cfWorker",
							uaBucket: "$uaBucket",
							endpoint: "$endpoint",
							query: "$query",
							status: "$status",
							empty: {
								$cond: [
									{ $isNumber: "$resultCount" },
									{ $eq: ["$resultCount", 0] },
									null,
								],
							},
							partial: "$partial",
						},
						n: { $sum: 1 },
					},
				},
			],
			// Keyed on query, 92 days of groups could pass the 100 MB in-memory
			// stage limit; let the stage spill to disk where the tier allows it.
			{ allowDiskUse: true },
		)
		.toArray()) as Array<{ _id: Omit<UsageGroup, "n">; n: number }>;
	const groups: UsageGroup[] = raw.map((r) => ({ ...r._id, n: r.n }));

	// The Payload count is the reference: a disagreement means the raw match
	// missed rows, and the report says so instead of reading as complete.
	const { totalDocs: callsInRange } = await payload.count({
		collection: "api-usage",
		where: {
			and: [
				{ createdAt: { greater_than_equal: from.toISOString() } },
				{ createdAt: { less_than: end.toISOString() } },
			],
		},
	});
	const callsCounted = groups.reduce((s, g) => s + g.n, 0);

	return json({
		meta: {
			from: from.toISOString().slice(0, 10),
			to: to.toISOString().slice(0, 10),
			generatedAt: new Date().toISOString(),
			callsCounted,
			callsInRange,
			minTermCount,
			topTerms,
			basis:
				"api-usage log. A rate's basis is the calls that recorded that outcome: status on every route, resultCount on the search and list routes that log it, partial on projects/search, research and repos/search only. A null rate means no call recorded it. Terms are single words, counted once per call, keys and hashes dropped.",
			warnings:
				callsCounted === callsInRange
					? []
					: [
							`the aggregate counted ${callsCounted} calls but the log holds ${callsInRange} in the window; the report is incomplete`,
						],
		},
		...buildDemandReport(groups, { minTermCount, topTerms }),
	});
}
