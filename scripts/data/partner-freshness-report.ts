/** READ-ONLY. Reports the partner freshness / reminder state for every partner
 * — the same age→status logic the daily `partner-freshness` cron uses, but
 * runnable on demand WITHOUT the CRON_SECRET, and it NEVER writes.
 *
 *   pnpm exec tsx scripts/data/partner-freshness-report.ts
 *
 * Proves the reminder machinery: for each partner it shows days since the
 * partner last touched the profile, the freshness status that implies, and how
 * many days until the next nudge/transition. Email delivery of those nudges is
 * the weekly `partner-digest` cron and needs RESEND_API_KEY in Vercel — this
 * report shows WHAT would be nudged regardless of whether email is wired.
 */
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

const DAY = 24 * 60 * 60 * 1000;
const AGING = 90;
const STALE = 180;
const ARCHIVE = 365;

type Freshness = "fresh" | "aging" | "stale" | "archived";

function statusForAgeDays(d: number): Freshness {
	if (d >= ARCHIVE) return "archived";
	if (d >= STALE) return "stale";
	if (d >= AGING) return "aging";
	return "fresh";
}

/** Days until the next status transition (null once archived). */
function daysToNext(d: number): number | null {
	if (d < AGING) return AGING - d;
	if (d < STALE) return STALE - d;
	if (d < ARCHIVE) return ARCHIVE - d;
	return null;
}

async function main() {
	const payload = await getPayload({ config: await configPromise });
	const res = await payload.find({
		collection: "partner-accounts",
		where: { status: { equals: "published" } },
		limit: 1000,
		depth: 0,
		overrideAccess: true,
	});
	const now = Date.now();

	const summary: Record<Freshness, number> = {
		fresh: 0,
		aging: 0,
		stale: 0,
		archived: 0,
	};
	let drift = 0;
	const rows: Array<{
		name: string;
		ageDays: number;
		stored: string;
		computed: Freshness;
		next: number | null;
	}> = [];

	for (const p of res.docs) {
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = p as any;
		const anchor = d.lastPartnerUpdateAt ?? d.createdAt;
		const ageDays = anchor
			? Math.floor((now - new Date(anchor).getTime()) / DAY)
			: 0;
		const computed = statusForAgeDays(ageDays);
		const stored: string = d.freshnessStatus ?? "fresh";
		summary[computed]++;
		if (stored !== computed) drift++;
		rows.push({
			name: d.name,
			ageDays,
			stored,
			computed,
			next: daysToNext(ageDays),
		});
	}

	rows.sort((a, b) => b.ageDays - a.ageDays);

	console.log(`Partner freshness report — ${res.docs.length} published\n`);
	console.log(
		`  fresh=${summary.fresh}  aging=${summary.aging}  stale=${summary.stale}  archived=${summary.archived}`,
	);
	console.log(
		`  ${drift} partner(s) whose stored status differs from computed (the daily cron reconciles these).\n`,
	);
	console.log(
		`  ${"partner".padEnd(30)} ${"age".padStart(5)} ${"status".padEnd(9)} next nudge`,
	);
	for (const r of rows.slice(0, 30)) {
		const next =
			r.next == null
				? "—"
				: r.computed === "fresh"
					? `aging in ${r.next}d`
					: r.computed === "aging"
						? `stale in ${r.next}d`
						: `archived in ${r.next}d`;
		console.log(
			`  ${r.name.slice(0, 30).padEnd(30)} ${String(r.ageDays).padStart(4)}d ${r.computed.padEnd(9)} ${next}`,
		);
	}
	if (rows.length > 30) console.log(`  … +${rows.length - 30} more`);
	console.log(
		`\nReminder EMAILS go out via the weekly partner-digest cron (needs RESEND_API_KEY).`,
	);
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
