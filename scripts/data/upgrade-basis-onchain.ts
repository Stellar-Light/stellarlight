/**
 * P4 basis lane: weak status bases upgrade to `onchain-activity` where the
 * row ALREADY HOLDS dated on-chain evidence.
 *
 *   pnpm exec tsx scripts/data/upgrade-basis-onchain.ts            # DRY RUN
 *   pnpm exec tsx scripts/data/upgrade-basis-onchain.ts --execute
 *
 * THE PROBLEM (P4, the board's #1 known limitation): 842/983 rows rest on the
 * weakest honest bases while some of them carry stronger evidence in the SAME
 * row — aquarius served tvlUSD $37M with a same-day DeFiLlama date and 160k
 * asset payments over the last observed week, under statusBasis
 * "site-liveness". The claim's label under-reported the evidence we serve
 * beside it.
 *
 * EVIDENCE RULES (a basis is only as good as its date — sls-024):
 *   A. asset MOVEMENT: onchain.asOf within MAX_MOVEMENT_AGE_DAYS and
 *      assetPaymentsDelta > 0 or assetTradesDelta > 0 — coins actually moved
 *      between two dated stellar.expert observations. Static holder/supply
 *      counts are NOT activity (a dead asset keeps its holders) and never
 *      qualify.
 *   B. verified TVL: tvlUSD > 0 from DeFiLlama with tvlAsOf within
 *      MAX_TVL_AGE_DAYS — third-party-verified value locked on Stellar now.
 *   A wins over B when both hold (a direct chain observation beats an
 *   aggregator read). statusAsOf becomes the EVIDENCE date, never now.
 *
 * WHAT THIS DELIBERATELY WILL NOT DO (same charter as upgrade-status-basis):
 *   - never changes `status` — evidence of activity grounds a Live label, its
 *     absence proves nothing and downgrades nothing;
 *   - never touches a strong basis (human-verified / onchain-activity /
 *     official-record) — only site-liveness / source-inherited / unverified /
 *     missing upgrade;
 *   - only rows whose status IS "Live": this basis explains that claim; an
 *     Inactive row with residual TVL keeps its verdict untouched;
 *   - refuses stale evidence: past the age windows the row keeps its weak
 *     basis honestly.
 */

import "../load-env";
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const MAX_MOVEMENT_AGE_DAYS = 45; // enrich-onchain runs weekly; 45d = generous but current
const MAX_TVL_AGE_DAYS = 14; // the DeFiLlama refresh is scheduled ~daily

