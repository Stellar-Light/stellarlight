/** Award statusBasis=onchain-activity from the on-chain evidence we already hold.
 *
 * The quality board tells readers that weak-basis rows with an on-chain
 * footprint "can earn onchain-activity from dated evidence" — and nothing in
 * the repo ever wrote that value. 35 rows carry it from earlier one-off
 * curation; the 41 the board names as eligible had no lane to travel. This is
 * that lane.
 *
 * The evidence is the enrich-onchain reading: the newest movement of the
 * row's asset and the newest event of each of its contracts, each dated by
 * the ledger it closed in, and the holder change between two readings. An
 * event is activity on its date, categorically stronger than site-liveness,
 * which only says a page answered. (Until 2026-11-03 the evidence was a
 * per-window delta of the explorer's counters; its API went paid.)
 *
 * Rules, in the order they matter:
 *   - Never downgrade. Only weak -> onchain-activity, never the reverse, and
 *     human-verified is never touched: a person outranks a probe.
 *   - No evidence is not counter-evidence. A contract with no event may
 *     still be called (13 of 68 tracked contracts in one week, 2026-11), so
 *     a row with nothing recent is left exactly alone.
 *   - The award carries its own date and source, so a reader can age it.
 *   - An event older than MAX_EVIDENCE_AGE_DAYS cannot support a claim
 *     about the product NOW, so it is skipped rather than backdated.
 *
 * Dry-run by default; --execute writes.
 */
import "./load-env";
import { STRONG_STATUS_BASES } from "../src/lib/project-status";

const EXECUTE = process.argv.includes("--execute");
/** Beyond this, the evidence describes a product we haven't seen recently. */
const MAX_EVIDENCE_AGE_DAYS = 90;
/** The strong bases this lane may replace, and only these. Each is a
 *  documented upgrade: the statusBasis spec ranks onchain-activity above
 *  repo-activity, package-release and product-integration (WEAKEST LAST), so
 *  an observed on-chain delta outranks a commit date, a registry publish or an
 *  observed integration. And the lane re-dates its own award: onchain-activity
 *  used to be protected here, which froze the lane's own output (a row
 *  awarded once could never be re-dated, so statusAsOf rotted while fresh
 *  snapshots arrived every day, and a wrong citation could never be
 *  corrected). */
export const REPLACES_STRONG = [
	"onchain-activity",
	"repo-activity",
	"package-release",
	"product-integration",
] as const satisfies readonly (typeof STRONG_STATUS_BASES)[number][];
/** Every other strong basis is never touched: today that is human-verified,
 *  because a person outranks a probe. Derived from the canonical list, so a
 *  strong basis added later is protected until someone ranks it below
 *  onchain-activity on purpose. */
export const NEVER_OVERWRITE: ReadonlySet<string> = new Set(
	STRONG_STATUS_BASES.filter(
		(b) => !(REPLACES_STRONG as readonly string[]).includes(b),
	),
);

/** `url` cites the exact thing observed: the asset, or the specific contract
 *  whose event it is. A citation that points somewhere else is not evidence.
 *  `at` is when it happened. */
export type Ev = {
	kind: string;
	detail: string;
	url: string | null;
	at: string;
};

/** The newest dated activity the reading holds, or null when it holds none. */
// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
export function evidenceOf(onchain: any): Ev | null {
	const when = (v: unknown) =>
		typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;
	const assetUrl =
		onchain?.assetCode && onchain?.issuer
			? `https://stellar.expert/explorer/public/asset/${onchain.assetCode}-${onchain.issuer}`
			: null;
	const dated: Ev[] = [];
	const moved = when(onchain?.assetLastMovedAt);
	if (moved && assetUrl)
		dated.push({
			kind: "asset-movement",
			detail: `${onchain.assetCode} moved on ${moved.slice(0, 10)}`,
			url: assetUrl,
			at: moved,
		});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	for (const c of (onchain?.contracts ?? []) as any[]) {
		const at = when(c?.lastEventAt);
		if (!at || typeof c?.address !== "string" || !c.address) continue;
		dated.push({
			kind: "contract-event",
			detail: `event from ${c.address.slice(0, 10)}… on ${at.slice(0, 10)}`,
			url: `https://stellar.expert/explorer/public/contract/${c.address}`,
			at,
		});
	}
	if (dated.length)
		return dated.reduce((a, b) =>
			Date.parse(b.at) > Date.parse(a.at) ? b : a,
		);
	// A holder change is seen between two readings, so it is dated by the
	// later one.
	const asOf = when(onchain?.asOf);
	if (
		typeof onchain?.assetHoldersDelta === "number" &&
		onchain.assetHoldersDelta !== 0 &&
		asOf
	)
		return {
			kind: "asset-holders",
			detail: `holders moved by ${onchain.assetHoldersDelta} (${onchain.assetCode})`,
			url: assetUrl,
			at: asOf,
		};
	return null;
}

export type Verdict =
	| "award"
	| "refresh"
	| "up-to-date"
	| "kept-fresher"
	| "stale"
	| "no-date";

