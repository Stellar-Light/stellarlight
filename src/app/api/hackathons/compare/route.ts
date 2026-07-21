/**
 * Side-by-side comparison of two (or more) Stellar hackathons.
 *
 *   GET  /api/hackathons/compare?slugs=stellar-hacks-agents,stellar-hacks-build
 *   POST /api/hackathons/compare  Body: { slugs: ["a", "b", ...] }
 *
 * Mirrors Colosseum Copilot's /compare. Returns each hackathon's
 * stats + a `deltas` block highlighting the differences agents care
 * about ("hackathon B had 2× the submissions but half the prize per
 * winner").
 *
 * Supports 2–5 slugs per call. For more, agents should iterate.
 *
 * Both verbs are supported — GET for browser/CDN cacheability, POST for
 * agents that prefer body-shaped requests. The schema and response are
 * identical.
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import {
	fetchAllDoraHacksHackathons,
	getHackathonUrl,
} from "@/lib/integrations/dorahacks";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { ACTIVE_PROJECT_STATUSES } from "@/lib/population";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";

interface HackathonSnapshot {
	slug: string;
	source: "curated" | "dorahacks" | "not-found";
	name?: string;
	startDate?: string;
	endDate?: string;
	status?: string;
	externalUrl?: string;
	prizePoolUSD?: number;
	hackersCount?: number;
	submissionCount?: number;
	winnerCount?: number;
	prizePerWinnerUSD?: number;
	// Cohort DURABILITY (2026-07-21): of this hackathon's submissions, how many
	// are STILL ACTIVE in the directory today (status Live/Pre-Release/
	// Development) and how many reached Live. Curated hackathons only — a
	// DoraHacks-sourced event has no directory project join, so these stay
	// undefined (absence = not joinable, never "zero survived").
	stillActiveCount?: number;
	liveCount?: number;
	/** stillActiveCount / submissionCount as a percent — the survival rate that
	 *  makes "2× the submissions but half as durable" answerable. */
	activeRatePct?: number;
}

async function loadOne(slug: string): Promise<HackathonSnapshot> {
	const payload = await getPayloadSafe();

	// 1. Try curated
	if (payload) {
		try {
			const c = await payload.find({
				collection: "hackathons",
				where: { slug: { equals: slug } },
				limit: 1,
				depth: 0,
			});
			if (c.docs[0]) {
				const h = c.docs[0] as unknown as {
					name: string;
					slug: string;
					startDate?: string;
					endDate?: string;
					status?: string;
					externalUrl?: string;
				};
				// Count submissions for this hackathon
				const subs = await payload.find({
					collection: "projects",
					where: { hackathon: { equals: c.docs[0].id } },
					limit: 1,
					depth: 0,
				});
				const winners = await payload.find({
					collection: "projects",
					where: {
						hackathon: { equals: c.docs[0].id },
						hackathonPlacement: {
							in: ["grand-prize", "1st", "2nd", "3rd", "track-winner"],
						},
					},
					limit: 1,
					depth: 0,
				});
				// Cohort durability: how many of this event's projects are still
				// active (any active status) and specifically Live, today.
				const stillActive = await payload.find({
					collection: "projects",
					where: {
						hackathon: { equals: c.docs[0].id },
						status: { in: [...ACTIVE_PROJECT_STATUSES] },
					},
					limit: 1,
					depth: 0,
				});
				const live = await payload.find({
					collection: "projects",
					where: {
						hackathon: { equals: c.docs[0].id },
						status: { equals: "Live" },
					},
					limit: 1,
					depth: 0,
				});
				const submissionCount = subs.totalDocs;
				const stillActiveCount = stillActive.totalDocs;
				return {
					slug: h.slug,
					source: "curated",
					name: h.name,
					startDate: h.startDate,
					endDate: h.endDate,
					status: h.status,
					externalUrl: h.externalUrl,
					submissionCount,
					winnerCount: winners.totalDocs,
					stillActiveCount,
					liveCount: live.totalDocs,
					activeRatePct:
						submissionCount > 0
							? Math.round((stillActiveCount / submissionCount) * 100)
							: undefined,
				};
			}
		} catch {
			// fall through to DoraHacks
		}
	}

	// 2. Try DoraHacks
	try {
		const all = await fetchAllDoraHacksHackathons();
		const d = all.find((h) => h.uname === slug);
		if (d) {
			const now = Math.floor(Date.now() / 1000);
			let status: string;
			if (d.start_time > now) status = "upcoming";
			else if (d.end_time < now) status = "completed";
			else status = "active";
			return {
				slug,
				source: "dorahacks",
				name: d.title,
				startDate: new Date(d.start_time * 1000).toISOString().slice(0, 10),
				endDate: new Date(d.end_time * 1000).toISOString().slice(0, 10),
				status,
				externalUrl: getHackathonUrl(d.uname),
				prizePoolUSD: d.bonus_price || undefined,
				hackersCount: d.hackers_count || undefined,
			};
		}
	} catch {
		// fall through
	}

	return { slug, source: "not-found" };
}

interface ComparisonDeltas {
	prizePoolUSD?: { highest: string; lowest: string; rangeUSD: number };
	submissionCount?: { highest: string; lowest: string; range: number };
	prizePerWinnerUSD?: { highest: string; lowest: string };
	hackersCount?: { highest: string; lowest: string };
	/** Cohort durability spread — which event's projects survived best (highest
	 *  still-active rate). Curated hackathons only. */
	activeRatePct?: { highest: string; lowest: string };
	notes: string[];
}

