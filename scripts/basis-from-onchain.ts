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
/** A person's verdict is never overwritten by a probe. */
const NEVER_OVERWRITE = new Set(["human-verified", "onchain-activity"]);

type Ev = { kind: string; detail: string };

/** What moved in the snapshot window, or null when nothing did. */
// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
function evidenceOf(onchain: any): Ev | null {
	const num = (v: unknown) => (typeof v === "number" ? v : 0);
	if (num(onchain?.assetPaymentsDelta) > 0)
		return {
			kind: "asset-payments",
			detail: `${onchain.assetPaymentsDelta} payments of ${onchain.assetCode} in the window`,
		};
	if (num(onchain?.assetHoldersDelta) !== 0)
		return {
			kind: "asset-holders",
			detail: `holders moved by ${onchain.assetHoldersDelta} (${onchain.assetCode})`,
		};
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	for (const c of (onchain?.contracts ?? []) as any[]) {
		if (num(c?.subinvocationsDelta) > 0)
			return {
				kind: "contract-subinvocations",
				detail: `${c.subinvocationsDelta} subinvocations on ${String(c.address).slice(0, 10)}…`,
			};
		if (num(c?.eventsDelta) > 0)
			return {
				kind: "contract-events",
				detail: `${c.eventsDelta} events on ${String(c.address).slice(0, 10)}…`,
			};
	}
	return null;
}

// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
function sourceUrl(onchain: any): string | null {
	if (onchain?.assetCode && onchain?.issuer)
		return `https://stellar.expert/explorer/public/asset/${onchain.assetCode}-${onchain.issuer}`;
	const addr = onchain?.contracts?.[0]?.address;
	return addr
		? `https://stellar.expert/explorer/public/contract/${addr}`
		: null;
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

	const t = { awarded: 0, alreadyStrong: 0, noEvidence: 0, stale: 0, noDate: 0 };
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
		t.awarded++;
		console.log(
			`  AWARD ${String(d.slug).padEnd(30)} ${basis || "(none)"} -> onchain-activity · ${ev.detail}`,
		);
		if (EXECUTE)
			await payload.update({
				collection: "projects",
				id: d.id,
				data: {
					statusBasis: "onchain-activity",
					statusAsOf: new Date(asOf).toISOString(),
					...(sourceUrl(d.onchain)
						? { statusSourceUrl: sourceUrl(d.onchain) }
						: {}),
				},
				context: { internal: true },
			});
	}
	console.log(
		`\nawarded ${t.awarded} | already strong ${t.alreadyStrong} | no movement in window ${t.noEvidence} | evidence too old ${t.stale} | undated ${t.noDate}`,
	);
	process.exit(0);
})();
