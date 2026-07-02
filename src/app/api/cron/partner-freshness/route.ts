import { NextResponse } from "next/server";
import { getPayload } from "payload";
import configPromise from "@/payload.config";

/**
 * Partner freshness cron (Anke's quarterly-update loop).
 *
 *   GET /api/cron/partner-freshness            (Vercel Cron, Bearer CRON_SECRET)
 *   GET /api/cron/partner-freshness?dryRun=1   (compute, report, write nothing)
 *
 * Walks every partner profile and ages it by how long since the PARTNER last
 * touched it (lastPartnerUpdateAt, falling back to createdAt):
 *
 *     <90d   → fresh
 *     90–180 → aging     (first nudge — "update soon")
 *     180–365→ stale     (public "please update" badge)
 *     >365d  → archived  (hidden from AI matches; still publicly listed)
 *
 * The incentive: a profile that goes stale is visibly stale next to fresh
 * competitors in the directory, and an archived one drops out of the AI
 * matchmaker entirely (GET /api/partners flags freshness.excludeFromMatching).
 * Keeping it current is the cheapest way to stay discoverable.
 *
 * Reminders: on entering aging/stale — and every ~90 days thereafter while
 * still not fresh (driven by nextReminderAt) — we email the partner. Payload
 * has no email adapter wired yet, so sendEmail currently logs to console;
 * this is best-effort and never blocks the freshness update.
 *
 * Writes go through the local API with overrideAccess so the system can set
 * the admin-locked auto fields (freshnessStatus, nextReminderAt). Because the
 * write carries no partner user, the collection's beforeChange hook does NOT
 * treat it as a partner edit — so it never resets the freshness clock.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 24 * 60 * 60 * 1000;
const AGING_AFTER = 90 * DAY;
const STALE_AFTER = 180 * DAY;
const ARCHIVE_AFTER = 365 * DAY;
const REMINDER_INTERVAL = 90 * DAY; // quarterly cadence while not fresh

type Freshness = "fresh" | "aging" | "stale" | "archived";

function statusForAge(ageMs: number): Freshness {
	if (ageMs >= ARCHIVE_AFTER) return "archived";
	if (ageMs >= STALE_AFTER) return "stale";
	if (ageMs >= AGING_AFTER) return "aging";
	return "fresh";
}

const REMINDER_COPY: Record<
	Exclude<Freshness, "fresh">,
	{ subject: string; line: string }
> = {
	aging: {
		subject: "Your Stellar Light partner profile is due for a refresh",
		line: "It's been about 3 months since you last updated your profile. A quick pass keeps you ranked above stale partners in the directory.",
	},
	stale: {
		subject: "Your Stellar Light partner profile is now showing as stale",
		line: "Your profile is now flagged 'stale' to builders. Update it to clear the badge and stay front-and-center.",
	},
	archived: {
		subject:
			"Your Stellar Light partner profile has been archived from AI matches",
		line: "Your profile hasn't been touched in over a year, so it's now hidden from the AI matchmaker (still publicly listed). Update it to be matchable again.",
	},
};

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
		let remindersSent = 0;
		let updated = 0;
		const changes: Array<{
			slug: string;
			from: string;
			to: Freshness;
			reminded: boolean;
		}> = [];

		for (const p of result.docs) {
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			const doc = p as any;
			const anchor = doc.lastPartnerUpdateAt ?? doc.createdAt;
			const ageMs = anchor ? now - new Date(anchor).getTime() : 0;
			const current: Freshness = doc.freshnessStatus ?? "fresh";
			const target = statusForAge(ageMs);

			const statusChanged = target !== current;
			// A reminder is due if we just crossed into a non-fresh state, or the
			// partner is still non-fresh and the quarterly timer has elapsed.
			const reminderDueAt = doc.nextReminderAt
				? new Date(doc.nextReminderAt).getTime()
				: 0;
			const reminderDue =
				target !== "fresh" &&
				(statusChanged || !doc.nextReminderAt || reminderDueAt <= now);

			if (!statusChanged && !reminderDue) continue;

			// biome-ignore lint/suspicious/noExplicitAny: partial update payload
			const data: any = {};
			if (statusChanged) {
				data.freshnessStatus = target;
				transitions[target]++;
			}

			let reminded = false;
			if (reminderDue) {
				data.nextReminderAt = new Date(now + REMINDER_INTERVAL).toISOString();
				if (!dryRun && doc.email) {
					try {
						const copy = REMINDER_COPY[target];
						await payload.sendEmail({
							to: doc.email,
							subject: copy.subject,
							text: `Hi ${doc.name},\n\n${copy.line}\n\nUpdate your profile: https://stellarlight.xyz/partners/dashboard\n\n— Stellar Light`,
						});
						reminded = true;
						remindersSent++;
					} catch {
						// Email backend not configured / transient — never block the
						// freshness write on a failed nudge.
					}
				} else if (dryRun) {
					reminded = true; // would-send
				}
			}

			if (!dryRun && Object.keys(data).length > 0) {
				await payload.update({
					collection: "partner-accounts",
					id: doc.id,
					data,
					overrideAccess: true, // system write to admin-locked auto fields
					depth: 0,
				});
				updated++;
			}

			changes.push({ slug: doc.slug, from: current, to: target, reminded });
		}

		return NextResponse.json({
			success: true,
			dryRun,
			scanned: result.docs.length,
			updated,
			transitions,
			remindersSent,
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