function computeDeltas(snaps: HackathonSnapshot[]): ComparisonDeltas {
	const real = snaps.filter((s) => s.source !== "not-found");
	const deltas: ComparisonDeltas = { notes: [] };

	function pickRange<K extends keyof HackathonSnapshot>(
		key: K,
		label: string,
	): {
		highest: string;
		lowest: string;
		rangeNum: number;
		values: number[];
	} | null {
		const values = real
			.map((s) => ({ slug: s.slug, v: s[key] as number | undefined }))
			.filter((x): x is { slug: string; v: number } => typeof x.v === "number");
		if (values.length < 2) return null;
		values.sort((a, b) => b.v - a.v);
		const highest = values[0];
		const lowest = values[values.length - 1];
		const rangeNum = highest.v - lowest.v;
		if (rangeNum > 0) {
			const ratio = lowest.v > 0 ? (highest.v / lowest.v).toFixed(1) : "∞";
			deltas.notes.push(
				`${label}: ${highest.slug} = ${highest.v.toLocaleString()} vs ${lowest.slug} = ${lowest.v.toLocaleString()} (${ratio}× spread)`,
			);
		}
		return {
			highest: highest.slug,
			lowest: lowest.slug,
			rangeNum,
			values: values.map((x) => x.v),
		};
	}

	const pp = pickRange("prizePoolUSD", "prize pool");
	if (pp)
		deltas.prizePoolUSD = {
			highest: pp.highest,
			lowest: pp.lowest,
			rangeUSD: pp.rangeNum,
		};
	const sc = pickRange("submissionCount", "submission count");
	if (sc)
		deltas.submissionCount = {
			highest: sc.highest,
			lowest: sc.lowest,
			range: sc.rangeNum,
		};
	const hc = pickRange("hackersCount", "registered hackers");
	if (hc) deltas.hackersCount = { highest: hc.highest, lowest: hc.lowest };

	// Compute prize-per-winner where we have both
	for (const s of real) {
		if (s.prizePoolUSD && s.winnerCount && s.winnerCount > 0) {
			s.prizePerWinnerUSD = Math.round(s.prizePoolUSD / s.winnerCount);
		}
	}
	const ppw = pickRange("prizePerWinnerUSD", "prize per winner");
	if (ppw)
		deltas.prizePerWinnerUSD = { highest: ppw.highest, lowest: ppw.lowest };

	// Cohort durability: which event's projects are most alive today. The note
	// is the "2× submissions but half survived" insight the endpoint exists for.
	const ar = pickRange("activeRatePct", "still-active rate (%)");
	if (ar) deltas.activeRatePct = { highest: ar.highest, lowest: ar.lowest };

	const notFound = snaps.filter((s) => s.source === "not-found");
	if (notFound.length > 0) {
		deltas.notes.push(
			`not found in our feed: ${notFound.map((s) => s.slug).join(", ")} — these slugs aren't in the curated DB or DoraHacks org IDs 3096/3853.`,
		);
	}

	return deltas;
}

async function compare(slugs: string[], req: NextRequest) {
	if (slugs.length < 2) {
		return NextResponse.json(
			{
				error: "must provide at least 2 slugs",
				hint: "?slugs=a,b or POST { slugs: ['a', 'b'] }",
			},
			{ status: 400 },
		);
	}
	if (slugs.length > 5) {
		return NextResponse.json(
			{
				error: "max 5 slugs per request",
				hint: "iterate for more — the comparison gets noisy past 5 anyway",
			},
			{ status: 400 },
		);
	}

	const snapshots = await Promise.all(slugs.map(loadOne));
	const deltas = computeDeltas(snapshots);

	logApiHit({
		req,
		endpoint: "/api/hackathons/compare",
		query: slugs.join(","),
		filters: { count: slugs.length },
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/hackathons",
				generatedAt: new Date().toISOString(),
				// `returned` counts only hackathons that actually resolved — a
				// not-found slug yields a placeholder snapshot but must NOT inflate
				// `returned` (a consumer's returned===requested success check relied
				// on that). `notFound` surfaces the misses explicitly.
				counts: {
					requested: slugs.length,
					returned: snapshots.filter((s) => s.source !== "not-found").length,
					notFound: snapshots.filter((s) => s.source === "not-found").length,
				},
			},
			hackathons: snapshots,
			deltas,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
			},
		},
	);
}

export async function GET(req: NextRequest) {
	const slugsParam = req.nextUrl.searchParams.get("slugs") ?? "";
	const slugs = slugsParam
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return compare(slugs, req);
}

export async function POST(req: NextRequest) {
	let body: { slugs?: string[] };
	try {
		body = (await req.json()) as { slugs?: string[] };
	} catch {
		return NextResponse.json(
			{ error: "invalid JSON body", hint: "POST body { slugs: ['a','b'] }" },
			{ status: 400 },
		);
	}
	const slugs = (body.slugs ?? []).map((s) => String(s).trim()).filter(Boolean);
	return compare(slugs, req);
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const PUT = methodNotAllowed(["GET", "POST"]);
export const DELETE = methodNotAllowed(["GET", "POST"]);
export const PATCH = methodNotAllowed(["GET", "POST"]);
