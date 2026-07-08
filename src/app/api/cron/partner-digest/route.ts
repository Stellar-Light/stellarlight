import { NextResponse } from "next/server";
import { getPayload, type Where } from "payload";
import configPromise from "@/payload.config";

/**
 * Weekly partner digest — the single owner of partner-facing email.
 *
 *   GET /api/cron/partner-digest            (Vercel Cron, Bearer CRON_SECRET)
 *   GET /api/cron/partner-digest?dryRun=1   (compute + report, send/write nothing)
 *
 * Runs weekly and sends AT MOST one email per partner, bundling two things so
 * a partner is never pinged twice:
 *
 *   1. Builder-lead alerts — every builder search that surfaced this partner in
 *      the concierge since the last digest (partner-leads where notified:false).
 *      "N builders were looking for what you offer this week." This is the
 *      demand signal that makes staying listed + fresh worth it.
 *
 *   2. The quarterly "still active?" check-in (Anke's Airtable replacement) —
 *      when the partner's nextReminderAt has elapsed (or was never set). Asks
 *      them to confirm they're still active and refresh their profile via the
 *      dashboard chat. Cadence is ~90 days per partner; sending it here resets
 *      nextReminderAt.
 *
 * A partner with no new leads and no check-in due gets NO email that week.
 *
 * Payload has no email adapter wired yet, so sendEmail logs to console — the
 * lead/check-in bookkeeping (marking leads notified, bumping nextReminderAt)
 * still runs so the system is correct the moment an adapter is added.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 24 * 60 * 60 * 1000;
const CHECKIN_INTERVAL = 90 * DAY; // ~quarterly, per Anke's cadence
const LEAD_RETENTION_DAYS = 90; // delivered leads older than this are pruned
const DASHBOARD_URL = "https://stellarlight.xyz/partners/dashboard";
const MAX_LEADS_SHOWN = 8;

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

		const partners = await payload.find({
			collection: "partner-accounts",
			limit: 1000,
			depth: 0,
		});

		// Pull all un-notified leads once, then group by partner slug.
		const leadRes = await payload.find({
			collection: "partner-leads",
			where: { notified: { equals: false } },
			limit: 5000,
			depth: 0,
			sort: "-createdAt",
		});
		const leadsBySlug = new Map<string, { ids: string[]; needs: string[] }>();
		for (const l of leadRes.docs) {
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			const lead = l as any;
			const slug = lead.partnerSlug as string;
			if (!slug) continue;
			const entry = leadsBySlug.get(slug) ?? { ids: [], needs: [] };
			entry.ids.push(lead.id);
			if (lead.need) entry.needs.push(String(lead.need));
			leadsBySlug.set(slug, entry);
		}

		let emailsSent = 0;
		let checkinsSent = 0;
		let leadsCleared = 0;
		const digests: Array<{
			slug: string;
			leadCount: number;
			checkin: boolean;
		}> = [];

		for (const p of partners.docs) {
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			const doc = p as any;
			const slug = doc.slug as string;
			const leads = leadsBySlug.get(slug);
			const leadCount = leads?.ids.length ?? 0;

			const reminderDueAt = doc.nextReminderAt
				? new Date(doc.nextReminderAt).getTime()
				: 0;
			const checkinDue = !doc.nextReminderAt || reminderDueAt <= now;

			if (leadCount === 0 && !checkinDue) continue;

			// ── Compose the one weekly email ──
			const sections: string[] = [`Hi ${doc.name},`];
			if (leadCount > 0) {
				const needs = (leads?.needs ?? [])
					.slice(0, MAX_LEADS_SHOWN)
					.map((n) => `  • ${n}`)
					.join("\n");
				sections.push(
					`${leadCount} builder${leadCount === 1 ? "" : "s"} were looking for what you offer this week on Stellar Light:\n${needs}\n\nMake sure your profile is current so they reach the right you: ${DASHBOARD_URL}`,
				);
			}
			if (checkinDue) {
				sections.push(
					`Quarterly check-in: are you still active and taking work? Take a moment to confirm and refresh your profile (services, regions, pricing, availability) — it keeps you matchable and ranked ahead of stale partners.\n\nUpdate in a quick chat: ${DASHBOARD_URL}`,
				);
			}
			sections.push("— Stellar Light");

			const subject =
				leadCount > 0
					? `${leadCount} builder${leadCount === 1 ? "" : "s"} looked for what you offer${checkinDue ? " — plus your quarterly check-in" : ""}`
					: "Your Stellar Light quarterly check-in — still active?";

			if (!dryRun) {
				if (doc.email) {
					try {
						await payload.sendEmail({
							to: doc.email,
							subject,
							text: sections.join("\n\n"),
						});
					} catch {
						// Email backend not configured / transient — never block the
						// bookkeeping below on a failed send.
					}
				}
				// Mark leads notified so the next digest doesn't repeat them.
				if (leads) {
					for (const id of leads.ids) {
						try {
							await payload.update({
								collection: "partner-leads",
								id,
								data: { notified: true },
								overrideAccess: true,
								depth: 0,
							});
							leadsCleared++;
						} catch {
							/* best-effort */
						}
					}
				}
				// Reset the quarterly clock when the check-in went out.
				if (checkinDue) {
					try {
						await payload.update({
							collection: "partner-accounts",
							id: doc.id,
							data: {
								nextReminderAt: new Date(now + CHECKIN_INTERVAL).toISOString(),
							},
							overrideAccess: true,
							depth: 0,
						});
					} catch {
						/* best-effort */
					}
				}
			} else {
				leadsCleared += leadCount;
			}

			emailsSent++;
			if (checkinDue) checkinsSent++;
			digests.push({ slug, leadCount, checkin: checkinDue });
		}

		// ── Retention: prune delivered leads past the window ─────────────────
		// Only ever touches notified:true (a broken digest run can't destroy
		// undelivered demand signal); 90 days keeps a quarter of history for
		// admin eyeballing while capping growth on the 512MB M0.
		const pruneCutoff = new Date(now - LEAD_RETENTION_DAYS * DAY).toISOString();
		const pruneWhere: Where = {
			and: [
				{ notified: { equals: true } },
				{ createdAt: { less_than: pruneCutoff } },
			],
		};
		let leadsPruned = 0;
		try {
			if (dryRun) {
				leadsPruned = await payload
					.count({
						collection: "partner-leads",
						where: pruneWhere,
					})
					.then((r) => r.totalDocs);
			} else {
				const pruned = await payload.delete({
					collection: "partner-leads",
					where: pruneWhere,
					depth: 0,
				});
				leadsPruned = pruned.docs.length;
			}
		} catch {
			// Best-effort — never fail the digest over retention cleanup.
		}

		return NextResponse.json({
			success: true,
			dryRun,
			partnersScanned: partners.docs.length,
			emailsSent,
			checkinsSent,
			leadsCleared,
			[dryRun ? "leadsWouldPrune" : "leadsPruned"]: leadsPruned,
			digests,
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