const WEAK = new Set(["site-liveness", "source-inherited", "unverified"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const days = (iso: string) => (Date.now() - Date.parse(iso)) / 86_400_000;

interface Row {
	id: string;
	slug?: string;
	status?: string;
	statusBasis?: string | null;
	statusAsOf?: string | null;
	tvlUSD?: number | null;
	tvlAsOf?: string | null;
	tvlSource?: string | null;
	llamaSlugs?: string[] | null;
	onchain?: {
		assetCode?: string | null;
		issuer?: string | null;
		assetPaymentsDelta?: number | null;
		assetTradesDelta?: number | null;
		asOf?: string | null;
	} | null;
}

function evidenceFor(
	r: Row,
): { kind: "movement" | "tvl"; asOf: string; url: string; note: string } | null {
	const o = r.onchain;
	if (
		o?.asOf &&
		days(o.asOf) <= MAX_MOVEMENT_AGE_DAYS &&
		((o.assetPaymentsDelta ?? 0) > 0 || (o.assetTradesDelta ?? 0) > 0)
	) {
		const asset =
			o.assetCode && o.issuer ? `${o.assetCode}-${o.issuer}` : null;
		return {
			kind: "movement",
			asOf: o.asOf,
			// The exact page the numbers were read from — citable, dated.
			url: asset
				? `https://stellar.expert/explorer/public/asset/${asset}`
				: "https://stellar.expert/explorer/public",
			note: `payments Δ${o.assetPaymentsDelta ?? 0} / trades Δ${o.assetTradesDelta ?? 0}`,
		};
	}
	if (
		(r.tvlUSD ?? 0) > 0 &&
		r.tvlSource === "defillama" &&
		r.tvlAsOf &&
		days(r.tvlAsOf) <= MAX_TVL_AGE_DAYS
	) {
		const slug = r.llamaSlugs?.[0];
		return {
			kind: "tvl",
			asOf: r.tvlAsOf,
			url: slug
				? `https://defillama.com/protocol/${slug}`
				: "https://defillama.com/chain/Stellar",
			note: `tvl $${Math.round(r.tvlUSD ?? 0).toLocaleString("en-US")}`,
		};
	}
	return null;
}

/**
 * Evidence C — HORIZON RECENT ACTIVITY, the "now" path. Movement deltas (A)
 * need two weekly stellar.expert readings, so a freshly-joined asset key sits
 * a week from its first possible upgrade. Horizon can attest activity TODAY:
 * the asset's most recent trade, dated by ledger close time — a direct,
 * citable on-chain observation (two parties moved value). Probed only for
 * weak rows that hold an asset key and passed neither A nor B; an asset with
 * no recent trade stays weak honestly (payment-only rails will earn their
 * upgrade through A when the deltas arrive).
 */
// The trinary probe invariant (audit C4, second recurrence of the class in
// two days): a probe outcome is hit / checked-empty / COULD-NOT-CHECK, and
// could-not-check must be a DISTINCT value that reaches the run summary and
// the exit code — a log line reaches humans who happen to be reading;
// summaries and exit codes reach guards.
let probesAttempted = 0;
let probeErrors = 0;
// Horizon answers "this pair has never traded" / "no such account" with a
// 404 — that is a CHECKED-EMPTY, not a could-not-check (verified 2026-09-01:
// a USDC/XLM control returns 200+records, never-traded pairs 404). Counting
// them as errors made an all-never-traded run exit 2 claiming an outage.
let probeNotFound = 0;
async function horizonJson(
	u: string,
): Promise<
	| { ok: true; data: Record<string, unknown> }
	| { ok: false; reason: string }
> {
	probesAttempted += 1;
	try {
		const res = await fetch(u, {
			headers: { "User-Agent": "stellarlight-basis-upgrade" },
			signal: AbortSignal.timeout(15_000),
		});
		if (res.status === 404) {
			probeNotFound += 1;
			return { ok: false, reason: "not-found" };
		}
		if (!res.ok) {
			probeErrors += 1;
			console.log(
				`    ✗ Horizon ${res.status}${res.status === 400 ? " (bad query)" : ""}: ${u.slice(0, 110)}`,
			);
			return { ok: false, reason: `http-${res.status}` };
		}
		return { ok: true, data: (await res.json()) as Record<string, unknown> };
	} catch (e) {
		probeErrors += 1;
		console.log(
			`    ✗ Horizon unreachable (${(e as Error).name}): ${u.slice(0, 110)}`,
		);
		return { ok: false, reason: "network" };
	}
}

async function horizonEvidence(
	r: Row,
): Promise<{ kind: string; asOf: string; url: string; note: string } | null> {
	const o = r.onchain;
	if (!o?.assetCode || !o.issuer) return null;
	const expertUrl = `https://stellar.expert/explorer/public/asset/${o.assetCode}-${o.issuer}`;
	// 1. Issuer-account payments — but ONLY payments in THIS asset (audit C3:
	//    the first version read a bare timestamp off ANY payment touching the
	//    issuer, so one stroop of dust — or the operator's unrelated XLM ops —
	//    minted "recent activity" for the asset). A payment whose asset_code +
	//    asset_issuer match the row's asset is real movement of the thing the
	//    basis is about; twenty records of lookback keeps the dust window
	//    honest without paging forever.
	const pay = await horizonJson(
		`https://horizon.stellar.org/accounts/${o.issuer}/payments?order=desc&limit=20`,
	);
	const payRecs = pay.ok
		? ((
				pay.data._embedded as
					| {
							records?: Array<{
								created_at?: string;
								asset_code?: string;
								asset_issuer?: string;
								type?: string;
							}>;
					  }
					| undefined
			)?.records ?? [])
		: [];
	const assetPay = payRecs.find(
		(rec) =>
			rec.type === "payment" &&
			rec.asset_code === o.assetCode &&
			rec.asset_issuer === o.issuer &&
			rec.created_at &&
			days(rec.created_at) <= MAX_MOVEMENT_AGE_DAYS,
	);
	if (assetPay?.created_at)
		return {
			kind: "issuer-payment",
			asOf: assetPay.created_at,
			url: expertUrl,
			note: `issuer payment in ${o.assetCode} ${assetPay.created_at.slice(0, 10)} (Horizon)`,
		};
	// 2. DEX trade against XLM — /trades requires a PAIR, so probe the
	//    dominant one. Misses exotic pairs; those rows stay weak honestly
	//    until the weekly deltas arrive.
	const type =
		o.assetCode.length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
	const tr = await horizonJson(
		`https://horizon.stellar.org/trades?base_asset_type=${type}&base_asset_code=${encodeURIComponent(o.assetCode)}&base_asset_issuer=${o.issuer}&counter_asset_type=native&order=desc&limit=1`,
	);
	const trRec = tr.ok
		? (
				tr.data._embedded as
					| { records?: Array<{ ledger_close_time?: string }> }
					| undefined
			)?.records?.[0]
		: undefined;
	if (
		trRec?.ledger_close_time &&
		days(trRec.ledger_close_time) <= MAX_MOVEMENT_AGE_DAYS
	)
		return {
			kind: "horizon-trade",
			asOf: trRec.ledger_close_time,
			url: expertUrl,
			note: `last XLM-pair trade ${trRec.ledger_close_time.slice(0, 10)} (Horizon)`,
		};
	return null;
}

// The one-time AUDIT_REVERTS map (C3, four rows upgraded by the uncorrected
// issuer-payment probe) executed on 2026-09-01 (run 33464175432: ylds /
// stellarport / mxne / brale → site-liveness; stellarport then re-earned
// onchain-activity in the same run via a same-day XLM-pair trade) and was
// deleted as designed — left in place it would have reverted that legitimate
// re-upgrade on any later run.

async function main() {
	const payload = await getPayload({ config: await configPromise });
	const all = await payload.find({
		collection: "projects",
		where: { status: { equals: "Live" } },
		limit: 5000,
		depth: 0,
		select: {
			slug: true,
			status: true,
			statusBasis: true,
			statusAsOf: true,
			tvlUSD: true,
			tvlAsOf: true,
			tvlSource: true,
			llamaSlugs: true,
			onchain: true,
		},
	});
	const rows = all.docs as unknown as Row[];
	const weak = rows.filter(
		(r) => !r.statusBasis || WEAK.has(r.statusBasis),
	);
	const plan: Array<{
		r: Row;
		ev: { kind: string; asOf: string; url: string; note: string };
	}> = [];
	for (const r of weak) {
		const ev = evidenceFor(r) ?? (await horizonEvidence(r));
		if (ev) plan.push({ r, ev });
		if (!evidenceFor(r) && r.onchain?.assetCode) await sleep(300); // Horizon politeness
	}

	console.log(
		`Live rows: ${rows.length} · weak-basis: ${weak.length} · upgradeable on held evidence: ${plan.length}\n`,
	);
	for (const { r, ev } of plan)
		console.log(
			`  ${String(r.slug).padEnd(28)} ${String(r.statusBasis).padEnd(18)} → onchain-activity  [${ev.kind}] ${ev.note}  asOf ${ev.asOf.slice(0, 10)}`,
		);

	if (!EXECUTE) {
		console.log("\nDRY RUN — nothing written. Re-run with --execute.");
		process.exit(0);
	}

	let wrote = 0;
	for (const { r, ev } of plan) {
		await payload.update({
			collection: "projects",
			id: r.id,
			data: {
				statusBasis: "onchain-activity",
				// The date of the OBSERVATION, never now (sls-024).
				statusAsOf: ev.asOf,
				statusSourceUrl: ev.url,
			},
		});
		wrote++;
	}

	// Read back — payload.update silently drops unknown keys, so prove the
	// writes landed by re-counting the basis from the collection.
	const after = await payload.find({
		collection: "projects",
		where: { statusBasis: { equals: "onchain-activity" } },
		limit: 5000,
		depth: 0,
		select: { slug: true },
	});
	console.log(
		`\nwrote ${wrote} — ${after.totalDocs} rows now carry basis=onchain-activity`,
	);
	// Trinary invariant: could-not-check reaches the summary AND the exit
	// code. All-probes-failed is an outage reading, not a quiet market — the
	// run must not exit green pretending it checked.
	if (probesAttempted > 0)
		console.log(
			`probes: ${probesAttempted} attempted · ${probeNotFound} not-found (checked-empty) · ${probeErrors} could-not-check`,
		);
	if (probesAttempted > 0 && probeErrors === probesAttempted) {
		console.error(
			"every Horizon probe failed — this run CHECKED NOTHING on the C path; exiting 2 (inconclusive), not green",
		);
		process.exit(2);
	}
	process.exit(after.totalDocs >= wrote ? 0 : 1);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
