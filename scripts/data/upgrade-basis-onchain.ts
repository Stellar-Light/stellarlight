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
async function horizonEvidence(
	r: Row,
): Promise<{ kind: "horizon-trade"; asOf: string; url: string; note: string } | null> {
	const o = r.onchain;
	if (!o?.assetCode || !o.issuer) return null;
	const type =
		o.assetCode.length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
	const u = `https://horizon.stellar.org/trades?base_asset_type=${type}&base_asset_code=${encodeURIComponent(o.assetCode)}&base_asset_issuer=${o.issuer}&order=desc&limit=1`;
	try {
		const res = await fetch(u, {
			headers: { "User-Agent": "stellarlight-basis-upgrade" },
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) return null;
		const d = (await res.json()) as {
			_embedded?: { records?: Array<{ ledger_close_time?: string }> };
		};
		const t = d._embedded?.records?.[0]?.ledger_close_time;
		if (!t || days(t) > MAX_MOVEMENT_AGE_DAYS) return null;
		return {
			kind: "horizon-trade",
			asOf: t,
			url: `https://stellar.expert/explorer/public/asset/${o.assetCode}-${o.issuer}`,
			note: `last trade ${t.slice(0, 10)} (Horizon)`,
		};
	} catch {
		return null;
	}
}

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
	process.exit(after.totalDocs >= wrote ? 0 : 1);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
