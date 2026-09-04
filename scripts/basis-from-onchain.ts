/** Award statusBasis=onchain-activity from the on-chain evidence we already hold.
 *
 * The quality board tells readers that weak-basis rows with an on-chain
 * footprint "can earn onchain-activity from dated evidence" — and nothing in
 * the repo ever wrote that value. 35 rows carry it from earlier one-off
 * curation; the 41 the board names as eligible had no lane to travel. This is
 * that lane.
 *
 * The evidence is the enrich-onchain snapshot, which already stores a dated
 * window: `onchain.prevAsOf` -> `onchain.asOf`, with per-window deltas. A
 * positive delta is activity OBSERVED between two dates — categorically
 * stronger than site-liveness, which only says a page answered.
 *
 * Rules, in the order they matter:
 *   - Never downgrade. Only weak -> onchain-activity, never the reverse, and
 *     human-verified is never touched: a person outranks a probe.
 *   - No evidence is not counter-evidence. A zero delta means the window was
 *     quiet, which is not proof of death — those rows are left exactly alone.
 *   - The award carries its own date and source, so a reader can age it.
 *   - An observation older than MAX_EVIDENCE_AGE_DAYS cannot support a claim
 *     about the product NOW, so it is skipped rather than backdated.
 *
 * Dry-run by default; --execute writes.
 */
import "./load-env";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
/** Beyond this, the snapshot describes a product we haven't seen recently. */
const MAX_EVIDENCE_AGE_DAYS = 90;
/** A person's verdict is never overwritten by a probe — and that is the ONLY
 *  basis this lane refuses to touch. onchain-activity used to be in here too,
 *  which froze the lane's own output: a row awarded once could never be
 *  re-dated, so statusAsOf rotted while fresh snapshots arrived every day, and
 *  a wrong citation could never be corrected. A dated claim that can never be
 *  re-dated is the same failure as one that was never dated. */
const NEVER_OVERWRITE = new Set(["human-verified"]);

/** `url` cites the exact thing observed — the asset or the specific contract
 *  whose delta moved. A citation that points somewhere else is not evidence. */
type Ev = { kind: string; detail: string; url: string | null };

/** What moved in the snapshot window, or null when nothing did. */
// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
function evidenceOf(onchain: any): Ev | null {
	const num = (v: unknown) => (typeof v === "number" ? v : 0);
	const assetUrl =
		onchain?.assetCode && onchain?.issuer
			? `https://stellar.expert/explorer/public/asset/${onchain.assetCode}-${onchain.issuer}`
			: null;
	if (num(onchain?.assetPaymentsDelta) > 0)
		return {
			kind: "asset-payments",
			detail: `${onchain.assetPaymentsDelta} payments of ${onchain.assetCode} in the window`,
			url: assetUrl,
		};
	if (num(onchain?.assetHoldersDelta) !== 0)
		return {
			kind: "asset-holders",
			detail: `holders moved by ${onchain.assetHoldersDelta} (${onchain.assetCode})`,
			url: assetUrl,
		};
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	for (const c of (onchain?.contracts ?? []) as any[]) {
		const cUrl = c?.address
			? `https://stellar.expert/explorer/public/contract/${c.address}`
			: null;
		if (num(c?.subinvocationsDelta) > 0)
			return {
				kind: "contract-subinvocations",
				detail: `${c.subinvocationsDelta} subinvocations on ${String(c.address).slice(0, 10)}…`,
				url: cUrl,
			};
		if (num(c?.eventsDelta) > 0)
			return {
				kind: "contract-events",
				detail: `${c.eventsDelta} events on ${String(c.address).slice(0, 10)}…`,
				url: cUrl,
			};
	}
	return null;
}

(async () => {
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
		alreadyStrong: 0,
		noEvidence: 0,
		stale: 0,
		noDate: 0,
	};
	for (const d of docs) {
		const basis = String(d.statusBasis ?? "");
		if (NEVER_OVERWRITE.has(basis)) {
			t.alreadyStrong++;
			continue;
		}
		const asOf = d.onchain?.asOf ? Date.parse(String(d.onchain.asOf)) : Number.NaN;
		if (Number.isNaN(asOf)) {
			t.noDate++;
			continue;
		}
		const ageDays = (Date.now() - asOf) / 86_400_000;
		const ev = evidenceOf(d.onchain);
		if (!ev) {
			t.noEvidence++;
			continue;
		}
		if (ageDays > MAX_EVIDENCE_AGE_DAYS) {
			t.stale++;
			console.log(
				`  STALE ${d.slug} — ${ev.kind}, but observed ${Math.round(ageDays)}d ago; not backdating a live claim`,
			);
			continue;
		}
		// Refreshing an existing award only moves FORWARD: a snapshot older
		// than the stored date would silently walk the evidence backwards.
		const storedAsOf = d.statusAsOf ? Date.parse(String(d.statusAsOf)) : 0;
		const isRefresh = basis === "onchain-activity";
		if (isRefresh && !(asOf > storedAsOf) && d.statusSourceUrl === ev.url) {
			t.upToDate++;
			continue;
		}
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
		`\nawarded ${t.awarded} | refreshed ${t.refreshed} | already current ${t.upToDate} | human-verified (untouched) ${t.alreadyStrong} | no movement in window ${t.noEvidence} | evidence too old ${t.stale} | undated ${t.noDate}`,
	);
	process.exit(0);
})();
