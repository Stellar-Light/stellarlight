import { NextResponse } from "next/server";
import { getPayload } from "payload";
import configPromise from "@/payload.config";

/**
 * Partner freshness cron — computes each partner's freshness STATUS only.
 *
 *   GET /api/cron/partner-freshness            (Vercel Cron, Bearer CRON_SECRET)
 *   GET /api/cron/partner-freshness?dryRun=1   (compute, report, write nothing)
 *
 * Ages every profile by how long since the PARTNER last touched it
 * (lastPartnerUpdateAt, falling back to createdAt):
 *
 *     <90d   → fresh
 *     90–180 → aging     ("update soon")
 *     180–365→ stale     (public "please update" badge)
 *     >365d  → archived  (hidden from AI matches; still publicly listed)
 *
 * The incentive: a stale profile looks stale next to fresh competitors in the
 * directory, and an archived one drops out of the AI matchmaker entirely.
 *
 * Runs daily so the badge is always current. It does NOT email anyone — all
 * partner email (the quarterly "still active?" check-in AND weekly builder-lead
 * alerts) is owned by the weekly digest at /api/cron/partner-digest, which
 * bundles them into one message so partners aren't pinged twice.
 *
 * Writes go through overrideAccess so the system can set the admin-locked
 * freshnessStatus. Carrying no partner user, the collection's beforeChange hook
 * does NOT treat it as a partner edit — it never resets the freshness clock.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 24 * 60 * 60 * 1000;
const AGING_AFTER = 90 * DAY;
const STALE_AFTER = 180 * DAY;
const ARCHIVE_AFTER = 365 * DAY;

type Freshness = "fresh" | "aging" | "stale" | "archived";

function statusForAge(ageMs: number): Freshness {
	if (ageMs >= ARCHIVE_AFTER) return "archived";
	if (ageMs >= STALE_AFTER) return "stale";
	if (ageMs >= AGING_AFTER) return "aging";
	return "fresh";
}

export async function GET(request: Request) {
	const authHeader = request.headers.get("authorization");
	const cronSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
	if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
	const now = Date.now();

	try {
		const payload = await getPayload({ config: configPromise });

		const result = await payload.find({
			collection: "partner-accounts",
			limit: 1000,
			depth: 0,
		});

		const transitions: Record<Freshness, number> = {
			fresh: 0,
			aging: 0,
			stale: 0,
			archived: 0,
		};
		let updated = 0;
		const changes: Array<{ slug: string; from: string; to: Freshness }> = [];

		for (const p of result.docs) {
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			const doc = p as any;
			const anchor = doc.lastPartnerUpdateAt ?? doc.createdAt;
			const ageMs = anchor ? now - new Date(anchor).getTime() : 0;
			const current: Freshness = doc.freshnessStatus ?? "fresh";
			const target = statusForAge(ageMs);

			// ARCHIVED IS TERMINAL for this cron. "archived" is set two ways: by age
			// (which this cron may lawfully reverse when a partner updates) — and by
			// the OWNER confirming a partner is dead (curate-partners.ts). The cron
			// can't tell them apart, and un-archiving an owner-confirmed-dead
			// partner resurrects it in the directory + AI matching daily (found by
			// the 2026-07-08 review: elroy/wallet-guru resurrection loop). Only a
			// PARTNER-driven update (their save re-stamps lastPartnerUpdateAt via
			// the collection hook, making age small) should revive — and that same
			// small age makes target "fresh" AFTER an admin manually un-archives.
			// So: never auto-transition OUT of archived here.
			if (current === "archived") continue;

			if (target === current) continue;
			transitions[target]++;

			if (!dryRun) {
				await payload.update({
					collection: "partner-accounts",
					id: doc.id,
					data: { freshnessStatus: target },
					overrideAccess: true, // system write to the admin-locked auto field
					depth: 0,
				});
				updated++;
			}

			changes.push({ slug: doc.slug, from: current, to: target });
		}

		return NextResponse.json({
			success: true,
			dryRun,
			scanned: result.docs.length,
			updated,
			transitions,
			changes,
			ranAt: new Date(now).toISOString(),
		});
	} catch (error) {
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}