/**
 * What the lane does with a row that holds evidence. Pure, so it is tested.
 * The evidence carries its own date, and that date can be OLDER than the one
 * the row holds (last week's award cited one contract, this week's newest
 * event is another's and earlier). A strong basis is never re-dated
 * backwards: not this lane's own award, whatever it cites now, and not a
 * fresher repo, package or product observation it would otherwise replace.
 * A weak basis is a label with no observation behind it, so a dated event
 * replaces it at any age inside the window.
 */
export function verdictFor(
	row: { statusBasis?: unknown; statusAsOf?: unknown },
	ev: Ev,
	nowMs: number,
): Verdict {
	const at = Date.parse(ev.at);
	if (Number.isNaN(at)) return "no-date";
	if ((nowMs - at) / 86_400_000 > MAX_EVIDENCE_AGE_DAYS) return "stale";
	const basis = String(row.statusBasis ?? "");
	const stored = row.statusAsOf
		? Date.parse(String(row.statusAsOf))
		: Number.NaN;
	const newer = Number.isNaN(stored) || at > stored;
	if (basis === "onchain-activity") return newer ? "refresh" : "up-to-date";
	if ((REPLACES_STRONG as readonly string[]).includes(basis))
		return newer ? "award" : "kept-fresher";
	return "award";
}

async function main() {
	// Imported here, not at module scope, so a unit test can import this
	// lane's protected set without booting Payload or opening a DB connection.
	const { getPayload } = await import("payload");
	const configPromise = (await import("../src/payload.config")).default;
	const payload = await getPayload({ config: await configPromise });
	const res = await payload.find({
		collection: "projects",
		where: { "onchain.asOf": { exists: true } },
		limit: 2000,
		depth: 0,
		select: {
			slug: true,
			name: true,
			status: true,
			statusBasis: true,
			statusAsOf: true,
			statusSourceUrl: true,
			onchain: true,
			canonicalSlug: true,
		},
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	const docs = res.docs as any[];
	console.log(
		`${docs.length} rows carry an on-chain snapshot — ${EXECUTE ? "EXECUTING" : "dry run"}\n`,
	);

	const t = {
		awarded: 0,
		refreshed: 0,
		upToDate: 0,
		keptFresher: 0,
		alreadyStrong: 0,
		noEvidence: 0,
		stale: 0,
		noDate: 0,
		shadow: 0,
	};
	for (const d of docs) {
		// A lineage shadow (Draft + canonicalSlug) is not a served row; its
		// status record belongs to the fold, never to a basis lane.
		if (d.canonicalSlug || d.status === "Draft") {
			t.shadow++;
			continue;
		}
		const basis = String(d.statusBasis ?? "");
		if (NEVER_OVERWRITE.has(basis)) {
			t.alreadyStrong++;
			continue;
		}
		const ev = evidenceOf(d.onchain);
		if (!ev) {
			t.noEvidence++;
			continue;
		}
		// The evidence carries its own date: the ledger an event closed in,
		// or the reading that observed a holder change.
		const verdict = verdictFor(d, ev, Date.now());
		const asOf = Date.parse(ev.at);
		if (verdict === "no-date") {
			t.noDate++;
			continue;
		}
		if (verdict === "stale") {
			t.stale++;
			console.log(
				`  STALE ${d.slug}: ${ev.kind}, but dated ${Math.round((Date.now() - asOf) / 86_400_000)}d ago; not backdating a live claim`,
			);
			continue;
		}
		if (verdict === "up-to-date") {
			t.upToDate++;
			continue;
		}
		if (verdict === "kept-fresher") {
			// Not an award and not current onchain-activity: the row keeps a
			// repo, package or product observation dated after the event.
			t.keptFresher++;
			console.log(
				`  KEPT    ${String(d.slug).padEnd(30)} ${basis} of ${String(d.statusAsOf).slice(0, 10)} is fresher than its newest on-chain evidence (${ev.at.slice(0, 10)})`,
			);
			continue;
		}
		const isRefresh = verdict === "refresh";
		if (isRefresh) t.refreshed++;
		else t.awarded++;
		console.log(
			`  ${isRefresh ? "REFRESH" : "AWARD  "} ${String(d.slug).padEnd(30)} ${basis || "(none)"} -> onchain-activity · ${ev.detail}`,
		);
		if (EXECUTE)
			await payload.update({
				collection: "projects",
				id: d.id,
				data: {
					statusBasis: "onchain-activity",
					statusAsOf: new Date(asOf).toISOString(),
					// cite what was actually observed, not contracts[0]
					...(ev.url ? { statusSourceUrl: ev.url } : {}),
				},
				context: { internal: true },
			});
	}
	console.log(
		`\nawarded ${t.awarded} | refreshed ${t.refreshed} | already current ${t.upToDate} | fresher basis kept ${t.keptFresher} | human-verified (untouched) ${t.alreadyStrong} | no movement in window ${t.noEvidence} | evidence too old ${t.stale} | undated ${t.noDate} | shadows skipped ${t.shadow}`,
	);
	process.exit(0);
}

if (process.argv[1]?.includes("basis-from-onchain")) main();
